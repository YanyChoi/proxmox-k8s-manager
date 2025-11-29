import { NextRequest, NextResponse } from 'next/server';
import { createProxmoxClient } from '@/lib/api/proxmox-client';
import { createKubernetesClusterManager, ClusterOptions } from '@/lib/api/k8s-cluster';

export async function GET() {
  try {
    // For now, we don't have persistent storage for clusters
    // Return VMs that match cluster naming pattern
    const client = createProxmoxClient();
    const vms = await client.listVMs();

    // Group VMs by cluster name (pattern: clustername-master-N or clustername-worker-N)
    const clusterMap = new Map<string, any[]>();

    for (const vm of vms) {
      const match = vm.name?.match(/^(.+)-(master|worker)-\d+$/);
      if (match) {
        const clusterName = match[1];
        if (!clusterMap.has(clusterName)) {
          clusterMap.set(clusterName, []);
        }
        clusterMap.get(clusterName)!.push({
          vmid: vm.vmid,
          name: vm.name,
          role: match[2],
          status: vm.status,
          ip: vm.ipAddress,
        });
      }
    }

    const clusters = Array.from(clusterMap.entries()).map(([name, nodes]) => ({
      name,
      nodes,
      masterCount: nodes.filter(n => n.role === 'master').length,
      workerCount: nodes.filter(n => n.role === 'worker').length,
      status: nodes.every(n => n.status === 'running') ? 'running' : 'partial',
    }));

    return NextResponse.json({ clusters });
  } catch (error) {
    console.error('Failed to list clusters:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list clusters' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      templateVmid,
      masterCount,
      workerCount,
      sshPrivateKey,
      sshUser,
      cni,
    } = body;

    // Validate required fields
    if (!name || !templateVmid || !masterCount || !sshPrivateKey) {
      return NextResponse.json(
        { error: 'Missing required fields: name, templateVmid, masterCount, sshPrivateKey' },
        { status: 400 }
      );
    }

    const client = createProxmoxClient();
    const clusterManager = createKubernetesClusterManager(client);

    const options: ClusterOptions = {
      name,
      templateVmid: parseInt(templateVmid),
      masterCount: parseInt(masterCount),
      workerCount: parseInt(workerCount) || 0,
      sshPrivateKey,
      sshUser: sshUser || 'ubuntu',
      cni: cni || 'cilium',
    };

    // Start cluster creation (this is a long-running operation)
    const result = await clusterManager.createCluster(options);

    if (result.status === 'failed') {
      return NextResponse.json(
        { error: result.error, cluster: result },
        { status: 500 }
      );
    }

    return NextResponse.json({ cluster: result });
  } catch (error) {
    console.error('Failed to create cluster:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create cluster' },
      { status: 500 }
    );
  }
}
