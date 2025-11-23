import { createProxmoxClient, createVMTemplateManager } from '../api';

async function main() {
  const client = createProxmoxClient();
  const templateManager = createVMTemplateManager(client);

  try {
    await client.authenticate();
    console.log('Successfully authenticated with Proxmox server');

    const templateVmid = await templateManager.createUbuntuTemplate({
      vmid: 9000,
      name: 'ubuntu-2404-k8s-template',
      memory: 4096,
      cores: 2,
      sockets: 1,
      cloudInitUser: 'ubuntu',
      cloudInitPassword: 'ubuntu',
    });

    console.log(`Template created with VMID: ${templateVmid}`);

    const clonedVmid = await templateManager.cloneTemplate(
      templateVmid,
      100,
      'k8s-master-01'
    );

    console.log(`Cloned VM created with VMID: ${clonedVmid}`);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
