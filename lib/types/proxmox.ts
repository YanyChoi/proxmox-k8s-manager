export interface ProxmoxAuthResponse {
  data: {
    ticket: string;
    CSRFPreventionToken: string;
    username: string;
  };
}

export interface ProxmoxVMConfig {
  vmid: number;
  name: string;
  memory?: number;
  cores?: number;
  sockets?: number;
  cpu?: string;
  net0?: string;
  ide2?: string;
  scsi0?: string;
  scsihw?: string;
  ostype?: string;
  boot?: string;
  agent?: string;
  ciuser?: string;
  cipassword?: string;
  sshkeys?: string;
  ipconfig0?: string;
  nameserver?: string;
  searchdomain?: string;
  cicustom?: string;
}

export interface ProxmoxTaskResponse {
  data: string;
}

export interface ProxmoxTaskStatus {
  data: {
    status: 'running' | 'stopped';
    exitstatus?: string;
  };
}

export interface ProxmoxVMStatus {
  data: {
    status: 'running' | 'stopped';
    vmid: number;
    name: string;
    uptime?: number;
    /** CPU usage as a fraction of total capacity (0-1), already normalized across vCPUs. */
    cpu?: number;
    cpus?: number;
    mem?: number;
    maxmem?: number;
    /** In-guest disk usage; often 0 unless the guest agent reports it. */
    disk?: number;
    maxdisk?: number;
    diskread?: number;
    diskwrite?: number;
    /** Cumulative bytes since boot (not a rate). */
    netin?: number;
    netout?: number;
  };
}

/** Timeframes Proxmox exposes for per-VM RRD data. */
export type RrdTimeframe = 'hour' | 'day' | 'week' | 'month' | 'year';

/**
 * One RRD sample from /nodes/{node}/qemu/{vmid}/rrddata. Unlike status/current,
 * netin/netout/diskread/diskwrite here are per-interval RATES (bytes/sec), and
 * `cpu` is a 0-1 fraction with `maxcpu` = core count. Fields can be missing for
 * buckets with no data.
 */
export interface ProxmoxRrdSample {
  time: number;
  cpu?: number;
  maxcpu?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  netin?: number;
  netout?: number;
  diskread?: number;
  diskwrite?: number;
}

export interface ProxmoxError {
  errors?: Record<string, string>;
}

export interface ProxmoxClient {
  ticket: string;
  csrfToken: string;
  authenticate(): Promise<void>;
  createVM(config: ProxmoxVMConfig): Promise<string>;
  getVMStatus(vmid: number): Promise<ProxmoxVMStatus>;
  convertToTemplate(vmid: number): Promise<void>;
  cloneVM(vmid: number, newVmid: number, name: string): Promise<string>;
  deleteVM(vmid: number): Promise<string>;
}
