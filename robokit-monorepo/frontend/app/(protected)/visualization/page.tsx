import { DatasetRerunVisualization } from '@/components/visualization/dataset-rerun-visualization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface PageProps {
  searchParams: Promise<{ datasetId?: string }>;
}

export default async function Visualization({ searchParams }: PageProps) {
  const params = await searchParams;
  const datasetId = params.datasetId ? Number(params.datasetId) : null;

  return (
    <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Visualization</h2>
            <p className="text-muted-foreground">
              {datasetId 
                ? `Visualizing Dataset #${datasetId}` 
                : 'Analyze your robot data with interactive visualizations'}
            </p>
          </div>
          {datasetId && (
            <Link href={`/datasets/${datasetId}`}>
              <Button variant="outline" size="sm">
                Back to Dataset
              </Button>
            </Link>
          )}
        </div>

        {datasetId ? (
          <DatasetRerunVisualization 
            datasetId={datasetId} 
            defaultMode="file"
            autoStart={false}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>No Dataset Selected</CardTitle>
              <CardDescription>
                Select a dataset to begin visualization
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center p-12">
                <div className="text-center space-y-4">
                  <p className="text-muted-foreground">
                    Choose a dataset from your library to visualize with Rerun
                  </p>
                  <Link href="/datasets">
                    <Button>Browse Datasets</Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
  );
}