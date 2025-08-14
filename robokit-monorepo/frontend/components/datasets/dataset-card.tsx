'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Loader2, Calendar, Database, ExternalLink, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { useBackendDatasets } from '@/hooks/api/use-backend-datasets';
import type { BackendDataset, DatasetStatus } from '@/types/dataset/huggingface';
import { cn } from '@/lib/utils';

interface DatasetCardProps {
  dataset: BackendDataset;
  onDelete: (id: number) => void;
  isDeleting: boolean;
  initialStatus?: DatasetStatus | null;
}

export function DatasetCard({ dataset, onDelete, isDeleting, initialStatus }: DatasetCardProps) {
  const { getDatasetStatus } = useBackendDatasets();
  const [status, setStatus] = useState<DatasetStatus | null>(initialStatus ?? null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(!initialStatus);

  useEffect(() => {
    if (initialStatus) return;
    const fetchStatus = async () => {
      setIsLoadingStatus(true);
      try {
        const datasetStatus = await getDatasetStatus(dataset.id);
        setStatus(datasetStatus);
      } catch (error) {
        console.error(`Failed to fetch status for dataset ${dataset.id}:`, error);
      } finally {
        setIsLoadingStatus(false);
      }
    };

    fetchStatus();
  }, [dataset.id, getDatasetStatus, initialStatus]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getDatasetStatusDisplay = () => {
    if (!status || !status.latest_jobs) return { status: 'pending', icon: Clock, color: 'text-yellow-600' };
    
    const metadataJob = status.latest_jobs.metadata_extraction;
    if (!metadataJob) return { status: 'pending', icon: Clock, color: 'text-yellow-600' };
    
    switch (metadataJob.status) {
      case 'completed':
        return { status: 'ready', icon: CheckCircle, color: 'text-green-600' };
      case 'running':
        return { status: 'processing', icon: Loader2, color: 'text-blue-600' };
      case 'failed':
        return { status: 'error', icon: AlertCircle, color: 'text-red-600' };
      default:
        return { status: 'pending', icon: Clock, color: 'text-yellow-600' };
    }
  };

  const { status: displayStatus, icon: StatusIcon, color } = getDatasetStatusDisplay();
  const metadataJob = status?.latest_jobs?.metadata_extraction;

  return (
    <Card className="hover:shadow-md transition-shadow" data-testid="dataset-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center space-x-2">
              <Database className="h-5 w-5" />
              <span className="font-mono text-sm">
                {dataset.source.type === 'huggingface' ? dataset.source.repo_id : `Dataset ${dataset.id}`}
              </span>
            </CardTitle>
            <CardDescription className="flex items-center space-x-4">
              <span className="flex items-center space-x-1">
                <Calendar className="h-4 w-4" />
                <span>Created {formatDate(dataset.created_at)}</span>
              </span>
              <Badge variant="secondary" className="text-xs">
                {dataset.format_type}
              </Badge>
              {isLoadingStatus ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <div className={cn("flex items-center space-x-1", color)}>
                  <StatusIcon className={cn("h-4 w-4", displayStatus === 'processing' && 'animate-spin')} />
                  <span className="text-xs capitalize">{displayStatus}</span>
                </div>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center space-x-2">
            {dataset.source.type === 'huggingface' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open(`https://huggingface.co/datasets/${dataset.source.repo_id}`, '_blank')}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
            <Link href={`/datasets/${dataset.id}`} className="mr-1">
              <Button 
                variant="outline" 
                size="sm"
                className="bg-gray-900 text-white border-gray-900 hover:bg-gray-800 hover:border-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100 dark:hover:bg-gray-200 dark:hover:border-gray-200"
              >
                View
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDelete(dataset.id)}
              disabled={isDeleting}
              className="bg-red-600 text-white border-red-600 hover:bg-red-700 hover:border-red-700 dark:bg-red-500 dark:text-white dark:border-red-500 dark:hover:bg-red-600 dark:hover:border-red-600"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Delete'
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {dataset.source.type === 'huggingface' && (
            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
              <span>Revision: {dataset.source.revision}</span>
            </div>
          )}
          
          {/* Job Status Details */}
          {metadataJob && !isLoadingStatus && (
            <div className="space-y-1">
              <div className="text-sm">
                <span className="font-medium">Metadata Extraction: </span>
                <span className={color}>
                  {metadataJob.status === 'running' ? `${Math.round(metadataJob.progress * 100)}% complete` : metadataJob.status}
                </span>
              </div>
              {metadataJob.status === 'failed' && metadataJob.error_message && (
                <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 p-2 rounded">
                  <span className="font-medium">Error: </span>
                  {metadataJob.error_message}
                </div>
              )}
              {metadataJob.result_summary && (
                <div className="text-xs text-muted-foreground">
                  <span className="mr-4">episodes: {metadataJob.result_summary.episode_count}</span>
                  <span className="mr-4">sensors: {metadataJob.result_summary.sensor_count}</span>
                  {metadataJob.result_summary.camera_count && metadataJob.result_summary.camera_count > 0 && (
                    <span className="mr-4">({metadataJob.result_summary.camera_count} camera{metadataJob.result_summary.camera_count !== 1 ? 's' : ''})</span>
                  )}
                </div>
              )}
              {metadataJob.result?.metadata?.sensors?.cameras && (
                <div className="text-xs text-muted-foreground mt-1">
                  <div className="flex flex-wrap gap-2">
                    {metadataJob.result.metadata.sensors.cameras.map((cam, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {cam.name}: {cam.width}x{cam.height} ({cam.format})
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}