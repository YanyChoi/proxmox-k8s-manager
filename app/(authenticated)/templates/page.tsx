'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Copy, RefreshCw } from 'lucide-react';
import Link from 'next/link';

interface Template {
  vmid: number;
  name: string;
  status: string;
  cpus?: number;
  maxmem?: number;
  maxdisk?: number;
  uptime?: number;
}

interface CloneForm {
  newVmid: string;
  name: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [cloneForm, setCloneForm] = useState<CloneForm>({
    newVmid: '100',
    name: 'k8s-node-01',
  });

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/templates');

      if (!response.ok) {
        throw new Error('Failed to fetch templates');
      }

      const data = await response.json();
      setTemplates(data.templates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleCloneTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplate) return;

    setSubmitting(true);

    try {
      const response = await fetch(`/api/templates/${selectedTemplate.vmid}/clone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          newVmid: parseInt(cloneForm.newVmid),
          name: cloneForm.name,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to clone template');
      }

      setCloneDialogOpen(false);
      setSelectedTemplate(null);
      await fetchTemplates();

      setCloneForm({
        newVmid: '100',
        name: 'k8s-node-01',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clone template');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTemplate = async (vmid: number) => {
    if (!confirm(`Are you sure you want to delete template ${vmid}?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/templates/${vmid}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete template');
      }

      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template');
    }
  };

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

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">VM Templates</h1>
          <p className="text-muted-foreground mt-2">
            Manage Proxmox VM templates for Kubernetes cluster deployment
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchTemplates} variant="outline" disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
          <Link href="/templates/create">
            <Button>
              <Plus />
              Create Template
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
          <p className="text-muted-foreground">Loading templates...</p>
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No templates found</p>
            <Link href="/templates/create">
              <Button>
                <Plus />
                Create Your First Template
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.vmid}>
              <CardHeader>
                <CardTitle className="flex justify-between items-start">
                  <span>{template.name}</span>
                  <span className="text-sm font-mono text-muted-foreground">
                    #{template.vmid}
                  </span>
                </CardTitle>
                <CardDescription>
                  Status: <span className="capitalize">{template.status}</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm mb-4">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">CPU Cores:</span>
                    <span className="font-medium">{template.cpus || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Memory:</span>
                    <span className="font-medium">{formatMemory(template.maxmem)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Disk:</span>
                    <span className="font-medium">{formatDisk(template.maxdisk)}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setSelectedTemplate(template);
                      setCloneDialogOpen(true);
                    }}
                  >
                    <Copy />
                    Clone
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDeleteTemplate(template.vmid)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={cloneDialogOpen} onOpenChange={setCloneDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clone Template</DialogTitle>
            <DialogDescription>
              Clone {selectedTemplate?.name} (#{selectedTemplate?.vmid}) to create a new VM
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCloneTemplate}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="newVmid">New VMID</Label>
                <Input
                  id="newVmid"
                  type="number"
                  value={cloneForm.newVmid}
                  onChange={(e) => setCloneForm({ ...cloneForm, newVmid: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cloneName">VM Name</Label>
                <Input
                  id="cloneName"
                  value={cloneForm.name}
                  onChange={(e) => setCloneForm({ ...cloneForm, name: e.target.value })}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCloneDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Cloning...' : 'Clone VM'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
