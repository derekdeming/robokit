# HuggingFace Backend Integration - Technical Documentation

## Overview

This document outlines the complete technical architecture for integrating RoboKit's frontend with the HuggingFace-enabled backend. The integration enables users to discover, import, and manage robotics datasets from HuggingFace Hub using git-based versioning.

## Architecture Overview

### System Flow
1. **Dataset Discovery** → HuggingFace Hub API search via frontend proxy
2. **Dataset Import** → Backend creates dataset record and jobs
3. **Job Processing** → Async metadata extraction and analysis
4. **Real-time Monitoring** → Frontend polls job status
5. **Dataset Management** → CRUD operations via REST API
6. **Job UIs** → Frontend fetches server-side JSON Schemas for job parameters and renders forms dynamically

```
Frontend (Next.js) ←→ Backend API (FastAPI) ←→ HuggingFace Hub
                  ←→ PostgreSQL (datasets/jobs)
                  ←→ JSON Schemas (job parameters)
```

## Backend Architecture

### Data Models

#### Dataset Model
```typescript
interface BackendDataset {
  id: number;                    // Primary key
  source: BackendHuggingFaceSource;
  format_type: 'lerobot' | 'rosbag' | 'hdf5' | 'parquet' | 'custom';
  dataset_metadata?: Record<string, any>;
  created_at: string;
  updated_at?: string;
  // processed_at removed - use job status instead
}

interface BackendHuggingFaceSource {
  type: 'huggingface';
  repo_id: string;               // e.g., "observabot/so101_die_mat4"
  revision: string;              // Git commit hash or branch
}
```

#### Job Processing System
```typescript
interface BackendJob {
  id: number;
  dataset_id: number;
  job_type: JobType;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;              // 0-100
  result?: Record<string, any>;
  result_summary?: Record<string, any>;
  error_message?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

type JobType = 
  | 'metadata_extraction'
  | 'attention_analysis' 
  | 'conversion'
  | 'validation'
  | 'indexing'
  | 'evaluate_quality_heuristics';
```

### API Endpoints

#### Core Dataset Operations
- `POST /api/v1/datasets/` - Create new dataset
- `GET /api/v1/datasets/` - List all datasets (with pagination)
- `GET /api/v1/datasets/{id}` - Get specific dataset
- `GET /api/v1/datasets/{id}/status` - Get dataset processing status
- `DELETE /api/v1/datasets/{id}` - Delete dataset

#### Job Management
- `GET /api/v1/datasets/{id}/jobs` - List dataset jobs
- `GET /api/v1/datasets/{id}/jobs/{job_id}` - Get specific job
- `POST /api/v1/datasets/{id}/analyses/{job_type}` - Trigger analysis job
 - `GET /api/v1/datasets/job-parameter-schemas` - Fetch JSON Schemas for job parameter forms

## Frontend Architecture

### Type System

#### Frontend-Backend Type Mapping
```typescript
// Helper functions for data transformation
export function toBackendSource(datasetId: string, commitHash: string): BackendHuggingFaceSource {
  return {
    type: 'huggingface',
    repo_id: datasetId,      // maps datasetId → repo_id
    revision: commitHash      // maps commitHash → revision
  };
}

export function toBackendDatasetCreate(
  datasetId: string, 
  commitHash: string, 
  format_type: 'lerobot' = 'lerobot'
): BackendDatasetCreate {
  return {
    source: toBackendSource(datasetId, commitHash),
    format_type
  };
}
```

### API Integration Layer

#### Backend API Service (`use-backend-datasets.ts`)
```typescript
const API_BASE = process.env.API_URL; // server-only

export function useBackendDatasets() {
  // Core CRUD operations
  const createDataset = async (datasetId: string, commitHash: string, formatType) => {
    const payload = toBackendDatasetCreate(datasetId, commitHash, formatType);
    const response = await fetch(`${API_BASE}/api/v1/datasets/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await response.json();
  };

  const listDatasets = async (skip = 0, limit = 100) => {
    const response = await fetch(`${API_BASE}/api/v1/datasets/?skip=${skip}&limit=${limit}`);
    return await response.json();
  };

  // Additional methods: getDataset, deleteDataset, getDatasetStatus
}
```

#### Job Monitoring Service (`use-job-monitoring.ts`)
```typescript
export function useJobMonitoring() {
  // Real-time job monitoring with 2-second polling
  const startMonitoring = (datasetId: number, onUpdate: (status: DatasetStatus) => void) => {
    const intervalId = setInterval(async () => {
      const status = await getDatasetStatus(datasetId);
      if (status) {
        onUpdate(status);
        // Auto-stop when all jobs complete
        if (status.jobs.every(job => job.status === 'completed' || job.status === 'failed')) {
          stopMonitoring();
        }
      }
    }, 2000);
  };
}
```

### HuggingFace Discovery Integration

#### Search API (`/api/datasets/huggingface/search/route.ts`)
```typescript
// Frontend proxy to HuggingFace Hub API
export async function POST(request: NextRequest) {
  const { query, limit = 8, offset = 0, sort = 'downloads' } = await request.json();
  
  // Call HuggingFace API
  const hfResponse = await fetch(`https://huggingface.co/api/datasets?search=${query}&limit=${limit}&sort=${sort}`);
  const hfData = await hfResponse.json();
  
  // Transform and paginate results
  const datasets = hfData.map(transformToFrontendFormat);
  
  return NextResponse.json({
    datasets: datasets.slice(offset, offset + limit),
    total: datasets.length,
    hasMore: offset + limit < datasets.length,
    offset,
    limit
  });
}
```

#### Pagination Implementation
```typescript
export function useHuggingFaceSearch() {
  const searchWithPagination = async (query: string, page = 0, limit = 8, sort = 'downloads') => {
    return searchDatasets({
      query,
      limit,
      offset: page * limit,
      sort
    });
  };

  const nextPage = async (query: string, sort?: string) => {
    if (!searchResults?.hasMore) return null;
    return searchWithPagination(query, currentPage + 1, pageSize, sort);
  };
}
```

### User Interface Components

#### Dataset Import Wizard (`data-import-wizard.tsx`)
- HuggingFace connector with search and pagination
- Real-time job progress monitoring
- Error handling with retry mechanisms
- Integration with backend dataset creation

#### Dataset Management (`dashboard/page.tsx`)
- Dynamic dataset listing from backend API
- Real-time dashboard statistics
- Dataset deletion with confirmation
- Processing status indicators

## Data Flow Examples

### 1. Dataset Import Flow
```
User searches "observabot/so101_die_mat4"
  ↓
Frontend calls /api/datasets/huggingface/search
  ↓
Proxy calls HuggingFace Hub API
  ↓
User selects dataset + commit hash
  ↓
Frontend calls POST /api/v1/datasets/
  ↓
Backend creates dataset record (ID: 7)
  ↓
Backend queues metadata_extraction job
  ↓
Job processor downloads files from HuggingFace
  ↓
Job extracts metadata (217 episodes, 3 cameras)
  ↓
Frontend polls status and shows completion
```

### 2. Real-time Monitoring
```javascript
// Frontend polls every 2 seconds
GET /api/v1/datasets/7/status
Response: {
  dataset_id: 7,
  status: 'processing',
  progress: 75,
  jobs: [{
    id: 8,
    job_type: 'metadata_extraction',
    status: 'running',
    progress: 75
  }]
}
```

## Configuration

### Environment Variables
- See the repository `.env.example` for the complete list and descriptions. Copy it to your local `.env` (or `frontend/.env.local`) and set values accordingly.

### API Integration Points
- **Frontend Port**: 3000 (dev), 3002 (fallback)
- **Backend Port**: 8000
- **Database**: PostgreSQL with SQLAlchemy ORM
- **External**: HuggingFace Hub API (https://huggingface.co/api/datasets)

## Technical Design Decisions

### 1. Git-Based Versioning
**Decision**: Use commit hashes instead of dataset versions
**Rationale**: HuggingFace follows Git implementation, enabling precise versioning and reproducibility
**Implementation**: `repo_id` + `revision` mapping in backend API

### 2. Async Job Processing
**Decision**: Separate dataset creation from processing
**Rationale**: Large datasets require time-intensive operations (download, metadata extraction)
**Implementation**: Job queue system with real-time status polling

### 3. Frontend Proxy Pattern
**Decision**: Route HuggingFace API calls through Next.js API routes
**Rationale**: Avoid CORS issues, enable server-side filtering, add caching
**Implementation**: `/api/datasets/huggingface/search` proxy endpoint

### 4. Type-Safe Integration
**Decision**: Maintain separate frontend/backend types with transformation functions
**Rationale**: Each layer optimized for its use case while maintaining type safety
**Implementation**: `toBackendSource()` and `toBackendDatasetCreate()` helpers

### 5. Pagination Strategy
**Decision**: Offset-based pagination with configurable page sizes (8-50)
**Rationale**: Simple to implement, good UX for dataset browsing
**Implementation**: Backend validation, frontend state management

## Error Handling

### API Error Classes
```typescript
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
```

### Retry Mechanisms
- Failed API calls: Automatic retry with exponential backoff
- Job monitoring: Continues polling until success/failure
- Search timeouts: 10-second timeout with user feedback

## Performance Optimizations

### 1. Search Optimization
- Buffer additional results for offset handling
- Intelligent robotics dataset filtering
- Request deduplication and caching

### 2. Real-time Updates
- Efficient polling (2-second intervals)
- Auto-stop monitoring on completion
- Minimal re-renders with React hooks

### 3. Bundle Size
- Lazy loading of heavy components
- Tree-shaking of unused utilities
- Optimized build output (399kB dashboard route)

## Testing & Validation

### Successful Test Cases
- ✅ Dataset creation: `observabot/so101_die_mat4`
- ✅ Metadata extraction: 217 episodes, 3 cameras, 3 sensors
- ✅ Real-time job monitoring and completion
- ✅ Frontend-backend integration with 7 total datasets
- ✅ Search functionality with pagination
- ✅ Dashboard statistics and dataset listing

### Backend Verification
```bash
curl -X GET "http://localhost:${API_PORT}/api/v1/datasets/"
# Returns 7 datasets including recent imports
```

## Future Considerations

### Scalability
- Database indexing on `source.repo_id` for fast lookups
- Job queue clustering for parallel processing
- Redis caching for frequently accessed datasets

### Features
- Batch dataset imports
- Dataset sharing and collaboration
- Advanced search filters (task types, modalities)
- WebSocket connections for real-time updates

### Security
- API rate limiting
- HuggingFace token management
- Dataset access controls
- Audit logging for dataset operations

## Summary

The HuggingFace integration provides a complete pipeline from dataset discovery to processing, with real-time monitoring and robust error handling. The architecture separates concerns cleanly while maintaining type safety and performance. The system successfully handles the git-based versioning approach used by HuggingFace Hub and provides an intuitive user experience for robotics researchers.