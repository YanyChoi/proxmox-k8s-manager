import { NextRequest, NextResponse } from 'next/server';
import { createProxmoxClient, createVMTemplateManager } from '@/lib/api';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ vmid: string }> }
) {
  try {
    const { vmid } = await params;
    const vmidNumber = parseInt(vmid);

    if (isNaN(vmidNumber)) {
      return NextResponse.json(
        { error: 'Invalid VMID' },
        { status: 400 }
      );
    }

    const client = createProxmoxClient();
    const templateManager = createVMTemplateManager(client);

    await client.authenticate();
    await templateManager.deleteTemplate(vmidNumber);

    return NextResponse.json({
      success: true,
      message: `Template ${vmid} deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete template' },
      { status: 500 }
    );
  }
}
