# Backend Integration Guide

This document describes the integration between the frontend and backend APIs for HuggingFace dataset management.

## Overview

The frontend now integrates directly with the backend API at `/api/v1/datasets` instead of using mock endpoints. This provides real dataset processing, job monitoring, and error handling.

## Architecture

### Data Flow
1. **Dataset Creation**: Frontend → Backend API → Database
2. **Job Processing**: Backend automatically creates metadata extraction jobs
3. **Status Monitoring**: Frontend polls for job updates via WebSocket-like pattern
4. **Error Handling**: Comprehensive error messages with retry functionality

### Key Components

#### Backend API Hooks
- `useBackendDatasets()` - Core dataset CRUD operations
- `useBackendJobs()` - Job management and analysis triggers
- `useJobMonitoring()` - Real-time job progress tracking
- `useDatasetStatusMonitoring()` - Overall dataset status tracking

#### UI Components
- `DataImportWizard` - Updated with real backend integration
- `DatasetErrorHandler` - Comprehensive error display and troubleshooting
- `JobErrorDisplay` - Job-specific error handling with retry options

## API Mapping

### Frontend → Backend Data Structure

```typescript
// Frontend format
{
  datasetId: "microsoft/DialoGPT-medium",
  commitHash: "abc123def456"
}

// Backend format
{
  source: {
    type: "huggingface",
    repo_id: "microsoft/DialoGPT-medium", 
    revision: "abc123def456"
  },
  format_type: "lerobot"
}
```

## Features

### ✅ Implemented
- [x] Real backend API integration
- [x] Data structure mapping (datasetId/commitHash → repo_id/revision)
- [x] Job monitoring with real-time progress
- [x] Comprehensive error handling
- [x] Automatic metadata extraction
- [x] Quality heuristics analysis
- [x] Dataset status tracking
- [x] Job retry functionality
- [x] Enhanced HuggingFace search with robotics filtering

### Job Types Supported
- `metadata_extraction` - Extract LeRobot dataset metadata
- `evaluate_quality_heuristics` - Analyze dataset quality metrics
- `attention_analysis` - Attention analysis (TODO)
- `conversion` - Format conversion (TODO)
- `validation` - Dataset validation (TODO)
- `indexing` - Search indexing (TODO)

## Usage Examples

### Creating a Dataset
```typescript
import { useBackendDatasets } from '@/hooks/api/use-backend-datasets';

const { createDataset, isLoading, error } = useBackendDatasets();

const dataset = await createDataset(
  'huggingface/lerobot_dataset',  // repo_id
  'main',                         // revision
  'lerobot'                       // format_type
);
```

### Monitoring Jobs
```typescript
import { useJobMonitoring } from '@/hooks/api/use-job-monitoring';

const { 
  jobs, 
  getOverallProgress, 
  hasActiveJobs,
  startMonitoring 
} = useJobMonitoring(datasetId);

// Progress: 0-100
const progress = getOverallProgress();
```

### Error Handling
```typescript
import { DatasetErrorHandler } from '@/components/datasets/dataset-error-handler';

<DatasetErrorHandler
  error={error}
  title="Dataset Creation Failed"
  onRetry={() => retryCreation()}
  onDismiss={() => clearError()}
  showDetails={true}
/>
```

## Environment Variables

```bash
# Frontend
API_URL=http://localhost:${API_PORT}

# Backend
ROBOKIT_HF_LOCAL_ONLY=0  # Set to 1 for offline mode
HF_HOME=/path/to/hf/cache  # Custom HuggingFace cache location
```

## Error Handling

### Error Types
- **400 Bad Request** - Invalid parameters (dataset ID format, etc.)
- **404 Not Found** - Dataset or commit hash doesn't exist
- **409 Conflict** - Dataset already exists
- **422 Unprocessable Entity** - Validation failed (missing metadata files)
- **429 Too Many Requests** - Rate limiting
- **500 Internal Server Error** - Backend processing errors

### Error Recovery
- Automatic retry for transient errors
- User-initiated retry for failed jobs
- Detailed troubleshooting information
- Graceful degradation for non-critical errors

## Migration from Mock Endpoints

### Removed Deprecated Endpoints
- `/api/datasets/huggingface/connect` has been removed. Use `useBackendDatasets().createDataset(...)`.
- `/api/datasets/huggingface/status` has been removed. Use `useDatasetStatusMonitoring(...)`.

### New Integration
- ✅ Direct backend API calls via hooks
- ✅ Real-time job monitoring
- ✅ Proper error handling
- ✅ Type-safe data structures

## Development

### Testing
```bash
# Start backend API
cd api && API_PORT=8000 uv run python main.py

# Start frontend
cd frontend && npm run dev

# Test dataset creation
curl -X POST http://localhost:${API_PORT}/api/v1/datasets/ \
  -H "Content-Type: application/json" \
  -d '{
    "source": {
      "type": "huggingface",
      "repo_id": "lerobot/pusht",
      "revision": "main"
    },
    "format_type": "lerobot"
  }'
```

### Debugging
- Check browser Network tab for API calls
- Monitor backend logs for processing errors  
- Use React DevTools for hook state inspection
- Check job status via `/api/v1/datasets/{id}/status`

## Performance Considerations

### Frontend
- Job monitoring uses polling (2-3 second intervals)
- Monitoring automatically stops when jobs complete
- Error retry with exponential backoff
- Optimistic UI updates

### Backend
- Background job processing
- Database connection pooling
- Efficient HuggingFace file downloading
- Caching for repeated requests

## Security

- Authentication via Clerk
- Input validation on all endpoints
- Safe HuggingFace token handling
- No sensitive data in frontend state
- CORS configuration for API access

---

## Support

For issues with the integration:
1. Check the browser console for errors
2. Verify backend API is running on correct port
3. Check environment variables
4. Review this documentation
5. Check backend logs for processing errors