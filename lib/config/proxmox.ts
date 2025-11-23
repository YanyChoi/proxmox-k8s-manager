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
