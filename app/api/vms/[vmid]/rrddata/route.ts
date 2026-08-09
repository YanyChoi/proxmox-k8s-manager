import { NextRequest, NextResponse } from 'next/server';
import { createProxmoxClient } from '@/lib/api';
import type { RrdTimeframe } from '@/lib/types/proxmox';

const TIMEFRAMES: RrdTimeframe[] = ['hour', 'day', 'week', 'month', 'year'];

/** Time-series RRD metrics for a single VM. Query: ?timeframe=hour&cf=AVERAGE */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ vmid: string }> }
) {
  try {
    const { vmid } = await params;
    const vmidNum = parseInt(vmid);
    if (isNaN(vmidNum)) {
      return NextResponse.json({ error: 'Invalid VM ID' }, { status: 400 });
    }

    const tfParam = request.nextUrl.searchParams.get('timeframe');
    const timeframe: RrdTimeframe =
      tfParam && TIMEFRAMES.includes(tfParam as RrdTimeframe)
        ? (tfParam as RrdTimeframe)
        : 'hour';
    const cf = request.nextUrl.searchParams.get('cf') === 'MAX' ? 'MAX' : 'AVERAGE';

    const client = createProxmoxClient();
    await client.authenticate();
    const data = await client.getVMRrdData(vmidNum, timeframe, cf);

    return NextResponse.json({ timeframe, cf, data });
  } catch (error) {
    console.error('Error fetching VM rrddata:', error);
    return NextResponse.json(
      { error: 'Failed to fetch VM metrics' },
      { status: 500 }
    );
  }
}
