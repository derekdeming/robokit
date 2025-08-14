export interface Dataset {
  id: string;
  name: string;
  description?: string;
  size: number;
  format: 'rosbag' | 'hdf5' | 'parquet' | 'custom';
  uploadedAt: string;
  processedAt?: string;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  organizationId: string;
  userId: string;
  metadata: DatasetMetadata;
  files: DatasetFile[];
}

export interface DatasetMetadata {
  episodes: number;
  duration?: number;
  sensors: string[];
  robotType?: string;
  environment?: string;
  tags: string[];
  version: string;
}

export interface DatasetFile {
  id: string;
  name: string;
  size: number;
  path: string;
  checksum: string;
  uploadedAt: string;
}

export interface UploadConfig {
  chunkSize: number;
  maxRetries: number;
  allowedTypes: string[];
  maxFileSize: number;
}

export interface VisualizationConfig {
  type: '3d' | 'plot' | 'rerun';
  settings: Record<string, unknown>;
}