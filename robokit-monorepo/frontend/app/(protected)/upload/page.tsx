import { DataImportWizard } from '@/components/datasets/data-import-wizard';
import type { HuggingFaceDataset } from '@/types/dataset/huggingface';
import { headers } from 'next/headers';

export default async function Upload() {
  // SSR prefetch popular datasets to avoid initial loading flash in connector
  let initialPopularDatasets: HuggingFaceDataset[] = [];
  try {
    const hdrs = await headers();
    const host = hdrs.get('host');
    const proto = hdrs.get('x-forwarded-proto') ?? 'http';
    const origin = host ? `${proto}://${host}` : '';
    const res = await fetch(`${origin}/api/datasets/huggingface/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'lerobot', limit: 12, sort: 'downloads' }),
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      initialPopularDatasets = data.datasets || [];
    }
  } catch {}

  return (
    <DataImportWizard initialPopularDatasets={initialPopularDatasets} />
  );
}


