export interface HuggingFaceDataset {
  id: string;
  author: string;
  name: string;
  description: string;
  downloads: number;
  likes: number;
  tags: string[];
  isPrivate: boolean;
  size?: string;
  createdAt: string;
  lastModified?: string;
  license?: string;
  paperswithcode?: string;
  cardData?: Record<string, unknown>;
  sha?: string; // Git commit hash for Git LFS
}

export interface HuggingFaceConfig {
  datasetId: string; // Repository ID (e.g., "microsoft/DialoGPT-medium") - maps to repo_id
  token?: string; // HuggingFace access token for private repos
  commitHash: string; // Git SHA for specific version (for Git LFS) - maps to revision
  split?: string; // Dataset split (train/test/validation)
  streaming?: boolean; // Whether to use streaming mode
  revision?: string; // Git revision/branch (defaults to main)
}

// Backend API compatible types
export interface BackendHuggingFaceSource {
  type: 'huggingface';
  repo_id: string; // Repository ID
  revision: string; // Commit hash or branch name
}

export interface BackendDatasetCreate {
  source: BackendHuggingFaceSource;
  format_type: 'lerobot' | 'rosbag' | 'hdf5' | 'parquet' | 'custom';
}

export interface BackendDataset {
  id: number;
  source: BackendHuggingFaceSource;
  format_type: string;
  dataset_metadata?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}

export type JobType = 
  | 'metadata_extraction'
  | 'attention_analysis' 
  | 'conversion'
  | 'validation'
  | 'indexing'
  | 'evaluate_quality_heuristics'
  | 'rerun_visualization';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface BackendJob {
  id: number;
  dataset_id: number;
  job_type: JobType;
  status: JobStatus;
  progress: number;
  result?: {
    metadata?: {
      tasks?: unknown[];
      repo_id?: string;
      sensors?: {
        cameras?: Array<{
          name: string;
          width: number;
          height: number;
          format: string;
        }>;
      };
      episodes?: number;
      revision?: string;
    };
    raw_meta?: Record<string, unknown>;
    rrd_url?: string;
    viewer_url?: string;
    local_path?: string;
    stream_url?: string;
    file_size_mb?: number;
    frame_count?: number;
    duration_seconds?: number;
  };
  result_summary?: {
    camera_count?: number;
    sensor_count?: number;
    episode_count?: number;
  };
  result_metadata?: {
    model?: string;
    version?: string;
    created_at?: string;
    parameters?: Record<string, unknown>;
  };
  error_message?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface BackendAnalysisResult {
  job_id: number;
  version: string;
  model: string;
  parameters: Record<string, unknown>;
  created_at: string;
  summary?: Record<string, unknown>;
  full_result?: {
    rrd_url?: string;
    blueprint_url?: string;
    viewer_url?: string;
    local_path?: string;
    stream_url?: string;
    frames_written?: number;
    sdk_version?: string;
    viewer_version?: string;
    [key: string]: unknown;
  };
}

export interface DatasetStatus {
  dataset_id: number;
  latest_jobs: {
    [jobType in JobType]?: BackendJob;
  };
}

export interface HuggingFaceSearchParams {
  query?: string;
  tags?: string[];
  author?: string;
  limit?: number;
  offset?: number;
  sort?: 'downloads' | 'likes' | 'updated' | 'created';
  direction?: 'asc' | 'desc';
}

export interface HuggingFaceSearchResponse {
  datasets: HuggingFaceDataset[];
  total: number;
  hasMore: boolean;
  offset?: number;
  limit?: number;
}

export interface HuggingFaceDatasetInfo {
  id: string;
  splits: string[];
  features: Record<string, unknown>;
  numRows?: number;
  sizeInBytes?: number;
  downloadUrl?: string;
}

export function toBackendSource(datasetId: string, commitHash: string): BackendHuggingFaceSource {
  return {
    type: 'huggingface',
    repo_id: datasetId,
    revision: commitHash
  };
}

export function toBackendDatasetCreate(
  datasetId: string, 
  commitHash: string, 
  format_type: BackendDatasetCreate['format_type'] = 'lerobot'
): BackendDatasetCreate {
  return {
    source: toBackendSource(datasetId, commitHash),
    format_type
  };
}