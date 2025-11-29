import { NextRequest, NextResponse } from 'next/server';
import { createProxmoxClient } from '@/lib/api/proxmox-client';
import { createKubernetesClusterManager } from '@/lib/api/k8s-cluster';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;

    const client = createProxmoxClient();
    const clusterManager = createKubernetesClusterManager(client);

    const kubeconfig = await clusterManager.getKubeconfig(name);

    if (!kubeconfig) {
      return NextResponse.json(
        { error: 'Kubeconfig not found for this cluster' },
        { status: 404 }
      );
    }

    // Return as downloadable file
    return new NextResponse(kubeconfig, {
      headers: {
        'Content-Type': 'application/x-yaml',
        'Content-Disposition': `attachment; filename="${name}-kubeconfig.yaml"`,
      },
    });
  } catch (error) {
    console.error('Failed to get kubeconfig:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get kubeconfig' },
      { status: 500 }
    );
  }
}
