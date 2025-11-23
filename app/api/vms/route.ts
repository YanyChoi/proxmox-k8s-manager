import { NextResponse } from 'next/server';
import { createProxmoxClient } from '@/lib/api';

export async function GET() {
  try {
    const client = createProxmoxClient();
    await client.authenticate();

    const vms = await client.listVMs();

    return NextResponse.json({ vms });
  } catch (error) {
    console.error('Error fetching VMs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch VMs' },
      { status: 500 }
    );
  }
}
