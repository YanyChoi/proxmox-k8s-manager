'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw, Power, Square, Trash2 } from 'lucide-react';

interface VM {
  vmid: number;
  name: string;
  status: string;
  cpus?: number;
  maxmem?: number;
  maxdisk?: number;
  uptime?: number;
  template?: number;
  ipAddress?: string | null;
}

export default function VMsPage() {
  const [vms, setVms] = useState<VM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<{ [key: number]: string }>({});

  const fetchVMs = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/vms');

      if (!response.ok) {
        throw new Error('Failed to fetch VMs');
      }

      const data = await response.json();
      // Filter out templates to show only regular VMs
      const regularVMs = data.vms.filter((vm: VM) => !vm.template);
      setVms(regularVMs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch VMs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVMs();
  }, []);

  const formatMemory = (bytes?: number) => {
    if (!bytes) return 'N/A';
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  };

  const formatDisk = (bytes?: number) => {
    if (!bytes) return 'N/A';
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  };

  const formatUptime = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'text-green-600 dark:text-green-400';
      case 'stopped':
        return 'text-red-600 dark:text-red-400';
      case 'paused':
        return 'text-yellow-600 dark:text-yellow-400';
      default:
        return 'text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Power className="h-4 w-4 text-green-600 dark:text-green-400" />;
      case 'stopped':
        return <Square className="h-4 w-4 text-red-600 dark:text-red-400" />;
      default:
        return null;
    }
  };

  const handleStartVM = async (vmid: number) => {
    try {
      setActionLoading(prev => ({ ...prev, [vmid]: 'starting' }));
      setError(null);

      const response = await fetch(`/api/vms/${vmid}/start`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to start VM');
      }

      await fetchVMs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start VM');
    } finally {
      setActionLoading(prev => {
        const newState = { ...prev };
        delete newState[vmid];
        return newState;
      });
    }
  };

  const handleStopVM = async (vmid: number) => {
    try {
      setActionLoading(prev => ({ ...prev, [vmid]: 'stopping' }));
      setError(null);

      const response = await fetch(`/api/vms/${vmid}/stop`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to stop VM');
      }

      await fetchVMs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop VM');
    } finally {
      setActionLoading(prev => {
        const newState = { ...prev };
        delete newState[vmid];
        return newState;
      });
    }
  };

  const handleDeleteVM = async (vmid: number) => {
    if (!confirm(`Are you sure you want to delete VM ${vmid}? This action cannot be undone.`)) {
      return;
    }

    try {
      setActionLoading(prev => ({ ...prev, [vmid]: 'deleting' }));
      setError(null);

      const response = await fetch(`/api/vms/${vmid}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete VM');
      }

      await fetchVMs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete VM');
    } finally {
      setActionLoading(prev => {
        const newState = { ...prev };
        delete newState[vmid];
        return newState;
      });
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Virtual Machines</h1>
          <p className="text-muted-foreground">
            Manage your Proxmox VMs for Kubernetes cluster nodes
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchVMs} variant="outline" disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
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
          <p className="text-muted-foreground">Loading VMs...</p>
        </div>
      ) : vms.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No VMs found</p>
            <p className="text-sm text-muted-foreground">
              Clone a template from the Templates page to create VMs
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {vms.map((vm) => (
            <Card key={vm.vmid} className="relative">
              <CardHeader>
                <CardTitle className="flex justify-between items-start">
                  <span className="flex items-center gap-2">
                    {getStatusIcon(vm.status)}
                    {vm.name}
                  </span>
                  <span className="text-sm font-mono text-muted-foreground">
                    #{vm.vmid}
                  </span>
                </CardTitle>
                <CardDescription>
                  <span className={`capitalize ${getStatusColor(vm.status)}`}>
                    {vm.status}
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm mb-4">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">CPU Cores:</span>
                    <span className="font-medium">{vm.cpus || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Memory:</span>
                    <span className="font-medium">{formatMemory(vm.maxmem)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Disk:</span>
                    <span className="font-medium">{formatDisk(vm.maxdisk)}</span>
                  </div>
                  {vm.ipAddress && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">IP Address:</span>
                      <span className="font-medium font-mono text-xs">{vm.ipAddress}</span>
                    </div>
                  )}
                  {vm.status === 'running' && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Uptime:</span>
                      <span className="font-medium">{formatUptime(vm.uptime)}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => vm.status === 'running' ? handleStopVM(vm.vmid) : handleStartVM(vm.vmid)}
                    disabled={!!actionLoading[vm.vmid]}
                  >
                    {actionLoading[vm.vmid] === 'starting' && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                    {actionLoading[vm.vmid] === 'stopping' && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                    {!actionLoading[vm.vmid] && vm.status === 'running' && <Square className="mr-2 h-4 w-4" />}
                    {!actionLoading[vm.vmid] && vm.status !== 'running' && <Power className="mr-2 h-4 w-4" />}
                    {actionLoading[vm.vmid] === 'starting' && 'Starting...'}
                    {actionLoading[vm.vmid] === 'stopping' && 'Stopping...'}
                    {!actionLoading[vm.vmid] && (vm.status === 'running' ? 'Stop' : 'Start')}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDeleteVM(vm.vmid)}
                    disabled={!!actionLoading[vm.vmid]}
                  >
                    {actionLoading[vm.vmid] === 'deleting' ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
