# RoboKit Monorepo

A monorepo for the RoboKit project.

## Quick Start

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [uv](https://docs.astral.sh/uv/) for Python dependency management

### Quick Commands
```sh
uv run python scripts/dev.py init
uv run python scripts/dev.py db start
```

### Development Setup

1. **Initialize configuration files**:
   ```sh
   uv run python scripts/dev.py init
   ```

2. **Start the database**:
   ```sh
   uv run python scripts/dev.py db start
   ```

3. **Start the API** (see `api/README.md` for details)

**Available Commands:**
```sh
# Initialize configuration files from environment variables
uv run python scripts/dev.py init

# Start the database with docker compose
uv run python scripts/dev.py db start

# Stop the database with docker compose
uv run python scripts/dev.py db stop

# Reset (stop containers and remove data)
uv run python scripts/dev.py reset
```

4. **Access the services**:
   - pgAdmin (database management): http://localhost:${PGADMIN_PORT}
     - Login credentials configured via `PGADMIN_DEFAULT_EMAIL` and `PGADMIN_DEFAULT_PASSWORD` in `.env`
   - API: http://localhost:${API_PORT} (see `api/README.md` for details)

## Project Structure

```
robokit-monorepo/
├── api/                    # FastAPI backend (see api/README.md)
├── data/                   # Generated files and database storage
├── scripts/                # Development tools
├── docker-compose.yml      # Database services
├── .env.example            # Environment template
└── README.md               # This file
```

## Database

The project uses PostgreSQL for the database. In development, it runs in Docker via `docker compose`.

### Production Database Setup

For production, you would:

1. **Set up a managed PostgreSQL database** (AWS RDS, Google Cloud SQL, etc.)
2. **Configure environment variables**:
   ```sh
   DATABASE_HOST=your-db-host
   DATABASE_PORT=5432
   DATABASE_NAME=robokit_prod
   DATABASE_USER=your-username
   DATABASE_PASSWORD=your-password
   ```
3. **Run database migrations** (see `api/README.md` for details)

## API

See `api/README.md` for API documentation, endpoints, and development instructions.

## Environment Variables

See `.env.example` for all required environment variables. Values must be provided explicitly; no defaults are assumed.

