from __future__ import annotations

from typing import Optional, List
import os


def safe_hf_download(repo_id: str, revision: str, filename: str, repo_type: str = "dataset") -> Optional[str]:
    """Download a file from Hugging Face Hub with optional offline mode.

    Returns the local path or None if unavailable.
    Respects ROBOKIT_HF_LOCAL_ONLY env var: '1'|'true' to enforce local cache only.
    """
    try:
        from huggingface_hub import hf_hub_download
    except Exception:
        return None

    local_only = os.getenv("ROBOKIT_HF_LOCAL_ONLY", "0") in ("1", "true", "True")
    try:
        return hf_hub_download(
            repo_id=repo_id,
            filename=filename,
            repo_type=repo_type,
            revision=revision,
            local_files_only=local_only,
        )
    except Exception:
        return None


def list_repo_files(repo_id: str, revision: str) -> List[str]:
    """List files in a HF repo at a specific revision (dataset type)."""
    try:
        from huggingface_hub import HfApi
    except Exception:
        return []

    api = HfApi()
    try:
        return sorted(api.list_repo_files(repo_id=repo_id, revision=revision, repo_type="dataset"))
    except Exception:
        return []

