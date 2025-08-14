from __future__ import annotations

import json
import socket
import threading
import time
import cv2
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
import rerun as rr
import rerun.blueprint as rrb
from sqlalchemy.orm import Session

from core.config import settings
from models.dataset import Dataset as DatasetModel
from schemas.dataset import RerunVisualizationParams
from services.dataset_service import DatasetService
from services.hf_utils import safe_hf_download, list_repo_files


@dataclass
class RerunBuildResult:
    """Result from building a Rerun recording."""
    rrd_path: Optional[Path] = None
    rrd_url: Optional[str] = None
    blueprint_path: Optional[Path] = None
    blueprint_url: Optional[str] = None
    frames_written: int = 0
    sdk_version: str = rr.__version__
    viewer_version: str = "0.24.1"


@dataclass
class RerunStreamResult:
    """Result from streaming a Rerun recording."""
    viewer_url: str
    frames_sent: int
    expires_at: datetime
    sdk_version: str = rr.__version__
    viewer_version: str = "0.24.1"


class DatasetMetadata:
    """Helper class to extract dataset metadata."""
    
    @staticmethod
    def get_lerobot_metadata(repo_id: str, revision: str) -> Tuple[float, List[str]]:
        """Extract FPS and camera names from LeRobot dataset."""
        fps = 30.0
        cameras = []
        
        # Try to load from meta/info.json
        try:
            info_path = safe_hf_download(repo_id, revision, "meta/info.json")
            if info_path and Path(info_path).exists():
                with open(info_path, "r") as f:
                    info = json.load(f)
                fps = float(info.get("fps", 30.0))
                features = info.get("features", {})
                obs = features.get("observation", {})
                images = obs.get("images", {})
                cameras = list(images.keys())
        except Exception:
            pass
        
        if not cameras:
            cameras = DatasetMetadata._discover_cameras_from_videos(repo_id, revision)
        if not cameras:
            cameras = ["base", "endeffector", "top"]
            
        return fps, cameras
    
    @staticmethod
    def _discover_cameras_from_videos(repo_id: str, revision: str) -> List[str]:
        """Discover camera names by listing video files in the repository."""
        cameras = []
        try:
            files = list_repo_files(repo_id, revision)
            video_files = [f for f in files if f.startswith("videos/") and "episode_000000.mp4" in f]
            
            for vf in video_files:
                # Extract camera name from path like "videos/chunk-000/observation.images.base/episode_000000.mp4"
                parts = vf.split("/")
                if len(parts) >= 3 and "observation.images." in parts[2]:
                    cam_name = parts[2].replace("observation.images.", "")
                    if cam_name not in cameras:
                        cameras.append(cam_name)
        except Exception:
            pass
        
        return cameras


class VideoLoader:
    """Helper class for loading video data."""
    
    @staticmethod
    def load_episode_videos(
        repo_id: str, 
        revision: str, 
        episode_idx: int, 
        cameras: List[str]
    ) -> Dict[str, cv2.VideoCapture]:
        """Load video files for all cameras in an episode."""
        chunk = episode_idx // 1000
        video_caps = {}
        
        for cam in cameras:
            try:
                video_path = safe_hf_download(
                    repo_id, revision,
                    f"videos/chunk-{chunk:03d}/observation.images.{cam}/episode_{episode_idx:06d}.mp4"
                )
                if video_path and Path(video_path).exists():
                    video_caps[cam] = cv2.VideoCapture(str(video_path))
            except Exception:
                print(f"Could not load video for camera {cam}")
        
        return video_caps
    
    @staticmethod
    def read_frame(cap: cv2.VideoCapture) -> Optional[np.ndarray]:
        """Read a frame from video capture and convert to RGB."""
        ret, img = cap.read()
        if ret and img is not None:
            return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        return None
    
    @staticmethod
    def cleanup(video_caps: Dict[str, cv2.VideoCapture]):
        """Release all video captures."""
        for cap in video_caps.values():
            cap.release()


class RerunLogger:
    """Helper class for logging data to Rerun."""
    
    @staticmethod
    def log_frame_data(
        row: pd.Series,
        video_caps: Dict[str, cv2.VideoCapture],
        frame_idx: int,
        fps: float = 30.0
    ):
        """Log a single frame of data to Rerun."""
        # Set time
        if 'timestamp' in row.index:
            rr.set_time_seconds("timestamp", float(row['timestamp']))
        rr.set_time_sequence("frame_index", frame_idx)
        
        for cam, cap in video_caps.items():
            img = VideoLoader.read_frame(cap)
            if img is not None:
                rr.log(f"{cam}", rr.Image(img).compress(jpeg_quality=85))
        
        RerunLogger._log_array_as_scalars(row, 'action', 'action')
        RerunLogger._log_array_as_scalars(row, 'observation.state', 'state')
        for col in ['next.done', 'next.reward', 'next.success']:
            if col in row.index and row[col] is not None:
                rr.log(col.replace('.', '/'), rr.Scalars(float(row[col])))
    
    @staticmethod
    def _log_array_as_scalars(row: pd.Series, column: str, prefix: str):
        """Log an array column as individual scalar timeseries."""
        if column in row.index and row[column] is not None:
            array = row[column]
            if isinstance(array, (list, np.ndarray)):
                for dim_idx, val in enumerate(array):
                    rr.log(f"{prefix}/joint_{dim_idx}", rr.Scalars(float(val)))
    
    @staticmethod
    def create_blueprint(cameras: List[str]) -> rrb.Blueprint:
        """Create a Rerun blueprint with appropriate views."""
        views = []
        
        for cam in cameras[:3]:  # showing up to 3 cameras
            views.append(rrb.Spatial2DView(origin=cam, name=cam.title()))
        
        # add timeseries views for actions and states
        views.extend([
            rrb.TimeSeriesView(origin="action", name="Robot Commands"),
            rrb.TimeSeriesView(origin="state", name="Joint Angles"),
        ])
        
        views.append(rrb.TimeSeriesView(origin="next", name="Episode Metrics"))
        return rrb.Blueprint(
            rrb.Grid(*views),
            collapse_panels=True
        )


def visualize_lerobot_dataset(
    repo_id: str,
    revision: str,
    episode_index: int,
    output_path: Path,
    max_frames: Optional[int] = None
) -> Tuple[Path, int]:
    """
    Create a Rerun RRD file from a LeRobot dataset episode.
    
    Args:
        repo_id: Hugging Face repository ID
        revision: Repository revision/branch
        episode_index: Index of the episode to visualize
        output_path: Path where the RRD file will be saved
        max_frames: Maximum number of frames to process
    
    Returns:
        Tuple of (Path to the created RRD file, actual number of frames written)
    """
    app_id = f"{repo_id}/episode_{episode_index}"
    rr.init(app_id, spawn=False)
    
    fps, cameras = DatasetMetadata.get_lerobot_metadata(repo_id, revision)
    chunk = episode_index // 1000
    parquet_path = safe_hf_download(
        repo_id, revision,
        f"data/chunk-{chunk:03d}/episode_{episode_index:06d}.parquet"
    )
    
    if not parquet_path or not Path(parquet_path).exists():
        raise ValueError(f"Could not find parquet data for episode {episode_index}")
    
    table = pq.read_table(parquet_path)
    df = table.to_pandas()
    video_caps = VideoLoader.load_episode_videos(repo_id, revision, episode_index, cameras)
    
    if not video_caps:
        raise ValueError(f"Could not load any video files for episode {episode_index}")
    
    try:
        rr.log("/", rr.ViewCoordinates.RDF, static=True)
        blueprint = RerunLogger.create_blueprint(list(video_caps.keys()))
        rr.send_blueprint(blueprint)
        num_frames = min(len(df), max_frames) if max_frames else len(df)
        
        for idx in range(num_frames):
            row = df.iloc[idx]
            RerunLogger.log_frame_data(row, video_caps, idx, fps)
        
        output_path.parent.mkdir(parents=True, exist_ok=True)
        rr.save(str(output_path))
        
        return output_path, num_frames
    finally:
        # Ensure video captures are always released
        VideoLoader.cleanup(video_caps)


class StreamManager:
    """Manager for active streaming sessions."""
    
    _active_streams: Dict[int, Dict] = {}
    
    @classmethod
    def is_stream_active(cls, dataset_id: int) -> bool:
        """Check if a stream is active for the given dataset."""
        if dataset_id not in cls._active_streams:
            return False
        return cls._active_streams[dataset_id]['expires_at'] > datetime.now()
    
    @classmethod
    def cleanup_expired_stream(cls, dataset_id: int):
        """Remove expired stream from tracking."""
        if dataset_id in cls._active_streams:
            del cls._active_streams[dataset_id]
    
    @classmethod
    def add_stream(cls, dataset_id: int, stream_info: Dict):
        """Add a new streaming session."""
        cls._active_streams[dataset_id] = stream_info
    
    @classmethod
    def find_available_port(cls, start: int = 9876, end: int = 9900) -> int:
        """Find an available port for the streaming server."""
        for port in range(start, end):
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                try:
                    s.bind(('', port))
                    return port
                except OSError:
                    continue
        raise RuntimeError("No available ports found")


class RerunService:
    """Main service for handling Rerun visualizations."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def build_recording(
        self, 
        dataset_id: int, 
        params: RerunVisualizationParams, 
        job_id: Optional[int] = None
    ) -> RerunBuildResult:
        """
        Build a Rerun recording file for a dataset.
        
        Args:
            dataset_id: ID of the dataset to visualize
            params: Visualization parameters
            job_id: Optional job ID for tracking
        
        Returns:
            RerunBuildResult with paths and metadata
        """
        dataset = DatasetService.get_dataset(self.db, dataset_id)
        if not dataset:
            raise ValueError(f"Dataset {dataset_id} not found")
        
        if dataset.format_type != "lerobot":
            raise ValueError(f"Unsupported dataset format: {dataset.format_type}")
        
        if dataset.source.get("type") != "huggingface":
            raise ValueError(f"Unsupported source type: {dataset.source.get('type')}")
        
        repo_id = dataset.source.get("repo_id")
        revision = dataset.source.get("revision", "main")
        episode_index = params.episode_index or 0
        
        artifacts_dir = Path(settings.ARTIFACTS_DIR or ".artifacts") / f"dataset_{dataset_id}" / "rerun"
        artifacts_dir.mkdir(parents=True, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = artifacts_dir / f"recording_{timestamp}.rrd"
        
        try:
            rrd_path, actual_frames = visualize_lerobot_dataset(
                repo_id=repo_id,
                revision=revision,
                episode_index=episode_index,
                output_path=output_path,
                max_frames=params.max_frames
            )
            
            result = RerunBuildResult(
                rrd_path=rrd_path,
                frames_written=actual_frames
            )
            
            if job_id:
                base_url = getattr(settings, 'API_BASE_URL', 'http://localhost:8000')
                result.rrd_url = f"{base_url}/api/v1/datasets/{dataset_id}/artifacts/{job_id}/recording_{timestamp}.rrd"
            elif hasattr(settings, "ARTIFACTS_PUBLIC_BASE_URL") and settings.ARTIFACTS_PUBLIC_BASE_URL:
                base = settings.ARTIFACTS_PUBLIC_BASE_URL.rstrip("/")
                result.rrd_url = f"{base}/dataset_{dataset_id}/rerun/recording_{timestamp}.rrd"
            
            return result
            
        except Exception as e:
            raise RuntimeError(f"Failed to create visualization: {str(e)}")
    
    def stream_recording(
        self, 
        dataset_id: int, 
        params: RerunVisualizationParams
    ) -> RerunStreamResult:
        """
        Start a streaming Rerun session for a dataset.
        
        Args:
            dataset_id: ID of the dataset to stream
            params: Visualization parameters
        
        Returns:
            RerunStreamResult with viewer URL and metadata
        """
        if StreamManager.is_stream_active(dataset_id):
            stream_info = StreamManager._active_streams[dataset_id]
            return RerunStreamResult(
                viewer_url=stream_info['viewer_url'],
                frames_sent=stream_info['frames_sent'],
                expires_at=stream_info['expires_at']
            )
        
        StreamManager.cleanup_expired_stream(dataset_id)
        port = StreamManager.find_available_port()
        expires_at = datetime.now() + timedelta(seconds=params.streaming_ttl_seconds or 1800)
        rr.init("robokit_stream", spawn=False)
        server_thread = threading.Thread(target=lambda: rr.serve(open_browser=False, web_port=port),daemon=True)
        server_thread.start()
        time.sleep(1)
        
        # TODO: Implement actual streaming logic here...this would involve loading data and streaming it frame by frame
        viewer_url = f"rerun+http://localhost:{port}"
        StreamManager.add_stream(dataset_id, {
            'viewer_url': viewer_url,
            'port': port,
            'expires_at': expires_at,
            'frames_sent': 0,
            'thread': server_thread
        })
        
        return RerunStreamResult(
            viewer_url=viewer_url,
            frames_sent=0,
            expires_at=expires_at
        )