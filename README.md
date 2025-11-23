# Proxmox Kubernetes Manager

A Next.js application for automating Kubernetes cluster deployment on Proxmox VE using Kubespray. This tool streamlines the process of creating VM templates, provisioning VMs, and setting up Kubernetes clusters.

## Features

- Proxmox API integration for VM management
- Automated VM template creation from cloud images
- VM cloning for rapid deployment
- Environment-based configuration for easy server switching
- TypeScript support with full type safety

## Getting Started

### Prerequisites

- Node.js 20+
- Proxmox VE server with API access
- SSH access to Proxmox node

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd proxmox-k8s-manager
```

2. Install dependencies:
```bash
pnpm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

Edit [.env](.env) with your Proxmox server details:
```env
PROXMOX_HOST=your-proxmox-server.example.com
PROXMOX_PORT=8006
PROXMOX_USER=root@pam
PROXMOX_PASSWORD=your-password-here
PROXMOX_NODE=pve
PROXMOX_TEMPLATE_STORAGE=local-lvm
PROXMOX_TEMPLATE_ISO_STORAGE=local
PROXMOX_TEMPLATE_NAME=ubuntu-2404-template
PROXMOX_TEMPLATE_VMID=9000
```

### Running the Application

Development server:
```bash
pnpm dev
```

Build for production:
```bash
pnpm build
pnpm start
```

## Usage

### Creating a VM Template

```typescript
import { createProxmoxClient, createVMTemplateManager } from '@/lib/api';

const client = createProxmoxClient();
const templateManager = createVMTemplateManager(client);

await client.authenticate();

const templateVmid = await templateManager.createUbuntuTemplate({
  vmid: 9000,
  name: 'ubuntu-2404-k8s-template',
  memory: 4096,
  cores: 2,
  cloudInitUser: 'ubuntu',
  cloudInitPassword: 'ubuntu',
});
```

### Cloning a Template

```typescript
const newVmid = await templateManager.cloneTemplate(
  9000,
  100,
  'k8s-master-01'
);
```

## Project Structure

```
lib/
├── api/
│   ├── proxmox-client.ts    # Proxmox API client with authentication
│   ├── vm-template.ts       # VM template management
│   └── index.ts             # API exports
├── config/
│   └── proxmox.ts           # Proxmox configuration from env vars
├── types/
│   └── proxmox.ts           # TypeScript type definitions
└── examples/
    └── create-template.ts   # Usage examples
```

## API Reference

### ProxmoxAPIClient

Main client for interacting with Proxmox API:

- `authenticate()` - Authenticate with Proxmox server
- `createVM(config)` - Create a new VM
- `getVMStatus(vmid)` - Get VM status
- `convertToTemplate(vmid)` - Convert VM to template
- `cloneVM(vmid, newVmid, name)` - Clone a VM
- `deleteVM(vmid)` - Delete a VM
- `waitForTask(upid)` - Wait for async task completion

### VMTemplateManager

High-level template management:

- `createUbuntuTemplate(options)` - Create Ubuntu cloud-init template
- `cloneTemplate(templateVmid, newVmid, name)` - Clone template to new VM
- `deleteTemplate(vmid)` - Delete a template

## Configuration

All Proxmox-related configuration is centralized in [lib/config/proxmox.ts](lib/config/proxmox.ts) and uses environment variables. This allows easy switching between different Proxmox servers by updating the [.env](.env) file.

## Next Steps

- Implement Kubespray integration
- Add UI for template and cluster management
- Support for multiple node clusters
- Network configuration automation
- Storage and disk management
