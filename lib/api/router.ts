import { ProxmoxAPIClient } from './proxmox-client';
import { routerConfig } from '../config/proxmox';
import { Socket } from 'net';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Provisions the gateway/router VM the rest of the cluster depends on. It sits on
 * two bridges -- WAN (DHCP, egress + default route) and the flat cluster LAN,
 * where it owns the gateway address -- and boots into three roles configured
 * entirely from cloud-init:
 *
 *   1. NAT      -- masquerade cluster egress out the WAN interface (nftables).
 *   2. HAProxy  -- TCP load balancer on :6443 in front of the control plane, so
 *                  `loadbalancer_apiserver.address` (group_vars/all) resolves to
 *                  a stable VIP that survives a control-plane node failing.
 *   3. Tailscale subnet router -- advertises the cluster CIDR to the tailnet and
 *                  enables Tailscale SSH, so the network is reachable (and the
 *                  router is administrable) from any tailnet device.
 *
 * This ALWAYS creates a new VM. It never adopts an existing router in place --
 * recreating a live gateway would cut the running cluster off, so the caller is
 * responsible for pointing `vmid` at an unused id.
 */
export interface RouterOptions {
  /** VMID for the new router VM. Defaults to routerConfig.vmid (101). */
  vmid?: number;
  name?: string;
  /** Template to clone from -- same Ubuntu template the nodes use. */
  templateVmid: number;
  /** Auth key the router uses to join the tailnet (tagged, reusable). */
  tailscaleAuthKey: string;
  /** Control-plane addresses to put behind HAProxy :6443. */
  masterIps: string[];
  wanBridge?: string;
  lanBridge?: string;
  lanAddress?: string;
  lanPrefix?: number;
  advertiseRoutes?: string;
  apiPort?: number;
  memoryMB?: number;
  cores?: number;
  /** Proxmox snippet storage for the cloud-init user-data. */
  snippetStorage?: string;
  nameserver?: string;
}

export interface RouterResult {
  vmid: number;
  name: string;
  lanAddress: string;
}

/**
 * Path to the cloud-init template. Read at runtime (not bundled), so the
 * Dockerfile's `COPY scripts` makes it available in the image and the mgmt VM
 * finds it under the repo root -- same convention k8s-cluster.ts uses for the
 * Kubespray group_vars templates.
 */
const CLOUD_INIT_TEMPLATE = path.join(
  process.cwd(),
  'scripts',
  'router-user-data.yaml'
);

/**
 * Renders scripts/router-user-data.yaml into a concrete #cloud-config. The
 * template is the single source of truth for what runs on the router; this only
 * substitutes the dynamic values (control-plane IPs, cluster CIDR, auth key).
 *
 * The HAProxy backend server list is variable-length, so its placeholder is
 * emitted with the exact indentation of the surrounding block scalar (6 spaces
 * for the literal block + 4 for HAProxy's own indent) to keep the YAML valid.
 */
async function renderCloudInit(opts: {
  clusterCidr: string;
  lanAddress: string;
  advertiseRoutes: string;
  authKey: string;
  hostname: string;
  masterIps: string[];
  apiPort: number;
}): Promise<string> {
  const template = await fs.readFile(CLOUD_INIT_TEMPLATE, 'utf-8');

  const haproxyServers = opts.masterIps
    .map((ip, i) => `          server master-${i + 1} ${ip}:${opts.apiPort} check`)
    .join('\n');

  return template
    .replaceAll('__HOSTNAME__', opts.hostname)
    .replaceAll('__LAN_ADDRESS__', opts.lanAddress)
    .replaceAll('__CLUSTER_CIDR__', opts.clusterCidr)
    .replaceAll('__API_PORT__', String(opts.apiPort))
    .replaceAll('__ADVERTISE_ROUTES__', opts.advertiseRoutes)
    .replaceAll('__TS_AUTHKEY__', opts.authKey)
    .replace('__HAPROXY_SERVERS__', haproxyServers);
}

/**
 * Computes the network address for `address/prefix` (e.g. 10.100.0.1 /16 ->
 * 10.100.0.0/16). Masks the full 32-bit address rather than assuming a /16
 * shape, so a non-/16 ROUTER_LAN_PREFIX produces a correct NAT source range.
 */
function networkCidr(address: string, prefix: number): string {
  const octets = address.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)
  ) {
    throw new Error(`invalid IPv4 address: ${address}`);
  }
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    throw new Error(`invalid prefix length: ${prefix}`);
  }
  const addr =
    ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const net = (addr & mask) >>> 0;
  const netOctets = [
    (net >>> 24) & 255,
    (net >>> 16) & 255,
    (net >>> 8) & 255,
    net & 255,
  ];
  return `${netOctets.join('.')}/${prefix}`;
}

export class RouterManager {
  constructor(private client: ProxmoxAPIClient) {}

  async createRouter(options: RouterOptions): Promise<RouterResult> {
    const vmid = options.vmid ?? routerConfig.vmid;
    const name = options.name ?? routerConfig.name;
    const wanBridge = options.wanBridge ?? routerConfig.wanBridge;
    const lanBridge = options.lanBridge ?? routerConfig.lanBridge;
    const lanAddress = options.lanAddress ?? routerConfig.lanAddress;
    const lanPrefix = options.lanPrefix ?? routerConfig.lanPrefix;
    const advertiseRoutes = options.advertiseRoutes ?? routerConfig.advertiseRoutes;
    const apiPort = options.apiPort ?? 6443;
    const snippetStorage = options.snippetStorage ?? 'local';
    const nameserver = options.nameserver ?? '1.1.1.1 8.8.8.8';

    if (!options.tailscaleAuthKey) {
      throw new Error('router requires a Tailscale auth key (TAILSCALE_AUTHKEY)');
    }
    if (options.masterIps.length === 0) {
      throw new Error('router requires at least one control-plane IP for HAProxy');
    }

    // The cluster CIDR is the LAN address's network -- reuse it for the NAT rule
    // so it cannot drift from the addressing.
    const clusterCidr = networkCidr(lanAddress, lanPrefix);

    console.log(`Creating router ${name} (VMID: ${vmid}) at ${lanAddress}...`);
    const cloneTask = await this.client.cloneVM(options.templateVmid, vmid, name);
    await this.client.waitForTask(cloneTask);

    // Upload the cloud-init user-data snippet, then point the VM at it. Done
    // before first boot: changing cloud-init after boot re-runs it and
    // regenerates SSH host keys.
    const userData = await renderCloudInit({
      clusterCidr,
      lanAddress,
      advertiseRoutes,
      authKey: options.tailscaleAuthKey,
      hostname: name,
      masterIps: options.masterIps,
      apiPort,
    });
    const snippetFilename = `${name}-${vmid}-user.yaml`;
    await this.client.uploadSnippetContent(snippetStorage, snippetFilename, userData);

    // Two NICs: net0 = WAN (DHCP, default route), net1 = cluster LAN (static
    // gateway address, no gateway of its own -- egress goes out the WAN side).
    await this.client.configureVM(vmid, {
      net0: `virtio,bridge=${wanBridge}`,
      net1: `virtio,bridge=${lanBridge}`,
      ipconfig0: 'ip=dhcp',
      ipconfig1: `ip=${lanAddress}/${lanPrefix}`,
      nameserver,
      cicustom: `user=${snippetStorage}:snippets/${snippetFilename}`,
      memory: options.memoryMB ?? routerConfig.memoryMB,
      cores: options.cores ?? routerConfig.cores,
      onboot: 1,
    });

    console.log(`Starting router ${name}...`);
    const startTask = await this.client.startVM(vmid);
    await this.client.waitForTask(startTask);

    // The mgmt VM shares the cluster L2, so it can reach the router's LAN
    // address directly once SSH is up -- no need to wait on the WAN side.
    console.log(`Waiting for router to accept SSH at ${lanAddress}...`);
    const ready = await waitForPort(lanAddress, 22, 300000);
    if (!ready) {
      throw new Error(`router ${name} (${lanAddress}) did not accept SSH within 5 minutes`);
    }
    console.log(`Router ${name} ready at ${lanAddress}`);

    return { vmid, name, lanAddress };
  }
}

/** Polls a TCP port until it accepts a connection or the timeout elapses. */
async function waitForPort(host: string, port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const open = await new Promise<boolean>((resolve) => {
      const socket = new Socket();
      const done = (result: boolean) => {
        socket.destroy();
        resolve(result);
      };
      socket.setTimeout(3000);
      socket.once('connect', () => done(true));
      socket.once('timeout', () => done(false));
      socket.once('error', () => done(false));
      socket.connect(port, host);
    });
    if (open) return true;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return false;
}

export const createRouterManager = (client: ProxmoxAPIClient): RouterManager => {
  return new RouterManager(client);
};
