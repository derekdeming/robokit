from sqlalchemy.orm import Session
from sqlalchemy import func, Float, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.exc import IntegrityError
from typing import List, Optional, Dict, Any
from models.dataset import Dataset, Job
from schemas.dataset import DatasetCreate, DatasetUpdate, JobCreate, JobType
from core.exceptions import raise_not_found, ValidationException
from datetime import datetime, timezone
import json
import re
import os
import pathlib


class DatasetService:
    """Service for dataset processing and analysis"""
    
    @staticmethod
    def create_dataset(db: Session, dataset: DatasetCreate) -> Dataset:
        """Create a new dataset record"""
        # Ensure JSON-serializable source for JSONB storage
        if hasattr(dataset.source, "model_dump"):
            source_payload = dataset.source.model_dump(mode="json")
        else:
            source_payload = dataset.source
        db_dataset = Dataset(
            source=source_payload,
            format_type=dataset.format_type
        )
        db.add(db_dataset)
        try:
            db.commit()
            db.refresh(db_dataset)
            return db_dataset
        except IntegrityError as e:
            db.rollback()
            raise e
    
    @staticmethod
    def get_dataset(db: Session, dataset_id: int) -> Optional[Dataset]:
        """Get dataset by ID"""
        return db.query(Dataset).filter(Dataset.id == dataset_id).first()
    
    @staticmethod
    def get_datasets(db: Session, skip: int = 0, limit: int = 100) -> List[Dataset]:
        """Get all datasets"""
        return db.query(Dataset).offset(skip).limit(limit).all()
    
    @staticmethod
    def update_dataset(db: Session, dataset_id: int, dataset_update: DatasetUpdate) -> Dataset:
        """Update dataset"""
        db_dataset = DatasetService.get_dataset(db, dataset_id)
        if not db_dataset:
            raise_not_found("Dataset", dataset_id)
        
        update_data = dataset_update.model_dump(exclude_unset=True)
        # Normalize source payload to JSON-serializable dict if provided
        if "source" in update_data and update_data["source"] is not None:
            src_val = update_data["source"]
            if hasattr(src_val, "model_dump"):
                update_data["source"] = src_val.model_dump(mode="json")
        for field, value in update_data.items():
            setattr(db_dataset, field, value)
        
        db_dataset.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(db_dataset)
        return db_dataset
    
    @staticmethod
    def delete_dataset(db: Session, dataset_id: int) -> bool:
        """Delete dataset"""
        db_dataset = DatasetService.get_dataset(db, dataset_id)
        if not db_dataset:
            raise_not_found("Dataset", dataset_id)
        
        db.delete(db_dataset)
        db.commit()
        return True

    @staticmethod
    def get_latest_analysis(db: Session, dataset_id: int, job_type: str | JobType) -> Optional[Job]:
        """Get the most recent completed analysis of a specific type"""
        job_type_str = job_type.value if isinstance(job_type, JobType) else job_type
        return db.query(Job).filter(
            Job.dataset_id == dataset_id,
            Job.job_type == job_type_str,
            Job.status == "completed"
        ).order_by(Job.completed_at.desc()).first()
    
    @staticmethod
    def get_analysis_history(db: Session, dataset_id: int, job_type: str | JobType) -> List[Job]:
        """Get all analysis versions for a dataset"""
        job_type_str = job_type.value if isinstance(job_type, JobType) else job_type
        return db.query(Job).filter(
            Job.dataset_id == dataset_id,
            Job.job_type == job_type_str,
            Job.status == "completed"
        ).order_by(Job.completed_at.desc()).all()
    
    # JSON search methods
    @staticmethod
    def search_by_metadata(db: Session, metadata_key: str, metadata_value: str) -> List[Dataset]:
        """Search datasets by metadata JSON field"""
        return db.query(Dataset).filter(
            Dataset.dataset_metadata.cast(JSONB).contains({metadata_key: metadata_value})
        ).all()
    
    @staticmethod
    def search_by_metadata_path(db: Session, json_path: str, value: Any) -> List[Dataset]:
        """Search using JSON path (e.g., 'sensors.camera.frame_rate')"""
        # For PostgreSQL, use jsonb_extract_path_text for strings, jsonb_extract_path for other types
        if isinstance(value, bool):
            # For boolean values, use jsonb_extract_path and cast to boolean
            return db.query(Dataset).filter(
                func.jsonb_extract_path(Dataset.dataset_metadata, *json_path.split('.')).cast(Boolean) == value
            ).all()
        else:
            # For string values, use jsonb_extract_path_text
            return db.query(Dataset).filter(
                func.jsonb_extract_path_text(Dataset.dataset_metadata, *json_path.split('.')) == str(value)
            ).all()
    
    @staticmethod
    def search_by_multiple_criteria(db: Session, criteria: Dict[str, Any]) -> List[Dataset]:
        """Advanced search with multiple JSON criteria"""
        query = db.query(Dataset)
        
        for key, value in criteria.items():
            if key == "metadata":
                for meta_key, meta_value in value.items():
                    query = query.filter(Dataset.dataset_metadata.cast(JSONB).contains({meta_key: meta_value}))
            elif key == "format_type":
                query = query.filter(Dataset.format_type == value)
            elif key == "sensor_types":
                for sensor_type in value:
                    query = query.filter(Dataset.dataset_metadata.cast(JSONB).contains({"sensors": {sensor_type: {"enabled": True}}}))
            elif key == "attention_score_min":
                query = query.filter(
                    func.jsonb_extract_path_text(Dataset.dataset_metadata, "quality_metrics", "attention_score").cast(Float) >= value
                )
        
        return query.all()


    # HuggingFace LeRobot metadata extraction

    @staticmethod
    

    @staticmethod
    def extract_lerobot_metadata_from_hf(repo_id: str, revision: str) -> Dict[str, Any]:
        """Extract useful metadata for LeRobot-style datasets hosted on Hugging Face.
        Gathers sensor/channel info, episodes, tasks, and includes raw meta files.
        Required files:
          - meta/info.json (with features.observation.images.* entries)
          - meta/episodes.jsonl (one JSON object per episode)
        """
        # Load required meta files
        from services.hf_utils import safe_hf_download

        info_fp = safe_hf_download(repo_id=repo_id, revision=revision, filename="meta/info.json")
        if not info_fp:
            raise ValidationException(message="Missing or invalid meta/info.json", field="meta.info")
        info = json.loads(pathlib.Path(info_fp).read_text(encoding="utf-8"))

        episodes_fp = safe_hf_download(repo_id=repo_id, revision=revision, filename="meta/episodes.jsonl")
        if not episodes_fp:
            raise ValidationException(message="Missing meta/episodes.jsonl", field="meta.episodes")
        episodes_text = pathlib.Path(episodes_fp).read_text(encoding="utf-8")

        # Derive cameras from features.observation.images.* entries
        sensors: Dict[str, Any] = {"cameras": []}
        features = info.get("features", {}) if isinstance(info, dict) else {}
        for key, spec in features.items():
            if not isinstance(key, str) or not isinstance(spec, dict):
                continue
            if key.startswith("observation.images.") and spec.get("dtype") == "video":
                camera_name = key.split(".")[-1]
                vid_info = spec.get("info") or {}
                height = vid_info.get("video.height")
                width = vid_info.get("video.width")
                codec = vid_info.get("video.codec")
                if (height is None or width is None) and isinstance(spec.get("shape"), list):
                    names = spec.get("names") or []
                    shape = spec["shape"]
                    if names and "height" in names and "width" in names:
                        try:
                            height = shape[names.index("height")]
                            width = shape[names.index("width")]
                        except Exception:
                            pass
                    elif len(shape) >= 2:
                        height, width = shape[0], shape[1]
                sensors["cameras"].append({
                    "name": camera_name,
                    "width": width,
                    "height": height,
                    "format": codec
                })

        # Cameras may be absent for some datasets; allow empty list

        # Episodes: count lines in episodes.jsonl
        episode_count = sum(1 for line in episodes_text.splitlines() if line.strip())

        summary = {
            "sensor_count": sum(1 for _ in sensors["cameras"]),
            "camera_count": len(sensors["cameras"]),
            "episode_count": episode_count,
        }

        full_result = {
            "metadata": {
                "repo_id": repo_id,
                "revision": revision,
                "sensors": sensors,
                "episodes": episode_count,
                "tasks": []
            },
            "raw_meta": {"meta/info.json": info}
        }

        return {"full_result": full_result, "summary": summary}

    @staticmethod
    def extract_rlds_metadata_from_hf(repo_id: str, revision: str) -> Dict[str, Any]:
        """Extract basic metadata from an RLDS/Open X-Embodiment style dataset on HF.

        Looks for a top-level features.json and minimal RLDS files, infers cameras and
        core keys similarly to LeRobot but without videos section.
        """
        from services.hf_utils import safe_hf_download, list_repo_files
        import json as _json

        # Attempt common metadata files
        features_fp = safe_hf_download(repo_id=repo_id, revision=revision, filename="features.json")
        dataset_info_fp = None
        dataset_infos_fp = None
        if not features_fp:
            # Try dataset_info.json and dataset_infos.json which are common in HF datasets
            dataset_info_fp = safe_hf_download(repo_id=repo_id, revision=revision, filename="dataset_info.json")
            if not dataset_info_fp:
                dataset_infos_fp = safe_hf_download(repo_id=repo_id, revision=revision, filename="dataset_infos.json")
        if not features_fp and not dataset_info_fp and not dataset_infos_fp:
            files = list_repo_files(repo_id=repo_id, revision=revision)
            # Try to find any of the above under root
            candidate = next((f for f in files if f.endswith("features.json")), None)
            if candidate:
                features_fp = safe_hf_download(repo_id=repo_id, revision=revision, filename=candidate)
            if not features_fp:
                candidate = next((f for f in files if f.endswith("dataset_info.json")), None)
                if candidate:
                    dataset_info_fp = safe_hf_download(repo_id=repo_id, revision=revision, filename=candidate)
            if not features_fp and not dataset_info_fp:
                candidate = next((f for f in files if f.endswith("dataset_infos.json")), None)
                if candidate:
                    dataset_infos_fp = safe_hf_download(repo_id=repo_id, revision=revision, filename=candidate)

        sensors: Dict[str, Any] = {"cameras": []}
        feature_keys: List[str] = []
        if features_fp or dataset_info_fp or dataset_infos_fp:
            try:
                def _collect_from_feature_dict(feature_dict: Dict[str, Any]):
                    for key, spec in (feature_dict.items() if isinstance(feature_dict, dict) else []):
                        feature_keys.append(key)
                        k_lower = key.lower() if isinstance(key, str) else ""
                        if isinstance(key, str) and ("image" in k_lower or "rgb" in k_lower):
                            sensors["cameras"].append({
                                "name": key.split("/")[-1],
                                "width": None,
                                "height": None,
                                "format": None,
                            })

                if features_fp:
                    features = _json.loads(pathlib.Path(features_fp).read_text(encoding="utf-8"))
                    if isinstance(features, dict):
                        feature_dict = features.get("features", features)
                        _collect_from_feature_dict(feature_dict)
                elif dataset_info_fp:
                    info_obj = _json.loads(pathlib.Path(dataset_info_fp).read_text(encoding="utf-8"))
                    # Single-dataset info file
                    if isinstance(info_obj, dict):
                        fd = info_obj.get("features") or {}
                        _collect_from_feature_dict(fd)
                elif dataset_infos_fp:
                    infos_obj = _json.loads(pathlib.Path(dataset_infos_fp).read_text(encoding="utf-8"))
                    if isinstance(infos_obj, dict) and infos_obj:
                        # Take first config
                        first_cfg = next(iter(infos_obj.values()))
                        fd = first_cfg.get("features") if isinstance(first_cfg, dict) else {}
                        _collect_from_feature_dict(fd)
            except Exception:
                pass

        summary = {
            "sensor_count": len(sensors["cameras"]),
            "camera_count": len(sensors["cameras"]),
            "episode_count": None,
        }
        full_result = {
            "metadata": {
                "repo_id": repo_id,
                "revision": revision,
                "sensors": sensors,
                "features": feature_keys,
            },
            "raw_meta": {
                "features.json": pathlib.Path(features_fp).read_text(encoding="utf-8") if features_fp else None,
                "dataset_info.json": pathlib.Path(dataset_info_fp).read_text(encoding="utf-8") if dataset_info_fp else None,
                "dataset_infos.json": pathlib.Path(dataset_infos_fp).read_text(encoding="utf-8") if dataset_infos_fp else None,
            }
        }
        return {"full_result": full_result, "summary": summary}

    @staticmethod
    def evaluate_quality_heuristics_from_hf(repo_id: str, revision: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Compute dataset quality heuristics by reading LeRobot v2.1 Parquet episodes from HF.

        Heuristics computed:
          - jitter and frame drops from timestamps
          - lack of jitter detection
          - NaN counts per numeric signal
          - missing topics compared to recommended feature keys
          - joint-space jerk from vector signals (qpos/positions or action vectors)
        """
        # Lazy imports to keep module import light
        import os
        import re
        import json
        import math
        from typing import List as _List, Dict as _Dict, Any as _Any, Optional as _Optional, Tuple as _Tuple
        import numpy as np
        import pandas as pd
        import pyarrow.parquet as pq
        from services.hf_utils import safe_hf_download

        def _safe_hf_download(_repo_id: str, _revision: str, path: str) -> _Optional[str]:
            return safe_hf_download(repo_id=_repo_id, revision=_revision, filename=path)

        def _to_milliseconds(dt_values: np.ndarray) -> np.ndarray:
            if dt_values.size == 0:
                return dt_values
            m = float(np.median(dt_values))
            if m > 1e6:  # likely nanoseconds
                return dt_values / 1e6
            if m > 1e3:  # likely microseconds
                return dt_values / 1e3
            if m < 10:   # likely seconds (e.g., 0.0333 for 30 FPS)
                return dt_values * 1e3
            return dt_values  # already milliseconds

        def _get_timestamp_series(df: pd.DataFrame) -> _Optional[np.ndarray]:
            candidates = [
                "timestamp",
                "timestamps",
                "time",
                "t",
                "frame_time_ms",
                "frame_time_us",
                "frame_time_ns",
            ]
            for name in candidates:
                if name in df.columns:
                    series = df[name].to_numpy()
                    try:
                        series = series.astype(float)
                    except Exception:
                        continue
                    return series
            return None

        def _group_vector_columns(df: pd.DataFrame, base: str) -> _Optional[np.ndarray]:
            # Pattern: base + ".<index>" columns
            pattern = re.compile(rf"^{re.escape(base)}\.(\d+)$")
            cols: _List[_Tuple[int, str]] = []
            for col in df.columns:
                m = pattern.match(col)
                if m:
                    cols.append((int(m.group(1)), col))
            if not cols:
                return None
            cols.sort(key=lambda x: x[0])
            arr = df[[c for _, c in cols]].to_numpy(dtype=float)
            return arr  # shape: (N, D)

        def _extract_vector_signal(df: pd.DataFrame) -> _Tuple[_Optional[np.ndarray], _Optional[str]]:
            # Try object-list columns first
            object_cols = [c for c in df.columns if df[c].dtype == object]
            keywords = ["qpos", "position", "joint", "action", "effort"]
            for col in object_cols:
                lowered = col.lower()
                if any(k in lowered for k in keywords):
                    try:
                        seq = df[col].apply(lambda x: np.asarray(x, dtype=float) if isinstance(x, (list, tuple, np.ndarray)) else None)
                        if seq.isnull().any():
                            continue
                        stacked = np.vstack(seq.to_list())
                        if stacked.ndim == 2 and stacked.shape[1] >= 2:
                            return stacked, f"{col} (list)"
                    except Exception:
                        continue

            # Then prefixed numeric columns like action.0, action.1, ...
            prefixes = [
                "observation.qpos",
                "observation.joints",
                "observation.state.position",
                "action",
                "action.joints",
                "action.qpos",
            ]
            for base in prefixes:
                arr = _group_vector_columns(df, base)
                if arr is not None and arr.shape[1] >= 2:
                    return arr, f"{base}.*"
            return None, None

        def _compute_jerk(vector: np.ndarray, timestamps_ms: np.ndarray, fps: float) -> _Dict[str, float]:
            n = vector.shape[0]
            if n < 4:
                return {"mean": float("nan"), "max": float("nan"), "p95": float("nan")}
            if timestamps_ms is None or timestamps_ms.size != n:
                dt_ms = 1000.0 / float(fps)
                dts = np.full(n - 1, dt_ms, dtype=float)
            else:
                dts = np.diff(timestamps_ms.astype(float))
                dts = _to_milliseconds(dts)
                # Guard against zeros
                dts[dts <= 0] = np.median(dts[dts > 0]) if np.any(dts > 0) else 1.0

            # Use uniform dt for stability based on median
            if dts.size == 0:
                return {"mean": float("nan"), "max": float("nan"), "p95": float("nan")}
            dt_ms = float(np.median(dts))
            dt_s = dt_ms / 1000.0
            v = np.diff(vector, axis=0) / dt_s
            a = np.diff(v, axis=0) / dt_s
            j = np.diff(a, axis=0) / dt_s  # shape (n-3, D)
            j_norm = np.linalg.norm(j, axis=1)
            if j_norm.size == 0:
                return {"mean": float("nan"), "max": float("nan"), "p95": float("nan")}
            return {
                "mean": float(np.mean(j_norm)),
                "max": float(np.max(j_norm)),
                "p95": float(np.quantile(j_norm, 0.95)),
            }

        def _nan_counts(df: pd.DataFrame) -> _Dict[str, int]:
            counts: _Dict[str, int] = {}
            for col in df.columns:
                s = df[col]
                if pd.api.types.is_numeric_dtype(s):
                    counts[col] = int(s.isna().sum())
                elif s.dtype == object:
                    try:
                        # Count NaNs inside list-like entries
                        def _count_in_cell(x):
                            if isinstance(x, (list, tuple, np.ndarray)):
                                arr = np.asarray(x)
                                return int(np.isnan(arr).sum())
                            return int(pd.isna(x))
                        counts[col] = int(s.apply(_count_in_cell).sum())
                    except Exception:
                        continue
            return counts

        # Load meta/info.json
        info_path = _safe_hf_download(repo_id, revision, "meta/info.json")
        if not info_path:
            raise ValueError("Missing meta/info.json; cannot evaluate quality heuristics")
        info = json.loads(open(info_path, "r", encoding="utf-8").read())
        fps = float(info.get("fps") or 30.0)
        total_episodes = int(info.get("total_episodes") or 0)
        chunks_size = int(info.get("chunks_size") or 1000)
        data_path_template = str(info.get("data_path") or "data/chunk-{episode_chunk:03d}/episode_{episode_index:06d}.parquet")

        features = info.get("features", {}) if isinstance(info, dict) else {}
        feature_keys = set(features.keys()) if isinstance(features, dict) else set()
        # Core timeseries topics
        expected_topics = set(["action", "observation.state", "timestamp"])
        missing_topics = sorted(list(expected_topics - feature_keys))

        # Episode selection
        max_episodes = parameters.get("max_episodes") if isinstance(parameters, dict) else None
        if isinstance(max_episodes, int) and max_episodes > 0:
            episode_indices = list(range(min(total_episodes, max_episodes)))
        else:
            episode_indices = list(range(total_episodes))

        # Aggregates
        all_dt_ms: _List[float] = []
        total_drop_count = 0
        total_delta_count = 0
        global_nan_counts: _Dict[str, int] = {}
        jerk_means: _List[float] = []
        jerk_maxes: _List[float] = []
        jerk_p95s: _List[float] = []
        jerk_signal_used: _Optional[str] = None

        for ep_idx in episode_indices:
            ep_chunk = ep_idx // chunks_size
            rel_path = data_path_template.format(episode_chunk=ep_chunk, episode_index=ep_idx)
            local_file = _safe_hf_download(repo_id, revision, rel_path)
            if not local_file:
                continue

            try:
                table = pq.read_table(local_file)
                df: pd.DataFrame = table.to_pandas()
            except Exception:
                continue

            # NaNs
            ep_nan = _nan_counts(df)
            for k, v in ep_nan.items():
                global_nan_counts[k] = global_nan_counts.get(k, 0) + int(v)

            # Timestamps and jitter
            ts = _get_timestamp_series(df)
            if ts is None:
                # Synthetic based on fps
                n = len(df)
                ts = np.arange(n, dtype=float) * (1000.0 / fps)
            else:
                ts = ts.astype(float)
            dts = np.diff(ts)
            dts = _to_milliseconds(dts)
            if dts.size > 0:
                all_dt_ms.extend(dts.tolist())
                dt_med = float(np.median(dts))
                drop_threshold = 1.5 * dt_med
                total_drop_count += int((dts > drop_threshold).sum())
                total_delta_count += dts.size

            # Jerk from vector signal
            vec, signal_name = _extract_vector_signal(df)
            if vec is not None:
                if jerk_signal_used is None:
                    jerk_signal_used = signal_name
                stats = _compute_jerk(vec, ts, fps)
                if not math.isnan(stats["mean"]):
                    jerk_means.append(stats["mean"])
                    jerk_maxes.append(stats["max"])
                    jerk_p95s.append(stats["p95"])

        jitter_ms_median = float(np.median(all_dt_ms)) if all_dt_ms else None
        jitter_ms_std = float(np.std(all_dt_ms)) if all_dt_ms else None
        lack_of_jitter = (
            jitter_ms_std is not None and jitter_ms_median is not None and
            (jitter_ms_std / max(jitter_ms_median, 1e-6)) < 5e-3  # <0.5% variation
        )
        frame_drop_ratio = (total_drop_count / total_delta_count) if total_delta_count > 0 else None

        jerk_mean = float(np.mean(jerk_means)) if jerk_means else None
        jerk_max = float(np.max(jerk_maxes)) if jerk_maxes else None
        jerk_p95 = float(np.mean(jerk_p95s)) if jerk_p95s else None

        full_result = {
            "quality_heuristics": {
                "nan_counts": global_nan_counts,
                "missing_topics": missing_topics,
                "frame_drop_ratio": frame_drop_ratio,
                "jitter_ms": {"median": jitter_ms_median, "std": jitter_ms_std},
                "lack_of_jitter": lack_of_jitter,
                "jerk": {"mean": jerk_mean, "max": jerk_max, "p95": jerk_p95, "signal": jerk_signal_used},
            },
            "source_type": "huggingface",
            "dataset_type": "lerobot",
            "parameters": parameters,
            "fps": fps,
            "episodes_evaluated": len(episode_indices),
        }
        summary = {
            "missing_topic_count": len(missing_topics),
            "frame_drop_ratio": frame_drop_ratio,
            "has_nans": any((v or 0) > 0 for v in global_nan_counts.values()),
            "lack_of_jitter": lack_of_jitter,
            "jerk_mean": jerk_mean,
        }
        return {"full_result": full_result, "summary": summary}

class JobService:
    """Service for background jobs"""
    
    @staticmethod
    def create_job(db: Session, job: JobCreate) -> Job:
        """Create a new processing job"""
        db_job = Job(
            dataset_id=job.dataset_id,
            job_type=job.job_type.value if hasattr(job.job_type, "value") else job.job_type,
            status="pending"
        )
        db.add(db_job)
        db.commit()
        db.refresh(db_job)
        return db_job
    
    @staticmethod
    def create_job_with_metadata(db: Session, dataset_id: int, job_type: str | JobType, parameters: Dict[str, Any]) -> Job:
        """Create a new processing job with metadata"""
        job_type_str = job_type.value if isinstance(job_type, JobType) else job_type
        # Get version number
        existing_jobs = db.query(Job).filter(
            Job.dataset_id == dataset_id,
            Job.job_type == job_type_str
        ).count()
        
        version = f"v{existing_jobs + 1}"
        
        db_job = Job(
            dataset_id=dataset_id,
            job_type=job_type_str,
            status="pending",
            result_metadata={
                "version": version,
                "model": parameters.get("model", "default"),
                "parameters": parameters,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
        )
        db.add(db_job)
        db.commit()
        db.refresh(db_job)
        return db_job
    
    @staticmethod
    def get_job(db: Session, job_id: int) -> Optional[Job]:
        """Get job by ID"""
        return db.query(Job).filter(Job.id == job_id).first()
    
    @staticmethod
    def get_dataset_jobs(db: Session, dataset_id: int) -> List[Job]:
        """Get all jobs for a dataset"""
        return db.query(Job).filter(Job.dataset_id == dataset_id).all()

    @staticmethod
    def get_latest_job_by_type(db: Session, dataset_id: int, job_type: str) -> Optional[Job]:
        """Get the latest job of a specific type for a dataset"""
        return db.query(Job).filter(
            Job.dataset_id == dataset_id,
            Job.job_type == job_type
        ).order_by(Job.created_at.desc()).first()
    
    @staticmethod
    def update_job_status(db: Session, job_id: int, status: str, progress: float = 0.0, 
                         result: Dict[str, Any] = None, result_summary: Dict[str, Any] = None, 
                          error_message: str = None) -> Job:
        """Update job status and progress"""
        db_job = JobService.get_job(db, job_id)
        if not db_job:
            raise_not_found("Job", job_id)
        
        db_job.status = status
        db_job.progress = progress
        
        if status == "running" and not db_job.started_at:
            db_job.started_at = datetime.now(timezone.utc)
        elif status in ["completed", "failed"]:
            db_job.completed_at = datetime.now(timezone.utc)
        
        if result:
            db_job.result = result
        if result_summary:
            db_job.result_summary = result_summary
        if error_message:
            db_job.error_message = error_message
        
        db.commit()
        db.refresh(db_job)
        return db_job
    
    @staticmethod
    def update_job_result(db: Session, job_id: int, result: Dict[str, Any], summary: Dict[str, Any]) -> Job:
        """Update job with results"""
        db_job = JobService.get_job(db, job_id)
        if not db_job:
            raise_not_found("Job", job_id)
        
        db_job.result = result
        db_job.result_summary = summary
        db_job.status = "completed"
        db_job.progress = 1.0 
        db_job.completed_at = datetime.now(timezone.utc)
        
        db.commit()
        db.refresh(db_job)
        return db_job 

    @staticmethod
    def get_dataset_latest_jobs_by_type(db: Session, dataset_id: int) -> List[Job]:
        """Return the most recent job per job_type for a given dataset."""
        all_jobs = (
            db.query(Job)
            .filter(Job.dataset_id == dataset_id)
            .order_by(Job.created_at.desc())
            .all()
        )
        seen_types: set[str] = set()
        latest_per_type: List[Job] = []
        for job in all_jobs:
            if job.job_type not in seen_types:
                latest_per_type.append(job)
                seen_types.add(job.job_type)
        return latest_per_type