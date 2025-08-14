import { useState, useCallback } from 'react';
import type { 
  BackendDataset,
  BackendDatasetCreate,
  BackendJob,
  BackendAnalysisResult,
  DatasetStatus,
  JobType
} from '@/types/dataset/huggingface';
import { toBackendDatasetCreate } from '@/types/dataset/huggingface';

export class DatasetError extends Error {
  field?: string;
  status?: number;

  constructor(message: string, field?: string, status?: number) {
    super(message);
    this.name = 'DatasetError';
    this.field = field;
    this.status = status;
  }
}

type UseBackendDatasetsReturn = {
  createDataset: (datasetId: string, commitHash: string, formatType?: BackendDatasetCreate['format_type']) => Promise<BackendDataset | null>;
  getDataset: (datasetId: number) => Promise<BackendDataset | null>;
  listDatasets: (skip?: number, limit?: number) => Promise<BackendDataset[]>;
  getDatasetStatus: (datasetId: number) => Promise<DatasetStatus | null>;
  deleteDataset: (datasetId: number) => Promise<boolean>;
  getDatasetJobs: (datasetId: number) => Promise<BackendJob[]>;
  getJob: (datasetId: number, jobId: number) => Promise<BackendJob | null>;
  runAnalysis: (datasetId: number, jobType: JobType, parameters?: Record<string, unknown>) => Promise<BackendJob | null>;
  getLatestAnalysis: (datasetId: number, jobType: JobType) => Promise<BackendAnalysisResult | null>;
  getAnalysisHistory: (datasetId: number, jobType: JobType) => Promise<BackendJob[]>;
  isLoading: boolean;
  error: DatasetError | null;
};

const API_BASE = process.env.NEXT_PUBLIC_INTERNAL_API_PROXY ?? '/api/backend';

export function useBackendDatasets(): UseBackendDatasetsReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<DatasetError | null>(null);

  const handleError = useCallback((err: unknown): DatasetError => {
    if (err instanceof DatasetError) {
      return err;
    }
    if (err instanceof Error) {
      return new DatasetError(err.message);
    }
    return new DatasetError('Unknown error occurred');
  }, []);

  const makeRequest = useCallback(async <T>(
    url: string,
    options?: RequestInit
  ): Promise<T> => {
    const response = await fetch(`${API_BASE}${url}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new DatasetError(
        errorData.detail || `HTTP ${response.status}: ${response.statusText}`,
        errorData.field,
        response.status
      );
    }

    return response.json();
  }, []);

  const createDataset = useCallback(async (
    datasetId: string,
    commitHash: string,
    formatType: BackendDatasetCreate['format_type'] = 'lerobot'
  ): Promise<BackendDataset | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const payload = toBackendDatasetCreate(datasetId, commitHash, formatType);
      const dataset = await makeRequest<BackendDataset>('/api/v1/datasets/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return dataset;
    } catch (err) {
      const error = handleError(err);
      setError(error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [makeRequest, handleError]);

  const getDataset = useCallback(async (datasetId: number): Promise<BackendDataset | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const dataset = await makeRequest<BackendDataset>(`/api/v1/datasets/${datasetId}`);
      return dataset;
    } catch (err) {
      const error = handleError(err);
      if (error.status === 404) {
        error.message = 'Dataset not found';
      }
      setError(error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [makeRequest, handleError]);

  const listDatasets = useCallback(async (skip = 0, limit = 100): Promise<BackendDataset[]> => {
    setIsLoading(true);
    setError(null);

    try {
      const datasets = await makeRequest<BackendDataset[]>(`/api/v1/datasets/?skip=${skip}&limit=${limit}`);
      return datasets;
    } catch (err) {
      const error = handleError(err);
      setError(error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [makeRequest, handleError]);

  const getDatasetStatus = useCallback(async (datasetId: number): Promise<DatasetStatus | null> => {
    try {
      const status = await makeRequest<DatasetStatus>(`/api/v1/datasets/${datasetId}/status`);
      return status;
    } catch (err) {
      const error = handleError(err);
      setError(error);
      return null;
    }
  }, [makeRequest, handleError]);

  const deleteDataset = useCallback(async (datasetId: number): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      await makeRequest(`/api/v1/datasets/${datasetId}`, { method: 'DELETE' });
      return true;
    } catch (err) {
      const error = handleError(err);
      setError(error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [makeRequest, handleError]);

  const getDatasetJobs = useCallback(async (datasetId: number): Promise<BackendJob[]> => {
    try {
      const jobs = await makeRequest<BackendJob[]>(`/api/v1/datasets/${datasetId}/jobs`);
      return jobs;
    } catch (err) {
      const error = handleError(err);
      setError(error);
      return [];
    }
  }, [makeRequest, handleError]);

  const getJob = useCallback(async (datasetId: number, jobId: number): Promise<BackendJob | null> => {
    try {
      const job = await makeRequest<BackendJob>(`/api/v1/datasets/${datasetId}/jobs/${jobId}`);
      return job;
    } catch (err) {
      return null;
    }
  }, [makeRequest]);

  const runAnalysis = useCallback(async (
    datasetId: number,
    jobType: JobType,
    parameters: Record<string, unknown> = {}
  ): Promise<BackendJob | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const job = await makeRequest<BackendJob>(`/api/v1/datasets/${datasetId}/analyses/${jobType}`, {
        method: 'POST',
        body: JSON.stringify(parameters),
      });
      return job;
    } catch (err) {
      const error = handleError(err);
      setError(error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [makeRequest, handleError]);

  const getLatestAnalysis = useCallback(async (
    datasetId: number,
    jobType: JobType
  ): Promise<BackendAnalysisResult | null> => {
    try {
      const analysis = await makeRequest<BackendAnalysisResult>(`/api/v1/datasets/${datasetId}/analyses/${jobType}/latest`);
      return analysis;
    } catch (err) {
      return null;
    }
  }, [makeRequest]);

  const getAnalysisHistory = useCallback(async (
    datasetId: number,
    jobType: JobType
  ): Promise<BackendJob[]> => {
    try {
      const history = await makeRequest<BackendJob[]>(`/api/v1/datasets/${datasetId}/analyses/${jobType}`);
      return history;
    } catch (err) {
      return [];
    }
  }, [makeRequest]);

  return {
    createDataset,
    getDataset,
    listDatasets,
    getDatasetStatus,
    deleteDataset,
    getDatasetJobs,
    getJob,
    runAnalysis,
    getLatestAnalysis,
    getAnalysisHistory,
    isLoading,
    error
  };
}