'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Plus, RefreshCw, Server, Trash2 } from 'lucide-react';
import Link from 'next/link';

interface ClusterNode {
  vmid: number;
  name: string;
  role: string;
  status: string;
  ip: string | null;
}

interface Cluster {
  name: string;
  nodes: ClusterNode[];
  masterCount: number;
  workerCount: number;
  status: string;
}

export default function ClustersPage() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClusters = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/clusters');
      if (!response.ok) {
        throw new Error('Failed to fetch clusters');
      }
      const data = await response.json();
      setClusters(data.clusters || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch clusters');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClusters();
  }, []);

  const [deleting, setDeleting] = useState<string | null>(null);

  const deleteCluster = async (clusterName: string) => {
    if (!confirm(`Are you sure you want to delete cluster "${clusterName}"? This will stop and delete all VMs.`)) {
      return;
    }

    setDeleting(clusterName);
    setError(null);

    try {
      const response = await fetch(`/api/clusters/${clusterName}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete cluster');
      }

      // Refresh the cluster list
      await fetchClusters();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete cluster');
    } finally {
      setDeleting(null);
    }
  };

  const downloadKubeconfig = async (clusterName: string) => {
    try {
      const response = await fetch(`/api/clusters/${clusterName}/kubeconfig`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to download kubeconfig');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${clusterName}-kubeconfig.yaml`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download kubeconfig');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'text-green-500';
      case 'partial':
        return 'text-yellow-500';
      case 'stopped':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kubernetes Clusters</h1>
          <p className="text-muted-foreground mt-2">
            Manage your Kubernetes clusters
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchClusters} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
          <Link href="/clusters/create">
            <Button>
              <Plus />
              Create Cluster
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <RefreshCw className="animate-spin mx-auto mb-2" size={32} />
          <p className="text-muted-foreground">Loading clusters...</p>
        </div>
      ) : clusters.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Server className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No clusters found</h3>
            <p className="text-muted-foreground mb-4">
              Get started by creating your first Kubernetes cluster
            </p>
            <Link href="/clusters/create">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Cluster
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {clusters.map((cluster) => (
            <Card key={cluster.name}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {cluster.name}
                      <span className={`text-sm font-normal ${getStatusColor(cluster.status)}`}>
                        ({cluster.status})
                      </span>
                    </CardTitle>
                    <CardDescription>
                      {cluster.masterCount} master(s), {cluster.workerCount} worker(s)
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadKubeconfig(cluster.name)}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Kubeconfig
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteCluster(cluster.name)}
                      disabled={deleting === cluster.name}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {deleting === cluster.name ? 'Deleting...' : 'Delete'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {cluster.nodes.map((node) => (
                    <div
                      key={node.vmid}
                      className="p-4 border rounded-lg flex items-center justify-between"
                    >
                      <div>
                        <p className="font-medium">{node.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {node.role} • VMID: {node.vmid}
                        </p>
                        {node.ip && (
                          <p className="text-sm font-mono">{node.ip}</p>
                        )}
                      </div>
                      <span className={`text-sm ${getStatusColor(node.status)}`}>
                        {node.status}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
