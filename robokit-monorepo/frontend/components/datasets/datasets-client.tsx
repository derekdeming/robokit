'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Search, Database, Filter, SortAsc, SortDesc } from 'lucide-react';
import type { BackendDataset, DatasetStatus } from '@/types/dataset/huggingface';
import { DatasetCard } from '@/components/datasets/dataset-card';
import { useBackendDatasets } from '@/hooks/api/use-backend-datasets';

type SortOption = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'status';
type FilterOption = 'all' | 'huggingface' | 'processing' | 'completed' | 'failed';

interface DatasetsClientProps {
  initialDatasets: BackendDataset[];
  initialStatuses?: Record<number, DatasetStatus | null>;
  newDatasetId?: number;
}

function getDatasetStatus(dataset: BackendDataset, statuses: Record<number, DatasetStatus | null>): 'processing' | 'completed' | 'failed' | 'unknown' {
  const status = statuses[dataset.id];
  if (!status?.latest_jobs?.metadata_extraction) return 'unknown';
  
  const job = status.latest_jobs.metadata_extraction;
  if (job.status === 'running' || job.status === 'pending') return 'processing';
  if (job.status === 'completed') return 'completed';
  if (job.status === 'failed') return 'failed';
  return 'unknown';
}

export default function DatasetsClient({ 
  initialDatasets, 
  initialStatuses = {},
  newDatasetId 
}: DatasetsClientProps) {
  const [datasets, setDatasets] = useState<BackendDataset[]>(initialDatasets);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [highlightedId, setHighlightedId] = useState<number | null>(newDatasetId || null);
  const { deleteDataset } = useBackendDatasets();

  useEffect(() => {
    if (highlightedId) {
      const timer = setTimeout(() => setHighlightedId(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [highlightedId]);


  const filteredAndSortedDatasets = useMemo(() => {
    let filtered = [...datasets];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(dataset => {
        const repoId = dataset.source?.type === 'huggingface' ? dataset.source.repo_id.toLowerCase() : '';
        const formatType = dataset.format_type.toLowerCase();
        return repoId.includes(term) || formatType.includes(term) || dataset.id.toString().includes(term);
      });
    }

    if (filterBy !== 'all') {
      filtered = filtered.filter(dataset => {
        switch (filterBy) {
          case 'huggingface':
            return dataset.source?.type === 'huggingface';
          case 'processing':
            return getDatasetStatus(dataset, initialStatuses) === 'processing';
          case 'completed':
            return getDatasetStatus(dataset, initialStatuses) === 'completed';
          case 'failed':
            return getDatasetStatus(dataset, initialStatuses) === 'failed';
          default:
            return true;
        }
      });
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'name-asc':
          const nameA = a.source?.type === 'huggingface' ? a.source.repo_id : `Dataset ${a.id}`;
          const nameB = b.source?.type === 'huggingface' ? b.source.repo_id : `Dataset ${b.id}`;
          return nameA.localeCompare(nameB);
        case 'name-desc':
          const nameA2 = a.source?.type === 'huggingface' ? a.source.repo_id : `Dataset ${a.id}`;
          const nameB2 = b.source?.type === 'huggingface' ? b.source.repo_id : `Dataset ${b.id}`;
          return nameB2.localeCompare(nameA2);
        case 'status':
          const statusA = getDatasetStatus(a, initialStatuses);
          const statusB = getDatasetStatus(b, initialStatuses);
          const statusOrder = { 'processing': 0, 'failed': 1, 'completed': 2, 'unknown': 3 };
          return statusOrder[statusA] - statusOrder[statusB];
        default:
          return 0;
      }
    });

    return filtered;
  }, [datasets, searchTerm, sortBy, filterBy, initialStatuses]);

  const handleDelete = async (datasetId: number) => {
    if (!confirm('Are you sure you want to delete this dataset? This action cannot be undone.')) {
      return;
    }
    setDeletingId(datasetId);
    try {
      const success = await deleteDataset(datasetId);
      if (success) {
        setDatasets(prev => prev.filter(d => d.id !== datasetId));
      }
    } finally {
      setDeletingId(null);
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSortBy('newest');
    setFilterBy('all');
  };

  const stats = useMemo(() => {
    const total = datasets.length;
    const processing = datasets.filter(d => getDatasetStatus(d, initialStatuses) === 'processing').length;
    const completed = datasets.filter(d => getDatasetStatus(d, initialStatuses) === 'completed').length;
    const failed = datasets.filter(d => getDatasetStatus(d, initialStatuses) === 'failed').length;
    const huggingface = datasets.filter(d => d.source?.type === 'huggingface').length;
    return { total, processing, completed, failed, huggingface };
  }, [datasets, initialStatuses]);

  if (datasets.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">
            No datasets uploaded yet. Start by uploading your first dataset.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Database className="h-5 w-5" />
            Dataset Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="px-2 py-1 bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100">
                {stats.total} total
              </Badge>
            </div>
            {stats.processing > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="px-2 py-1 border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-300">
                  {stats.processing} processing
                </Badge>
              </div>
            )}
            {stats.completed > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="px-2 py-1 border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950 dark:text-green-300">
                  {stats.completed} completed
                </Badge>
              </div>
            )}
            {stats.failed > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="px-2 py-1 border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950 dark:text-red-300">
                  {stats.failed} failed
                </Badge>
              </div>
            )}
            <div className="text-sm text-muted-foreground">
              {stats.huggingface} from Hugging Face
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search and Filter Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search datasets by name, format, or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger className="w-44">
                <div className="flex items-center gap-2">
                  {sortBy.includes('desc') || sortBy === 'oldest' ? (
                    <SortDesc className="h-4 w-4" />
                  ) : (
                    <SortAsc className="h-4 w-4" />
                  )}
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="name-asc">Name A-Z</SelectItem>
                <SelectItem value="name-desc">Name Z-A</SelectItem>
                <SelectItem value="status">By status</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterBy} onValueChange={(v) => setFilterBy(v as FilterOption)}>
              <SelectTrigger className="w-40">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All datasets</SelectItem>
                <SelectItem value="huggingface">Hugging Face</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>

            {(searchTerm || sortBy !== 'newest' || filterBy !== 'all') && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>
          
          {filteredAndSortedDatasets.length !== datasets.length && (
            <div className="mt-3 text-sm text-muted-foreground">
              Showing {filteredAndSortedDatasets.length} of {datasets.length} datasets
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dataset List */}
      {filteredAndSortedDatasets.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-center text-muted-foreground">
              No datasets match your current filters.{' '}
              <Button variant="link" onClick={clearFilters} className="p-0 h-auto">
                Clear filters
              </Button>
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4" data-testid="datasets-list">
          {filteredAndSortedDatasets.map(dataset => {
            const isHighlighted = highlightedId === dataset.id;
            return (
              <div 
                key={dataset.id}
                className={`transition-all duration-1000 ${
                  isHighlighted 
                    ? 'ring-2 ring-primary/50 shadow-lg scale-[1.01] dark:ring-primary/40' 
                    : ''
                }`}
              >
                <DatasetCard
                  dataset={dataset}
                  onDelete={handleDelete}
                  isDeleting={deletingId === dataset.id}
                  initialStatus={initialStatuses[dataset.id] ?? null}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}