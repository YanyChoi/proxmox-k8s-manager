import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Server, Box, Network } from "lucide-react";

export default function Dashboard() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          Dashboard
        </h1>
        <p className="text-muted-foreground">
          Manage your Proxmox infrastructure and Kubernetes clusters
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3 mb-12">
        <Card className="border-2 hover:border-primary transition-colors">
          <CardHeader>
            <Server className="mb-2" size={32} />
            <CardTitle>VM Templates</CardTitle>
            <CardDescription>
              Create and manage VM templates for rapid deployment
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/templates">
              <Button className="w-full">
                Manage Templates
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="border-2 opacity-50">
          <CardHeader>
            <Box className="mb-2" size={32} />
            <CardTitle>Virtual Machines</CardTitle>
            <CardDescription>
              Deploy and configure VMs for your cluster
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" disabled>
              Coming Soon
            </Button>
          </CardContent>
        </Card>

        <Card className="border-2 opacity-50">
          <CardHeader>
            <Network className="mb-2" size={32} />
            <CardTitle>Kubernetes Cluster</CardTitle>
            <CardDescription>
              Deploy and manage K8s clusters with Kubespray
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" disabled>
              Coming Soon
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Getting Started</CardTitle>
          <CardDescription>
            Follow these steps to deploy your first Kubernetes cluster
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
              1
            </div>
            <div>
              <h3 className="font-semibold mb-1">Configure Proxmox Connection</h3>
              <p className="text-sm text-muted-foreground">
                Set up your Proxmox server credentials in the .env file
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
              2
            </div>
            <div>
              <h3 className="font-semibold mb-1">Create VM Template</h3>
              <p className="text-sm text-muted-foreground">
                Create an Ubuntu cloud-init template for your Kubernetes nodes
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center font-bold">
              3
            </div>
            <div>
              <h3 className="font-semibold mb-1 text-muted-foreground">Deploy VMs</h3>
              <p className="text-sm text-muted-foreground">
                Clone your template to create master and worker nodes
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center font-bold">
              4
            </div>
            <div>
              <h3 className="font-semibold mb-1 text-muted-foreground">Initialize Cluster</h3>
              <p className="text-sm text-muted-foreground">
                Use Kubespray to automatically configure your Kubernetes cluster
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
