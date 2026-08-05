/**
 * Provisions the Kubernetes cluster described in CLUSTER-DESIGN.md.
 *
 * Runs the same code path as POST /api/clusters, but as a foreground process --
 * the playbook takes 30-40 minutes, which is longer than a comfortable HTTP
 * request, and this way the Ansible output streams straight to a log file.
 *
 * From the repo root on the mgmt VM:
 *   node --env-file=.env --import tsx scripts/create-cluster.ts
 *
 * Overridable via env: CLUSTER_NAME, MASTER_COUNT, WORKER_COUNT,
 * MASTER_VMID_BASE, WORKER_VMID_BASE, SSH_KEY_PATH.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createProxmoxClient } from '../lib/api/proxmox-client';
import { createKubernetesClusterManager } from '../lib/api/k8s-cluster';

const CLUSTER_NAME = process.env.CLUSTER_NAME ?? 'k8s';
const MASTER_COUNT = Number(process.env.MASTER_COUNT ?? 3);
const WORKER_COUNT = Number(process.env.WORKER_COUNT ?? 3);
const MASTER_VMID_BASE = Number(process.env.MASTER_VMID_BASE ?? 111);
const WORKER_VMID_BASE = Number(process.env.WORKER_VMID_BASE ?? 121);
const SSH_KEY_PATH =
  process.env.SSH_KEY_PATH ?? path.join(os.homedir(), '.ssh', 'id_ed25519');

async function main(): Promise<void> {
  // This is the mgmt VM's own key, authorized on the template alongside the
  // workstation key -- the operator's personal key never leaves their machine.
  const sshPrivateKey = fs.readFileSync(SSH_KEY_PATH, 'utf-8');

  const client = createProxmoxClient();
  const manager = createKubernetesClusterManager(client);

  console.log(
    `Creating cluster "${CLUSTER_NAME}": ` +
      `${MASTER_COUNT} control plane + ${WORKER_COUNT} workers`
  );

  const result = await manager.createCluster({
    name: CLUSTER_NAME,
    templateVmid: Number(process.env.PROXMOX_TEMPLATE_VMID ?? 100),
    masterCount: MASTER_COUNT,
    workerCount: WORKER_COUNT,
    masterVmidBase: MASTER_VMID_BASE,
    workerVmidBase: WORKER_VMID_BASE,
    sshPrivateKey,
    sshUser: 'ubuntu',
    cni: 'cilium',
  });

  console.log('\n=== result ===');
  console.log(JSON.stringify(result, null, 2));

  if (result.status === 'failed') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
