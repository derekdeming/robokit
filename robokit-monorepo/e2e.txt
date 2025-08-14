### RoboKit Monorepo Architecture Deep Dive

- Backend: FastAPI service for dataset CRUD, background analyses, Hugging Face metadata extraction, and job lifecycle tracking.
- Frontend: Next.js 15 (App Router) app with Clerk auth, React Query style hooks, and a server-side proxy for backend access. Integrates directly with Hugging Face search APIs from a Next route.

### Backend (robokit-monorepo/api)

- App initialization
  - `app.py` constructs the FastAPI app with `lifespan` calling `init_db()` (SQLAlchemy `Base.metadata.create_all`).
  - CORS set from `API_CORS_ORIGINS`; OpenAPI served at `/openapi.json`.
  - Routers:
    - `app.include_router(datasets.router, prefix=f"{settings.API_V1_STR}/datasets", tags=["datasets"])` maps to `/api/v1/datasets`.
  - Root/health/status:
    - `/` returns service info.
    - `/health` returns status with `"database": "connected"` (static).
    - `/api/v1/status` returns capabilities and version.
  - Exception handling: custom `RoboKitException` family via `core/exceptions.py`.

- Configuration
  - `core/config.py` uses `pydantic-settings`. Required env (from root `.env`) include DB, pgAdmin, and API values; see `.env` in repo root for concrete dev defaults.
  - `get_database_url()` builds `postgresql://user:pass@host:port/db`.

- Database
  - `core/database.py` configures SQLAlchemy engine/session. Exported:
    - `Base` for models.
    - `get_db()` FastAPI dependency.
    - `get_db_context()` contextmanager for background tasks with commit/rollback.
    - `init_db()` creates tables.
  - Alembic:
    - `alembic/env.py` wires metadata and URL from settings.
    - `alembic/versions/94c9..._initial_migration.py` creates `datasets` and `jobs` tables, indexes JSONB fields including GIN.

- Models (`models/dataset.py`)
  - `Dataset`
    - id, `source` JSONB (e.g., {type: "huggingface", repo_id, revision}), `format_type` string, optional `dataset_metadata` JSONB, timestamps.
    - Indexes on `dataset_metadata`, `source`, `source['type']`.
  - `Job`
    - id, `dataset_id` int, `job_type` string, `status` string, `progress` float.
    - `result` JSONB, `result_summary` JSONB, `result_metadata` JSONB, `error_message`, timestamps for lifecycle.
    - Indexes on `result` and `result_metadata`.

- Schemas (`schemas/dataset.py`)
  - Enums: `DatasetFormat` (rosbag, hdf5, parquet, custom, lerobot, rlds), `JobType`, `JobStatus`.
  - Discriminated union for dataset sources:
    - `HTTPSource` {type: "http", url: HttpUrl}
    - `HuggingFaceSource` {type: "huggingface", repo_id, revision}
  - Data shapes: `DatasetCreate`, `DatasetUpdate`, `Dataset`, `JobCreate/Update/Job`.
  - Job parameter models per job type with defaults and `get_job_parameter_schemas()` to expose JSON Schemas for UI generation.

- Services (`services/dataset_service.py`)
  - `DatasetService`:
    - CRUD: create/list/get/update/delete on `Dataset`. Normalizes `source` to JSON (Pydantic `model_dump`).
    - Search helpers: match JSONB keys, nested JSON path queries (using Postgres functions), multi-criteria filtering.
    - Analysis history: get latest and full history for specific `job_type` with status `completed`.
    - Hugging Face metadata extraction:
      - `extract_lerobot_metadata_from_hf(repo_id, revision)`: downloads `meta/info.json` and `meta/episodes.jsonl` via `services.hf_utils.safe_hf_download`, derives cameras from `features.observation.images.*`, counts episodes, returns `{ full_result: { metadata, raw_meta }, summary }`.
      - `extract_rlds_metadata_from_hf(repo_id, revision)`: tries `features.json`, `dataset_info.json`, `dataset_infos.json`, lists repo files if needed, infers camera-like features, returns similarly structured result.
    - Quality heuristics evaluator: `evaluate_quality_heuristics_from_hf(repo_id, revision, parameters)` reads LeRobot Parquet episodes, computes jitter/frame drops/NaN counts/jerk, returns detailed `quality_heuristics` and summary.
  - `JobService`:
    - Create job and `create_job_with_metadata()` which version-tags jobs (v1, v2...) in `result_metadata`.
    - Get jobs, get latest by type, update job status (timestamps), update result (mark completed).
    - `get_dataset_latest_jobs_by_type()` returns deduped latest per job type.

- Endpoints (`api/v1/endpoints/datasets.py`)
  - `GET /search`: returns all datasets (placeholder simple search).
  - `GET /job-parameter-schemas`: returns JSON Schemas of job parameter models for frontend auto-UI.
  - Dataset CRUD:
    - `POST /` creates dataset; also creates a `metadata_extraction` job (with `auto_extract=True`) and schedules background processing.
    - `GET /`, `GET /{dataset_id}`, `PUT /{dataset_id}`, `DELETE /{dataset_id}` standard behaviors.
  - Status:
    - `GET /{dataset_id}/status`: returns `latest_jobs` with latest `metadata_extraction` job (expandable).
  - Analysis history:
    - `GET /{dataset_id}/analyses/{job_type}`: all completed runs summary.
    - `GET /{dataset_id}/analyses/{job_type}/latest`: latest run with `full_result`.
    - `POST /{dataset_id}/analyses/{job_type}`: validate job type, validate parameters via Pydantic model (when defined), create job with versioning, schedule background task.
  - Jobs:
    - `POST /{dataset_id}/jobs` create a job; background runner invoked.
    - `GET /{dataset_id}/jobs` returns either all jobs or `latest_per_type=true` variant.
    - `GET|PUT /{dataset_id}/jobs/{job_id}` detail/update.
  - Background tasks (FastAPI `BackgroundTasks` functions):
    - `run_analysis_background(job_id, dataset_id, job_type, parameters)` updates job running, dispatches to job-type-specific async function, updates results or sets failure.
    - Job-type functions implemented:
      - `extract_metadata_background()`: reads dataset, routes HF sources to LeRobot or RLDS extractor based on `format_type`; otherwise fails with a descriptive error including dataset and source info.
      - `analyze_attention_background()`, `convert_dataset_background()`, `validate_dataset_background()`, `index_dataset_background()` are scaffolded with placeholder results.
      - `evaluate_quality_heuristics_background()`: validates supported types (Hugging Face LeRobot/RLDS), then calls `DatasetService.evaluate_quality_heuristics_from_hf`.

- HF Utility (`services/hf_utils.py`)
  - `safe_hf_download()`: wraps `huggingface_hub.hf_hub_download`, respects `ROBOKIT_HF_LOCAL_ONLY` to enforce offline cache-only.
  - `list_repo_files()`: lists repo files via `HfApi`.

- Tests (API)
  - Comprehensive pytest suite for endpoints, services, models, schemas, config. Integration tests hit real HF repos when allowed.
  - `tests/conftest.py` provisions a test DB (`robokit_test`), creates/drops DB, truncates tables per test, overrides `get_db` dependency, and starts the app for `TestClient`.

- Running the backend
  - `api/main.py` runs `uvicorn` using `app` from `app.py` with reload.
  - Dependencies: see `api/pyproject.toml` (FastAPI, SQLAlchemy, Psycopg2, huggingface_hub, numpy/pandas/pyarrow, Alembic).
  - Docker `docker-compose.yml` provides Postgres and optional pgAdmin using root `.env` variables.

### Frontend (robokit-monorepo/frontend)

- Environment
  - `lib/config.ts` enforces required public env var: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`. Backend URL usage varies:
    - Hooks use `NEXT_PUBLIC_API_URL` as default base for direct backend calls.
    - SSR pages use the Next API proxy base computed from request headers.
    - Proxy route requires `API_URL` on the server (not public).

- Auth and middleware
  - `middleware.ts` uses `clerkMiddleware` for auth; configured for all routes and `/api/*`.
  - `(protected)/layout.tsx` checks `auth()` and redirects to `/welcome` if not authenticated.

- Server-side backend proxy
  - `app/api/backend/[...path]/route.ts`
    - Forwards GET/POST/PUT/DELETE to the real backend `API_URL` (must be set in the frontend server environment).
    - Preserves headers, removes hop-by-hop headers, streams body.
    - Allows central auth injection and hiding the API URL from the browser.

- Hugging Face search API
  - `app/api/datasets/huggingface/search/route.ts`
    - POST endpoint that calls Hugging Face `https://huggingface.co/api/datasets` with `search`, `limit`, `sort`, applies light filtering if the query looks robotics-related, paginates client-side, and returns a normalized `HuggingFaceSearchResponse`.
    - Supports optional bearer token header.

- Hooks
  - `hooks/api/use-backend-datasets.ts`
    - Base URL: `NEXT_PUBLIC_API_URL || http://localhost:8000` (calls backend directly, not via proxy).
    - `createDataset(datasetId, commitHash, formatType)`: POST to `/api/v1/datasets/` with HF source and format; returns backend dataset and triggers background metadata extraction on the backend.
    - `getDataset`, `listDatasets`, `getDatasetStatus`, `deleteDataset`.
  - `hooks/api/use-backend-datasets.ts` (jobs section)
    - `getDatasetJobs`, `getJob`, `runAnalysis(datasetId, jobType, parameters)`, `getLatestAnalysis`, `getAnalysisHistory`.
  - `hooks/api/use-huggingface.ts`
    - `useHuggingFaceSearch()`: client hook to POST to the Next search API route for pagination.
    - `useHuggingFaceConnect()`: invokes backend `createDataset` with HF id and commit SHA, returns a frontend-shaped import response to the wizard.

- Job monitoring
  - `hooks/api/use-job-monitoring.ts`: polling for jobs list and dataset status with configurable intervals and retries; calculates overall progress and provides filtered lists (running, completed, failed, pending).

- Pages
  - `(protected)/dashboard/page.tsx`:
    - SSR computes base URL and uses the Next API proxy (`/api/backend`) to fetch a small page of datasets for count.
  - `(protected)/datasets/page.tsx`:
    - SSR uses proxy to fetch datasets and their statuses, then renders `DatasetsClient` with initial data.
  - `(protected)/datasets/[id]/page.tsx`:
    - SSR fetches dataset details, jobs, and job parameter schemas via proxy. Renders a `JobRunner` UI that reads schemas and can POST new analyses.

- Components
  - `components/datasets/datasets-client.tsx`: client view that handles delete actions.
  - `components/datasets/dataset-card.tsx`: shows dataset metadata, Hugging Face link, computed status from latest metadata job, and summary badges parsed from backend job result.
  - `components/datasets/data-import-wizard.tsx`: multi-step import UI; integrates with `HuggingFaceConnector` or upload (upload path scaffolded, marked as broken in README).
  - `components/datasets/huggingface-connector.tsx`: browse/search HF datasets, direct connect by ID, resolve revision SHA, trigger connect (create dataset on backend).
  - `components/datasets/job-runner.tsx`: fetches backend job parameter schemas, builds a dynamic form per job type, POSTs to `/analyses/{job_type}`. Uses proxy base `NEXT_PUBLIC_INTERNAL_API_PROXY ?? '/api/backend'` for requests.
  - `components/datasets/dataset-error-handler.tsx`: maps HTTP errors to friendly messages and displays troubleshooting tips.

- Types
  - `types/dataset/huggingface.ts` defines backend-facing types (`BackendDataset`, `BackendJob`, `JobType`, `DatasetStatus`) consistent with FastAPI schemas and JSON structures. Helpers to build backend payloads.
  - `types/dataset/import.ts` shapes for imported datasets and responses used by the wizard.

### End-to-end data flow

- Hugging Face browse
  - Client calls Next route `/api/datasets/huggingface/search` ⇒ server-side fetch to HF Hub ⇒ returns normalized list.
- Connect dataset from HF
  - Client resolves commit SHA via HF API directly from the browser (or uses `sha` from search).
  - Client calls backend `POST /api/v1/datasets`:
    - Either directly to `NEXT_PUBLIC_API_URL` (client) or via SSR to `/api/backend` proxy.
    - Backend creates `Dataset` and an initial `metadata_extraction` job, returns `Dataset`.
    - Background task starts:
      - Loads dataset from DB, routes HF source by `format_type` to LeRobot or RLDS extractor.
      - Uses `huggingface_hub` to fetch `meta/info.json` and `meta/episodes.jsonl` (LeRobot) or feature infos (RLDS).
      - Updates job result/summary and status; on error, marks job failed with detailed error message (used in frontend badges).
- Monitoring and UX
  - Frontend polls `/api/v1/datasets/{id}/jobs` or `/status` to update UI.
  - Dataset cards show processing state based on latest metadata job.
  - Job details page shows jobs, summaries, raw JSON, and a form to start new jobs based on backend-exposed JSON Schemas.

### Integrations and environment

- Backend relies on:
  - Postgres connection from `.env` at repo root.
  - Optional HF env var `ROBOKIT_HF_LOCAL_ONLY` to force offline cache usage.
  - Standard FastAPI and SQLAlchemy structure; Alembic migrations consistent with models.
- Frontend relies on:
  - Clerk public key `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (required at startup).
  - API URL usage:
    - For SSR and UI pages fetching backend, prefer the Next proxy `/api/backend` with server `API_URL` set.
    - Hooks currently use `NEXT_PUBLIC_API_URL` which hits backend directly from browser; to unify through the proxy, you can set `NEXT_PUBLIC_INTERNAL_API_PROXY=/api/backend` and update hooks to use it (JobRunner already does).

### Security and auth

- Clerk middleware protects routes and API; however:
  - The backend proxy route includes a commented stub for auth header injection. You can wire Clerk session tokens to backend requests there.
  - Backend FastAPI does not currently enforce auth; it’s open by CORS and not checking JWTs. Production should add auth dependencies.
- CORS:
  - `API_CORS_ORIGINS` in `.env` controls allowed origins; defaults to list including `http://localhost:3000`.

### Testing and validation

- Backend has unit and integration tests for endpoints, services, models, schemas, and config parsing. Integration tests for real HF datasets can be run with `ROBOKIT_HF_LOCAL_ONLY=0` and pinned revisions.
- The frontend has Playwright config and tests folders, though not reviewed here; the README highlights dataset upload is currently broken.

### Key API endpoints (backend)

- Health/status
  - GET `/` | `/health` | `/api/v1/status`
- Datasets
  - POST `/api/v1/datasets/` { source, format_type }
  - GET `/api/v1/datasets/` with `skip`, `limit`
  - GET `/api/v1/datasets/{id}`
  - PUT `/api/v1/datasets/{id}` { dataset_metadata? | source? }
  - DELETE `/api/v1/datasets/{id}`
  - GET `/api/v1/datasets/search`
  - GET `/api/v1/datasets/{id}/status`
- Analyses
  - GET `/api/v1/datasets/{id}/analyses/{job_type}`
  - GET `/api/v1/datasets/{id}/analyses/{job_type}/latest`
  - POST `/api/v1/datasets/{id}/analyses/{job_type}` with parameters validated per job
- Jobs
  - POST `/api/v1/datasets/{id}/jobs` { dataset_id, job_type }
  - GET `/api/v1/datasets/{id}/jobs?latest_per_type=true|false`
  - GET `/api/v1/datasets/{id}/jobs/{job_id}`
  - PUT `/api/v1/datasets/{id}/jobs/{job_id}` { status | progress | result* }

### Sequence diagram (frontend ↔ backend ↔ HF)

```mermaid
sequenceDiagram
    participant U as "User"
    participant C as "Next.js UI (Client/SSR)"
    participant H as "HF Search API (Next route)"
    participant HF as "Hugging Face Hub"
    participant P as "Next API Proxy (/api/backend)"
    participant B as "FastAPI Backend"
    participant BG as "Background Task"
    participant DB as "Postgres"

    U->>C: Connect dataset workflow
    C->>H: POST /api/datasets/huggingface/search
    H->>HF: GET /api/datasets?search=...
    HF-->>H: results
    H-->>C: datasets, hasMore

    C->>HF: Resolve revision (commit SHA)
    HF-->>C: SHA

    alt via proxy
      C->>P: POST /api/v1/datasets {source: huggingface, repo_id, revision}
      P->>B: Forward request
    else direct
      C->>B: POST /api/v1/datasets {...}
    end

    B->>DB: INSERT dataset
    B->>DB: INSERT job (metadata_extraction, pending, vN)
    B-->>C: 200 Dataset JSON

    B->>BG: run_analysis_background(...)
    BG->>DB: UPDATE job status=running
    BG->>HF: Download meta/info.json, episodes.jsonl
    HF-->>BG: files
    BG->>DB: UPDATE job result, summary, status=completed|failed

    loop polling
      C->>B: GET /api/v1/datasets/{id}/jobs
      B-->>C: jobs with status/progress
    end
```

### Notable implementation details and edge cases

- Background tasks use the same process thread via FastAPI BackgroundTasks; no external worker. They perform DB session operations via `get_db_context()` and catch errors to mark jobs failed, storing `error_message`.
- Metadata extraction only supports HF source types for `format_type` in {lerobot, rlds}. Otherwise fails with an informative error string; frontend surfaces this in cards and job details.
- Versioning of jobs per dataset per type is handled by counting existing jobs and storing `"version": "vN"` in `result_metadata`.
- The Next SSR pages compute base URL via headers (`x-forwarded-proto`, `host`) and make server-side fetches to `/api/backend/...`. Hooks use direct base URL.
- The Hugging Face Next route enforces bounds on `limit` (1..50), applies timeouts, and returns friendly errors for timeouts.

### Gaps and recommendations

- Unify backend calls through the proxy: update hooks to use `/api/backend` by default (like `JobRunner`) and rely on server `API_URL`. This avoids exposing backend URL publicly and simplifies CORS.
- Add backend auth: protect FastAPI endpoints using JWT from Clerk or another provider, verify on each request, and restrict CORS origins strictly in production.
- Implement remaining job handlers (attention analysis, conversion, validation, indexing) or mark with feature flags.
- Add dataset upload backend endpoints and TUS server if pursuing resumable uploads (frontend upload dashboard currently marked broken).
- Improve `/health` to actually check DB connectivity; optionally expose Alembic revision.
- Consider a queue/worker (e.g., Celery/RQ) if background tasks get heavy or long-running; current in-process background tasks block only on I/O within the server process.
- Ensure `API_URL` is set in the frontend runtime environment for the proxy to work; otherwise requests will fail with 500 from the proxy.
- Provide pagination metadata (total count) on list endpoints; SSR dashboard currently infers from a small page.

- **Backend DB/env**: `.env` in repo root sets dev defaults; Docker Compose uses them to expose Postgres and pgAdmin.
- **HF cache**: set `ROBOKIT_HF_LOCAL_ONLY=1` to force offline mode; integration tests switch it off.

Summary:
- Mapped FastAPI backend: endpoints for datasets, jobs, analyses; services implement HF metadata extraction and quality heuristics; SQLAlchemy models with JSONB and GIN indexes; background tasks manage job lifecycle and error capture.
- Mapped Next.js frontend: Clerk-protected UI, server-side proxy to backend, HF search route, dataset import wizard, job runner with JSON Schema-driven forms, and polling hooks to display job progress/results.
- Noted integration flow and requirements for environment variables (`API_URL`, `NEXT_PUBLIC_API_URL`, Clerk key).
- Suggested improvements: route all frontend backend calls through the proxy, add auth to API, implement remaining job handlers, finalize upload backend, and enhance health checks/pagination.