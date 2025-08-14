# Dataset Import System

The dataset import system allows users to import robot sensor datasets from two sources:

## Features

### 1. Data Source Selection
- **File Upload**: Upload local robot sensor files (.rosbag, .hdf5, .parquet)
- **Hugging Face Datasets**: Connect to datasets hosted on Hugging Face Hub

### 2. File Upload Support
- Multi-terabyte file support (up to 100GB per file)
- Resumable uploads using TUS protocol
- Support for common robotics formats:
  - ROS bag files (`.rosbag`, `.bag`)
  - HDF5 files (`.hdf5`, `.h5`)
  - Parquet files (`.parquet`)
- Drag & drop interface via Uppy

### 3. Hugging Face Integration
- Browse popular robotics datasets
- Search datasets by name, description, or tags
- Support for both public and private datasets
- Direct dataset connection via ID (e.g., `observabot/so101_die_mat4`)
- Optional authentication with HF token for private datasets

### 4. Import Process
- Step-by-step wizard interface
- Real-time progress tracking
- Status indicators for each dataset
- Error handling and retry logic

## Components

### DataImportWizard
Main component that orchestrates the import process.

```tsx
import { DataImportWizard } from '@/components/datasets/data-import-wizard';

function ImportPage() {
  return <DataImportWizard />;
}
```

### DatasetSourceSelector
Allows users to choose between upload and Hugging Face sources.

### HuggingFaceConnector
Handles browsing, searching, and connecting to HF datasets.

### UploadDashboard
File upload interface with drag & drop support.

## API Endpoints

### Hugging Face Search (proxied)
```
POST /api/datasets/huggingface/search
{ "query": "robotics", "limit": 8, "offset": 0 }
```

### Hugging Face Connect

Deprecated. Use the backend dataset creation endpoint via `useBackendDatasets()`.

## Usage Example

```python
# Python equivalent for what the frontend does:
from datasets import load_dataset

# Login using e.g. `huggingface-cli login` to access private datasets
ds = load_dataset("observabot/so101_die_mat4")
```

The frontend provides a user-friendly interface for this same functionality, allowing users to:
1. Browse and search datasets
2. Provide authentication tokens
3. Preview dataset information
4. Import datasets for analysis

## Types

All TypeScript types are defined in:
- `@/types/dataset/huggingface.ts` remains for lightweight frontend types and helpers. For backend-aligned types, prefer generating `types/api.gen.ts` from the API's OpenAPI spec via `npm run gen:api-types`.
- `@/types/dataset/import.ts`

## Hooks

Custom hooks for API integration:
- `useHuggingFaceSearch()` - Search HF datasets
- `useHuggingFaceConnect()` - Connect to HF datasets