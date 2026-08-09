import { ProxmoxAPIClient } from './proxmox-client';
import { routerConfig } from '../config/proxmox';
import { Socket } from 'net';
import * as yaml from 'yaml';

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
 * Builds HAProxy in TCP mode fronting the control plane. `tcp-check` probes the
 * TLS port rather than doing an HTTP health check -- the apiserver's /healthz
 * needs auth, and a bare TCP connect is enough to route around a dead node.
 * Backends that don't exist yet (nodes are created after the router) simply show
 * DOWN until they boot; the frontend still binds.
 */
function haproxyConfig(masterIps: string[], apiPort: number): string {
  const servers = masterIps
    .map((ip, i) => `    server master-${i + 1} ${ip}:${apiPort} check`)
    .join('\n');
  return `global
    log /dev/log local0
    maxconn 4096

defaults
    mode tcp
    log global
    option tcplog
    timeout connect 5s
    timeout client 30m
    timeout server 30m

frontend k8s-apiserver
    bind *:${apiPort}
    default_backend k8s-control-plane

backend k8s-control-plane
    balance roundrobin
    option tcp-check
${servers}
`;
}

/**
 * nftables masquerade for anything leaving the cluster CIDR. Keyed on source/dest
 * rather than the WAN interface name so it survives cloud-image NIC renaming
 * (ens18/enp*). Loaded by nftables.service at boot, so it persists across reboots.
 */
function nftablesConfig(clusterCidr: string): string {
  return `#!/usr/sbin/nft -f
flush ruleset

table ip nat {
    chain postrouting {
        type nat hook postrouting priority srcnat; policy accept;
        ip saddr ${clusterCidr} ip daddr != ${clusterCidr} masquerade
    }
}
`;
}

/**
 * Assembles the #cloud-config. Files are written first (cloud-init `write_files`
 * runs before `runcmd`), then packages install, then runcmd enables forwarding,
 * loads nftables, starts HAProxy, and brings up Tailscale as a subnet router
 * with SSH. `--accept-dns=false` keeps the router on its own resolver instead of
 * MagicDNS, which the cluster nodes cannot reach.
 */
function buildCloudInit(opts: {
  clusterCidr: string;
  advertiseRoutes: string;
  authKey: string;
  hostname: string;
  masterIps: string[];
  apiPort: number;
}): string {
  const config = {
    hostname: opts.hostname,
    package_update: true,
    packages: ['haproxy', 'nftables'],
    write_files: [
      {
        path: '/etc/sysctl.d/99-router.conf',
        content: 'net.ipv4.ip_forward=1\nnet.ipv6.conf.all.forwarding=1\n',
      },
      {
        path: '/etc/nftables.conf',
        permissions: '0755',
        content: nftablesConfig(opts.clusterCidr),
      },
      {
        path: '/etc/haproxy/haproxy.cfg',
        content: haproxyConfig(opts.masterIps, opts.apiPort),
      },
    ],
    runcmd: [
      'sysctl --system',
      'systemctl enable --now nftables',
      'systemctl restart haproxy',
      'systemctl enable haproxy',
      'curl -fsSL https://tailscale.com/install.sh | sh',
      // Idempotent: `tailscale up` re-runs cleanly if cloud-init retries.
      `tailscale up --authkey=${opts.authKey} ` +
        `--advertise-routes=${opts.advertiseRoutes} ` +
        `--accept-dns=false --ssh --hostname=${opts.hostname}`,
    ],
  };

  return '#cloud-config\n' + yaml.stringify(config);
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

    // The cluster CIDR is the LAN address's network -- reuse it for both the NAT
    // rule and the advertised route default so they cannot drift apart.
    const clusterCidr = `${lanAddress.split('.').slice(0, 2).join('.')}.0.0/${lanPrefix}`;

    console.log(`Creating router ${name} (VMID: ${vmid}) at ${lanAddress}...`);
    const cloneTask = await this.client.cloneVM(options.templateVmid, vmid, name);
    await this.client.waitForTask(cloneTask);

    // Upload the cloud-init user-data snippet, then point the VM at it. Done
    // before first boot: changing cloud-init after boot re-runs it and
    // regenerates SSH host keys.
    const userData = buildCloudInit({
      clusterCidr,
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
