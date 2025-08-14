import { useState, useEffect, useRef, useCallback } from 'react';
import { useBackendDatasets } from './use-backend-datasets';
import type { BackendJob, JobStatus, DatasetStatus } from '@/types/dataset/huggingface';

export interface JobMonitoringOptions {
  pollInterval?: number; // milliseconds, default 2000
  maxRetries?: number; // default 5
  autoStart?: boolean; // default true
}

export interface JobProgress {
  job: BackendJob;
  isComplete: boolean;
  isError: boolean;
  progressPercentage: number;
}

export function useJobMonitoring(
  datasetId: number,
  options: JobMonitoringOptions = {}
) {
  const {
    pollInterval = 2000,
    maxRetries = 5,
    autoStart = true
  } = options;

  const [jobs, setJobs] = useState<BackendJob[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { getDatasetJobs, error: jobsError } = useBackendDatasets();

  const fetchJobs = useCallback(async () => {
    try {
      const fetchedJobs = await getDatasetJobs(datasetId);
      if (fetchedJobs) {
        setJobs(fetchedJobs);
        setRetryCount(0); // Reset retry count on successful fetch
      }
    } catch (err) {
      console.error('Error fetching jobs:', err);
      setRetryCount(prev => prev + 1);
      
      if (retryCount >= maxRetries) {
        setError(`Failed to fetch jobs after ${maxRetries} retries`);
        stopMonitoring();
      }
    }
  }, [datasetId, getDatasetJobs, retryCount, maxRetries]);

  const startMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    setIsMonitoring(true);
    setError(null);
    setRetryCount(0);
    
    // Immediate fetch
    fetchJobs();
    
    // Set up polling
    intervalRef.current = setInterval(fetchJobs, pollInterval);
  }, [fetchJobs, pollInterval]);

  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsMonitoring(false);
  }, []);

  // Auto-start monitoring
  useEffect(() => {
    if (autoStart && datasetId) {
      startMonitoring();
    }
    
    return () => {
      stopMonitoring();
    };
  }, [datasetId, autoStart, startMonitoring, stopMonitoring]);

  // Stop monitoring when all jobs are complete or failed
  useEffect(() => {
    const allJobsComplete = jobs.length > 0 && jobs.every(job => 
      job.status === 'completed' || job.status === 'failed'
    );
    
    if (allJobsComplete && isMonitoring) {
      // Wait a bit before stopping to ensure UI updates
      setTimeout(() => {
        stopMonitoring();
      }, 1000);
    }
  }, [jobs, isMonitoring, stopMonitoring]);

  // Update error state based on jobs error
  useEffect(() => {
    if (jobsError) {
      setError(jobsError.message);
    }
  }, [jobsError]);

  const getJobProgress = useCallback((job: BackendJob): JobProgress => {
    return {
      job,
      isComplete: job.status === 'completed',
      isError: job.status === 'failed',
      progressPercentage: Math.round(job.progress * 100)
    };
  }, []);

  const getOverallProgress = useCallback((): number => {
    if (jobs.length === 0) return 0;
    
    const totalProgress = jobs.reduce((sum, job) => sum + job.progress, 0);
    return Math.round((totalProgress / jobs.length) * 100);
  }, [jobs]);

  const getRunningJobs = useCallback((): BackendJob[] => {
    return jobs.filter(job => job.status === 'running');
  }, [jobs]);

  const getCompletedJobs = useCallback((): BackendJob[] => {
    return jobs.filter(job => job.status === 'completed');
  }, [jobs]);

  const getFailedJobs = useCallback((): BackendJob[] => {
    return jobs.filter(job => job.status === 'failed');
  }, [jobs]);

  const getPendingJobs = useCallback((): BackendJob[] => {
    return jobs.filter(job => job.status === 'pending');
  }, [jobs]);

  const hasActiveJobs = useCallback((): boolean => {
    return jobs.some(job => job.status === 'running' || job.status === 'pending');
  }, [jobs]);

  return {
    jobs,
    isMonitoring,
    error,
    startMonitoring,
    stopMonitoring,
    fetchJobs,
    getJobProgress,
    getOverallProgress,
    getRunningJobs,
    getCompletedJobs,
    getFailedJobs,
    getPendingJobs,
    hasActiveJobs
  };
}

export function useDatasetStatusMonitoring(
  datasetId: number,
  options: JobMonitoringOptions = {}
) {
  const {
    pollInterval = 3000,
    autoStart = true
  } = options;

  const [status, setStatus] = useState<DatasetStatus | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/datasets/${datasetId}/status`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const datasetStatus: DatasetStatus = await response.json();
      setStatus(datasetStatus);
      setError(null);
    } catch (err) {
      console.error('Error fetching dataset status:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    }
  }, [datasetId]);

  const startMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    setIsMonitoring(true);
    setError(null);
    
    // Immediate fetch
    fetchStatus();
    
    // Set up polling
    intervalRef.current = setInterval(fetchStatus, pollInterval);
  }, [fetchStatus, pollInterval]);

  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsMonitoring(false);
  }, []);

  // Auto-start monitoring
  useEffect(() => {
    if (autoStart && datasetId) {
      startMonitoring();
    }
    
    return () => {
      stopMonitoring();
    };
  }, [datasetId, autoStart, startMonitoring, stopMonitoring]);

  // Stop monitoring when dataset is ready or has error
  useEffect(() => {
    if (status && isMonitoring) {
      const metadataJob = status.latest_jobs.metadata_extraction;
      if (metadataJob && (metadataJob.status === 'completed' || metadataJob.status === 'failed')) {
        // Wait a bit before stopping to ensure UI updates
        setTimeout(() => {
          stopMonitoring();
        }, 2000);
      }
    }
  }, [status, isMonitoring, stopMonitoring]);

  return {
    status,
    isMonitoring,
    error,
    startMonitoring,
    stopMonitoring,
    fetchStatus,
    isReady: status?.latest_jobs.metadata_extraction?.status === 'completed',
    isError: status?.latest_jobs.metadata_extraction?.status === 'failed',
    isProcessing: status?.latest_jobs.metadata_extraction?.status === 'running'
  };
}