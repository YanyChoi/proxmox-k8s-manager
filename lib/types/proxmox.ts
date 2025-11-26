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
    cpus?: number;
    maxmem?: number;
    maxdisk?: number;
  };
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
