import pytest
from unittest.mock import Mock, patch, MagicMock, mock_open
from pathlib import Path
import json
from datetime import datetime, timedelta
import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from services.rerun_service import (
    RerunService,
    RerunBuildResult,
    RerunStreamResult,
    DatasetMetadata,
    VideoLoader,
    RerunLogger,
    StreamManager,
    visualize_lerobot_dataset
)
from schemas.dataset import RerunVisualizationParams
from models.dataset import Dataset as DatasetModel


def mock_open_with_json(data):
    """Helper to mock file opening with JSON data."""
    return mock_open(read_data=json.dumps(data))


class TestDatasetMetadata:
    """Test dataset metadata extraction."""
    
    @patch('services.rerun_service.safe_hf_download')
    @patch('services.rerun_service.Path')
    def test_get_lerobot_metadata_with_info_json(self, mock_path, mock_download):
        """Test metadata extraction from info.json."""
        mock_path.return_value.exists.return_value = True
        mock_download.return_value = "/fake/path/info.json"
        
        test_info = {
            "fps": 25.0,
            "features": {
                "observation": {
                    "images": {
                        "cam1": {"shape": [480, 640, 3]},
                        "cam2": {"shape": [480, 640, 3]}
                    }
                }
            }
        }
        
        with patch('builtins.open', mock_open_with_json(test_info)):
            fps, cameras = DatasetMetadata.get_lerobot_metadata("test/repo", "main")
        
        assert fps == 25.0
        assert cameras == ["cam1", "cam2"]
    
    @patch('services.rerun_service.safe_hf_download')
    @patch('services.rerun_service.DatasetMetadata._discover_cameras_from_videos')
    def test_get_lerobot_metadata_fallback_to_discovery(self, mock_discover, mock_download):
        """Test fallback to video discovery when info.json unavailable."""
        mock_download.return_value = None
        mock_discover.return_value = ["discovered_cam"]
        
        fps, cameras = DatasetMetadata.get_lerobot_metadata("test/repo", "main")
        
        assert fps == 30.0
        assert cameras == ["discovered_cam"]
        mock_discover.assert_called_once_with("test/repo", "main")
    
    @patch('services.rerun_service.list_repo_files')
    def test_discover_cameras_from_videos(self, mock_list_files):
        """Test camera discovery from video file paths."""
        mock_list_files.return_value = [
            "videos/chunk-000/observation.images.base/episode_000000.mp4",
            "videos/chunk-000/observation.images.gripper/episode_000000.mp4",
            "videos/chunk-001/observation.images.base/episode_001000.mp4"
        ]
        
        cameras = DatasetMetadata._discover_cameras_from_videos("test/repo", "main")
        
        assert sorted(cameras) == ["base", "gripper"]


class TestVideoLoader:
    """Test video loading functionality."""
    
    @patch('services.rerun_service.safe_hf_download')
    @patch('services.rerun_service.Path')
    @patch('cv2.VideoCapture')
    def test_load_episode_videos_success(self, mock_cv2, mock_path, mock_download):
        """Test successful video loading."""
        mock_path.return_value.exists.return_value = True
        mock_download.return_value = "/fake/video.mp4"
        mock_cap = Mock()
        mock_cv2.return_value = mock_cap
        
        cameras = ["cam1", "cam2"]
        result = VideoLoader.load_episode_videos("test/repo", "main", 500, cameras)
        
        assert len(result) == 2
        assert "cam1" in result
        assert "cam2" in result
        assert mock_download.call_count == 2
    
    @patch('cv2.cvtColor')
    def test_read_frame_success(self, mock_cvt):
        """Test frame reading from video capture."""
        mock_cap = Mock()
        mock_cap.read.return_value = (True, np.zeros((480, 640, 3), dtype=np.uint8))
        mock_cvt.return_value = np.zeros((480, 640, 3), dtype=np.uint8)
        
        frame = VideoLoader.read_frame(mock_cap)
        
        assert frame is not None
        assert frame.shape == (480, 640, 3)
        mock_cvt.assert_called_once()
    
    def test_cleanup_releases_all_caps(self):
        """Test cleanup releases all video captures."""
        cap1, cap2 = Mock(), Mock()
        video_caps = {"cam1": cap1, "cam2": cap2}
        
        VideoLoader.cleanup(video_caps)
        
        cap1.release.assert_called_once()
        cap2.release.assert_called_once()


class TestRerunLogger:
    """Test Rerun logging functionality."""
    
    @patch('services.rerun_service.rr')
    def test_log_frame_data(self, mock_rr):
        """Test logging frame data to Rerun."""
        row = pd.Series({
            'timestamp': 1.5,
            'action': [1.0, 2.0, 3.0],
            'observation.state': [0.1, 0.2],
            'next.done': False,
            'next.reward': 0.5
        })
        
        mock_cap = Mock()
        mock_cap.read.return_value = (True, np.zeros((100, 100, 3), dtype=np.uint8))
        video_caps = {"cam1": mock_cap}
        
        with patch('services.rerun_service.VideoLoader.read_frame', return_value=np.zeros((100, 100, 3))):
            RerunLogger.log_frame_data(row, video_caps, 42, 30.0)
        
        mock_rr.set_time_seconds.assert_called_with("timestamp", 1.5)
        mock_rr.set_time_sequence.assert_called_with("frame_index", 42)
        assert mock_rr.log.call_count >= 1
    
    @patch('services.rerun_service.rrb')
    def test_create_blueprint(self, mock_rrb):
        """Test blueprint creation for viewer layout."""
        mock_view = Mock()
        mock_rrb.Spatial2DView.return_value = mock_view
        mock_rrb.TimeSeriesView.return_value = mock_view
        mock_blueprint = Mock()
        mock_rrb.Blueprint.return_value = mock_blueprint
        mock_rrb.Grid.return_value = Mock()
        
        cameras = ["cam1", "cam2", "cam3", "cam4"]
        result = RerunLogger.create_blueprint(cameras)
        
        assert mock_rrb.Spatial2DView.call_count == 3
        assert mock_rrb.TimeSeriesView.call_count == 3
        assert result == mock_blueprint


class TestStreamManager:
    """Test stream management functionality."""
    
    def setup_method(self):
        StreamManager._active_streams.clear()
    
    def test_is_stream_active_no_stream(self):
        """Test stream activity check when no stream exists."""
        assert not StreamManager.is_stream_active(123)
    
    def test_is_stream_active_expired(self):
        """Test stream activity check for expired stream."""
        StreamManager._active_streams[123] = {
            'expires_at': datetime.now() - timedelta(seconds=10)
        }
        assert not StreamManager.is_stream_active(123)
    
    def test_is_stream_active_valid(self):
        """Test stream activity check for valid stream."""
        StreamManager._active_streams[123] = {
            'expires_at': datetime.now() + timedelta(seconds=10)
        }
        assert StreamManager.is_stream_active(123)
    
    def test_cleanup_expired_stream(self):
        """Test cleanup of expired streams."""
        StreamManager._active_streams[123] = {'test': 'data'}
        StreamManager.cleanup_expired_stream(123)
        assert 123 not in StreamManager._active_streams
    
    def test_add_stream(self):
        """Test adding stream to active streams."""
        stream_info = {'viewer_url': 'test_url', 'port': 9876}
        StreamManager.add_stream(123, stream_info)
        assert StreamManager._active_streams[123] == stream_info
    
    @patch('socket.socket')
    def test_find_available_port_success(self, mock_socket):
        """Test finding available port successfully."""
        mock_sock = Mock()
        mock_socket.return_value.__enter__.return_value = mock_sock
        mock_sock.bind.return_value = None
        
        port = StreamManager.find_available_port(9876, 9878)
        assert port == 9876
    
    @patch('socket.socket')
    def test_find_available_port_failure(self, mock_socket):
        """Test finding available port when all ports are in use."""
        mock_sock = Mock()
        mock_socket.return_value.__enter__.return_value = mock_sock
        mock_sock.bind.side_effect = OSError("Port in use")
        
        with pytest.raises(RuntimeError, match="No available ports found"):
            StreamManager.find_available_port(9876, 9877)


class TestRerunService:
    """Test main RerunService functionality."""
    
    def setup_method(self):
        self.mock_db = Mock(spec=Session)
        self.service = RerunService(self.mock_db)
    
    @patch('services.rerun_service.DatasetService.get_dataset')
    def test_build_recording_dataset_not_found(self, mock_get_dataset):
        """Test build recording with non-existent dataset."""
        mock_get_dataset.return_value = None
        params = RerunVisualizationParams()
        
        with pytest.raises(ValueError, match="Dataset 123 not found"):
            self.service.build_recording(123, params)
    
    @patch('services.rerun_service.DatasetService.get_dataset')
    def test_build_recording_unsupported_format(self, mock_get_dataset):
        """Test build recording with unsupported dataset format."""
        mock_dataset = Mock()
        mock_dataset.format_type = "rosbag"
        mock_get_dataset.return_value = mock_dataset
        params = RerunVisualizationParams()
        
        with pytest.raises(ValueError, match="Unsupported dataset format"):
            self.service.build_recording(123, params)
    
    @patch('services.rerun_service.DatasetService.get_dataset')
    def test_build_recording_unsupported_source(self, mock_get_dataset):
        """Test build recording with unsupported source type."""
        mock_dataset = Mock()
        mock_dataset.format_type = "lerobot"
        mock_dataset.source = {"type": "s3"}
        mock_get_dataset.return_value = mock_dataset
        params = RerunVisualizationParams()
        
        with pytest.raises(ValueError, match="Unsupported source type"):
            self.service.build_recording(123, params)
    
    @patch('services.rerun_service.visualize_lerobot_dataset')
    @patch('services.rerun_service.DatasetService.get_dataset')
    @patch('services.rerun_service.settings')
    @patch('services.rerun_service.datetime')
    def test_build_recording_success(self, mock_datetime, mock_settings, mock_get_dataset, mock_visualize):
        """Test successful recording build."""
        mock_dataset = Mock()
        mock_dataset.format_type = "lerobot"
        mock_dataset.source = {"type": "huggingface", "repo_id": "test/repo", "revision": "main"}
        mock_get_dataset.return_value = mock_dataset
        
        mock_settings.ARTIFACTS_DIR = "/artifacts"
        mock_settings.API_BASE_URL = "http://localhost:8000"
        
        mock_datetime.now.return_value.strftime.return_value = "20240101_120000"
        
        mock_rrd_path = Path("/fake/recording.rrd")
        mock_visualize.return_value = (mock_rrd_path, 100)
        
        with patch('services.rerun_service.Path') as mock_path_cls:
            mock_base_path = MagicMock()
            mock_dataset_path = MagicMock()  
            mock_rerun_path = MagicMock()
            mock_output_path = MagicMock()
            
            mock_path_cls.return_value = mock_base_path
            mock_base_path.__truediv__.return_value = mock_dataset_path
            mock_dataset_path.__truediv__.return_value = mock_rerun_path
            mock_rerun_path.mkdir.return_value = None
            mock_rerun_path.__truediv__.return_value = mock_output_path
            
            params = RerunVisualizationParams(episode_index=5, max_frames=1000)
            result = self.service.build_recording(123, params, job_id=456)
        
        assert isinstance(result, RerunBuildResult)
        assert result.rrd_path == mock_rrd_path
        assert result.frames_written == 100
        assert "recording_" in result.rrd_url
        mock_visualize.assert_called_once()
    
    @patch('services.rerun_service.StreamManager.is_stream_active')
    @patch('services.rerun_service.StreamManager._active_streams')
    def test_stream_recording_existing_active(self, mock_streams, mock_is_active):
        """Test stream recording with existing active stream."""
        mock_is_active.return_value = True
        stream_info = {
            'viewer_url': 'rerun+http://localhost:9876',
            'frames_sent': 100,
            'expires_at': datetime.now() + timedelta(seconds=300)
        }
        mock_streams.__getitem__.return_value = stream_info
        
        params = RerunVisualizationParams()
        result = self.service.stream_recording(123, params)
        
        assert isinstance(result, RerunStreamResult)
        assert result.viewer_url == stream_info['viewer_url']
        assert result.frames_sent == stream_info['frames_sent']
    
    @patch('services.rerun_service.StreamManager.find_available_port')
    @patch('services.rerun_service.StreamManager.add_stream')
    @patch('services.rerun_service.rr')
    @patch('threading.Thread')
    @patch('time.sleep')
    def test_stream_recording_new_stream(self, mock_sleep, mock_thread, mock_rr, mock_add_stream, mock_find_port):
        """Test stream recording with new stream creation."""
        mock_find_port.return_value = 9876
        mock_thread_instance = Mock()
        mock_thread.return_value = mock_thread_instance
        
        params = RerunVisualizationParams(streaming_ttl_seconds=1800)
        result = self.service.stream_recording(123, params)
        
        assert isinstance(result, RerunStreamResult)
        assert result.viewer_url == "rerun+http://localhost:9876"
        assert result.frames_sent == 0
        mock_rr.init.assert_called_once_with("robokit_stream", spawn=False)
        mock_thread_instance.start.assert_called_once()


class TestVisualizeLerobotDataset:
    """Test LeRobot dataset visualization."""
    
    @patch('services.rerun_service.rr')
    @patch('services.rerun_service.DatasetMetadata.get_lerobot_metadata')
    @patch('services.rerun_service.safe_hf_download')
    @patch('services.rerun_service.pq.read_table')
    @patch('services.rerun_service.VideoLoader.load_episode_videos')
    @patch('services.rerun_service.VideoLoader.cleanup')
    @patch('services.rerun_service.RerunLogger.create_blueprint')
    @patch('services.rerun_service.RerunLogger.log_frame_data')
    def test_visualize_success(self, mock_log_frame, mock_blueprint, 
                              mock_cleanup, mock_load_videos, mock_read_table,
                              mock_download, mock_metadata, mock_rr):
        """Test successful dataset visualization."""
        mock_metadata.return_value = (30.0, ["cam1", "cam2"])
        mock_download.return_value = "/fake/episode.parquet"
        
        mock_df = pd.DataFrame({
            'timestamp': [0.0, 0.033, 0.066],
            'action': [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
        })
        mock_table = Mock()
        mock_table.to_pandas.return_value = mock_df
        mock_read_table.return_value = mock_table
        
        mock_video_caps = {"cam1": Mock(), "cam2": Mock()}
        mock_load_videos.return_value = mock_video_caps
        
        import tempfile
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "test.rrd"
            
            with patch('services.rerun_service.Path') as mock_path_cls:
                def path_side_effect(path_arg):
                    if str(path_arg) == "/fake/episode.parquet":
                        mock_path = Mock()
                        mock_path.exists.return_value = True
                        return mock_path
                    return Path(path_arg)
                
                mock_path_cls.side_effect = path_side_effect
                
                result = visualize_lerobot_dataset("test/repo", "main", 0, output_path, max_frames=2)
        
        assert result == (output_path, 2)
        mock_rr.init.assert_called_once_with("test/repo/episode_0", spawn=False)
        mock_rr.save.assert_called_once_with(str(output_path))
        assert mock_log_frame.call_count == 2
        mock_cleanup.assert_called_once_with(mock_video_caps)
    
    @patch('services.rerun_service.DatasetMetadata.get_lerobot_metadata')
    @patch('services.rerun_service.safe_hf_download')
    @patch('services.rerun_service.Path')
    def test_visualize_no_parquet(self, mock_path_cls, mock_download, mock_metadata):
        """Test visualization failure when parquet data unavailable."""
        mock_metadata.return_value = (30.0, ["cam1"])
        mock_download.return_value = None
        
        output_path = Path("/output/test.rrd")
        with pytest.raises(ValueError, match="Could not find parquet data"):
            visualize_lerobot_dataset("test/repo", "main", 0, output_path)
    
    @patch('services.rerun_service.rr')
    @patch('services.rerun_service.DatasetMetadata.get_lerobot_metadata')
    @patch('services.rerun_service.safe_hf_download')
    @patch('services.rerun_service.pq.read_table')
    @patch('services.rerun_service.VideoLoader.load_episode_videos')
    @patch('services.rerun_service.Path')
    def test_visualize_no_videos(self, mock_path_cls, mock_load_videos, mock_read_table,
                                mock_download, mock_metadata, mock_rr):
        """Test visualization failure when no videos can be loaded."""
        mock_metadata.return_value = (30.0, ["cam1"])
        mock_download.return_value = "/fake/episode.parquet"
        mock_path = Mock()
        mock_path_cls.return_value = mock_path
        mock_path.exists.return_value = True
        
        mock_table = Mock()
        mock_table.to_pandas.return_value = pd.DataFrame({'test': [1, 2, 3]})
        mock_read_table.return_value = mock_table
        
        mock_load_videos.return_value = {}
        
        output_path = Path("/output/test.rrd")
        with pytest.raises(ValueError, match="Could not load any video files"):
            visualize_lerobot_dataset("test/repo", "main", 0, output_path)