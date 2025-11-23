import { NextRequest, NextResponse } from 'next/server';
import { createProxmoxClient, createVMTemplateManager } from '@/lib/api';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ vmid: string }> }
) {
  try {
    const { vmid } = await params;
    const templateVmid = parseInt(vmid);

    if (isNaN(templateVmid)) {
      return NextResponse.json(
        { error: 'Invalid VMID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { newVmid, name } = body;

    if (!newVmid || !name) {
      return NextResponse.json(
        { error: 'New VMID and name are required' },
        { status: 400 }
      );
    }

    const client = createProxmoxClient();
    const templateManager = createVMTemplateManager(client);

    await client.authenticate();
    const clonedVmid = await templateManager.cloneTemplate(
      templateVmid,
      newVmid,
      name
    );

    return NextResponse.json({
      success: true,
      vmid: clonedVmid,
      message: `VM ${name} cloned successfully`
    });
  } catch (error) {
    console.error('Error cloning template:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to clone template' },
      { status: 500 }
    );
  }
}
