import { NextResponse } from 'next/server';
import { createProxmoxClient } from '@/lib/api';

export async function GET() {
  try {
    const client = createProxmoxClient();
    await client.authenticate();

    const storages = await client.getStorages();

    // Filter for active storages and categorize by content type
    const activeStorages = storages.filter(s => s.active === 1);

    // File-based storage types that can store ISO/images files
    const fileBasedTypes = ['dir', 'nfs', 'cifs', 'glusterfs', 'cephfs'];

    // Storages that support ISO content (for cloud images) - must be file-based
    const isoStorages = activeStorages.filter(s =>
      fileBasedTypes.includes(s.type) && (s.content.includes('iso') || s.content.includes('images'))
    );

    // All file-based storages for snippets
    const snippetStorages = activeStorages.filter(s =>
      fileBasedTypes.includes(s.type)
    );

    // Storages that support disk images (for VM disks) - can be any type
    const diskStorages = activeStorages.filter(s =>
      s.content.includes('images') || s.content.includes('rootdir')
    );

    return NextResponse.json({
      all: activeStorages,
      iso: isoStorages,
      snippets: snippetStorages,
      disk: diskStorages,
    });
  } catch (error) {
    console.error('Error fetching storages:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch storages' },
      { status: 500 }
    );
  }
}
