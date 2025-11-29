import { ProxmoxAPIClient } from './proxmox-client';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ClusterNode {
  vmid: number;
  name: string;
  role: 'master' | 'worker';
  ip?: string;
}

export interface ClusterOptions {
  name: string;
  templateVmid: number;
  masterCount: number;
  workerCount: number;
  sshPrivateKey: string; // SSH private key to access the VMs
  sshUser?: string; // SSH user for VMs (default: ubuntu)
  startVmid?: number;
}

export interface ClusterStatus {
  name: string;
  status: 'creating' | 'provisioning' | 'running' | 'failed';
  nodes: ClusterNode[];
  error?: string;
}

// Configuration from environment variables
const kubesprayConfig = {
  // Path to Kubespray installation
  path: process.env.KUBESPRAY_PATH || '/opt/kubespray',
  // Directory to store cluster inventories
  inventoryDir: process.env.KUBESPRAY_INVENTORY_DIR || '/tmp/kubespray-inventories',
};

export class KubernetesClusterManager {
  constructor(private client: ProxmoxAPIClient) {}

  async createCluster(options: ClusterOptions): Promise<ClusterStatus> {
    const {
      name,
      templateVmid,
      masterCount,
      workerCount,
      sshPrivateKey,
      sshUser = 'ubuntu',
    } = options;

    const nodes: ClusterNode[] = [];
    let currentVmid = options.startVmid || await this.client.getNextVMID();

    try {
      // Create master nodes
      console.log(`Creating ${masterCount} master node(s)...`);
      for (let i = 0; i < masterCount; i++) {
        const nodeName = `${name}-master-${i + 1}`;
        const vmid = currentVmid++;

        console.log(`Cloning template to create ${nodeName} (VMID: ${vmid})...`);
        const taskId = await this.client.cloneVM(templateVmid, vmid, nodeName);
        await this.client.waitForTask(taskId);

        nodes.push({
          vmid,
          name: nodeName,
          role: 'master',
        });
      }

      // Create worker nodes
      console.log(`Creating ${workerCount} worker node(s)...`);
      for (let i = 0; i < workerCount; i++) {
        const nodeName = `${name}-worker-${i + 1}`;
        const vmid = currentVmid++;

        console.log(`Cloning template to create ${nodeName} (VMID: ${vmid})...`);
        const taskId = await this.client.cloneVM(templateVmid, vmid, nodeName);
        await this.client.waitForTask(taskId);

        nodes.push({
          vmid,
          name: nodeName,
          role: 'worker',
        });
      }

      // Start all nodes
      console.log('Starting all nodes...');
      for (const node of nodes) {
        console.log(`Starting ${node.name}...`);
        const taskId = await this.client.startVM(node.vmid);
        await this.client.waitForTask(taskId);
      }

      // Wait for all nodes to get IP addresses
      console.log('Waiting for nodes to get IP addresses...');
      for (const node of nodes) {
        node.ip = await this.client.waitForVMIP(node.vmid);
        console.log(`${node.name}: ${node.ip}`);
      }

      // Generate Kubespray inventory locally
      console.log('Generating Kubespray inventory...');
      const inventoryPath = await this.prepareInventory(name, nodes, sshPrivateKey, sshUser);

      // Run Kubespray locally
      console.log('Running Kubespray playbook...');
      await this.runKubespray(inventoryPath);

      // Retrieve kubeconfig from master node
      console.log('Retrieving kubeconfig from master node...');
      const masterNode = nodes.find(n => n.role === 'master');
      if (masterNode?.ip) {
        const kubeconfig = await this.retrieveKubeconfig(
          masterNode.ip,
          sshUser,
          path.join(inventoryPath, 'ssh_key')
        );
        if (kubeconfig) {
          const kubeconfigPath = path.join(inventoryPath, 'kubeconfig');
          await fs.writeFile(kubeconfigPath, kubeconfig);
          console.log(`Kubeconfig saved to ${kubeconfigPath}`);
        }
      }

      console.log('Kubernetes cluster created successfully!');
      return {
        name,
        status: 'running',
        nodes,
      };

    } catch (error) {
      console.error('Failed to create cluster:', error);

      // Clean up created nodes on failure
      if (nodes.length > 0) {
        console.log('Cleaning up created nodes...');
        await this.deleteCluster(nodes);
      }

      return {
        name,
        status: 'failed',
        nodes: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async prepareInventory(
    clusterName: string,
    nodes: ClusterNode[],
    sshPrivateKey: string,
    sshUser: string
  ): Promise<string> {
    const clusterDir = path.join(kubesprayConfig.inventoryDir, clusterName);

    // Create directory structure
    await fs.mkdir(path.join(clusterDir, 'group_vars', 'all'), { recursive: true });
    await fs.mkdir(path.join(clusterDir, 'group_vars', 'k8s_cluster'), { recursive: true });

    // Write SSH private key
    const sshKeyPath = path.join(clusterDir, 'ssh_key');
    await fs.writeFile(sshKeyPath, sshPrivateKey, { mode: 0o600 });

    // Generate and write hosts.yaml
    const inventory = this.generateKubesprayInventory(nodes, sshUser, sshKeyPath);
    await fs.writeFile(path.join(clusterDir, 'hosts.yaml'), inventory);

    // Copy sample group_vars from Kubespray (resolve to handle relative paths)
    const kubesprayAbsPath = path.resolve(kubesprayConfig.path);
    const sampleDir = path.join(kubesprayAbsPath, 'inventory', 'sample', 'group_vars');
    await this.copyDir(sampleDir, path.join(clusterDir, 'group_vars'));

    return clusterDir;
  }

  private async copyDir(src: string, dest: string): Promise<void> {
    try {
      const entries = await fs.readdir(src, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
          await fs.mkdir(destPath, { recursive: true });
          await this.copyDir(srcPath, destPath);
        } else {
          await fs.copyFile(srcPath, destPath);
        }
      }
    } catch (error) {
      console.error(`Failed to copy ${src} to ${dest}:`, error);
    }
  }

  private generateKubesprayInventory(
    nodes: ClusterNode[],
    sshUser: string,
    sshKeyPath: string
  ): string {
    const masters = nodes.filter(n => n.role === 'master');
    const workers = nodes.filter(n => n.role === 'worker');

    const allHosts: Record<string, {
      ansible_host: string;
      ip: string;
      access_ip: string;
      ansible_user: string;
      ansible_ssh_private_key_file: string;
    }> = {};

    for (const node of nodes) {
      if (node.ip) {
        allHosts[node.name] = {
          ansible_host: node.ip,
          ip: node.ip,
          access_ip: node.ip,
          ansible_user: sshUser,
          ansible_ssh_private_key_file: sshKeyPath,
        };
      }
    }

    const inventory = {
      all: {
        hosts: allHosts,
        children: {
          kube_control_plane: {
            hosts: Object.fromEntries(masters.map(m => [m.name, null])),
          },
          kube_node: {
            hosts: Object.fromEntries(workers.map(w => [w.name, null])),
          },
          etcd: {
            hosts: Object.fromEntries(masters.map(m => [m.name, null])),
          },
          k8s_cluster: {
            children: {
              kube_control_plane: null,
              kube_node: null,
            },
          },
          calico_rr: {
            hosts: {},
          },
        },
      },
    };

    return this.toYaml(inventory);
  }

  private async runKubespray(inventoryPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Resolve to absolute paths to handle relative KUBESPRAY_PATH
      const kubesprayAbsPath = path.resolve(kubesprayConfig.path);
      const playbookPath = path.join(kubesprayAbsPath, 'cluster.yml');
      const hostsPath = path.resolve(path.join(inventoryPath, 'hosts.yaml'));

      const args = [
        '-i', hostsPath,
        playbookPath,
        '-b',
        '--become-user=root',
      ];

      // Use ansible-playbook from venv if it exists, otherwise fall back to system
      const venvAnsiblePlaybook = path.join(kubesprayAbsPath, 'venv', 'bin', 'ansible-playbook');
      const ansiblePlaybook = existsSync(venvAnsiblePlaybook) ? venvAnsiblePlaybook : 'ansible-playbook';
      console.log(`Running: ${ansiblePlaybook} ${args.join(' ')}`);

      const proc = spawn(ansiblePlaybook, args, {
        cwd: kubesprayAbsPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ANSIBLE_HOST_KEY_CHECKING: 'False',
        },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        console.log(output);
      });

      proc.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        console.error(output);
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Kubespray failed with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to run ansible-playbook: ${err.message}`));
      });
    });
  }

  private async retrieveKubeconfig(
    masterIp: string,
    sshUser: string,
    sshKeyPath: string
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const args = [
        '-i', sshKeyPath,
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'UserKnownHostsFile=/dev/null',
        `${sshUser}@${masterIp}`,
        'sudo cat /etc/kubernetes/admin.conf',
      ];

      console.log(`Retrieving kubeconfig via SSH from ${masterIp}...`);

      const proc = spawn('ssh', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0 && stdout) {
          resolve(stdout);
        } else {
          console.error(`Failed to retrieve kubeconfig: ${stderr}`);
          resolve(null);
        }
      });

      proc.on('error', (err) => {
        console.error(`SSH error: ${err.message}`);
        resolve(null);
      });
    });
  }

  async getKubeconfig(clusterName: string): Promise<string | null> {
    const kubeconfigPath = path.join(
      kubesprayConfig.inventoryDir,
      clusterName,
      'kubeconfig'
    );
    try {
      return await fs.readFile(kubeconfigPath, 'utf-8');
    } catch {
      return null;
    }
  }

  private toYaml(obj: any, indent: number = 0): string {
    const spaces = '  '.repeat(indent);
    let result = '';

    for (const [key, value] of Object.entries(obj)) {
      if (value === null) {
        result += `${spaces}${key}:\n`;
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        result += `${spaces}${key}:\n`;
        result += this.toYaml(value, indent + 1);
      } else if (Array.isArray(value)) {
        result += `${spaces}${key}:\n`;
        for (const item of value) {
          result += `${spaces}  - ${item}\n`;
        }
      } else {
        result += `${spaces}${key}: ${value}\n`;
      }
    }

    return result;
  }

  async deleteCluster(nodes: ClusterNode[]): Promise<void> {
    console.log('Deleting cluster nodes...');
    for (const node of nodes) {
      try {
        // Stop VM first
        console.log(`Stopping ${node.name}...`);
        const stopTaskId = await this.client.stopVM(node.vmid);
        await this.client.waitForTask(stopTaskId).catch(() => {});

        // Delete VM
        console.log(`Deleting ${node.name}...`);
        const deleteTaskId = await this.client.deleteVM(node.vmid);
        await this.client.waitForTask(deleteTaskId);
      } catch (error) {
        console.error(`Failed to delete ${node.name}:`, error);
      }
    }
    console.log('Cluster deleted.');
  }
}

export const createKubernetesClusterManager = (client: ProxmoxAPIClient): KubernetesClusterManager => {
  return new KubernetesClusterManager(client);
};
