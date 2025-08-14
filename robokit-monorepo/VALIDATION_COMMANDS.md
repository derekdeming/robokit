# RoboKit API - Complete Validation Commands

This guide contains all commands to validate your RoboKit API setup and explore the database.

## 🚀 Quick Start Validation

### 1. Start All Services
```bash
# From project root
cd /Users/derekdeming/robotics/robokit-monorepo

# Start database
docker-compose up -d postgres

# Start API (new terminal)
cd api
uv run fastapi dev main.py

# Verify services are running
docker-compose ps
curl http://localhost:8000/health
```

## 📊 API Endpoint Testing

### Basic Health Checks
```bash
# Health check
curl http://localhost:8000/health

# API status
curl http://localhost:8000/api/v1/status

# Interactive API docs
open http://localhost:8000/docs
```

### Dataset Creation Commands

#### Create Hugging Face Dataset (LeRobot)
```bash
curl -X POST "http://localhost:8000/api/v1/datasets/" \
  -H "Content-Type: application/json" \
  -d '{
    "format_type": "lerobot",
    "source": {
      "type": "huggingface",
      "repo_id": "lerobot/pusht",
      "revision": "main"
    }
  }' | python3 -m json.tool
```

#### Create HTTP Dataset
```bash
curl -X POST "http://localhost:8000/api/v1/datasets/" \
  -H "Content-Type: application/json" \
  -d '{
    "format_type": "rosbag",
    "source": {
      "type": "http",
      "url": "https://example.com/dataset.bag"
    }
  }' | python3 -m json.tool
```

#### Create Parquet Dataset from Hugging Face
```bash
curl -X POST "http://localhost:8000/api/v1/datasets/" \
  -H "Content-Type: application/json" \
  -d '{
    "format_type": "parquet",
    "source": {
      "type": "huggingface",
      "repo_id": "HuggingFaceH4/ultrachat_200k",
      "revision": "main"
    }
  }' | python3 -m json.tool
```

### Dataset Query Commands

#### List All Datasets
```bash
curl -X GET "http://localhost:8000/api/v1/datasets/" \
  -H "accept: application/json" | python3 -m json.tool
```

#### Get Specific Dataset
```bash
# Replace {id} with actual dataset ID (1, 2, 3, etc.)
curl -X GET "http://localhost:8000/api/v1/datasets/1" \
  -H "accept: application/json" | python3 -m json.tool
```

#### Get Dataset Status (Shows Metadata & Jobs)
```bash
# This shows processing status and job details
curl -X GET "http://localhost:8000/api/v1/datasets/1/status" \
  -H "accept: application/json" | python3 -m json.tool
```

#### Search Datasets
```bash
curl -X GET "http://localhost:8000/api/v1/datasets/search?format_type=lerobot" \
  -H "accept: application/json" | python3 -m json.tool
```

### Job Management Commands

#### Create Manual Job
```bash
curl -X POST "http://localhost:8000/api/v1/datasets/1/jobs" \
  -H "Content-Type: application/json" \
  -d '{
    "dataset_id": 1,
    "job_type": "validation"
  }' | python3 -m json.tool
```

#### List All Jobs for Dataset
```bash
curl -X GET "http://localhost:8000/api/v1/datasets/1/jobs" \
  -H "accept: application/json" | python3 -m json.tool
```

#### Get Specific Job
```bash
# Replace {job_id} with actual job ID
curl -X GET "http://localhost:8000/api/v1/datasets/1/jobs/1" \
  -H "accept: application/json" | python3 -m json.tool
```

#### Run Analysis Jobs
```bash
# Metadata extraction
curl -X POST "http://localhost:8000/api/v1/datasets/1/analyses/metadata_extraction" \
  -H "Content-Type: application/json" | python3 -m json.tool

# Validation analysis
curl -X POST "http://localhost:8000/api/v1/datasets/1/analyses/validation" \
  -H "Content-Type: application/json" | python3 -m json.tool

# Get latest analysis result
curl -X GET "http://localhost:8000/api/v1/datasets/1/analyses/validation/latest" \
  -H "accept: application/json" | python3 -m json.tool
```

## 🗄️ Database Inspection Commands

### Connect to PostgreSQL Database

#### Method 1: Direct psql Connection
```bash
# Connect directly to the database
docker exec -it robokit-postgres psql -U robokit_user -d robokit_dev

# Once connected, you can run SQL commands:
\dt                           # List all tables
\d datasets                   # Describe datasets table structure
\d jobs                       # Describe jobs table structure
SELECT * FROM datasets;       # View all datasets
SELECT * FROM jobs;           # View all jobs
SELECT * FROM alembic_version; # View migration version
\q                            # Quit psql
```

#### Method 2: One-liner SQL Queries
```bash
# View all datasets
docker exec -it robokit-postgres psql -U robokit_user -d robokit_dev -c "SELECT * FROM datasets;"

# View all jobs
docker exec -it robokit-postgres psql -U robokit_user -d robokit_dev -c "SELECT * FROM jobs;"

# Count datasets by format
docker exec -it robokit-postgres psql -U robokit_user -d robokit_dev -c "SELECT format_type, COUNT(*) FROM datasets GROUP BY format_type;"

# View jobs with their status
docker exec -it robokit-postgres psql -U robokit_user -d robokit_dev -c "SELECT id, dataset_id, job_type, status, progress, error_message FROM jobs;"

# View dataset sources (JSONB data)
docker exec -it robokit-postgres psql -U robokit_user -d robokit_dev -c "SELECT id, format_type, source FROM datasets;"
```

#### Method 3: Python Database Inspection
```bash
# From the api directory
cd api

# Run Python database inspection
uv run python -c "
from core.database import engine
from sqlalchemy import text
import json

with engine.connect() as conn:
    # List all tables
    result = conn.execute(text(\"SELECT tablename FROM pg_tables WHERE schemaname='public';\"))
    tables = result.fetchall()
    print('📊 Available tables:')
    for table in tables:
        print(f'  - {table[0]}')
    
    print('\n📋 Datasets:')
    result = conn.execute(text('SELECT id, format_type, source, created_at FROM datasets ORDER BY id;'))
    for row in result:
        print(f'  ID {row[0]}: {row[1]} from {row[2][\"type\"]} ({row[3].strftime(\"%Y-%m-%d %H:%M\")})')
    
    print('\n🔄 Jobs:')
    result = conn.execute(text('SELECT id, dataset_id, job_type, status, error_message FROM jobs ORDER BY id;'))
    for row in result:
        error = row[4][:50] + '...' if row[4] and len(row[4]) > 50 else row[4] or 'None'
        print(f'  Job {row[0]}: Dataset {row[1]} - {row[2]} ({row[3]}) - Error: {error}')
"
```

### Advanced Database Queries

#### JSON Queries (PostgreSQL JSONB)
```bash
# Find datasets by source type
docker exec -it robokit-postgres psql -U robokit_user -d robokit_dev -c "
SELECT id, format_type, source->>'type' as source_type, source->>'repo_id' as repo_id 
FROM datasets 
WHERE source->>'type' = 'huggingface';
"

# Find datasets with specific repo_id
docker exec -it robokit-postgres psql -U robokit_user -d robokit_dev -c "
SELECT id, format_type, source 
FROM datasets 
WHERE source->>'repo_id' LIKE '%pusht%';
"

# View job results (if any)
docker exec -it robokit-postgres psql -U robokit_user -d robokit_dev -c "
SELECT id, job_type, status, result_summary, result_metadata 
FROM jobs 
WHERE result IS NOT NULL;
"
```

## 🚀 Complete Validation Workflow

### Step-by-Step Validation
```bash
# 1. Start services
cd /Users/derekdeming/robotics/robokit-monorepo
docker-compose up -d postgres
cd api && uv run fastapi dev main.py &

# 2. Wait for startup, then test basic connectivity
sleep 5
curl http://localhost:8000/health

# 3. Create a test dataset
DATASET_ID=$(curl -s -X POST "http://localhost:8000/api/v1/datasets/" \
  -H "Content-Type: application/json" \
  -d '{
    "format_type": "lerobot",
    "source": {
      "type": "huggingface", 
      "repo_id": "lerobot/pusht",
      "revision": "main"
    }
  }' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "Created dataset with ID: $DATASET_ID"

# 4. Check status
curl -X GET "http://localhost:8000/api/v1/datasets/$DATASET_ID/status" | python3 -m json.tool

# 5. Check database
docker exec -it robokit-postgres psql -U robokit_user -d robokit_dev -c "SELECT COUNT(*) as total_datasets FROM datasets;"

# 6. List all data
curl -X GET "http://localhost:8000/api/v1/datasets/" | python3 -m json.tool
```

## 🔧 Troubleshooting Commands

### Service Health Checks
```bash
# Check if Docker is running
docker ps

# Check database container logs
docker-compose logs postgres

# Check API process
ps aux | grep fastapi

# Test database connection from API
cd api && uv run python -c "
from core.database import engine
try:
    with engine.connect() as conn:
        print('✅ Database connection successful')
except Exception as e:
    print(f'❌ Database connection failed: {e}')
"
```

### Reset Everything
```bash
# Stop all services
docker-compose down

# Remove all data (WARNING: This deletes all your data!)
rm -rf data/

# Restart fresh
docker-compose up -d postgres
cd api && uv run alembic upgrade head
```

## 🌐 Access Points Summary

- **API Server**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs
- **API Redoc**: http://localhost:8000/redoc
- **Health Check**: http://localhost:8000/health
- **pgAdmin** (optional): http://localhost:8080
  ```bash
  docker-compose up -d pgadmin
  # Login: admin@robokit.ai / pgadmin_t0ps3cr3t
  ```

## 📝 Available Job Types

When creating jobs, you can use these `job_type` values:
- `metadata_extraction` - Extract dataset metadata
- `attention_analysis` - Analyze attention patterns  
- `conversion` - Convert between formats
- `validation` - Validate dataset structure
- `indexing` - Create search indexes
- `evaluate_quality_heuristics` - Quality assessment

## 💡 Tips for Testing

1. **Use `python3 -m json.tool`** to format JSON responses nicely
2. **Save dataset IDs** from creation responses to use in other commands
3. **Check logs** if something isn't working: `docker-compose logs postgres`
4. **Use the interactive docs** at http://localhost:8000/docs for easy testing
5. **Monitor the database** with SQL queries to see what's actually stored

Now you have everything you need to fully validate and explore your RoboKit API! 🚀
