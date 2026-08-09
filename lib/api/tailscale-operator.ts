import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'yaml';
import { tailscaleConfig } from '../config/proxmox';

/**
 * Installs the Tailscale Kubernetes operator into a freshly built cluster and
 * turns on its API server proxy. With `apiServerProxyConfig.mode=true` the
 * operator exposes the apiserver at https://<hostname>.<tailnet>.ts.net and
 * authenticates callers by their tailnet identity (impersonation is granted in
 * the tailnet ACL), so any tailnet device can reach the cluster with
 * `tailscale configure kubeconfig <hostname>` and no certificates to copy.
 *
 * Auth is an OAuth client (not an auth key): the operator mints its own device
 * keys as it provisions proxies, which an auth key cannot do.
 */
export interface OperatorOptions {
  /** Path to the cluster's admin kubeconfig (points at the HAProxy VIP). */
  kubeconfigPath: string;
  oauthClientId: string;
  oauthClientSecret: string;
  /** Operator device hostname; also the API-proxy DNS name. */
  hostname?: string;
  /** Enable the API server proxy in auth mode. Default true. */
  apiServerProxy?: boolean;
  /** Pin a chart version; omit for latest. */
  chartVersion?: string;
  helmPath?: string;
  /** Full tailnet name (e.g. example.ts.net) -- only used to report the URL. */
  tailnet?: string;
}

export interface OperatorResult {
  installed: boolean;
  /** API server proxy endpoint, if the tailnet name is known. */
  endpoint?: string;
}

const HELM_REPO_NAME = 'tailscale';
const HELM_REPO_URL = 'https://pkgs.tailscale.com/helmcharts';

/**
 * Installs (or upgrades) the operator via Helm against the given kubeconfig. The
 * OAuth secret is passed through a temp values file with 0600 perms rather than
 * on argv, so it never lands in the process list; the file is removed in a
 * finally. Helm still persists the values into an in-cluster secret, which is
 * expected and where the operator reads them from.
 */
export async function installTailscaleOperator(
  options: OperatorOptions
): Promise<OperatorResult> {
  const helm = options.helmPath ?? 'helm';
  const hostname = options.hostname ?? tailscaleConfig.operatorHostname;
  const apiServerProxy = options.apiServerProxy ?? true;

  if (!options.oauthClientId || !options.oauthClientSecret) {
    throw new Error(
      'Tailscale operator requires OAuth credentials (TS_OAUTH_CLIENT_ID / TS_OAUTH_CLIENT_SECRET)'
    );
  }

  const env = { ...process.env, KUBECONFIG: options.kubeconfigPath };

  console.log('Adding Tailscale Helm repo...');
  await run(helm, ['repo', 'add', HELM_REPO_NAME, HELM_REPO_URL, '--force-update'], env);
  await run(helm, ['repo', 'update', HELM_REPO_NAME], env);

  const valuesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts-operator-'));
  const valuesPath = path.join(valuesDir, 'values.yaml');
  try {
    // Serialize with yaml.stringify rather than string interpolation so a quote
    // or newline in the OAuth secret cannot break the file or inject YAML.
    // apiServerProxyConfig.mode is a STRING enum ("true"/"false"/"noauth"), not
    // a boolean -- keep it quoted so Helm does not coerce it.
    const values: Record<string, unknown> = {
      oauth: {
        clientId: options.oauthClientId,
        clientSecret: options.oauthClientSecret,
      },
      operatorConfig: { hostname },
    };
    if (apiServerProxy) {
      values.apiServerProxyConfig = { mode: 'true' };
    }
    await fs.writeFile(valuesPath, yaml.stringify(values), { mode: 0o600 });

    const args = [
      'upgrade',
      '--install',
      'tailscale-operator',
      `${HELM_REPO_NAME}/tailscale-operator`,
      '--namespace',
      'tailscale',
      '--create-namespace',
      '-f',
      valuesPath,
      '--wait',
      '--timeout',
      '5m',
    ];
    if (options.chartVersion) {
      args.push('--version', options.chartVersion);
    }

    console.log('Installing Tailscale operator via Helm...');
    await run(helm, args, env);
  } finally {
    await fs.rm(valuesDir, { recursive: true, force: true });
  }

  const tailnet = options.tailnet ?? tailscaleConfig.tailnet;
  const endpoint = tailnet ? `https://${hostname}.${tailnet}` : undefined;
  if (endpoint) {
    console.log(`Tailscale operator installed. API server proxy: ${endpoint}`);
    console.log(`Reach it from any tailnet device: tailscale configure kubeconfig ${hostname}`);
  } else {
    console.log('Tailscale operator installed. Set TS_TAILNET to print the API proxy URL.');
  }

  return { installed: true, endpoint };
}

/** Spawns a command, streaming output, and rejects on non-zero exit. */
function run(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env });
    let stderr = '';
    proc.stdout.on('data', (d) => console.log(d.toString()));
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
      console.error(d.toString());
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} failed (${code}): ${stderr}`));
    });
    proc.on('error', (err) => reject(new Error(`failed to run ${cmd}: ${err.message}`)));
  });
}
