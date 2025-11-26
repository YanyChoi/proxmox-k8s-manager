import { NextRequest, NextResponse } from 'next/server';
import { createProxmoxClient, createVMTemplateManager } from '@/lib/api';

export async function GET() {
  try {
    const client = createProxmoxClient();
    await client.authenticate();

    const vms = await client.listVMs();
    const templates = vms.filter((vm: { template?: number }) => vm.template === 1);

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      vmid,
      name,
      memory,
      cores,
      sockets,
      cloudInitUser,
      cloudInitPassword,
      sshKeys,
      userDataCommands,
      snippetStorage,
      cloudImageUrl,
      isoStorage,
      diskSize,
    } = body;

    const client = createProxmoxClient();
    const templateManager = createVMTemplateManager(client);

    await client.authenticate();

    const templateVmid = await templateManager.createUbuntuTemplate({
      vmid,
      name,
      memory,
      cores,
      sockets,
      cloudInitUser,
      cloudInitPassword,
      sshKeys,
      userDataCommands,
      snippetStorage,
      cloudImageUrl,
      isoStorage,
      diskSize,
    });

    return NextResponse.json({
      success: true,
      vmid: templateVmid,
      message: `Template ${name} created successfully`
    });
  } catch (error) {
    console.error('Error creating template:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create template' },
      { status: 500 }
    );
  }
}
