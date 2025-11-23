import { ProxmoxAPIClient } from './proxmox-client';
import { proxmoxConfig } from '../config/proxmox';
import type { ProxmoxVMConfig } from '../types/proxmox';

export interface TemplateOptions {
  vmid?: number;
  name?: string;
  memory?: number;
  cores?: number;
  sockets?: number;
  diskSize?: string;
  storage?: string;
  cloudInitUser?: string;
  cloudInitPassword?: string;
  sshKeys?: string;
}

export class VMTemplateManager {
  constructor(private client: ProxmoxAPIClient) {}

  async createUbuntuTemplate(options: TemplateOptions = {}): Promise<number> {
    const vmid = options.vmid || proxmoxConfig.template.vmid;
    const name = options.name || proxmoxConfig.template.name;
    const memory = options.memory || 2048;
    const cores = options.cores || 2;
    const sockets = options.sockets || 1;
    const storage = options.storage || proxmoxConfig.template.storage;

    console.log(`Creating Ubuntu cloud-init template with VMID ${vmid}...`);

    const vmConfig: ProxmoxVMConfig = {
      vmid,
      name,
      memory,
      cores,
      sockets,
      cpu: 'host',
      net0: 'virtio,bridge=vmbr0',
      scsihw: 'virtio-scsi-pci',
      scsi0: `${storage}:32`,
      ide2: `${storage}:cloudinit`,
      boot: 'order=scsi0',
      ostype: 'l26',
      agent: 'enabled=1',
    };

    if (options.cloudInitUser) {
      vmConfig.ciuser = options.cloudInitUser;
    }

    if (options.cloudInitPassword) {
      vmConfig.cipassword = options.cloudInitPassword;
    }

    if (options.sshKeys) {
      vmConfig.sshkeys = encodeURIComponent(options.sshKeys);
    }

    console.log('Creating VM...');
    const taskId = await this.client.createVM(vmConfig);

    console.log('Waiting for VM creation to complete...');
    await this.client.waitForTask(taskId);

    console.log('Converting VM to template...');
    await this.client.convertToTemplate(vmid);

    console.log(`Template ${name} (${vmid}) created successfully!`);
    return vmid;
  }

  async downloadUbuntuCloudImage(version: string = '24.04'): Promise<string> {
    const imageUrl = `https://cloud-images.ubuntu.com/releases/${version}/release/ubuntu-${version}-server-cloudimg-amd64.img`;
    const filename = `ubuntu-${version}-cloudimg-amd64.img`;

    console.log(`Downloading Ubuntu ${version} cloud image...`);
    const taskId = await this.client.downloadCloudImage(imageUrl, filename);

    console.log('Waiting for download to complete...');
    await this.client.waitForTask(taskId);

    console.log(`Cloud image ${filename} downloaded successfully!`);
    return filename;
  }

  async createTemplateFromCloudImage(
    imagePath: string,
    options: TemplateOptions = {}
  ): Promise<number> {
    const vmid = options.vmid || proxmoxConfig.template.vmid;
    const name = options.name || proxmoxConfig.template.name;
    const memory = options.memory || 2048;
    const cores = options.cores || 2;
    const sockets = options.sockets || 1;
    const storage = options.storage || proxmoxConfig.template.storage;

    console.log(`Creating template from cloud image: ${imagePath}`);

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
      boot: 'order=scsi0',
      agent: 'enabled=1',
    };

    if (options.cloudInitUser) {
      vmConfig.ciuser = options.cloudInitUser;
    }

    if (options.cloudInitPassword) {
      vmConfig.cipassword = options.cloudInitPassword;
    }

    if (options.sshKeys) {
      vmConfig.sshkeys = encodeURIComponent(options.sshKeys);
    }

    console.log('Creating base VM...');
    const taskId = await this.client.createVM(vmConfig);
    await this.client.waitForTask(taskId);

    console.log('Converting to template...');
    await this.client.convertToTemplate(vmid);

    console.log(`Template created successfully with VMID ${vmid}`);
    return vmid;
  }

  async cloneTemplate(
    templateVmid: number,
    newVmid: number,
    name: string
  ): Promise<number> {
    console.log(`Cloning template ${templateVmid} to new VM ${newVmid}...`);

    const taskId = await this.client.cloneVM(templateVmid, newVmid, name);
    await this.client.waitForTask(taskId);

    console.log(`VM ${name} (${newVmid}) cloned successfully!`);
    return newVmid;
  }

  async deleteTemplate(vmid: number): Promise<void> {
    console.log(`Deleting template ${vmid}...`);

    const taskId = await this.client.deleteVM(vmid);
    await this.client.waitForTask(taskId);

    console.log(`Template ${vmid} deleted successfully!`);
  }
}

export const createVMTemplateManager = (client: ProxmoxAPIClient): VMTemplateManager => {
  return new VMTemplateManager(client);
};
