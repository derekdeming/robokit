# RoboKit API Setup Guide

Complete setup instructions for the RoboKit API development environment.

## Prerequisites

- macOS (Darwin)
- Docker Desktop
- Python 3.12+
- Node.js (for frontend)

## 1. Install UV Package Manager

UV is a fast Python package manager that replaces pip and virtualenv.

```bash
# Install uv using the official installer
curl -LsSf https://astral.sh/uv/install.sh | sh

# Add uv to your PATH (restart shell or source)
source $HOME/.local/bin/env

# Verify installation
uv --version
```

## 2. Python Environment Setup

```bash
# Navigate to the API directory
cd robotics/robokit-monorepo/api

# Install all dependencies (creates virtual environment automatically)
uv sync

# Verify Python environment
uv run python --version
uv run python -c "import fastapi; print('FastAPI available')"
```

## 3. Database Setup

### Start Docker and PostgreSQL

```bash
# Navigate to project root
cd ../

# Start Docker Desktop (if not running)
open -a Docker

# Start PostgreSQL database container
docker-compose up -d postgres

# Verify database is running
docker-compose ps postgres

# Optional: Start pgAdmin for database management
docker-compose up -d pgadmin
# Access at: http://localhost:8080
```

### Database Migration Setup

```bash
# Navigate back to API directory
cd api

# Add Alembic (database migration tool)
uv add alembic

# Initialize Alembic
uv run alembic init alembic

# Note: Alembic configuration is already set up to use your models and database settings
```

### Create and Apply Initial Migration

```bash
# Create initial migration (detects your models)
uv run alembic revision --autogenerate -m "Initial migration"

# Apply migration to create database tables
uv run alembic upgrade head

# Verify tables were created
uv run python -c "
from core.database import engine
from sqlalchemy import text
with engine.connect() as conn:
    result = conn.execute(text('SELECT tablename FROM pg_tables WHERE schemaname=\\\'public\\\';'))
    tables = result.fetchall()
    print('Created tables:')
    for table in tables:
        print(f'  - {table[0]}')
"
```

## 4. Environment Configuration

Your `.env` file should contain (already configured):

```bash
# Database Configuration
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=robokit_dev
DATABASE_USER=robokit_user
DATABASE_PASSWORD=robokit_t0ps3cr3t

# pgAdmin Configuration
PGADMIN_DEFAULT_EMAIL=admin@robokit.ai
PGADMIN_DEFAULT_PASSWORD=pgadmin_t0ps3cr3t

# API Configuration
API_DEBUG=true
API_SECRET_KEY=your-secret-key-here-change-in-production
API_CORS_ORIGINS=http://localhost:3000,http://localhost:8080
```

## 5. Development Commands

### Running the API Server

```bash
# Development server with auto-reload
uv run fastapi dev main.py

# Alternative: Using uvicorn directly
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Production-like server
uv run fastapi run main.py
```

### Database Operations

```bash
# Create new migration after model changes
uv run alembic revision --autogenerate -m "Description of changes"

# Apply all pending migrations
uv run alembic upgrade head

# Rollback to previous migration
uv run alembic downgrade -1

# View migration history
uv run alembic history

# View current database version
uv run alembic current
```

### Testing

```bash
# Run all tests
uv run pytest

# Run tests with coverage
uv run pytest --cov=. --cov-report=html

# Run specific test file
uv run pytest tests/test_endpoints.py

# Run tests in verbose mode
uv run pytest -v
```

### Adding Dependencies

```bash
# Add runtime dependency
uv add package-name

# Add development dependency
uv add --dev package-name

# Add dependency with version constraint
uv add "fastapi>=0.100.0"

# Update all dependencies
uv sync --upgrade
```

## 6. Frontend Setup (Optional)

```bash
# Navigate to frontend directory
cd ../frontend

# Install Node.js dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## 7. Full Stack Development

### Start All Services

```bash
# From project root (robokit-monorepo/)

# Start database services
docker-compose up -d postgres pgadmin

# Start API (in api/ directory)
cd api && uv run fastapi dev main.py

# Start frontend (in frontend/ directory, new terminal)
cd frontend && npm run dev
```

### Access Points

- **API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **Frontend**: http://localhost:3000
- **pgAdmin**: http://localhost:8080

## 8. Troubleshooting Commands

### Check Service Status

```bash
# Check Docker containers
docker-compose ps

# View container logs
docker-compose logs postgres
docker-compose logs pgadmin

# Check database connection
uv run python -c "
from core.database import engine
try:
    with engine.connect() as conn:
        print('✅ Database connection successful')
except Exception as e:
    print(f'❌ Database connection failed: {e}')
"
```

### Reset Database

```bash
# Stop and remove containers (data will be lost)
docker-compose down -v

# Remove data directory
rm -rf data/

# Restart fresh
docker-compose up -d postgres

# Reapply migrations
uv run alembic upgrade head
```

### Clean Python Environment

```bash
# Remove virtual environment and reinstall
rm -rf .venv
uv sync
```

## 9. Production Deployment Preparation

### Environment Variables

```bash
# Set production environment variables
export API_DEBUG=false
export API_SECRET_KEY="your-super-secure-production-key"
export DATABASE_PASSWORD="your-secure-production-password"
```

### Build and Test

```bash
# Run all tests
uv run pytest

# Check code formatting
uv run black --check .

# Check imports
uv run isort --check-only .

# Type checking (if mypy is added)
uv run mypy .
```

## 10. Useful Development Tips

### Database Inspection

```bash
# Connect to PostgreSQL directly
docker exec -it robokit-postgres psql -U robokit_user -d robokit_dev

# View table structure
\d datasets
\d jobs

# Exit PostgreSQL
\q
```

### View Migration Files

```bash
# View generated migration
cat alembic/versions/*.py

# Edit migration before applying (if needed)
# vim alembic/versions/your_migration_file.py
```

### API Testing

```bash
# Test API endpoints
curl http://localhost:8000/api/v1/health

# Test with httpie (if installed)
http GET localhost:8000/api/v1/health
```

## Summary of Key Commands Used in Setup

1. **Install uv**: `curl -LsSf https://astral.sh/uv/install.sh | sh`
2. **Setup Python**: `uv sync`
3. **Start Database**: `docker-compose up -d postgres`
4. **Add Alembic**: `uv add alembic`
5. **Initialize Migrations**: `uv run alembic init alembic`
6. **Create Migration**: `uv run alembic revision --autogenerate -m "Initial migration"`
7. **Apply Migration**: `uv run alembic upgrade head`
8. **Start API**: `uv run fastapi dev main.py`

Your RoboKit API development environment is now fully configured! 🚀
