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