export const proxmoxConfig = {
  host: process.env.PROXMOX_HOST || '',
  port: parseInt(process.env.PROXMOX_PORT || '8006'),
  // PROXMOX_USER should be in format: USER@REALM (e.g., root@pam)
  user: process.env.PROXMOX_USER || 'root@pam',
  // PROXMOX_API_TOKEN_ID is the token name (e.g., mytoken)
  tokenId: process.env.PROXMOX_API_TOKEN_ID || '',
  // PROXMOX_API_TOKEN should be the UUID value
  apiToken: process.env.PROXMOX_API_TOKEN || '',
  node: process.env.PROXMOX_NODE || 'pve',

  ssh: {
    user: process.env.PROXMOX_SSH_USER || 'root',
    port: parseInt(process.env.PROXMOX_SSH_PORT || '22'),
    // SSH_PRIVATE_KEY should be base64 encoded
    privateKey: process.env.SSH_PRIVATE_KEY
      ? Buffer.from(process.env.SSH_PRIVATE_KEY, 'base64').toString('utf-8')
      : '',
  },

  template: {
    storage: process.env.PROXMOX_TEMPLATE_STORAGE || 'local-lvm',
    isoStorage: process.env.PROXMOX_TEMPLATE_ISO_STORAGE || 'local',
    name: process.env.PROXMOX_TEMPLATE_NAME || 'ubuntu-2404-template',
    vmid: parseInt(process.env.PROXMOX_TEMPLATE_VMID || '9000'),
  },

  get baseUrl() {
    return `https://${this.host}:${this.port}/api2/json`;
  },
} as const;

/**
 * The gateway/router VM that fronts the flat 10.100.0.0/16 L2 network: NAT for
 * egress, HAProxy on :6443 in front of the control plane, and a Tailscale
 * subnet router that makes the cluster network reachable over the tailnet.
 *
 * This is provisioned FRESH as part of a new cluster (`ROUTER_VMID` defaults to
 * 101). It is never adopted in place -- point `ROUTER_VMID` at an unused id when
 * building a new stack so an existing, live router is left alone.
 */
export const routerConfig = {
  vmid: parseInt(process.env.ROUTER_VMID || '101'),
  name: process.env.ROUTER_NAME || 'net-router',
  // WAN side: egress + default route, DHCP from the home LAN.
  wanBridge: process.env.ROUTER_WAN_BRIDGE || 'vmbr0',
  // LAN side: the cluster's flat L2 domain; the router owns the gateway address.
  lanBridge: process.env.ROUTER_LAN_BRIDGE || 'vmbr1',
  lanAddress: process.env.ROUTER_LAN_ADDRESS || '10.100.0.1',
  lanPrefix: parseInt(process.env.ROUTER_LAN_PREFIX || '16'),
  // Route the subnet router advertises to the tailnet.
  advertiseRoutes: process.env.ROUTER_ADVERTISE_ROUTES || '10.100.0.0/16',
  memoryMB: parseInt(process.env.ROUTER_MEMORY_MB || '1024'),
  cores: parseInt(process.env.ROUTER_CORES || '1'),
} as const;

/**
 * Tailscale credentials. Two separate mechanisms by design (see decision in the
 * runbook): the router joins with a pre-authorized auth key, while the in-cluster
 * operator authenticates with an OAuth client so it can mint its own device keys.
 */
export const tailscaleConfig = {
  // Router subnet router. Reusable, tagged (tag:k8s-router) auth key. The
  // advertised route must be auto-approved in the tailnet ACL or it stays
  // pending and nothing routes.
  authKey: process.env.TAILSCALE_AUTHKEY || '',
  // In-cluster operator + API server proxy.
  oauthClientId: process.env.TS_OAUTH_CLIENT_ID || '',
  oauthClientSecret: process.env.TS_OAUTH_CLIENT_SECRET || '',
  operatorHostname: process.env.TS_OPERATOR_HOSTNAME || 'tailscale-operator',
  // e.g. "example.ts.net" -- only used to print the API proxy endpoint.
  tailnet: process.env.TS_TAILNET || '',
} as const;
