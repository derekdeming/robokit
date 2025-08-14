import { ThreeViewer } from '@/components/visualization/three-viewer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { headers } from 'next/headers';

export default async function Dashboard() {
  const h = headers();
  const hdrs = await h;
  const proto = hdrs.get('x-forwarded-proto') ?? 'http';
  const host = hdrs.get('host');
  if (!host) throw new Error('Missing host');
  const baseUrl = `${proto}://${host}`;
  const apiBase = `${baseUrl}/api/backend`;

  let datasetCount = 0;
  try {
    const res = await fetch(`${apiBase}/api/v1/datasets/?skip=0&limit=100`, { cache: 'no-store' });
    if (res.ok) {
      // If backend supports pagination metadata in headers later, prefer that.
      // For now, fetch a small page and infer count by a dedicated endpoint in future.
      const smallPage = await res.json();
      // We only know at least length; keep zero if backend does not return full count.
      datasetCount = Array.isArray(smallPage) ? smallPage.length : 0;
    }
  } catch {}

  return (
    <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold">Dashboard</h2>
          <p className="text-muted-foreground">Monitor your robot datasets and processing status</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Total Datasets</CardTitle>
              <CardDescription>Uploaded and processed</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{datasetCount}</div>
              <p className="text-xs text-muted-foreground mt-2">
                {datasetCount === 0 ? 'Upload your first dataset to get started' : `${datasetCount} datasets available`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Storage Used</CardTitle>
              <CardDescription>Across all datasets</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">0 GB</div>
              <p className="text-xs text-muted-foreground mt-2">No storage used yet</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Processing Jobs</CardTitle>
              <CardDescription>Currently running</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">0</div>
              <p className="text-xs text-muted-foreground mt-2">No jobs running</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Robot Metrics</CardTitle>
              <CardDescription>Performance analytics from your datasets</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <p className="mb-2">No data available</p>
                  <p className="text-sm">Upload robot datasets to see metrics</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3D Visualization</CardTitle>
              <CardDescription>Interactive robot environment view</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ThreeViewer />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
  );
}

