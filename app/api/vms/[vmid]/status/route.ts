import { NextRequest, NextResponse } from 'next/server';
import { createProxmoxClient } from '@/lib/api';

/** Live status snapshot for a single VM (cpu/mem/disk/net/uptime). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ vmid: string }> }
) {
  try {
    const { vmid } = await params;
    const vmidNum = parseInt(vmid);
    if (isNaN(vmidNum)) {
      return NextResponse.json({ error: 'Invalid VM ID' }, { status: 400 });
    }

    const client = createProxmoxClient();
    await client.authenticate();
    const status = await client.getVMStatus(vmidNum);

    return NextResponse.json({ status: status.data });
  } catch (error) {
    console.error('Error fetching VM status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch VM status' },
      { status: 500 }
    );
  }
}
