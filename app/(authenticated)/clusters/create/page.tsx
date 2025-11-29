'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface Template {
  vmid: number;
  name: string;
}

interface CreateClusterForm {
  name: string;
  templateVmid: string;
  masterCount: string;
  workerCount: string;
  sshPrivateKey: string;
  sshUser: string;
}

export default function CreateClusterPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  const [form, setForm] = useState<CreateClusterForm>({
    name: '',
    templateVmid: '',
    masterCount: '1',
    workerCount: '2',
    sshPrivateKey: '',
    sshUser: 'ubuntu',
  });

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const response = await fetch('/api/templates');
        if (!response.ok) {
          throw new Error('Failed to fetch templates');
        }
        const data = await response.json();
        setTemplates(data.templates || []);
      } catch (err) {
        console.error('Error fetching templates:', err);
        setError('Failed to load templates');
      } finally {
        setLoadingTemplates(false);
      }
    };

    fetchTemplates();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/clusters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          templateVmid: form.templateVmid,
          masterCount: form.masterCount,
          workerCount: form.workerCount,
          sshPrivateKey: form.sshPrivateKey,
          sshUser: form.sshUser,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create cluster');
      }

      router.push('/clusters');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create cluster');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (field: keyof CreateClusterForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/clusters">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create Kubernetes Cluster</h1>
          <p className="text-muted-foreground mt-2">
            Create a new Kubernetes cluster using Kubespray
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Cluster Configuration</CardTitle>
            <CardDescription>
              Configure your Kubernetes cluster settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && (
              <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Cluster Name *</Label>
                <Input
                  id="name"
                  placeholder="my-k8s-cluster"
                  value={form.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  required
                />
                <p className="text-sm text-muted-foreground">
                  Used as prefix for VM names (e.g., my-k8s-cluster-master-1)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="templateVmid">Template *</Label>
                <Select
                  value={form.templateVmid}
                  onValueChange={(value) => handleChange('templateVmid', value)}
                  disabled={loadingTemplates}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingTemplates ? "Loading..." : "Select a template"} />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.vmid} value={template.vmid.toString()}>
                        {template.name} (ID: {template.vmid})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Base VM template for cluster nodes
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="masterCount">Master Nodes *</Label>
                <Select
                  value={form.masterCount}
                  onValueChange={(value) => handleChange('masterCount', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 (Development)</SelectItem>
                    <SelectItem value="3">3 (HA Production)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Control plane nodes (use 3 for high availability)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="workerCount">Worker Nodes</Label>
                <Input
                  id="workerCount"
                  type="number"
                  min="0"
                  max="10"
                  value={form.workerCount}
                  onChange={(e) => handleChange('workerCount', e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Worker nodes for running workloads
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sshUser">SSH User</Label>
                <Input
                  id="sshUser"
                  placeholder="ubuntu"
                  value={form.sshUser}
                  onChange={(e) => handleChange('sshUser', e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  SSH user configured in the template (default: ubuntu)
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sshPrivateKey">SSH Private Key *</Label>
              <Textarea
                id="sshPrivateKey"
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                value={form.sshPrivateKey}
                onChange={(e) => handleChange('sshPrivateKey', e.target.value)}
                rows={8}
                className="font-mono text-sm"
                required
              />
              <p className="text-sm text-muted-foreground">
                Private key to SSH into the VMs (must match the public key in the template)
              </p>
            </div>

            <div className="pt-4 flex justify-end gap-4">
              <Link href="/clusters">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                disabled={submitting || !form.name || !form.templateVmid || !form.sshPrivateKey}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Cluster...
                  </>
                ) : (
                  'Create Cluster'
                )}
              </Button>
            </div>

            {submitting && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  This may take 15-30 minutes. The process includes:
                </p>
                <ul className="list-disc list-inside text-sm text-muted-foreground mt-2">
                  <li>Cloning VMs from template</li>
                  <li>Starting VMs and waiting for IP addresses</li>
                  <li>Running Kubespray Ansible playbook</li>
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
