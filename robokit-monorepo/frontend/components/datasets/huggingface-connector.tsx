'use client';

import { useState, useEffect } from 'react';
import { Search, Key, Globe, Lock, ExternalLink, Download, Info, Loader2, ChevronLeft, ChevronRight, CheckCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useHuggingFaceSearch } from '@/hooks/api/use-huggingface';
import type { HuggingFaceDataset } from '@/types/dataset/huggingface';

function mapHubErrorToFriendly(
  status: number,
  rawText: string,
  hadToken: boolean,
  context: 'validate' | 'resolve' = 'validate'
): string {
  const lower = (rawText || '').toLowerCase();
  const gatedHint = lower.includes('gated') || lower.includes('restricted') || lower.includes('access request');
  const notAuthHint = lower.includes('not authorized') || lower.includes('unauthorized') || lower.includes('forbidden');
  const badTokenHint = lower.includes('token') && (lower.includes('invalid') || lower.includes('expired'));
  const usernamePwdNoise = lower.includes('invalid username') || lower.includes('password');

  if (status === 401) {
    if (badTokenHint) {
      return 'Invalid or expired Hugging Face token. Please update your token.';
    }
    return hadToken
      ? 'Unauthorized. Your token may be invalid or lacks access to this dataset. Update the token or request access on the dataset page.'
      : 'Private or unauthorized dataset. Provide a valid Hugging Face token to access it.';
  }

  if (status === 403) {
    if (gatedHint || notAuthHint) {
      return 'Your token does not have access to this dataset. Request access on the dataset page or use a token with permission.';
    }
    return hadToken
      ? 'Forbidden. Your token does not have access to this dataset. Request access or use a token with permission.'
      : 'Private or unauthorized dataset. Provide a valid Hugging Face token to access it.';
  }

  if (status === 404) {
    return context === 'resolve'
      ? 'Revision not found. Check the branch, tag, or commit SHA.'
      : 'Dataset not found. Check the dataset ID (username/dataset-name).';
  }

  if (status === 429) return 'Rate limited by Hugging Face. Please try again shortly.';

  if (usernamePwdNoise) {
    return hadToken
      ? 'Unauthorized. Your token may be invalid or lacks access. Update the token or request access.'
      : 'Private or unauthorized dataset. Provide a valid Hugging Face token to access it.';
  }

  if (rawText) return rawText;
  return context === 'resolve' ? 'Failed to resolve revision' : 'Failed to validate dataset';
}

async function resolveRevisionSha(
  repoId: string,
  revisionInput?: string,
  token?: string
): Promise<string> {
  const input = (revisionInput || '').trim();

  const isLatest = input === '' || input.toLowerCase() === 'latest';
  const endpoint = isLatest
    ? `https://huggingface.co/api/datasets/${encodeURIComponent(repoId)}`
    : `https://huggingface.co/api/datasets/${encodeURIComponent(repoId)}/revision/${encodeURIComponent(input)}`;

  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const resp = await fetch(endpoint, { headers, signal: controller.signal });
    clearTimeout(timeoutId);
    if (!resp.ok) {
      let rawText = '';
      try {
        const j = await resp.clone().json();
        rawText = (j && (j.error || j.message || j.detail)) || '';
      } catch {
        rawText = await resp.text().catch(() => '');
      }
      const friendly = mapHubErrorToFriendly(resp.status, rawText, !!token, 'resolve');
      throw new Error(friendly);
    }
    const info = await resp.json();
    if (!info || typeof info.sha !== 'string' || !/^[a-f0-9]{40}$/i.test(info.sha)) {
      throw new Error('Unable to resolve commit SHA for the specified revision');
    }
    return info.sha as string;
  } finally {
    clearTimeout(timeoutId);
  }
}


interface HuggingFaceConnectorProps {
  onDatasetConnect: (dataset: HuggingFaceDataset, token?: string) => void;
  initialPopularDatasets?: HuggingFaceDataset[];
}

export function HuggingFaceConnector({ onDatasetConnect, initialPopularDatasets }: HuggingFaceConnectorProps) {
  const [activeTab, setActiveTab] = useState<'browse' | 'direct'>('browse');
  const [searchQuery, setSearchQuery] = useState('');
  const [directDatasetId, setDirectDatasetId] = useState('');
  const [revision, setRevision] = useState('');
  const [hfToken, setHfToken] = useState('');
  const [isLoadingPopular, setIsLoadingPopular] = useState(!initialPopularDatasets);
  const [popularDatasets, setPopularDatasets] = useState<HuggingFaceDataset[]>(initialPopularDatasets || []);
  const [selectedPageSize, setSelectedPageSize] = useState(8);
  const [sort, setSort] = useState<'downloads' | 'likes' | 'updated' | 'created'>('downloads');
  const [resolvingDatasetId, setResolvingDatasetId] = useState<string | null>(null);
  const [repoValidationStatus, setRepoValidationStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [repoValidationError, setRepoValidationError] = useState<string | null>(null);
  const [defaultHeadSha, setDefaultHeadSha] = useState<string | null>(null);
  const [revisionValidationStatus, setRevisionValidationStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [revisionValidationError, setRevisionValidationError] = useState<string | null>(null);
  const [revisionResolvedSha, setRevisionResolvedSha] = useState<string | null>(null);

  const {
    searchWithPagination,
    nextPage,
    previousPage,
    changePageSize,
    reset,
    isLoading: isSearching,
    error: searchError,
    currentPage,
    searchResults: paginatedResults,
    hasNextPage,
    hasPreviousPage,
    totalPages
  } = useHuggingFaceSearch();

  const [error, setError] = useState<string | null>(null);
  const searchResults = paginatedResults?.datasets || [];
  
  // Combine local and search errors
  const displayError = error || searchError;

  // Fetch popular robotics datasets from Hugging Face API
  const fetchPopularDatasets = async () => {
    try {
      setIsLoadingPopular(true);
      setError(null);
      
      const response = await fetch('/api/datasets/huggingface/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: 'lerobot',
          limit: 12,
          sort: 'downloads',
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setPopularDatasets(data.datasets || []);
    } catch (error) {
      console.error('Error fetching popular datasets:', error);
      setError('Failed to fetch datasets. Please try again.');
      setPopularDatasets([]);
    } finally {
      setIsLoadingPopular(false);
    }
  };

  // Search datasets using the pagination hook
  const handleSearch = async (resetPage = true) => {
    if (!searchQuery.trim()) return;
    setError(null);

    try {
      if (resetPage) {
        await searchWithPagination(searchQuery, 0, selectedPageSize, sort);
      }
    } catch (error) {
      console.error('Error searching datasets:', error);
      setError('Search failed. Please try again.');
    }
  };

  const handleNextPage = async () => {
    if (!searchQuery.trim() || !hasNextPage) return;
    await nextPage(searchQuery, sort);
  };

  const handlePreviousPage = async () => {
    if (!searchQuery.trim() || !hasPreviousPage) return;
    await previousPage(searchQuery, sort);
  };

  const handlePageSizeChange = async (newPageSize: number) => {
    setSelectedPageSize(newPageSize);
    if (searchQuery.trim()) {
      await changePageSize(searchQuery, newPageSize, sort);
    }
  };

  const handleSortChange = async (newSort: 'downloads' | 'likes' | 'updated' | 'created') => {
    setSort(newSort);
    if (searchQuery.trim()) {
      await searchWithPagination(searchQuery, currentPage, selectedPageSize, newSort);
    }
  };

  useEffect(() => {
    if (!initialPopularDatasets || initialPopularDatasets.length === 0) {
      fetchPopularDatasets();
    }
  }, [initialPopularDatasets]);

  // Validate dataset repo and fetch default branch HEAD SHA for blank revision
  useEffect(() => {
    const repoId = directDatasetId.trim();
    if (!repoId) {
      setRepoValidationStatus('idle');
      setRepoValidationError(null);
      setDefaultHeadSha(null);
      return;
    }

    let isCancelled = false;
    setRepoValidationStatus('validating');
    setRepoValidationError(null);
    setDefaultHeadSha(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const debounceId = setTimeout(async () => {
      try {
        const headers: Record<string, string> = { 'Accept': 'application/json' };
        if (hfToken) headers['Authorization'] = `Bearer ${hfToken}`;
        const resp = await fetch(`https://huggingface.co/api/datasets/${encodeURIComponent(repoId)}`, {
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!resp.ok) {
          let rawText = '';
          try {
            const j = await resp.clone().json();
            rawText = (j && (j.error || j.message || j.detail)) || '';
          } catch {
            rawText = await resp.text().catch(() => '');
          }
          const friendly = mapHubErrorToFriendly(resp.status, rawText, !!hfToken, 'validate');
          throw new Error(friendly);
        }
        const info = await resp.json();
        const sha = typeof info?.sha === 'string' ? info.sha : null;
        if (!isCancelled) {
          if (sha && /^[a-f0-9]{40}$/i.test(sha)) {
            setDefaultHeadSha(sha);
            setRepoValidationStatus('valid');
          } else {
            setRepoValidationStatus('invalid');
            setRepoValidationError('Could not determine default branch HEAD');
          }
        }
      } catch (err) {
        if (!isCancelled) {
          setRepoValidationStatus('invalid');
          const msg = err instanceof Error ? err.message : 'Failed to validate dataset';
          setRepoValidationError(msg);
        }
      }
  }, 350);

    return () => {
      isCancelled = true;
      clearTimeout(debounceId);
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [directDatasetId, hfToken]);
  

  // Validate revision whenever repoId and revision input change
  useEffect(() => {
    const repoId = directDatasetId.trim();
    const rev = revision.trim();
    setRevisionResolvedSha(null);
    setRevisionValidationError(null);
    if (!repoId) {
      setRevisionValidationStatus('idle');
      return;
    }
    // Only validate revision if dataset repo is valid to avoid duplicate auth/not-found errors
    if (repoValidationStatus !== 'valid') {
      setRevisionValidationStatus('idle');
      return;
    }
    if (rev === '') {
      // Blank => use default head (already displayed via repo validation)
      setRevisionValidationStatus('idle');
      return;
    }

    let isCancelled = false;
    setRevisionValidationStatus('validating');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const debounceId = setTimeout(async () => {
      try {
        const sha = await resolveRevisionSha(repoId, rev, hfToken || undefined);
        if (isCancelled) return;
        setRevisionResolvedSha(sha);
        setRevisionValidationStatus('valid');
      } catch (err) {
        if (isCancelled) return;
        setRevisionValidationStatus('invalid');
        const message = err instanceof Error ? err.message : 'Failed to validate revision';
        setRevisionValidationError(message);
      }
    }, 350);

    return () => {
      isCancelled = true;
      clearTimeout(debounceId);
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [directDatasetId, revision, hfToken, repoValidationStatus]);

  const handleDirectConnect = async () => {
    if (!directDatasetId.trim()) return;
    setResolvingDatasetId(directDatasetId);
    setError(null);

    try {
      // Create dataset object for direct connection
      const [author, name] = directDatasetId.includes('/') 
        ? directDatasetId.split('/')
        : ['unknown', directDatasetId];

      const effectiveRevision = revision.trim() === '' ? '' : revision.trim();
      const resolvedSha = await resolveRevisionSha(directDatasetId, effectiveRevision, hfToken || undefined);
      
      const dataset: HuggingFaceDataset = {
        id: directDatasetId,
        author,
        name,
        description: 'Dataset connected directly by ID',
        downloads: 0,
        likes: 0,
        tags: [],
        isPrivate: !!hfToken,
        createdAt: new Date().toISOString(),
        sha: resolvedSha
      };
      
      onDatasetConnect(dataset, hfToken || undefined);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to resolve dataset revision';
      setError(message);
    } finally {
      setResolvingDatasetId(null);
    }
  };

  const DatasetCard = ({ dataset }: { dataset: HuggingFaceDataset }) => {
    // Extract and clean description
    const cleanDescription = (desc: string) => {
      // Remove HTML-like formatting and truncate long descriptions
      const cleaned = desc
        .replace(/\t+/g, ' ')
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/Dataset Structure.*?See the full description.*?\./g, '')
        .trim();
      
      if (cleaned.length > 150) {
        return cleaned.substring(0, 150) + '...';
      }
      return cleaned || 'No description available';
    };

    // Filter and categorize tags
    const importantTags = dataset.tags.filter(tag => 
      tag.includes('robotics') || 
      tag.includes('LeRobot') || 
      tag.includes('robot') ||
      tag.startsWith('task_categories:') ||
      tag.startsWith('modality:') ||
      tag.startsWith('license:') ||
      tag.startsWith('language:')
    );

    const otherTags = dataset.tags.filter(tag => !importantTags.includes(tag));

    // Resolve default branch HEAD SHA for display
    const [headSha, setHeadSha] = useState<string | null>(null);
    const [headLoading, setHeadLoading] = useState<boolean>(false);

    useEffect(() => {
      let cancelled = false;
      const fetchSha = async () => {
        try {
          // Use provided sha if it's already a full commit, else resolve
          if (dataset.sha && /^[a-f0-9]{40}$/i.test(dataset.sha)) {
            if (!cancelled) setHeadSha(dataset.sha);
            return;
          }
          setHeadLoading(true);
          const sha = await resolveRevisionSha(dataset.id, '', hfToken || undefined);
          if (!cancelled) setHeadSha(sha);
        } catch {
          if (!cancelled) setHeadSha(null);
        } finally {
          if (!cancelled) setHeadLoading(false);
        }
      };
      fetchSha();
      return () => { cancelled = true; };
    }, [dataset.id, dataset.sha]);

    return (
      <Card className="hover:shadow-lg transition-all duration-200 hover:border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                {dataset.isPrivate ? (
                  <Lock className="h-4 w-4 text-orange-500 flex-shrink-0" />
                ) : (
                  <Globe className="h-4 w-4 text-green-500 flex-shrink-0" />
                )}
                <CardTitle className="text-base font-mono text-primary truncate">
                  {dataset.id}
                </CardTitle>
              </div>
              
              <CardDescription className="text-sm leading-relaxed mb-3">
                {cleanDescription(dataset.description)}
              </CardDescription>

              <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                <span className="flex items-center gap-1">
                  <Download className="h-3 w-3" />
                  {dataset.downloads.toLocaleString()}
                </span>
                <span className="flex items-center gap-1">
                  ❤️ {dataset.likes}
                </span>
                <span className="flex items-center gap-1">
                  Revision
                  {headLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : headSha ? (
                    <code className="font-mono">{headSha}</code>
                  ) : (
                    <span>—</span>
                  )}
                </span>
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              className="flex-shrink-0"
              onClick={() => window.open(`https://huggingface.co/datasets/${dataset.id}`, '_blank')}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>

          {/* Important tags first */}
          {importantTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {importantTags.slice(0, 4).map(tag => (
                <Badge 
                  key={tag} 
                  variant={tag.includes('robotics') || tag.includes('LeRobot') || tag.startsWith('task_categories:') ? 'default' : 'secondary'}
                  className="text-xs"
                >
                  {tag.replace('task_categories:', '').replace('modality:', '').replace('license:', '').replace('language:', '')}
                </Badge>
              ))}
            </div>
          )}

          {/* Show fewer other tags, collapsed by default */}
          {otherTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {otherTags.slice(0, 3).map(tag => (
                <Badge key={tag} variant="outline" className="text-xs opacity-70">
                  {tag.replace(/^[^:]+:/, '')}
                </Badge>
              ))}
              {otherTags.length > 3 && (
                <Badge variant="outline" className="text-xs opacity-50">
                  +{otherTags.length - 3} more
                </Badge>
              )}
            </div>
          )}
        </CardHeader>
        
        <CardContent className="pt-0">
          <Button 
            onClick={async () => {
              setResolvingDatasetId(dataset.id);
              setError(null);
              try {
                const resolvedSha = await resolveRevisionSha(dataset.id, dataset.sha ?? '', hfToken || undefined);
                onDatasetConnect({ ...dataset, sha: resolvedSha }, hfToken || undefined);
              } catch (e) {
                const message = e instanceof Error ? e.message : 'Failed to resolve dataset revision';
                setError(message);
              } finally {
                setResolvingDatasetId(null);
              }
            }}
            className="w-full"
            size="sm"
            disabled={resolvingDatasetId === dataset.id}
          >
            {resolvingDatasetId === dataset.id ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {resolvingDatasetId === dataset.id ? 'Connecting…' : 'Connect Dataset'}
          </Button>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Connect Hugging Face Dataset</h2>
        <p className="text-muted-foreground">
          Browse and connect to datasets from the Hugging Face Hub
        </p>
      </div>

      {/* Authentication Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Authentication (Optional)
          </CardTitle>
          <CardDescription>
            Provide your Hugging Face token to access private datasets
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="hf-token">Hugging Face Token</Label>
            <Input
              id="hf-token"
              type="password"
              placeholder="hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={hfToken}
              onChange={(e) => setHfToken(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Get your token from{' '}
              <a 
                href="https://huggingface.co/settings/tokens" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Hugging Face Settings
              </a>
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'browse' | 'direct')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="browse">Browse Datasets</TabsTrigger>
          <TabsTrigger value="direct">Connect by ID</TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="Search all datasets on Hugging Face..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <Button onClick={() => handleSearch()} disabled={isSearching || !searchQuery.trim()}>
              {isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Search Controls */}
          {searchQuery && (
            <div className="flex items-center justify-between gap-4 py-2 border-b">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label htmlFor="page-size" className="text-sm">Results per page:</Label>
                  <select
                    id="page-size"
                    value={selectedPageSize}
                    onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                    className="text-sm border rounded px-2 py-1"
                  >
                    <option value={8}>8</option>
                    <option value={12}>12</option>
                    <option value={16}>16</option>
                    <option value={20}>20</option>
                    <option value={30}>30</option>
                    <option value={50}>50</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="sort-by" className="text-sm">Sort by:</Label>
                  <select
                    id="sort-by"
                    value={sort}
                    onChange={(e) => handleSortChange(e.target.value as 'downloads' | 'likes' | 'updated' | 'created')}
                    className="text-sm border rounded px-2 py-1"
                  >
                    <option value="downloads">Downloads</option>
                    <option value="likes">Likes</option>
                    <option value="updated">Last Updated</option>
                    <option value="created">Created Date</option>
                  </select>
                </div>
              </div>
              
              {paginatedResults && (
                <div className="text-sm text-muted-foreground">
                  Page {currentPage + 1} {totalPages > 0 && `of ${totalPages}`}
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            <h3 className="font-medium">
              {searchQuery ? 'Search Results' : 'Popular Datasets'}
            </h3>
            
            {displayError && (
              <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-red-700 dark:text-red-300 text-sm">{displayError}</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    setError(null);
                    reset();
                    if (searchQuery) {
                      handleSearch();
                    } else {
                      fetchPopularDatasets();
                    }
                  }}
                  className="mt-2"
                >
                  Try Again
                </Button>
              </div>
            )}
            
            {isLoadingPopular && !searchQuery && (
              <div className="text-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                <p className="text-muted-foreground">Loading popular datasets...</p>
              </div>
            )}
            
            {isSearching && (
              <div className="text-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                <p className="text-muted-foreground">Searching datasets...</p>
              </div>
            )}
            
            {!isLoadingPopular && !isSearching && !displayError && (
              <div className="grid gap-4">
                {(searchQuery ? searchResults : popularDatasets).map(dataset => (
                  <DatasetCard key={dataset.id} dataset={dataset} />
                ))}
              </div>
            )}

            {/* Pagination Controls */}
            {searchQuery && searchResults.length > 0 && !isSearching && (
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Showing {searchResults.length} results on page {currentPage + 1}
                  {totalPages > 0 && ` of ${totalPages}`}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePreviousPage}
                    disabled={!hasPreviousPage || isSearching}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={!hasNextPage || isSearching}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
            
            {!isLoadingPopular && !isSearching && !displayError && 
             (searchQuery ? searchResults.length === 0 : popularDatasets.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                <p>{searchQuery ? 'No datasets found for your search.' : 'No datasets available.'}</p>
                {searchQuery && (
                  <p className="text-sm mt-1">Try a different search term.</p>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="direct" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Connect by Dataset ID</CardTitle>
              <CardDescription>
                Enter the full dataset ID (e.g., &ldquo;observabot/so101_die_mat4&rdquo;)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="dataset-id">Dataset ID</Label>
                <Input
                  id="dataset-id"
                  placeholder="username/dataset-name"
                  value={directDatasetId}
                  onChange={(e) => setDirectDatasetId(e.target.value)}
                />
                {directDatasetId.trim() && (
                  <div className="text-xs mt-1">
                    {repoValidationStatus === 'validating' && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Validating dataset…</span>
                      </div>
                    )}
                    {repoValidationStatus === 'valid' && defaultHeadSha && (
                      <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                        <CheckCircle className="h-3 w-3" />
                        <span>Found. Default branch HEAD:</span>
                        <code className="ml-1">{defaultHeadSha}</code>
                      </div>
                    )}
                    {repoValidationStatus === 'invalid' && (
                      <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                        <AlertCircle className="h-3 w-3" />
                        <span>{repoValidationError || 'Dataset not found or inaccessible'}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            
            <div className="space-y-2">
              <Label htmlFor="dataset-revision">Revision (optional)</Label>
              <Input
                id="dataset-revision"
                placeholder="<commit-sha>"
                value={revision}
                onChange={(e) => setRevision(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to use the default branch HEAD.
              </p>
              {revision.trim() !== '' && (
                <div className="text-xs mt-1">
                  {revisionValidationStatus === 'validating' && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Validating revision…</span>
                    </div>
                  )}
                  {revisionValidationStatus === 'valid' && revisionResolvedSha && (
                    <>
                      {revision.trim().toLowerCase() === revisionResolvedSha.toLowerCase() ? (
                        <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                          <CheckCircle className="h-3 w-3" />
                          <span>Revision valid</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                      <Info className="h-3 w-3" />
                      <span>
                        Resolved &ldquo;{revision.trim()}&rdquo; to <code className="ml-1">{revisionResolvedSha}</code>
                      </span>
                        </div>
                      )}
                    </>
                  )}
                  {revisionValidationStatus === 'invalid' && repoValidationStatus === 'valid' && (
                    <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                      <AlertCircle className="h-3 w-3" />
                      <span>{revisionValidationError || 'Invalid revision (branch, tag, or commit not found)'}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
              
              {/* Example usage box removed per design */}

              {/* Summary of what will be sent to backend */}
              {directDatasetId.trim() && (
                <div className="rounded-md border p-3 text-sm bg-muted/30">
                  <div className="flex items-center justify-between py-0.5">
                    <span className="text-muted-foreground">Dataset ID</span>
                    <code className="font-mono">{directDatasetId.trim()}</code>
                  </div>
                  <div className="flex items-center justify-between py-0.5">
                    <span className="text-muted-foreground">Revision</span>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const hasCustomRev = revision.trim() !== '';
                        const isValidating = hasCustomRev
                          ? revisionValidationStatus === 'validating'
                          : repoValidationStatus === 'validating';
                        const sha = hasCustomRev ? revisionResolvedSha : defaultHeadSha;
                        if (isValidating) {
                          return (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              <span>resolving…</span>
                            </span>
                          );
                        }
                        if (sha) {
                          return (
                            <span className="inline-flex items-center gap-1">
                              <code className="font-mono">{sha}</code>
                              {/* Resolved-from note omitted in summary per design */}
                            </span>
                          );
                        }
                        return <span className="text-muted-foreground">—</span>;
                      })()}
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-0.5">
                    <span className="text-muted-foreground">Format</span>
                    <code className="font-mono">lerobot</code>
                  </div>
                </div>
              )}
              
              <Button 
                onClick={handleDirectConnect}
                disabled={
                  !directDatasetId.trim() ||
                  repoValidationStatus !== 'valid' ||
                  (revision.trim() !== '' && revisionValidationStatus !== 'valid') ||
                  resolvingDatasetId === directDatasetId
                }
                className="w-full"
                title={
                  repoValidationStatus === 'validating' ? 'Validating dataset…' :
                  repoValidationStatus === 'invalid' ? 'Fix dataset ID or token' :
                  (revision.trim() !== '' && revisionValidationStatus === 'validating') ? 'Validating revision…' :
                  undefined
                }
              >
                {resolvingDatasetId === directDatasetId ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                {resolvingDatasetId === directDatasetId ? 'Connecting…' : 'Connect Dataset'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default HuggingFaceConnector;