import { NextRequest, NextResponse } from 'next/server';
import { createProxmoxClient } from '@/lib/api';

export async function POST(
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

    const taskId = await client.stopVM(vmidNum);

    return NextResponse.json({
      success: true,
      taskId,
      message: `VM ${vmidNum} stop initiated`
    });
  } catch (error) {
    console.error('Error stopping VM:', error);
    return NextResponse.json(
      { error: 'Failed to stop VM' },
      { status: 500 }
    );
  }
}
