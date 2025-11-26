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

  async deleteStorageContent(
    storage: string,
    volume: string
  ): Promise<void> {
    try {
      await this.request(
        `/nodes/${this.node}/storage/${storage}/content/${encodeURIComponent(volume)}`,
        'DELETE'
      );
    } catch (error) {
      // Ignore error if file doesn't exist
      console.log(`Could not delete ${volume}: ${error}`);
    }
  }

  async downloadCloudImage(
    url: string,
    filename: string,
    storage: string = proxmoxConfig.template.isoStorage
  ): Promise<string> {
    // Delete existing file if it exists
    const volume = `${storage}:images/${filename}`;
    await this.deleteStorageContent(storage, volume);

    const response = await this.request<ProxmoxTaskResponse>(
      `/nodes/${this.node}/storage/${storage}/download-url`,
      'POST',
      {
        content: 'images',
        filename,
        url,
      }
    );
    return response.data;
  }

  async getCloudInitUserData(vmid: number): Promise<string> {
    const response = await this.request<{ data: string }>(
      `/nodes/${this.node}/qemu/${vmid}/cloudinit/dump?type=user`,
      'GET'
    );
    return response.data;
  }

  async uploadSnippet(
    filename: string,
    content: string,
    storage: string = 'local'
  ): Promise<void> {
    const headers: HeadersInit = {
      Authorization: `PVEAPIToken=${this.user}!${this.tokenId}=${this.apiToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    const formData = new URLSearchParams();
    formData.append('content', 'snippets');
    formData.append('filename', filename);

    const response = await fetch(
      `${this.baseUrl}/nodes/${this.node}/storage/${storage}/upload`,
      {
        method: 'POST',
        headers,
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload snippet: ${response.status} - ${errorText}`);
    }
  }

  async writeSnippetFile(
    filename: string,
    content: string,
    storage: string = 'local'
  ): Promise<void> {
    const response = await this.request<{ data: any }>(
      `/nodes/${this.node}/storage/${storage}/content`,
      'POST',
      {
        content: 'snippets',
        filename,
      }
    );
  }

  async uploadSnippetContent(
    storage: string,
    filename: string,
    content: string
  ): Promise<void> {
    const headers: HeadersInit = {
      Authorization: `PVEAPIToken=${this.user}!${this.tokenId}=${this.apiToken}`,
    };

    // Create a multipart form with the file content
    const formData = new FormData();
    formData.append('content', 'snippets');
    const blob = new Blob([content], { type: 'text/yaml' });
    formData.append('filename', new File([blob], filename, { type: 'text/yaml' }));

    const response = await fetch(
      `${this.baseUrl}/nodes/${this.node}/storage/${storage}/upload`,
      {
        method: 'POST',
        headers,
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload snippet content: ${response.status} - ${errorText}`);
    }
  }

  async createVMWithImportedDisk(
    vmid: number,
    name: string,
    memory: number,
    cores: number,
    sockets: number,
    storage: string,
    imagePath: string
  ): Promise<string> {
    // First create a basic VM
    const vmConfig: ProxmoxVMConfig = {
      vmid,
      name,
      memory,
      cores,
      sockets,
      cpu: 'host',
      net0: 'virtio,bridge=vmbr0',
      scsihw: 'virtio-scsi-pci',
      ostype: 'l26',
      agent: 'enabled=1',
    };

    const response = await this.request<ProxmoxTaskResponse>(
      `/nodes/${this.node}/qemu`,
      'POST',
      vmConfig as unknown as Record<string, unknown>
    );

    await this.waitForTask(response.data);

    // Use absolute path for import-from (downloaded via SSH)
    const importResponse = await this.request<ProxmoxTaskResponse>(
      `/nodes/${this.node}/qemu/${vmid}/config`,
      'PUT',
      {
        scsi0: `${storage}:0,import-from=${imagePath}`,
      }
    );

    return importResponse.data || 'OK';
  }

  async getStorages(): Promise<Array<{
    storage: string;
    type: string;
    content: string;
    active: number;
  }>> {
    const response = await this.request<{ data: Array<{
      storage: string;
      type: string;
      content: string;
      active: number;
    }> }>(
      `/nodes/${this.node}/storage`,
      'GET'
    );
    return response.data;
  }

  async getStoragePath(storage: string): Promise<string> {
    const response = await this.request<{ data: { path: string } }>(
      `/storage/${storage}`,
      'GET'
    );
    return response.data.path;
  }

  async configureVM(
    vmid: number,
    config: Record<string, string | number | undefined>
  ): Promise<void> {
    // Filter out undefined values
    const filteredConfig = Object.fromEntries(
      Object.entries(config).filter(([, value]) => value !== undefined)
    );

    if (Object.keys(filteredConfig).length === 0) {
      return;
    }

    await this.request(
      `/nodes/${this.node}/qemu/${vmid}/config`,
      'PUT',
      filteredConfig
    );
  }

  async resizeDisk(
    vmid: number,
    disk: string,
    size: string
  ): Promise<void> {
    await this.request(
      `/nodes/${this.node}/qemu/${vmid}/resize`,
      'PUT',
      {
        disk,
        size,
      }
    );
  }
}

export const createProxmoxClient = (): ProxmoxAPIClient => {
  return new ProxmoxAPIClient();
};
