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
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface CreateTemplateForm {
  vmid: string;
  name: string;
  memory: string;
  cores: string;
  sockets: string;
  diskSize: string;
  cloudInitUser: string;
  cloudInitPassword: string;
  sshKeys: string;
  userDataCommands: string;
  snippetStorage: string;
  cloudImageUrl: string;
  isoStorage: string;
}

interface Storage {
  storage: string;
  type: string;
  content: string;
  active: number;
}

interface StoragesResponse {
  all: Storage[];
  iso: Storage[];
  snippets: Storage[];
  disk: Storage[];
}

export default function CreateTemplatePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storages, setStorages] = useState<StoragesResponse | null>(null);
  const [loadingStorages, setLoadingStorages] = useState(true);

  const [form, setForm] = useState<CreateTemplateForm>({
    vmid: '',
    name: '',
    memory: '4096',
    cores: '2',
    sockets: '1',
    diskSize: '32',
    cloudInitUser: 'ubuntu',
    cloudInitPassword: '',
    sshKeys: '',
    userDataCommands: `# Update APT to point to Kakao Mirror Server (Remove if not in Korea)
sed -i -e 's/archive.ubuntu.com/mirror.kakao.com/g' /etc/apt/sources.list.d/ubuntu.sources
sed -i -e 's/security.ubuntu.com/mirror.kakao.com/g' /etc/apt/sources.list.d/ubuntu.sources
apt-get update
apt-get install -y qemu-guest-agent
systemctl enable qemu-guest-agent
systemctl start qemu-guest-agent`,
    snippetStorage: '',
    cloudImageUrl: '',
    isoStorage: '',
  });

  useEffect(() => {
    const fetchStorages = async () => {
      try {
        const response = await fetch('/api/storages');
        if (!response.ok) {
          throw new Error('Failed to fetch storages');
        }
        const data: StoragesResponse = await response.json();
        setStorages(data);

        // Set default values if available
        if (data.iso.length > 0 && !form.isoStorage) {
          setForm(prev => ({ ...prev, isoStorage: data.iso[0].storage }));
        }
        if (data.snippets.length > 0 && !form.snippetStorage) {
          setForm(prev => ({ ...prev, snippetStorage: data.snippets[0].storage }));
        }
      } catch (err) {
        console.error('Error fetching storages:', err);
      } finally {
        setLoadingStorages(false);
      }
    };

    fetchStorages();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vmid: parseInt(form.vmid),
          name: form.name,
          memory: parseInt(form.memory),
          cores: parseInt(form.cores),
          sockets: parseInt(form.sockets),
          diskSize: form.diskSize ? `${form.diskSize}G` : undefined,
          cloudInitUser: form.cloudInitUser,
          cloudInitPassword: form.cloudInitPassword || undefined,
          sshKeys: form.sshKeys || undefined,
          userDataCommands: form.userDataCommands
            ? form.userDataCommands.split('\n').filter(cmd => cmd.trim())
            : undefined,
          snippetStorage: form.snippetStorage || undefined,
          cloudImageUrl: form.cloudImageUrl || undefined,
          isoStorage: form.isoStorage || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create template');
      }

      router.push('/templates');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create template');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8">
        <Link href="/templates">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Templates
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create VM Template</CardTitle>
          <CardDescription>
            Create a new cloud-init template for Kubernetes deployment
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Basic Settings Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Basic Settings</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vmid">VMID</Label>
                  <Input
                    id="vmid"
                    type="number"
                    value={form.vmid}
                    onChange={(e) => setForm({ ...form, vmid: e.target.value })}
                    placeholder="9000"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="ubuntu-2404-template"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Cloud Image Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Cloud Image</h3>
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cloudImageUrl">Cloud Image URL</Label>
                  <Input
                    id="cloudImageUrl"
                    value={form.cloudImageUrl}
                    onChange={(e) => setForm({ ...form, cloudImageUrl: e.target.value })}
                    placeholder="https://cloud-images.ubuntu.com/releases/24.04/release/ubuntu-24.04-server-cloudimg-amd64.img"
                  />
                  <p className="text-sm text-muted-foreground">
                    URL of the cloud image to download. Leave empty to create a VM without a base image.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="isoStorage">ISO Storage</Label>
                  <Select
                    value={form.isoStorage}
                    onValueChange={(value) => setForm({ ...form, isoStorage: value })}
                    disabled={loadingStorages}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={loadingStorages ? "Loading..." : "Select storage"} />
                    </SelectTrigger>
                    <SelectContent>
                      {storages?.iso.map((storage) => (
                        <SelectItem key={storage.storage} value={storage.storage}>
                          {storage.storage} ({storage.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Proxmox storage for downloading the cloud image (must support ISO content type).
                  </p>
                </div>
              </div>
            </div>

            {/* Hardware Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Hardware</h3>
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="memory">Memory (MB)</Label>
                  <Input
                    id="memory"
                    type="number"
                    value={form.memory}
                    onChange={(e) => setForm({ ...form, memory: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cores">Cores</Label>
                  <Input
                    id="cores"
                    type="number"
                    value={form.cores}
                    onChange={(e) => setForm({ ...form, cores: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sockets">Sockets</Label>
                  <Input
                    id="sockets"
                    type="number"
                    value={form.sockets}
                    onChange={(e) => setForm({ ...form, sockets: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="diskSize">Disk Size (GB)</Label>
                  <Input
                    id="diskSize"
                    type="number"
                    value={form.diskSize}
                    onChange={(e) => setForm({ ...form, diskSize: e.target.value })}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Cloud-Init Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Cloud-Init Configuration</h3>
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cloudInitUser">Default User</Label>
                    <Input
                      id="cloudInitUser"
                      value={form.cloudInitUser}
                      onChange={(e) => setForm({ ...form, cloudInitUser: e.target.value })}
                      placeholder="ubuntu"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cloudInitPassword">Password (optional)</Label>
                    <Input
                      id="cloudInitPassword"
                      type="password"
                      value={form.cloudInitPassword}
                      onChange={(e) => setForm({ ...form, cloudInitPassword: e.target.value })}
                      placeholder="Leave empty to use SSH keys only"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sshKeys">SSH Public Keys (optional)</Label>
                  <Textarea
                    id="sshKeys"
                    value={form.sshKeys}
                    onChange={(e) => setForm({ ...form, sshKeys: e.target.value })}
                    placeholder="ssh-rsa AAAAB3..."
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            </div>

            {/* User Data Commands Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">User Data Commands</h3>
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="userDataCommands">Commands (one per line)</Label>
                  <Textarea
                    id="userDataCommands"
                    value={form.userDataCommands}
                    onChange={(e) => setForm({ ...form, userDataCommands: e.target.value })}
                    placeholder="apt-get update&#10;apt-get install -y docker.io&#10;systemctl enable docker"
                    className="min-h-[150px] font-mono text-sm"
                  />
                  <p className="text-sm text-muted-foreground">
                    These commands will be added to the cloud-init runcmd section and executed on first boot.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="snippetStorage">Snippet Storage</Label>
                  <Select
                    value={form.snippetStorage}
                    onValueChange={(value) => setForm({ ...form, snippetStorage: value })}
                    disabled={loadingStorages}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={loadingStorages ? "Loading..." : "Select storage"} />
                    </SelectTrigger>
                    <SelectContent>
                      {storages?.snippets.map((storage) => (
                        <SelectItem key={storage.storage} value={storage.storage}>
                          {storage.storage} ({storage.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Proxmox storage for cloud-init snippets. Must have snippets content type enabled.
                  </p>
                </div>
              </div>
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-4 pt-4 border-t">
              <Link href="/templates">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating Template...' : 'Create Template'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
