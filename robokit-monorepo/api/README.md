# RoboKit Scientific Computing API

FastAPI-based service for scientific dataset processing and analysis. This API handles all computational workloads including attention analysis, format conversion, and background processing jobs.

## Architecture

This API is designed to handle **scientific computing workloads** while the frontend handles all user-related concerns:

- **Frontend**: User authentication, UI, file uploads, visualization
- **API**: Dataset processing, attention analysis, format conversion, background jobs

## Setup

1. **Install dependencies**:
   ```bash
   uv sync
   ```

2. **Environment variables** (required, no defaults):
   Provide all variables in `.env` at the project root. Missing variables will cause startup failure.
   Required keys (see `.env.example`): `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`, `API_SECRET_KEY`, `API_DEBUG`, `API_CORS_ORIGINS`, `PGADMIN_DEFAULT_EMAIL`, `PGADMIN_DEFAULT_PASSWORD`, `API_PORT`.

## Scientific Computing Dependencies

The API includes specialized libraries for robotics data processing:

- **Data Processing**: `pandas`, `numpy`, `scipy`
- **Machine Learning**: `scikit-learn` for attention analysis
- **Visualization**: `matplotlib`, `seaborn`, `plotly`
- **Robotics Formats**: `h5py`, `pyarrow`, `rosbag`
- **Background Jobs**: `celery`, `redis`

## Database Setup

### PostgreSQL Configuration
Follow the main project README in the root directory to configure the database and start containerized services.

### Database Migrations
```bash
# Initialize Alembic (first time only)
alembic init alembic

# Create a new migration
alembic revision --autogenerate -m "Description of changes"

# Apply migrations
alembic upgrade head
```

## Running

```bash
API_PORT=8000 uv run python main.py
```

The API will be available at `http://localhost:${API_PORT}`

### API Documentation

FastAPI automatically generates interactive API documentation:
- **Swagger UI**: `http://localhost:${API_PORT}/docs` - Interactive API documentation with testing interface
- **ReDoc**: `http://localhost:${API_PORT}/redoc` - Alternative documentation format

## API Endpoints

### Health & Status
- `GET /` - Welcome message
- `GET /health` - Health check with database status
- `GET /api/v1/status` - API status with capabilities

### Datasets (CRUD)
- `POST /api/v1/datasets/` - Create dataset from HTTP URL
- `GET /api/v1/datasets/` - List all datasets
- `GET /api/v1/datasets/{dataset_id}` - Get specific dataset
- `PUT /api/v1/datasets/{dataset_id}` - Update dataset
- `DELETE /api/v1/datasets/{dataset_id}` - Delete dataset

### Dataset Search
- `GET /api/v1/datasets/search` - List datasets (temporary simple search)

### Dataset Status & Progress
- `GET /api/v1/datasets/{dataset_id}/status` - Get dataset status and progress

### Analysis
- `GET /api/v1/datasets/{dataset_id}/analyses/{job_type}` - Get all runs of an analysis
- `GET /api/v1/datasets/{dataset_id}/analyses/{job_type}/latest` - Get latest run
- `POST /api/v1/datasets/{dataset_id}/analyses/{job_type}` - Run a new analysis

### Processing Jobs (CRUD)
- `POST /api/v1/datasets/{dataset_id}/jobs` - Create processing job
- `GET /api/v1/datasets/{dataset_id}/jobs` - List all jobs for dataset
- `GET /api/v1/datasets/{dataset_id}/jobs/{job_id}` - Get specific job
- `PUT /api/v1/datasets/{dataset_id}/jobs/{job_id}` - Update job

## Dataset Sources

Datasets use a generic `source` object (JSON). Currently supported sources:

### HTTP Source
```sh
curl -X POST "http://localhost:${API_PORT}/api/v1/datasets/" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Remote Dataset",
    "description": "Navigation data from robot",
    "format_type": "rosbag",
    "source": { "type": "http", "url": "https://example.com/dataset.rosbag" }
  }'
```

### Hugging Face Source
```sh
curl -X POST "http://localhost:${API_PORT}/api/v1/datasets/" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "HF Dataset",
    "description": "Dataset from Hugging Face",
    "format_type": "rosbag",
"source": { "type": "huggingface", "repo_id": "owner/repo", "revision": "<revision>" }
  }'
```

## Supported Formats

### Input Formats
- **ROS Bag**: `.rosbag`, `.bag`
- **HDF5**: `.hdf5`, `.h5`
- **Parquet**: `.parquet`
- **Custom**: Custom format handling

### Processing Capabilities
- **Metadata Extraction**: Automatic extraction of sensor types, duration, frame count
- **Attention Analysis**: ML-based attention scoring for different sensors
- **Format Conversion**: Convert between supported formats
- **Dataset Validation**: Comprehensive dataset validation and quality assessment
- **Search Indexing**: Create search indices for spatial-temporal queries
- **Background Processing**: Asynchronous job processing with progress tracking

## Job Types

The API supports the following processing job types:

- **metadata_extraction**: Extract metadata from datasets
- **attention_analysis**: Perform attention analysis on sensor data
- **conversion**: Convert between dataset formats
- **validation**: Validate dataset integrity and quality
- **indexing**: Create search indices for datasets

## Job Statuses

Jobs can have the following statuses:

- **pending**: Job is queued but not started
- **running**: Job is currently executing
- **completed**: Job finished successfully
- **failed**: Job encountered an error

## Adding Dependencies

```bash
uv add <package-name>
```

## Testing

### Install Test Dependencies
```bash
uv sync --extra test
```

### Run Tests
```bash
# Run all tests
uv run python -m pytest -v

# Run specific files/classes
uv run python -m pytest tests/test_endpoints.py
uv run python -m pytest tests/test_endpoints.py::TestDatasetEndpoints

# Exclude slow/integration tests by default (fast CI)
uv run python -m pytest -m "not slow and not integration"

# Run the HF snapshot-based integration test only (downloads once to data/hf-cache/)
# Note: uses optional test extras (includes huggingface_hub)
uv run --extra test python -m pytest -m integration -k test_hf_lerobot_extraction_with_snapshot_cache

# Or run all integration tests
uv run --extra test python -m pytest -m integration

# Customize which HF dataset/revision the integration test uses (optional):
# Defaults: ROBOKIT_HF_REPO=observabot/so101_die_mat1, ROBOKIT_HF_REVISION=main
ROBOKIT_HF_REPO=owner/repo ROBOKIT_HF_REVISION=rev \
  uv run --extra test python -m pytest -m integration -k test_hf_lerobot_extraction_with_snapshot_cache

# Cache location:
#  data/hf-cache/datasets/<owner>__<repo>/
# Subsequent runs reuse the snapshot; delete the folder to re-download
```

## Environment Variables

The API automatically uses the root `.env` file. See `../.env.example` for all available environment variables and their default values.
