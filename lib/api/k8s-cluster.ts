import { ProxmoxAPIClient } from './proxmox-client';
import { createRouterManager, RouterResult } from './router';
import { createTailscaleOperatorManager } from './tailscale-operator';
import { waitForPort } from './net';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';

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
  cni?: string; // CNI plugin (default: cilium)
  startVmid?: number;
  network?: Partial<ClusterNetwork>;
  resources?: Partial<NodeResources>;
  /**
   * Role-based VMID bases, so VMIDs mirror addresses (VMID 11x <-> 10.100.1.1x,
   * 12x <-> 10.100.2.1x) instead of depending on whatever getNextVMID returns.
   * Pass `startVmid` instead to fall back to plain sequential allocation.
   */
  masterVmidBase?: number;
  workerVmidBase?: number;
  /**
   * When set, provision a fresh gateway/router VM (NAT + HAProxy + Tailscale
   * subnet router) BEFORE the nodes -- it owns their gateway address. This
   * always creates a new VM; point `vmid` at an unused id so a live router is
   * left alone.
   */
  router?: RouterProvisionOptions;
  /**
   * When set, install the Tailscale operator (with the API server proxy) into
   * the cluster after Kubespray finishes and the kubeconfig is retrieved.
   */
  operator?: OperatorProvisionOptions;
}

export interface RouterProvisionOptions {
  /** Auth key the router uses to join the tailnet (tagged, reusable). */
  authKey: string;
  vmid?: number;
  wanBridge?: string;
  lanBridge?: string;
}

export interface OperatorProvisionOptions {
  oauthClientId: string;
  oauthClientSecret: string;
  hostname?: string;
  tailnet?: string;
}

/**
 * Node addressing. Every node sits on one flat L2 domain on `bridge` and is
 * masked /`prefixLength` -- the per-role /24s are allocation ranges, not
 * subnets. Cilium's L2 announcements are ARP-based, so the LoadBalancer pool
 * (10.100.9.0/24) must stay in the same broadcast domain as the nodes.
 */
export interface ClusterNetwork {
  bridge: string;
  gateway: string;
  prefixLength: number;
  masterPrefix: string; // first three octets of the control plane range
  workerPrefix: string; // first three octets of the worker range
  hostStart: number; // last octet of the first node in each range
  /**
   * Proxmox seeds guest cloud-init from the *host's* resolver when this is
   * unset. The PVE host resolves via Tailscale MagicDNS (100.100.100.100),
   * which cluster nodes cannot reach -- they would boot with working IP
   * routing but dead DNS. Always set this explicitly.
   */
  nameserver: string;
}

export interface NodeResources {
  memoryMB: number;
  cores: number;
}

export const DEFAULT_NETWORK: ClusterNetwork = {
  bridge: 'vmbr1',
  gateway: '10.100.0.1',
  prefixLength: 16,
  masterPrefix: '10.100.1',
  workerPrefix: '10.100.2',
  hostStart: 11,
  nameserver: '1.1.1.1 8.8.8.8',
};

export const DEFAULT_RESOURCES: NodeResources = {
  memoryMB: 8192,
  cores: 2,
};

export interface ClusterStatus {
  name: string;
  status: 'creating' | 'provisioning' | 'running' | 'failed';
  nodes: ClusterNode[];
  error?: string;
  /**
   * Non-fatal problems from post-cluster add-ons (e.g. the Tailscale operator).
   * The cluster is up and usable; these are surfaced so a failed add-on doesn't
   * masquerade as success but also doesn't roll back a working cluster.
   */
  warnings?: string[];
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
      cni = 'cilium',
    } = options;

    const netCfg: ClusterNetwork = { ...DEFAULT_NETWORK, ...options.network };
    const resources: NodeResources = { ...DEFAULT_RESOURCES, ...options.resources };

    // etcd needs a quorum majority, so an even control plane is strictly worse
    // than the odd number below it -- 2 nodes tolerate 0 failures, same as 1.
    if (masterCount % 2 === 0) {
      throw new Error(
        `masterCount must be odd (1, 3, 5) so etcd can form a quorum; got ${masterCount}`
      );
    }

    const nodes: ClusterNode[] = [];
    // Sequential allocation is only used when role bases are not given.
    let currentVmid = options.startVmid || await this.client.getNextVMID();
    const { masterVmidBase, workerVmidBase } = options;
    let router: RouterResult | undefined;

    try {
      // The router is the nodes' gateway, so it must exist and be routing before
      // any node boots. Its HAProxy backend is the (deterministic) set of
      // control-plane addresses, which we can derive before cloning anything.
      if (options.router) {
        const masterIps = Array.from({ length: masterCount }, (_, i) =>
          this.nodeIp(netCfg, 'master', i)
        );
        const routerManager = createRouterManager(this.client);
        router = await routerManager.createRouter({
          templateVmid,
          tailscaleAuthKey: options.router.authKey,
          masterIps,
          vmid: options.router.vmid,
          wanBridge: options.router.wanBridge,
          lanBridge: netCfg.bridge,
          lanAddress: netCfg.gateway,
          lanPrefix: netCfg.prefixLength,
          nameserver: netCfg.nameserver,
        });
      }

      const planned = [
        ...Array.from({ length: masterCount }, (_, i) => ({ role: 'master' as const, index: i })),
        ...Array.from({ length: workerCount }, (_, i) => ({ role: 'worker' as const, index: i })),
      ];

      for (const { role, index } of planned) {
        const nodeName = `${name}-${role}-${index + 1}`;
        const base = role === 'master' ? masterVmidBase : workerVmidBase;
        const vmid = base !== undefined ? base + index : currentVmid++;
        const ip = this.nodeIp(netCfg, role, index);

        console.log(`Cloning template to create ${nodeName} (VMID: ${vmid}, IP: ${ip})...`);
        const taskId = await this.client.cloneVM(templateVmid, vmid, nodeName);
        await this.client.waitForTask(taskId);

        // Configure before first boot. Changing cloud-init settings after a
        // guest has booted alters its instance-id, which makes cloud-init
        // re-run and regenerate the SSH host keys.
        await this.client.configureVM(vmid, {
          net0: `virtio,bridge=${netCfg.bridge}`,
          ipconfig0: `ip=${ip}/${netCfg.prefixLength},gw=${netCfg.gateway}`,
          nameserver: netCfg.nameserver,
          memory: resources.memoryMB,
          cores: resources.cores,
          onboot: 1,
        });

        nodes.push({ vmid, name: nodeName, role, ip });
      }

      // Start all nodes
      console.log('Starting all nodes...');
      for (const node of nodes) {
        console.log(`Starting ${node.name}...`);
        const taskId = await this.client.startVM(node.vmid);
        await this.client.waitForTask(taskId);
      }

      // Addresses are assigned above rather than discovered, so there is no
      // waitForVMIP() poll here -- which also drops the dependency on
      // qemu-guest-agent, the slowest part of a cold boot. We only need to
      // know each node is accepting SSH before handing over to Ansible.
      console.log('Waiting for nodes to accept SSH...');
      for (const node of nodes) {
        const ready = await waitForPort(node.ip!, 22, 300000);
        if (!ready) {
          throw new Error(`${node.name} (${node.ip}) did not accept SSH within 5 minutes`);
        }
        console.log(`${node.name}: ready at ${node.ip}`);
      }

      // Generate Kubespray inventory locally
      console.log('Generating Kubespray inventory...');
      const inventoryPath = await this.prepareInventory(name, nodes, sshPrivateKey, sshUser, cni);

      // Run Kubespray locally
      console.log('Running Kubespray playbook...');
      await this.runKubespray(inventoryPath);

      // Retrieve kubeconfig from master node. admin.conf already points at the
      // HAProxy VIP (loadbalancer_apiserver in group_vars/all), so it is usable
      // as-is from the mgmt VM -- including for the operator install below.
      console.log('Retrieving kubeconfig from master node...');
      const masterNode = nodes.find(n => n.role === 'master');
      let kubeconfigPath: string | undefined;
      if (masterNode?.ip) {
        const kubeconfig = await this.retrieveKubeconfig(
          masterNode.ip,
          sshUser,
          path.join(inventoryPath, 'ssh_key')
        );
        if (kubeconfig) {
          kubeconfigPath = path.join(inventoryPath, 'kubeconfig');
          await fs.writeFile(kubeconfigPath, kubeconfig);
          console.log(`Kubeconfig saved to ${kubeconfigPath}`);
        }
      }

      // Install the Tailscale operator + API server proxy, so the cluster is
      // reachable over the tailnet by identity with no certs to distribute.
      //
      // This is a POST-cluster add-on: by now the cluster is fully built and
      // working, and the likeliest failure (a missing tailnet ACL grant) is an
      // external prerequisite. So its errors are caught here and recorded as a
      // warning rather than allowed to reach the catch below, which would delete
      // an otherwise healthy cluster.
      const warnings: string[] = [];
      if (options.operator) {
        try {
          if (!kubeconfigPath) {
            throw new Error('kubeconfig was not retrieved');
          }
          const result = await createTailscaleOperatorManager().install({
            kubeconfigPath,
            oauthClientId: options.operator.oauthClientId,
            oauthClientSecret: options.operator.oauthClientSecret,
            hostname: options.operator.hostname,
            tailnet: options.operator.tailnet,
          });
          if (result.endpoint) {
            console.log(`Cluster API reachable over Tailscale at ${result.endpoint}`);
          }
        } catch (opError) {
          const message = opError instanceof Error ? opError.message : String(opError);
          console.error(`Tailscale operator install failed (cluster is still up): ${message}`);
          warnings.push(`Tailscale operator install failed: ${message}`);
        }
      }

      console.log('Kubernetes cluster created successfully!');
      return {
        name,
        status: 'running',
        nodes,
        ...(warnings.length > 0 ? { warnings } : {}),
      };

    } catch (error) {
      console.error('Failed to create cluster:', error);

      // Clean up created nodes on failure
      if (nodes.length > 0) {
        console.log('Cleaning up created nodes...');
        await this.deleteCluster(nodes);
      }

      // And the router, if this run created it. Only tear down a router we just
      // built -- an existing one is never adopted, so `router` is only set when
      // this run created a fresh VM.
      if (router) {
        console.log('Cleaning up created router...');
        await this.deleteVM(router.vmid, router.name).catch(() => {});
      }

      return {
        name,
        status: 'failed',
        nodes: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Derives a node's address from its role and index, so node count can change
   * without hand-editing addressing. Control plane and workers get separate
   * /24 allocation ranges inside one flat /16 L2 domain.
   */
  private nodeIp(net: ClusterNetwork, role: 'master' | 'worker', index: number): string {
    const prefix = role === 'master' ? net.masterPrefix : net.workerPrefix;
    const host = net.hostStart + index;
    if (host > 254) {
      throw new Error(`too many ${role} nodes: host octet ${host} exceeds 254`);
    }
    return `${prefix}.${host}`;
  }

  private async prepareInventory(
    clusterName: string,
    nodes: ClusterNode[],
    sshPrivateKey: string,
    sshUser: string,
    cni: string
  ): Promise<string> {
    const clusterDir = path.join(kubesprayConfig.inventoryDir, clusterName);

    // Create directory structure
    await fs.mkdir(path.join(clusterDir, 'group_vars', 'all'), { recursive: true });
    await fs.mkdir(path.join(clusterDir, 'group_vars', 'k8s_cluster'), { recursive: true });

    // Write SSH private key (normalize line endings and ensure trailing newline)
    const sshKeyPath = path.join(clusterDir, 'ssh_key');
    const normalizedKey = sshPrivateKey.replace(/\r\n/g, '\n').trim() + '\n';
    await fs.writeFile(sshKeyPath, normalizedKey, { mode: 0o600 });

    // Generate and write hosts.yaml
    const inventory = this.generateKubesprayInventory(nodes, sshUser, sshKeyPath);
    await fs.writeFile(path.join(clusterDir, 'hosts.yaml'), inventory);

    // Copy inventory template from local project
    const templateDir = path.join(process.cwd(), 'lib', 'templates', 'kubespray-inventory', 'group_vars');
    await this.copyDir(templateDir, path.join(clusterDir, 'group_vars'));

    // Configure CNI plugin
    const k8sClusterVarsPath = path.join(clusterDir, 'group_vars', 'k8s_cluster', 'k8s-cluster.yml');
    await this.updateK8sClusterVars(k8sClusterVarsPath, cni);

    return clusterDir;
  }

  private async updateK8sClusterVars(filePath: string, cni: string): Promise<void> {
    try {
      let content = await fs.readFile(filePath, 'utf-8');
      // Replace the kube_network_plugin setting
      content = content.replace(
        /^kube_network_plugin:\s*\w+/m,
        `kube_network_plugin: ${cni}`
      );
      await fs.writeFile(filePath, content);
      console.log(`Configured CNI plugin: ${cni}`);
    } catch (error) {
      console.error('Failed to update k8s-cluster.yml:', error);
    }
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
      await this.deleteVM(node.vmid, node.name);
    }
    console.log('Cluster deleted.');
  }

  /** Stops (best-effort) then deletes a single VM. Never throws. */
  private async deleteVM(vmid: number, name: string): Promise<void> {
    try {
      console.log(`Stopping ${name}...`);
      const stopTaskId = await this.client.stopVM(vmid);
      await this.client.waitForTask(stopTaskId).catch(() => {});

      console.log(`Deleting ${name}...`);
      const deleteTaskId = await this.client.deleteVM(vmid);
      await this.client.waitForTask(deleteTaskId);
    } catch (error) {
      console.error(`Failed to delete ${name}:`, error);
    }
  }
}

export const createKubernetesClusterManager = (client: ProxmoxAPIClient): KubernetesClusterManager => {
  return new KubernetesClusterManager(client);
};
