import { NextRequest, NextResponse } from 'next/server';
import { createProxmoxClient } from '@/lib/api/proxmox-client';
import { createKubernetesClusterManager } from '@/lib/api/k8s-cluster';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;

    const client = createProxmoxClient();
    const clusterManager = createKubernetesClusterManager(client);

    // Find all VMs that belong to this cluster
    const vms = await client.listVMs();
    const clusterNodes = vms
      .filter(vm => vm.name?.match(new RegExp(`^${name}-(master|worker)-\\d+$`)))
      .map(vm => ({
        vmid: vm.vmid,
        name: vm.name || '',
        role: vm.name?.includes('-master-') ? 'master' as const : 'worker' as const,
      }));

    if (clusterNodes.length === 0) {
      return NextResponse.json(
        { error: 'Cluster not found' },
        { status: 404 }
      );
    }

    // Delete all cluster nodes
    await clusterManager.deleteCluster(clusterNodes);

    return NextResponse.json({ success: true, deleted: clusterNodes.length });
  } catch (error) {
    console.error('Failed to delete cluster:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete cluster' },
      { status: 500 }
    );
  }
}
