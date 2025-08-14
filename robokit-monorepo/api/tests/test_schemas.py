import pytest
from datetime import datetime, timezone
from pydantic import ValidationError

from schemas.dataset import (
    DatasetCreate, DatasetUpdate, Dataset,
    JobCreate, JobUpdate, Job,
    JobType, JobStatus, DatasetFormat
)


class TestDatasetSchemas:
    """Test dataset-related schemas"""
    
    def test_dataset_create_valid(self):
        """Test valid dataset creation"""
        data = {
            "source": {"type": "http", "url": "https://example.com/test.rosbag"},
            "format_type": "rosbag"
        }
        
        dataset = DatasetCreate(**data)
        assert dataset.source.type == "http"
        assert str(dataset.source.url) == "https://example.com/test.rosbag"
        assert dataset.format_type == DatasetFormat.ROSBAG
    
    def test_dataset_create_invalid_url(self):
        """Test dataset creation with invalid URL"""
        data = {
            "source": {"type": "http", "url": "invalid-url"},
            "format_type": "rosbag"
        }
        
        with pytest.raises(ValidationError):
            DatasetCreate(**data)
    
    def test_dataset_update_partial(self):
        """Test partial dataset update"""
        data = {
        }
        
        update = DatasetUpdate(**data)
        assert update.dataset_metadata is None
    
    def test_dataset_response_with_metadata(self):
        """Test dataset response with complex metadata"""
        complex_metadata = {
            "sensors": {
                "camera": {"enabled": True, "resolution": "1080p"},
                "lidar": {"enabled": True, "points_per_second": 100000}
            },
            "timestamps": [1.0, 2.0, 3.0],
            "tags": ["indoor", "navigation", "test"]
        }
        
        data = {
            "id": 1,
            "source": {"type": "http", "url": "https://example.com/test.rosbag"},
            "format_type": "rosbag",
            "dataset_metadata": complex_metadata,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        
        dataset = Dataset(**data)
        assert dataset.dataset_metadata == complex_metadata
        assert dataset.dataset_metadata["sensors"]["camera"]["enabled"] is True


class TestJobSchemas:
    """Test processing job schemas"""
    
    def test_processing_job_create_valid(self):
        """Test valid processing job creation"""
        data = {
            "dataset_id": 1,
            "job_type": "attention_analysis"
        }
        
        job = JobCreate(**data)
        
        assert job.dataset_id == 1
        assert job.job_type == JobType.ATTENTION_ANALYSIS
    
    def test_processing_job_update_with_results(self):
        """Test processing job update with complex results"""
        update_data = {
            "status": "completed",
            "progress": 1.0,
            "result": {
                "attention_scores": {"camera": 0.8, "lidar": 0.6},
                "attention_heatmap": [[0.1, 0.2], [0.3, 0.4]],
                "key_frames": [10, 25, 40]
            },
            "result_summary": {
                "top_sensor": "camera",
                "top_score": 0.8,
                "key_frame_count": 3
            },
            "result_metadata": {
                "version": "v1",
                "model": "transformer_attention",
                "parameters": {"threshold": 0.5}
            }
        }
        
        update = JobUpdate(**update_data)
        
        assert update.status == JobStatus.COMPLETED
        assert update.progress == 1.0
        assert update.result["attention_scores"]["camera"] == 0.8
        assert update.result_summary["top_sensor"] == "camera"
        assert update.result_metadata["version"] == "v1"


class TestEnumSchemas:
    """Test enum schemas"""
    
    def test_job_type_enum_values(self):
        """Test JobType enum values"""
        assert JobType.METADATA_EXTRACTION == "metadata_extraction"
        assert JobType.ATTENTION_ANALYSIS == "attention_analysis"
        assert JobType.CONVERSION == "conversion"
        assert JobType.VALIDATION == "validation"
        assert JobType.INDEXING == "indexing"
        assert JobType.EVALUATE_QUALITY_HEURISTICS == "evaluate_quality_heuristics"
    
    def test_job_status_enum_values(self):
        """Test JobStatus enum values"""
        assert JobStatus.PENDING == "pending"
        assert JobStatus.RUNNING == "running"
        assert JobStatus.COMPLETED == "completed"
        assert JobStatus.FAILED == "failed"
    
    def test_dataset_format_enum_values(self):
        """Test DatasetFormat enum values"""
        assert DatasetFormat.ROSBAG == "rosbag"
        assert DatasetFormat.HDF5 == "hdf5"
        assert DatasetFormat.PARQUET == "parquet"
        assert DatasetFormat.CUSTOM == "custom" 
        assert DatasetFormat.LEROBOT == "lerobot"
        assert DatasetFormat.RLDS == "rlds"