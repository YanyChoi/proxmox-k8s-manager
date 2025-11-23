import { NextRequest, NextResponse } from 'next/server';
import { createProxmoxClient } from '@/lib/api';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ vmid: string }> }
) {
  try {
    const { vmid } = await params;
    const vmidNum = parseInt(vmid);

    if (isNaN(vmidNum)) {
      return NextResponse.json(
        { error: 'Invalid VM ID' },
        { status: 400 }
      );
    }

    const client = createProxmoxClient();
    await client.authenticate();

    const taskId = await client.deleteVM(vmidNum);

    return NextResponse.json({
      success: true,
      taskId,
      message: `VM ${vmidNum} deletion initiated`
    });
  } catch (error) {
    console.error('Error deleting VM:', error);
    return NextResponse.json(
      { error: 'Failed to delete VM' },
      { status: 500 }
    );
  }
}
