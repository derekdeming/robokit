import time
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Dict, Any, Optional, List, NamedTuple
from dataclasses import dataclass
from sqlalchemy.orm import Session

from core.config import settings
from schemas.dataset import AttentionAnalysisParams
from services.dataset_service import DatasetService
from services.model_registry import model_registry
from services.attention_wrapper import ACTPolicyWithAttention, AttentionVisualizer
from services.rerun_service import DatasetMetadata, VideoLoader


@dataclass
class AttentionAnalysisResult:
    rrd_url: str
    rrd_path: str
    frames_written: int
    episode_index: int
    model: Any
    parameters: Dict[str, Any]
    summary: Dict[str, Any]


class EpisodeData(NamedTuple):
    dataframe: pd.DataFrame
    video_caps: Dict[str, Any]
    fps: float
    cameras: List[str]


class AttentionService:
    def __init__(self, db: Session):
        self.db = db
    
    def run_attention_for_episode(
        self, 
        dataset_id: int, 
        params: AttentionAnalysisParams, 
        job_id: int
    ) -> Dict[str, Any]:
        dataset = self._validate_dataset(dataset_id)
        repo_id, revision = self._extract_hf_params(dataset)
        
        policy = model_registry.get_act_policy(params.model)
        wrapper = ACTPolicyWithAttention(
            policy,
            specific_decoder_token_index=params.specific_decoder_token_index
        )
        
        result = self._process_episode_with_attention(
            wrapper, repo_id, revision, dataset_id, params, job_id
        )
        
        return {
            "rrd_url": result.rrd_url,
            "rrd_path": result.rrd_path,
            "frames_written": result.frames_written,
            "episode_index": result.episode_index,
            "model": result.model,
            "parameters": result.parameters,
            "summary": result.summary
        }
    
    def _validate_dataset(self, dataset_id: int):
        dataset = DatasetService.get_dataset(self.db, dataset_id)
        if not dataset:
            raise ValueError(f"Dataset not found: {dataset_id}")
        
        source = dataset.source or {}
        if source.get("type") != "huggingface":
            raise ValueError(f"Only HuggingFace datasets supported, got: {source.get('type')}")
        
        if not dataset.format_type or str(dataset.format_type).lower() not in ("lerobot", "rlds"):
            raise ValueError(f"Only LeRobot and RLDS formats supported for attention analysis, got: {dataset.format_type}")
        
        return dataset
    
    def _extract_hf_params(self, dataset) -> tuple[str, str]:
        source = dataset.source
        repo_id = source.get("repo_id")
        revision = source.get("revision")
        
        if not repo_id:
            raise ValueError("Missing repo_id in dataset source")
        if not revision:
            raise ValueError("Missing revision in dataset source")
        if not isinstance(repo_id, str) or not isinstance(revision, str):
            raise ValueError(f"repo_id and revision must be strings, got: {type(repo_id)}, {type(revision)}")
        
        return repo_id, revision
    
    def _process_episode_with_attention(
        self,
        wrapper: ACTPolicyWithAttention,
        repo_id: str,
        revision: str,
        dataset_id: int,
        params: AttentionAnalysisParams,
        job_id: int
    ) -> AttentionAnalysisResult:
        episode_data = self._load_episode_data(repo_id, revision, params.episode_index)
        
        try:
            recording_info = self._setup_rerun_recording(dataset_id, params.episode_index, episode_data.cameras)
            frames_written = self._process_frames(wrapper, episode_data, params, recording_info)
            
            self._finalize_recording(recording_info["rrd_path"])
            
            return AttentionAnalysisResult(
                rrd_url=f"/api/v1/datasets/{dataset_id}/artifacts/{job_id}/{recording_info['filename']}",
                rrd_path=str(recording_info["rrd_path"]),
                frames_written=frames_written,
                episode_index=params.episode_index,
                model=params.model,
                parameters=params.model_dump(),
                summary={
                    "frames_processed": frames_written,
                    "episode_index": params.episode_index,
                    "cameras_analyzed": len([cam for cam in episode_data.cameras if cam in episode_data.video_caps]),
                    "attention_method": "last_layer_multihead",
                    "avg_proprio_attention": getattr(wrapper, 'avg_proprio_attention', 0.0),
                    "min_proprio_attention": getattr(wrapper, 'min_proprio_attention', 0.0),
                    "max_proprio_attention": getattr(wrapper, 'max_proprio_attention', 0.0)
                }
            )
        finally:
            VideoLoader.cleanup(episode_data.video_caps)
    
    def _load_episode_data(self, repo_id: str, revision: str, episode_index: int) -> EpisodeData:
        import pyarrow.parquet as pq
        from services.hf_utils import safe_hf_download
        
        if episode_index < 0:
            raise ValueError(f"Episode index must be non-negative, got: {episode_index}")
        
        try:
            fps, cameras = DatasetMetadata.get_lerobot_metadata(repo_id, revision)
        except Exception as e:
            raise ValueError(f"Failed to load dataset metadata for {repo_id}@{revision}: {e}")
        
        if not cameras:
            raise ValueError(f"No cameras found in dataset {repo_id}@{revision}")
        
        chunk = episode_index // 1000
        parquet_path = safe_hf_download(
            repo_id, revision,
            f"data/chunk-{chunk:03d}/episode_{episode_index:06d}.parquet"
        )
        
        if not parquet_path or not Path(parquet_path).exists():
            raise ValueError(f"Episode {episode_index} parquet data not found for {repo_id}@{revision}")
        
        try:
            table = pq.read_table(parquet_path)
            df = table.to_pandas()
        except Exception as e:
            raise ValueError(f"Failed to read episode {episode_index} parquet data: {e}")
        
        if df.empty:
            raise ValueError(f"Episode {episode_index} contains no data")
        
        video_caps = VideoLoader.load_episode_videos(repo_id, revision, episode_index, cameras)
        if not video_caps:
            raise ValueError(f"No video files found for episode {episode_index} in {repo_id}@{revision}")
        
        return EpisodeData(df, video_caps, fps, cameras)
    
    def _setup_rerun_recording(self, dataset_id: int, episode_index: int, cameras: List[str]) -> Dict[str, Any]:
        import rerun as rr
        
        timestamp_str = time.strftime("%Y%m%d-%H%M%S")
        app_id = f"attention_analysis_{dataset_id}_{episode_index}_{timestamp_str}"
        rr.init(app_id, spawn=False)
        
        artifacts_dir = Path(settings.ARTIFACTS_DIR or ".artifacts")
        output_dir = artifacts_dir / f"dataset_{dataset_id}" / "rerun"
        output_dir.mkdir(parents=True, exist_ok=True)
        
        filename = f"attention_{episode_index}_{timestamp_str}.rrd"
        rrd_path = output_dir / filename
        
        rr.log("/", rr.ViewCoordinates.RDF, static=True)
        blueprint = self._create_attention_blueprint(cameras)
        rr.send_blueprint(blueprint)
        
        return {"rrd_path": rrd_path, "filename": filename}
    
    def _process_frames(
        self, 
        wrapper: ACTPolicyWithAttention, 
        episode_data: EpisodeData, 
        params: AttentionAnalysisParams,
        recording_info: Dict[str, Any]
    ) -> int:
        import torch
        
        frames_written = 0
        proprio_attention_sum = 0.0
        proprio_attention_count = 0
        min_proprio = float('inf')
        max_proprio = float('-inf')
        max_frames = min(len(episode_data.dataframe), params.max_frames) if params.max_frames else len(episode_data.dataframe)
        
        for idx in range(0, max_frames, params.stride):
            row = episode_data.dataframe.iloc[idx]
            observation = self._prepare_observation(row, episode_data.video_caps, episode_data.cameras, wrapper.config)
            
            if observation is None:
                print(f"Warning: No observation prepared for frame {idx}")
                continue
            
            try:
                with torch.inference_mode():
                    action, attention_maps = wrapper.select_action(observation)
                
                print(f"Frame {idx}: Generated action shape: {action.shape if hasattr(action, 'shape') else 'N/A'}, attention maps: {len(attention_maps) if attention_maps else 0}")
                
                # Extract images in the order of config.image_features
                images = wrapper._extract_images(observation)
                images_np = [AttentionVisualizer._tensor_to_numpy(img) if img is not None else None for img in images]
                print(f"Frame {idx}: Extracted {len(images_np)} images")
                
                visualizations = wrapper.visualize_attention(
                    attention_maps=attention_maps,
                    observation=observation,
                    use_rgb=params.use_rgb,
                    overlay_alpha=params.overlay_alpha,
                    show_proprio_border=params.show_proprio_border,
                    proprio_border_width=params.proprio_border_width
                )
                
                # Use the same camera order as the policy config for consistent indexing
                camera_order = wrapper.config.image_features if hasattr(wrapper.config, 'image_features') else episode_data.cameras
                
                # Filter to only cameras that exist in both config and dataset
                cameras_to_log = []
                images_to_log = []
                visualizations_to_log = []
                
                for i, cam in enumerate(camera_order):
                    if cam in episode_data.video_caps:
                        cameras_to_log.append(cam)
                        images_to_log.append(images_np[i] if i < len(images_np) else None)
                        visualizations_to_log.append(visualizations[i] if i < len(visualizations) else None)
                
                self._log_attention_frame(
                    row, images_to_log, cameras_to_log,
                    attention_maps, visualizations_to_log, wrapper.last_proprio_attention,
                    action, frames_written, episode_data.fps
                )
                
                # Track proprio attention statistics
                proprio_val = wrapper.last_proprio_attention
                proprio_attention_sum += proprio_val
                proprio_attention_count += 1
                min_proprio = min(min_proprio, proprio_val)
                max_proprio = max(max_proprio, proprio_val)
                
                frames_written += 1
                
            except Exception as e:
                import traceback
                print(f"Error processing frame {idx}: {e}")
                traceback.print_exc()
                continue
        
        # Store proprio attention statistics in the wrapper for the summary
        if proprio_attention_count > 0:
            wrapper.avg_proprio_attention = proprio_attention_sum / proprio_attention_count
            wrapper.min_proprio_attention = min_proprio
            wrapper.max_proprio_attention = max_proprio
        else:
            wrapper.avg_proprio_attention = 0.0
            wrapper.min_proprio_attention = 0.0
            wrapper.max_proprio_attention = 0.0
        
        return frames_written
    
    def _finalize_recording(self, rrd_path: Path) -> None:
        import rerun as rr
        rr.save(str(rrd_path))
    
    def _prepare_observation(
        self, 
        row: pd.Series, 
        video_caps: Dict[str, Any], 
        cameras: List[str],
        policy_config: Any
    ) -> Optional[Dict[str, Any]]:
        import torch
        
        observation = {}
        
        # Only decode cameras that the policy actually uses
        cameras_to_decode = policy_config.image_features if hasattr(policy_config, 'image_features') else cameras
        
        for cam in cameras_to_decode:
            if cam in video_caps:
                img = VideoLoader.read_frame(video_caps[cam])
                if img is not None:
                    img_tensor = torch.from_numpy(img).float()
                    if img_tensor.max() > 1.0:
                        img_tensor = img_tensor / 255.0
                    
                    img_tensor = img_tensor.permute(2, 0, 1).unsqueeze(0)
                    observation[cam] = img_tensor
        
        if hasattr(policy_config, 'robot_state_feature') and policy_config.robot_state_feature:
            state_key = policy_config.robot_state_feature
            if state_key in row.index and row[state_key] is not None:
                state = row[state_key]
                if isinstance(state, (list, tuple)):
                    state_tensor = torch.tensor(state, dtype=torch.float32).unsqueeze(0)
                    observation[state_key] = state_tensor
        
        return observation if observation else None
    
    def _create_attention_blueprint(self, cameras: List[str]):
        import rerun.blueprint as rrb
        
        views = []
        
        for cam in cameras[:3]:
            views.extend([
                rrb.Spatial2DView(origin=f"cam/{cam}", name=f"{cam.title()} Original"),
                rrb.Spatial2DView(origin=f"attention/{cam}", name=f"{cam.title()} Attention")
            ])
        
        views.extend([
            rrb.TimeSeriesView(origin="attention_metrics", name="Attention Metrics"),
            rrb.TimeSeriesView(origin="action", name="Robot Commands"),
            rrb.TimeSeriesView(origin="state", name="Joint States")
        ])
        
        return rrb.Blueprint(rrb.Grid(*views), collapse_panels=True)
    
    def _log_attention_frame(
        self,
        row: pd.Series,
        images_np: List[np.ndarray],
        cameras: List[str],
        attention_maps: List[np.ndarray],
        visualizations: List[np.ndarray],
        proprio_attention: float,
        action: Any,
        frame_idx: int,
        fps: float = 30.0
    ):
        import rerun as rr
        
        if 'timestamp' in row.index:
            rr.set_time_seconds("timestamp", float(row['timestamp']))
        rr.set_time_sequence("frame_index", frame_idx)
        
        for i, cam in enumerate(cameras):
            if i < len(images_np) and images_np[i] is not None:
                # Convert to uint8 for JPEG compression
                img_uint8 = (images_np[i] * 255).astype(np.uint8) if images_np[i].dtype != np.uint8 else images_np[i]
                rr.log(f"cam/{cam}", rr.Image(img_uint8).compress(jpeg_quality=85))
            
            if i < len(visualizations) and visualizations[i] is not None:
                # Visualizations should already be uint8, but ensure it
                vis_uint8 = visualizations[i].astype(np.uint8) if visualizations[i].dtype != np.uint8 else visualizations[i]
                rr.log(f"attention/{cam}", rr.Image(vis_uint8).compress(jpeg_quality=85))
        
        rr.log("attention_metrics/proprioception", rr.Scalars(proprio_attention))
        
        if hasattr(action, 'cpu'):
            action_np = action.cpu().numpy()
            if action_np.ndim > 1:
                action_np = action_np.squeeze(0)
            
            for dim_idx, val in enumerate(action_np):
                rr.log(f"action/joint_{dim_idx}", rr.Scalars(float(val)))
        
        if 'observation.state' in row.index and row['observation.state'] is not None:
            state = row['observation.state']
            if isinstance(state, (list, np.ndarray)):
                for dim_idx, val in enumerate(state):
                    rr.log(f"state/joint_{dim_idx}", rr.Scalars(float(val)))