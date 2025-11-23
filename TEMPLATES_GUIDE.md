# VM Templates Management Guide

## Overview

The VM Templates page provides a full-featured interface for managing Proxmox VM templates used for Kubernetes cluster deployment.

## Features

### Template Management
- **List Templates**: View all VM templates with details (VMID, name, status, resources)
- **Create Templates**: Create new Ubuntu cloud-init templates with custom configuration
- **Clone Templates**: Clone existing templates to create new VMs
- **Delete Templates**: Remove templates that are no longer needed
- **Refresh**: Real-time updates of template status

### Create Template Form

The template creation dialog allows you to configure:

- **VMID**: Unique identifier for the template (e.g., 9000)
- **Name**: Template name (e.g., ubuntu-2404-template)
- **Memory**: RAM allocation in MB (e.g., 4096)
- **Cores**: Number of CPU cores (e.g., 2)
- **Sockets**: Number of CPU sockets (e.g., 1)
- **Cloud-Init User**: Default username for cloud-init (e.g., ubuntu)
- **Cloud-Init Password**: Optional password for the user
- **SSH Keys**: Optional SSH public keys for authentication

### Clone Template

Clone existing templates to create new VMs:

- **New VMID**: Unique ID for the cloned VM (e.g., 100)
- **VM Name**: Name for the new VM (e.g., k8s-master-01)

## API Endpoints

### GET /api/templates
Fetch all VM templates from Proxmox

**Response:**
```json
{
  "templates": [
    {
      "vmid": 9000,
      "name": "ubuntu-2404-template",
      "status": "stopped",
      "cpus": 2,
      "maxmem": 4294967296,
      "maxdisk": 34359738368
    }
  ]
}
```

### POST /api/templates
Create a new VM template

**Request Body:**
```json
{
  "vmid": 9000,
  "name": "ubuntu-2404-template",
  "memory": 4096,
  "cores": 2,
  "sockets": 1,
  "cloudInitUser": "ubuntu",
  "cloudInitPassword": "optional",
  "sshKeys": "ssh-rsa AAAAB3..."
}
```

### DELETE /api/templates/[vmid]
Delete a template

**Response:**
```json
{
  "success": true,
  "message": "Template 9000 deleted successfully"
}
```

### POST /api/templates/[vmid]/clone
Clone a template

**Request Body:**
```json
{
  "newVmid": 100,
  "name": "k8s-master-01"
}
```

## Usage Flow

1. **Navigate to Templates Page**: Click "Manage Templates" from the home page
2. **Create Template**: Click "Create Template" and fill in the form
3. **Wait for Creation**: Template creation takes a few minutes (VM creation + conversion)
4. **Clone for Deployment**: Use the "Clone" button to create VMs from templates
5. **Manage Templates**: Delete unused templates to free up resources

## File Structure

```
app/
├── templates/
│   └── page.tsx              # Main templates management page
└── api/
    └── templates/
        ├── route.ts          # GET (list) and POST (create)
        └── [vmid]/
            ├── route.ts      # DELETE template
            └── clone/
                └── route.ts  # POST clone template

components/ui/
├── button.tsx
├── card.tsx
├── dialog.tsx
├── input.tsx
└── label.tsx
```

## Environment Setup

Make sure your `.env` file is configured:

```env
PROXMOX_HOST=your-proxmox-server.example.com
PROXMOX_PORT=8006
PROXMOX_USER=root@pam
PROXMOX_PASSWORD=your-password-here
PROXMOX_NODE=pve
PROXMOX_TEMPLATE_STORAGE=local-lvm
PROXMOX_TEMPLATE_ISO_STORAGE=local
```

## Next Steps

After creating templates:
1. Navigate to the VMs page (coming soon) to deploy cluster nodes
2. Configure networking and storage
3. Initialize Kubernetes cluster with Kubespray
