'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Server, Box, Network, LogOut } from 'lucide-react';

export function Navbar() {
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2">
              <Server className="h-6 w-6" />
              <span className="font-bold text-lg">Proxmox K8s Manager</span>
            </Link>
            <div className="flex gap-1">
              <Link href="/dashboard">
                <Button
                  variant={isActive('/dashboard') ? 'default' : 'ghost'}
                  size="sm"
                >
                  Dashboard
                </Button>
              </Link>
              <Link href="/templates">
                <Button
                  variant={isActive('/templates') ? 'default' : 'ghost'}
                  size="sm"
                >
                  <Server className="mr-2 h-4 w-4" />
                  Templates
                </Button>
              </Link>
              <Link href="/vms">
                <Button
                  variant={isActive('/vms') ? 'default' : 'ghost'}
                  size="sm"
                >
                  <Box className="mr-2 h-4 w-4" />
                  VMs
                </Button>
              </Link>
              <Link href="/clusters">
                <Button
                  variant={isActive('/clusters') || pathname.startsWith('/clusters') ? 'default' : 'ghost'}
                  size="sm"
                >
                  <Network className="mr-2 h-4 w-4" />
                  Clusters
                </Button>
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
