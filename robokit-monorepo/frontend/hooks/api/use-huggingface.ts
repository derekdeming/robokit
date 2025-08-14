import { useState, useCallback } from 'react';
import type { 
  HuggingFaceDataset, 
  HuggingFaceSearchParams, 
  HuggingFaceSearchResponse 
} from '@/types/dataset/huggingface';
import type { DatasetImportRequest, DatasetImportResponse } from '@/types/dataset/import';
import { useBackendDatasets } from './use-backend-datasets';

export function useHuggingFaceSearch() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(8);
  const [searchResults, setSearchResults] = useState<HuggingFaceSearchResponse | null>(null);

  const searchDatasets = useCallback(async (params: HuggingFaceSearchParams): Promise<HuggingFaceSearchResponse | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const searchBody = {
        query: params.query || '',
        limit: params.limit || pageSize,
        offset: params.offset || (currentPage * pageSize),
        sort: params.sort || 'downloads',
        tags: params.tags?.join(','),
      };

      const response = await fetch('/api/datasets/huggingface/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(searchBody),
      });
      
      if (!response.ok) {
        throw new Error('Failed to search datasets');
      }

      const data: HuggingFaceSearchResponse = await response.json();
      setSearchResults(data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize]);

  const searchWithPagination = useCallback(async (
    query: string,
    page: number = 0,
    limit: number = pageSize,
    sort: 'downloads' | 'likes' | 'updated' | 'created' = 'downloads'
  ): Promise<HuggingFaceSearchResponse | null> => {
    setCurrentPage(page);
    setPageSize(limit);
    
    return searchDatasets({
      query,
      limit,
      offset: page * limit,
      sort
    });
  }, [searchDatasets, pageSize]);

  const nextPage = useCallback(async (query: string, sort?: 'downloads' | 'likes' | 'updated' | 'created') => {
    if (!searchResults?.hasMore) return null;
    return searchWithPagination(query, currentPage + 1, pageSize, sort);
  }, [searchWithPagination, currentPage, pageSize, searchResults?.hasMore]);

  const previousPage = useCallback(async (query: string, sort?: 'downloads' | 'likes' | 'updated' | 'created') => {
    if (currentPage <= 0) return null;
    return searchWithPagination(query, currentPage - 1, pageSize, sort);
  }, [searchWithPagination, currentPage, pageSize]);

  const goToPage = useCallback(async (query: string, page: number, sort?: 'downloads' | 'likes' | 'updated' | 'created') => {
    if (page < 0) return null;
    return searchWithPagination(query, page, pageSize, sort);
  }, [searchWithPagination, pageSize]);

  const changePageSize = useCallback(async (query: string, newPageSize: number, sort?: 'downloads' | 'likes' | 'updated' | 'created') => {
    if (newPageSize < 1 || newPageSize > 50) return null;
    setCurrentPage(0); // Reset to first page when changing page size
    return searchWithPagination(query, 0, newPageSize, sort);
  }, [searchWithPagination]);

  const reset = useCallback(() => {
    setCurrentPage(0);
    setPageSize(8);
    setSearchResults(null);
    setError(null);
  }, []);

  return { 
    searchDatasets, 
    searchWithPagination,
    nextPage,
    previousPage,
    goToPage,
    changePageSize,
    reset,
    isLoading, 
    error,
    currentPage,
    pageSize,
    searchResults,
    hasNextPage: searchResults?.hasMore || false,
    hasPreviousPage: currentPage > 0,
    totalPages: searchResults ? Math.ceil((searchResults.total + (searchResults.offset || 0)) / pageSize) : 0
  };
}

export function useHuggingFaceConnect() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { createDataset } = useBackendDatasets();

  const connectDataset = useCallback(async (
    datasetId: string,
    commitHash: string,
    token?: string, 
    metadata?: { name?: string; description?: string; tags?: string[]; }
  ): Promise<DatasetImportResponse | null> => {
    setIsLoading(true);
    setError(null);

    try {
      // Use the backend API to create the dataset
      const backendDataset = await createDataset(datasetId, commitHash, 'lerobot');
      
      if (!backendDataset) {
        throw new Error('Failed to create dataset');
      }

      // Convert backend response to frontend format for compatibility
      const response: DatasetImportResponse = {
        id: backendDataset.id.toString(),
        status: 'processing',
        message: `Started dataset import for: ${datasetId} (${commitHash.substring(0, 8)})`,
        dataset: {
          id: backendDataset.id.toString(),
          name: datasetId.split('/').pop() || datasetId,
          source: 'huggingface',
          status: 'processing',
          hfDatasetId: datasetId,
          commitHash,
          gitUrl: `https://huggingface.co/datasets/${datasetId}`,
          createdAt: backendDataset.created_at
        }
      };

      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      // Propagate so callers can show the specific reason immediately
      throw (err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setIsLoading(false);
    }
  }, [createDataset]);

  return { connectDataset, isLoading, error };
}