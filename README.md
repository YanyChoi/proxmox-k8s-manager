# Proxmox Kubernetes Manager

A Next.js application for automating Kubernetes cluster deployment on Proxmox VE using Kubespray. This tool streamlines the process of creating VM templates, provisioning VMs, and setting up Kubernetes clusters.

## Features

- **Proxmox API Integration** - Full VM lifecycle management
- **Template Creation** - Automated VM template creation from Ubuntu cloud images
- **Kubernetes Cluster Provisioning** - Deploy K8s clusters using Kubespray
- **Cloud-Init Support** - Configure users, SSH keys, and custom commands
- **Web UI** - Manage templates, VMs, and clusters through a modern interface
- **TypeScript** - Full type safety throughout the codebase

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm package manager
- Proxmox VE server with API access
- SSH access to Proxmox node (for template creation)

#### For Kubernetes Cluster Creation

- **Python 3** with `venv` module
- **Kubespray** cloned on the app server (with venv set up)
- Network access from the app server to the VMs

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

Edit `.env` with your configuration:
```env
# Proxmox API Configuration
PROXMOX_HOST=your-proxmox-server.example.com
PROXMOX_PORT=8006
PROXMOX_USER=root@pam
PROXMOX_API_TOKEN_ID=your-token-id
PROXMOX_API_TOKEN=your-api-token-uuid
PROXMOX_NODE=pve

# Template Defaults
PROXMOX_TEMPLATE_STORAGE=local-lvm
PROXMOX_TEMPLATE_ISO_STORAGE=local
PROXMOX_TEMPLATE_NAME=ubuntu-2404-template
PROXMOX_TEMPLATE_VMID=9000

# SSH Access to Proxmox Node (for template creation)
PROXMOX_SSH_USER=root
PROXMOX_SSH_PORT=22
SSH_PRIVATE_KEY=<base64-encoded-private-key>

# Kubespray Configuration (for cluster creation)
KUBESPRAY_PATH=/opt/kubespray
KUBESPRAY_INVENTORY_DIR=/tmp/kubespray-inventories

# --- Tailscale integration (optional; each add-on activates when its creds are set) ---
# Router VM (NAT + HAProxy :6443 + Tailscale subnet router). Set the auth key to
# have create-cluster provision a fresh gateway VM before the nodes.
TAILSCALE_AUTHKEY=tskey-auth-...   # prefer an EPHEMERAL / single-use key (see note below)
ROUTER_VMID=101              # must be an UNUSED id -- a live router is never adopted
# NOTE: ROUTER_LAN_ADDRESS defaults to 10.100.0.1 -- the address a live router
# already holds. Running this against an existing stack puts two hosts on the
# gateway IP and breaks cluster networking. The IP collides, not just the VMID.
ROUTER_WAN_BRIDGE=vmbr0     # egress / default route (DHCP)
ROUTER_LAN_BRIDGE=vmbr1     # cluster L2; router owns 10.100.0.1
# ROUTER_LAN_ADDRESS, ROUTER_LAN_PREFIX, ROUTER_ADVERTISE_ROUTES, ROUTER_MEMORY_MB,
# ROUTER_CORES also override the defaults in lib/config/proxmox.ts.

# In-cluster Tailscale operator + API server proxy. Set both to have it installed
# after Kubespray. Reuse the OAuth client created for the operator.
TS_OAUTH_CLIENT_ID=...
TS_OAUTH_CLIENT_SECRET=...
TS_OPERATOR_HOSTNAME=tailscale-operator
TS_TAILNET=example.ts.net   # optional; only used to print the API proxy URL
```

To encode your SSH private key in base64:
```bash
cat ~/.ssh/id_rsa | base64 -w 0
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

### KubernetesClusterManager

Kubernetes cluster lifecycle:

- `createCluster(options)` - Create a new K8s cluster
- `deleteCluster(nodes)` - Delete cluster nodes

Options for `createCluster`:
```typescript
{
  name: string;           // Cluster name (used as VM prefix)
  templateVmid: number;   // Template to clone from
  masterCount: number;    // Number of master nodes (1 or 3)
  workerCount: number;    // Number of worker nodes
  sshPrivateKey: string;  // SSH key to access VMs
  sshUser?: string;       // SSH user (default: ubuntu)
}
```

## Configuration

All Proxmox-related configuration is centralized in [lib/config/proxmox.ts](lib/config/proxmox.ts) and uses environment variables. This allows easy switching between different Proxmox servers by updating the [.env](.env) file.

## Kubespray Setup

To use the Kubernetes cluster creation feature, you need Kubespray with a Python virtual environment set up:

```bash
# Clone Kubespray (can be relative to project or absolute path)
git clone https://github.com/kubernetes-sigs/kubespray.git kubespray
cd kubespray

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate

# Install Ansible and dependencies (specific versions required by Kubespray)
pip install -r requirements.txt
```

Set the `KUBESPRAY_PATH` environment variable to point to your Kubespray installation:
```env
# Relative path (from project root)
KUBESPRAY_PATH=./kubespray

# Or absolute path
KUBESPRAY_PATH=/opt/kubespray
```

The app will automatically use `ansible-playbook` from the `venv/bin/` directory within Kubespray.

## How It Works

### Template Creation
1. Downloads Ubuntu cloud image via SSH to Proxmox node
2. Creates VM with imported disk using `qm` commands
3. Configures cloud-init (user, password, SSH keys, custom commands)
4. Converts VM to template

### Cluster Creation
1. (Optional) Provisions a fresh **router VM** from cloud-init when `TAILSCALE_AUTHKEY`
   is set: two NICs (WAN DHCP + cluster LAN gateway), NAT via nftables, HAProxy on
   `:6443` in front of the control plane, and `tailscale up` as a subnet router with
   SSH. Created **before** the nodes, since it owns their gateway address.
2. Clones VMs from selected template (master + worker nodes)
3. Starts VMs and waits for each to accept SSH (addresses are assigned statically,
   so no QEMU-guest-agent dependency)
4. Generates Kubespray inventory locally
5. Runs `ansible-playbook` to deploy Kubernetes
6. Retrieves the kubeconfig (already pointed at the HAProxy VIP)
7. (Optional) Installs the **Tailscale operator** with the API server proxy when
   `TS_OAUTH_CLIENT_ID`/`TS_OAUTH_CLIENT_SECRET` are set, so the cluster is reachable
   over the tailnet by identity (`tailscale configure kubeconfig <hostname>`), no
   certs to distribute.

### Tailscale prerequisites

The two integrations authenticate differently and each needs a one-time tailnet setup:

- **Router (subnet router)** — a tagged auth key (`TAILSCALE_AUTHKEY`). In the
  tailnet policy, add a `tagOwners` entry for its tag and an **autoApprover** for the
  advertised route (e.g. `10.100.0.0/16`), or the route stays pending and nothing routes.
  Prefer an **ephemeral / single-use** key: the rendered cloud-init snippet is deleted
  from the Proxmox host after the router boots, but the key still lands in the guest's
  cloud-init logs, so a single-use key means any residual copy is already spent.
- **Operator (API server proxy)** — an OAuth client with `Devices Core` + `Auth Keys`
  write, tagged `tag:k8s-operator`; plus `tagOwners` for `tag:k8s-operator`/`tag:k8s`
  and a `grants` rule mapping your users to a Kubernetes group via
  `tailscale.com/cap/kubernetes` (impersonation). See the Tailscale operator docs.

## Next Steps

- Cluster deletion and lifecycle management
- Kubeconfig retrieval after cluster creation
- Network configuration automation
- Persistent cluster state storage
