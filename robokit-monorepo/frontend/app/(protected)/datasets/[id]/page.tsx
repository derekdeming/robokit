import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { BackendDataset, BackendJob } from '@/types/dataset/huggingface';
import JobRunner from '@/components/datasets/job-runner';
import JobsView from '@/components/datasets/jobs-view';
import { headers } from 'next/headers';
import Link from 'next/link';
import { CopyButton } from '@/components/ui/copy-button';

async function fetchDataset(apiBase: string, id: string): Promise<BackendDataset | null> {
  const res = await fetch(`${apiBase}/api/v1/datasets/${id}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

async function fetchJobs(apiBase: string, id: string): Promise<BackendJob[]> {
  const res = await fetch(`${apiBase}/api/v1/datasets/${id}/jobs`, { cache: 'no-store' });
  if (!res.ok) return [];
  return res.json();
}

async function fetchJobSchemas(apiBase: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${apiBase}/api/v1/datasets/job-parameter-schemas`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

export default async function DatasetDetails({ params }: { params: Promise<{ id: string }> }) {
  const h = headers();
  const hdrs = await h;
  const proto = hdrs.get('x-forwarded-proto') ?? 'http';
  const host = hdrs.get('host');
  if (!host) throw new Error('Missing host');
  const baseUrl = `${proto}://${host}`;
  const apiBase = `${baseUrl}/api/backend`;

  const { id } = await params;
  const [dataset, jobs, schemas] = await Promise.all([
    fetchDataset(apiBase, id),
    fetchJobs(apiBase, id),
    fetchJobSchemas(apiBase),
  ]);

  return (
    <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Dataset #{id}</h1>
            <p className="text-sm text-muted-foreground">
              {dataset?.source?.type === 'huggingface' ? dataset.source.repo_id : 'Custom source'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/datasets/${id}/visualize`}>
              <Button variant="outline" size="sm">Visualize</Button>
            </Link>
            <Link href="/datasets">
              <Button variant="outline" size="sm">Back</Button>
            </Link>
          </div>
        </div>

        {!dataset && (
          <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
            <CardContent className="p-4">
              <p className="text-red-700 dark:text-red-300 text-sm">Dataset not found.</p>
            </CardContent>
          </Card>
        )}

        {/* Dataset summary */}
        {dataset && (
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
              <CardDescription>Basic information and source</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground mr-1">Format:</span>
                  <Badge variant="secondary">{dataset.format_type}</Badge>
                </div>
                {dataset.source?.type === 'huggingface' && (
                  <div className="text-muted-foreground">
                    Revision: <span className="font-mono">{dataset.source.revision}</span>
                  </div>
                )}
                <div className="text-muted-foreground">Created: {new Date(dataset.created_at).toLocaleString()}</div>
                {dataset.updated_at && (
                  <div className="text-muted-foreground">Updated: {new Date(dataset.updated_at).toLocaleString()}</div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Job Runner */}
        {dataset && (
          <Card>
            <CardHeader>
              <CardTitle>Run a job</CardTitle>
              <CardDescription>Trigger new processing or analysis jobs</CardDescription>
            </CardHeader>
            <CardContent>
              <JobRunner datasetId={Number(id)} initialSchemas={schemas ?? undefined} />
            </CardContent>
          </Card>
        )}

        {/* Jobs list */}
        <JobsView jobs={jobs} />

        {/* Visualization */}
        <Card>
          <CardHeader>
            <CardTitle>Visualization</CardTitle>
            <CardDescription>Interactive 3D visualization with Rerun</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={`/datasets/${id}/visualize`}>
              <Button className="w-full">
                Open Rerun Visualizer
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
  );
}


