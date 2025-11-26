import { ProxmoxAPIClient } from './proxmox-client';
import { createProxmoxSSHClient } from './ssh-client';
import { proxmoxConfig } from '../config/proxmox';
import type { ProxmoxVMConfig } from '../types/proxmox';
import * as yaml from 'yaml';

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
  userDataCommands?: string[];
  snippetStorage?: string;
  cloudImageUrl?: string;
  isoStorage?: string;
}

export interface CloudInitUserData {
  users?: Array<{
    name: string;
    lock_passwd?: boolean;
    sudo?: string;
    shell?: string;
    ssh_authorized_keys?: string[];
  }>;
  package_upgrade?: boolean;
  packages?: string[];
  runcmd?: string[];
  [key: string]: unknown;
}

export class VMTemplateManager {
  constructor(private client: ProxmoxAPIClient) {}

  private generateUserDataYaml(
    baseUserData: string | null,
    customCommands: string[],
    options: TemplateOptions
  ): string {
    let userData: CloudInitUserData = {};

    // Parse existing user data if available
    if (baseUserData) {
      try {
        userData = yaml.parse(baseUserData) || {};
      } catch {
        userData = {};
      }
    }

    // Initialize runcmd array if not present
    if (!userData.runcmd) {
      userData.runcmd = [];
    }

    // Add custom commands
    userData.runcmd.push(...customCommands);

    // Ensure user is set if provided
    if (options.cloudInitUser) {
      if (!userData.users) {
        userData.users = [];
      }
      const existingUser = userData.users.find(u => u.name === options.cloudInitUser);
      if (!existingUser) {
        const newUser: CloudInitUserData['users'] extends (infer T)[] | undefined ? T : never = {
          name: options.cloudInitUser,
          lock_passwd: !options.cloudInitPassword,
          sudo: 'ALL=(ALL) NOPASSWD:ALL',
          shell: '/bin/bash',
        };
        if (options.sshKeys) {
          newUser.ssh_authorized_keys = [options.sshKeys];
        }
        userData.users.push(newUser);
      }
    }

    return '#cloud-config\n' + yaml.stringify(userData);
  }

  async createUbuntuTemplate(options: TemplateOptions = {}): Promise<number> {
    const vmid = options.vmid || proxmoxConfig.template.vmid;
    const name = options.name || proxmoxConfig.template.name;
    const memory = options.memory || 2048;
    const cores = options.cores || 2;
    const sockets = options.sockets || 1;
    const storage = options.storage || proxmoxConfig.template.storage;
    const snippetStorage = options.snippetStorage || 'local';
    const isoStorage = options.isoStorage || proxmoxConfig.template.isoStorage;

    console.log(`Creating cloud-init template with VMID ${vmid}...`);

    // Download cloud image if URL is provided
    if (options.cloudImageUrl) {
      // Use SSH for all operations (qm commands require root for absolute paths)
      const sshClient = createProxmoxSSHClient();
      const storagePath = await sshClient.getStoragePath(isoStorage);
      const downloadPath = `${storagePath}/template/iso`;

      console.log(`Downloading cloud image via SSH from ${options.cloudImageUrl}...`);
      const imagePath = await sshClient.downloadCloudImage(
        options.cloudImageUrl,
        downloadPath
      );
      console.log(`Cloud image downloaded to: ${imagePath}`);

      // Create VM via SSH
      console.log('Creating VM via SSH...');
      await sshClient.createVM(vmid, name, memory, cores, sockets);

      // Import disk via SSH
      console.log('Importing disk via SSH...');
      await sshClient.importDisk(vmid, storage, imagePath);

      // Resize disk
      const diskSize = options.diskSize || '32G';
      console.log(`Resizing disk to ${diskSize}...`);
      await sshClient.resizeDisk(vmid, 'scsi0', diskSize);

      // Configure cloud-init settings via SSH
      console.log('Configuring cloud-init settings via SSH...');
      await sshClient.configureVM(vmid, {
        ide2: `${storage}:cloudinit`,
        boot: 'order=scsi0',
        serial0: 'socket',
        vga: 'serial0',
        ipconfig0: 'ip=dhcp',
        ciuser: options.cloudInitUser,
        cipassword: options.cloudInitPassword,
        sshkeys: options.sshKeys,
      });

      // Handle custom user data commands
      if (options.userDataCommands && options.userDataCommands.length > 0) {
        const userDataYaml = this.generateUserDataYaml(null, options.userDataCommands, options);
        const snippetFilename = `${name}-${vmid}-user.yaml`;

        console.log('Writing custom user data snippet via SSH...');
        await sshClient.writeSnippet(snippetStorage, snippetFilename, userDataYaml);

        await sshClient.configureVM(vmid, {
          cicustom: `user=${snippetStorage}:snippets/${snippetFilename}`,
        });
      }

      // Convert to template via SSH
      console.log('Converting VM to template via SSH...');
      await sshClient.convertToTemplate(vmid);

      console.log(`Template ${name} (${vmid}) created successfully!`);
      return vmid;
    } else {
      // Create VM without imported disk (original behavior)
      const vmConfig = {
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
        serial0: 'socket',
        vga: 'serial0',
        ostype: 'l26',
        agent: 'enabled=1',
      } as ProxmoxVMConfig & { serial0: string; vga: string };

      if (options.cloudInitUser) {
        vmConfig.ciuser = options.cloudInitUser;
      }

      if (options.cloudInitPassword) {
        vmConfig.cipassword = options.cloudInitPassword;
      }

      if (options.sshKeys) {
        vmConfig.sshkeys = encodeURIComponent(options.sshKeys);
      }

      // Handle custom user data commands
      if (options.userDataCommands && options.userDataCommands.length > 0) {
        const userDataYaml = this.generateUserDataYaml(null, options.userDataCommands, options);
        const snippetFilename = `${name}-${vmid}-user.yaml`;

        console.log('Uploading custom user data snippet...');
        await this.client.uploadSnippetContent(snippetStorage, snippetFilename, userDataYaml);

        vmConfig.cicustom = `user=${snippetStorage}:snippets/${snippetFilename}`;
      }

      console.log('Creating VM...');
      const taskId = await this.client.createVM(vmConfig);

      console.log('Waiting for VM creation to complete...');
      await this.client.waitForTask(taskId);
    }

    // Convert to template (for non-cloud-image case)
    console.log('Converting VM to template...');
    await this.client.convertToTemplate(vmid);

    console.log(`Template ${name} (${vmid}) created successfully!`);
    return vmid;
  }

  private extractFilenameFromUrl(url: string): string {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop() || 'cloud-image.img';
    return filename;
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
