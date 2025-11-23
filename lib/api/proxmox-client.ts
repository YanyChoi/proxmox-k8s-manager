import { proxmoxConfig } from '../config/proxmox';
import type {
  ProxmoxClient,
  ProxmoxVMConfig,
  ProxmoxTaskResponse,
  ProxmoxTaskStatus,
  ProxmoxVMStatus,
} from '../types/proxmox';

export class ProxmoxAPIClient implements ProxmoxClient {
  public ticket: string = '';
  public csrfToken: string = '';

  constructor(
    private host: string = proxmoxConfig.host,
    private port: number = proxmoxConfig.port,
    private user: string = proxmoxConfig.user,
    private tokenId: string = proxmoxConfig.tokenId,
    private apiToken: string = proxmoxConfig.apiToken,
    private node: string = proxmoxConfig.node
  ) {}

  private get baseUrl(): string {
    return `https://${this.host}:${this.port}/api2/json`;
  }

  async authenticate(): Promise<void> {
    if (this.apiToken) {
      this.ticket = 'token';
      this.csrfToken = 'token';
    } else {
      throw new Error('API token is required for authentication');
    }
  }

  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: Record<string, unknown>
  ): Promise<T> {
    if (!this.ticket || !this.csrfToken) {
      await this.authenticate();
    }

    const headers: HeadersInit = {
      Authorization: `PVEAPIToken=${this.user}!${this.tokenId}=${this.apiToken}`,
    };

    if (method !== 'GET') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && method !== 'GET') {
      options.body = new URLSearchParams(
        Object.entries(body).reduce((acc, [key, value]) => {
          acc[key] = String(value);
          return acc;
        }, {} as Record<string, string>)
      );
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async listVMs(): Promise<any[]> {
    const response = await this.request<{ data: any[] }>(
      `/cluster/resources?type=vm`,
      'GET'
    );

    // Fetch IP addresses for running VMs
    const vmsWithIPs = await Promise.all(
      response.data.map(async (vm) => {
        if (vm.status === 'running') {
          const interfaces = await this.getVMInterfaces(vm.vmid);
          const ipAddress = this.extractIPAddress(interfaces);
          return { ...vm, ipAddress };
        }
        return { ...vm, ipAddress: null };
      })
    );

    return vmsWithIPs;
  }

  private extractIPAddress(interfaces: any): string | null {
    if (!interfaces) return null;

    // Look for non-loopback IPv4 address
    for (const iface of interfaces) {
      if (iface.name === 'lo') continue; // Skip loopback

      if (iface['ip-addresses']) {
        for (const ip of iface['ip-addresses']) {
          if (ip['ip-address-type'] === 'ipv4' && !ip['ip-address'].startsWith('127.')) {
            return ip['ip-address'];
          }
        }
      }
    }

    return null;
  }

  async createVM(config: ProxmoxVMConfig): Promise<string> {
    const response = await this.request<ProxmoxTaskResponse>(
      `/nodes/${this.node}/qemu`,
      'POST',
      config as unknown as Record<string, unknown>
    );
    return response.data;
  }

  async getVMStatus(vmid: number): Promise<ProxmoxVMStatus> {
    return this.request<ProxmoxVMStatus>(
      `/nodes/${this.node}/qemu/${vmid}/status/current`,
      'GET'
    );
  }

  async getVMInterfaces(vmid: number): Promise<any> {
    try {
      const response = await this.request<{ data: { result: any } }>(
        `/nodes/${this.node}/qemu/${vmid}/agent/network-get-interfaces`,
        'GET'
      );
      return response.data.result;
    } catch (error) {
      // QEMU agent might not be running or installed
      return null;
    }
  }

  async convertToTemplate(vmid: number): Promise<void> {
    await this.request(
      `/nodes/${this.node}/qemu/${vmid}/template`,
      'POST'
    );
  }

  async cloneVM(vmid: number, newVmid: number, name: string): Promise<string> {
    const response = await this.request<ProxmoxTaskResponse>(
      `/nodes/${this.node}/qemu/${vmid}/clone`,
      'POST',
      {
        newid: newVmid,
        name,
        full: 1,
      }
    );
    return response.data;
  }

  async startVM(vmid: number): Promise<string> {
    const response = await this.request<ProxmoxTaskResponse>(
      `/nodes/${this.node}/qemu/${vmid}/status/start`,
      'POST'
    );
    return response.data;
  }

  async stopVM(vmid: number): Promise<string> {
    const response = await this.request<ProxmoxTaskResponse>(
      `/nodes/${this.node}/qemu/${vmid}/status/stop`,
      'POST'
    );
    return response.data;
  }

  async deleteVM(vmid: number): Promise<string> {
    const response = await this.request<ProxmoxTaskResponse>(
      `/nodes/${this.node}/qemu/${vmid}`,
      'DELETE'
    );
    return response.data;
  }

  async waitForTask(upid: string, timeout: number = 300000): Promise<void> {
    const encodedUpid = encodeURIComponent(upid);
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const status = await this.request<ProxmoxTaskStatus>(
        `/nodes/${this.node}/tasks/${encodedUpid}/status`,
        'GET'
      );

      if (status.data.status === 'stopped') {
        if (status.data.exitstatus === 'OK') {
          return;
        }
        throw new Error(`Task failed with status: ${status.data.exitstatus}`);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error('Task timeout');
  }

  async downloadCloudImage(
    url: string,
    filename: string,
    storage: string = proxmoxConfig.template.isoStorage
  ): Promise<string> {
    const response = await this.request<ProxmoxTaskResponse>(
      `/nodes/${this.node}/storage/${storage}/download-url`,
      'POST',
      {
        content: 'iso',
        filename,
        url,
      }
    );
    return response.data;
  }
}

export const createProxmoxClient = (): ProxmoxAPIClient => {
  return new ProxmoxAPIClient();
};
