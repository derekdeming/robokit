import type { HuggingFaceDataset, HuggingFaceConfig } from './huggingface';

export type DatasetSource = 'upload' | 'huggingface';
export type ImportStatus = 'pending' | 'processing' | 'complete' | 'error';

export interface DatasetImportRequest {
  source: DatasetSource;
  config: UploadConfig | HuggingFaceConfig;
  metadata?: {
    name?: string;
    description?: string;
    tags?: string[];
  };
}

export interface UploadConfig {
  files: File[];
  chunkSize?: number;
  retryCount?: number;
}

export interface ImportedDataset {
  id: string;
  name: string;
  source: DatasetSource;
  status: ImportStatus;
  progress?: number;
  size?: string;
  files?: string[];
  hfDatasetId?: string;
  commitHash?: string; // Git commit hash for HuggingFace datasets (Git LFS)
  gitUrl?: string; // Git repository URL for cloning
  error?: string;
  createdAt: string;
  completedAt?: string;
  metadata?: {
    description?: string;
    tags?: string[];
    format?: string;
    rows?: number;
    columns?: string[];
  };
}

export interface DatasetImportResponse {
  id: string;
  status: ImportStatus;
  message?: string;
  dataset?: ImportedDataset;
}

export interface DatasetProcessingJob {
  id: string;
  datasetId: string;
  type: 'validation' | 'conversion' | 'analysis' | 'indexing';
  status: ImportStatus;
  progress?: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
  result?: Record<string, unknown>;
}