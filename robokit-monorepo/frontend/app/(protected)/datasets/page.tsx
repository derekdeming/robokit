import { Card, CardContent } from '@/components/ui/card';
import type { BackendDataset, DatasetStatus } from '@/types/dataset/huggingface';
import DatasetsClient from '@/components/datasets/datasets-client';
import { headers } from 'next/headers';

export default async function Datasets({ searchParams }: { 
  searchParams?: Promise<{ newDataset?: string }> 
}) {
  const h = headers();
  const hdrs = await h;
  const proto = hdrs.get('x-forwarded-proto') ?? 'http';
  const host = hdrs.get('host');
  if (!host) throw new Error('Missing host');
  const baseUrl = `${proto}://${host}`;
  const apiBase = `${baseUrl}/api/backend`;

  const params = await searchParams;
  const newDatasetId = params?.newDataset ? parseInt(params.newDataset, 10) : undefined;

  let datasets: BackendDataset[] = [];
  let initialStatuses: Record<number, DatasetStatus | null> = {};
  let errorMessage: string | null = null;

  try {
    const res = await fetch(`${apiBase}/api/v1/datasets/?skip=0&limit=100`, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    datasets = await res.json();
    const statusResults = await Promise.all(
      datasets.map(async (d) => {
        try {
          const sres = await fetch(`${apiBase}/api/v1/datasets/${d.id}/status`, { cache: 'no-store' });
          if (!sres.ok) return [d.id, null] as const;
          const status: DatasetStatus = await sres.json();
          return [d.id, status] as const;
        } catch {
          return [d.id, null] as const;
        }
      })
    );
    initialStatuses = Object.fromEntries(statusResults);
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : 'Failed to load datasets';
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Datasets</h2>
        <p className="text-muted-foreground">Manage your robot sensor datasets</p>
      </div>

      {errorMessage ? (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardContent className="p-4">
            <p className="text-red-700 dark:text-red-300 text-sm">Error loading datasets: {errorMessage}</p>
          </CardContent>
        </Card>
      ) : datasets.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-center text-muted-foreground">
              No datasets uploaded yet. Start by uploading your first dataset.
            </p>
          </CardContent>
        </Card>
      ) : (
        <DatasetsClient 
          initialDatasets={datasets} 
          initialStatuses={initialStatuses}
          newDatasetId={newDatasetId}
        />
      )}
    </div>
  );
}

