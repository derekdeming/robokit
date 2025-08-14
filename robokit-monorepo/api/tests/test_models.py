import pytest
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from models.dataset import Dataset, Job


class TestDatasetModel:
    """Test Dataset model business logic"""
    
    def test_dataset_with_complex_metadata(self, db_session: Session):
        """Test dataset with complex metadata structure"""
        metadata = {
            "sensors": {
                "camera": {
                    "enabled": True,
                    "resolution": "1080p",
                    "frame_rate": 30,
                    "settings": {"exposure": "auto", "white_balance": "auto"}
                },
                "lidar": {
                    "enabled": True,
                    "points_per_second": 100000,
                    "range": [0.1, 100.0]
                },
                "imu": {
                    "enabled": True,
                    "frequency": 100
                }
            },
            "timestamps": [1.0, 2.0, 3.0],
            "tags": ["indoor", "navigation", "test"],
            "quality_metrics": {
                "completeness": 0.95,
                "consistency": 0.88
            }
        }
        
        dataset = Dataset(
            source={"type": "http", "url": "https://example.com/test.rosbag"},
            format_type="rosbag",
            dataset_metadata=metadata
        )
        
        db_session.add(dataset)
        db_session.commit()
        db_session.refresh(dataset)
        
        assert dataset.dataset_metadata == metadata
        assert dataset.dataset_metadata["sensors"]["camera"]["enabled"] is True
        assert dataset.dataset_metadata["sensors"]["lidar"]["range"] == [0.1, 100.0]
        assert dataset.dataset_metadata["quality_metrics"]["completeness"] == 0.95
    
    def test_dataset_timestamp_behavior(self, db_session: Session):
        """Test dataset timestamp behavior for business logic"""
        dataset = Dataset(
            source={"type": "http", "url": "https://example.com/test.rosbag"},
            format_type="rosbag"
        )
        
        db_session.add(dataset)
        db_session.commit()
        db_session.refresh(dataset)
        
        # Verify created_at is set
        assert dataset.created_at is not None
        assert isinstance(dataset.created_at, datetime)
        
        # Verify updated_at is None initially
        assert dataset.updated_at is None
        
        # Update dataset and verify updated_at is set
        original_created = dataset.created_at
        dataset.dataset_metadata = {"updated": True}
        db_session.commit()
        db_session.refresh(dataset)
        
        assert dataset.updated_at is not None
        assert dataset.updated_at > original_created
        assert dataset.created_at == original_created  # Should not change

class TestJobModel:
    """Test Job model business logic"""
    
    def test_processing_job_with_complex_results(self, db_session: Session, sample_dataset):
        """Test processing job with complex analysis results"""
        result = {
            "attention_scores": {
                "camera": 0.85,
                "lidar": 0.72,
                "imu": 0.45
            },
            "attention_heatmap": [
                [0.1, 0.2, 0.3, 0.4],
                [0.5, 0.6, 0.7, 0.8],
                [0.9, 1.0, 0.8, 0.6]
            ],
            "key_frames": [10, 25, 40, 55, 70],
            "analysis_metadata": {
                "model_version": "transformer_v2",
                "confidence_threshold": 0.7,
                "processing_time": 45.2
            }
        }
        
        result_summary = {
            "top_sensor": "camera",
            "top_score": 0.85,
            "key_frame_count": 5,
            "average_attention": 0.67,
            "analysis_quality": "high"
        }
        
        result_metadata = {
            "version": "v2",
            "model": "transformer_attention_v2",
            "parameters": {
                "threshold": 0.7,
                "window_size": 10,
                "attention_heads": 8
            },
            "training_data": "robokit_v1_dataset",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        job = Job(
            dataset_id=sample_dataset.id,
            job_type="attention_analysis",
            status="completed",
            progress=1.0,
            result=result,
            result_summary=result_summary,
            result_metadata=result_metadata
        )
        
        db_session.add(job)
        db_session.commit()
        db_session.refresh(job)
        
        assert job.result == result
        assert job.result_summary == result_summary
        assert job.result_metadata == result_metadata
        assert job.result["attention_scores"]["camera"] == 0.85
        assert job.result_summary["top_sensor"] == "camera"
        assert job.result_metadata["version"] == "v2"
    
    def test_processing_job_lifecycle_tracking(self, db_session: Session, sample_dataset):
        """Test processing job lifecycle timestamp tracking"""
        job = Job(
            dataset_id=sample_dataset.id,
            job_type="metadata_extraction",
            status="pending"
        )
        
        db_session.add(job)
        db_session.commit()
        db_session.refresh(job)
        
        # Verify initial state
        assert job.created_at is not None
        assert job.started_at is None
        assert job.completed_at is None
        
        # Start job
        job.status = "running"
        job.started_at = datetime.now(timezone.utc)
        db_session.commit()
        db_session.refresh(job)
        
        assert job.started_at is not None
        assert job.started_at >= job.created_at
        
        # Complete job
        job.status = "completed"
        job.completed_at = datetime.now(timezone.utc)
        db_session.commit()
        db_session.refresh(job)
        
        assert job.completed_at is not None
        assert job.completed_at >= job.started_at
    
    def test_processing_job_error_handling(self, db_session: Session, sample_dataset):
        """Test processing job error handling and tracking"""
        from datetime import datetime, timezone
        
        error_message = "Failed to process dataset: Invalid ROS bag format"
        
        job = Job(
            dataset_id=sample_dataset.id,
            job_type="metadata_extraction",
            status="failed",
            progress=0.3,
            error_message=error_message,
            completed_at=datetime.now(timezone.utc)  # Manually set for failed jobs
        )
        
        db_session.add(job)
        db_session.commit()
        db_session.refresh(job)
        
        assert job.status == "failed"
        assert job.progress == 0.3
        assert job.error_message == error_message
        assert job.completed_at is not None  # Failed jobs should have completed_at set


class TestModelRelationships:
    """Test model relationships and business logic"""
    
    def test_dataset_job_relationship_integrity(self, db_session: Session, sample_dataset):
        """Test dataset-job relationship integrity"""
        # Create multiple jobs for the same dataset
        jobs = [
            Job(
                dataset_id=sample_dataset.id,
                job_type="metadata_extraction",
                status="completed"
            ),
            Job(
                dataset_id=sample_dataset.id,
                job_type="attention_analysis",
                status="pending"
            ),
            Job(
                dataset_id=sample_dataset.id,
                job_type="conversion",
                status="running"
            )
        ]
        
        for job in jobs:
            db_session.add(job)
        db_session.commit()
        
        # Verify all jobs belong to the same dataset
        for job in jobs:
            db_session.refresh(job)
            assert job.dataset_id == sample_dataset.id
        
        # Verify job types are unique per dataset
        job_types = [job.job_type for job in jobs]
        assert len(job_types) == len(set(job_types))  # No duplicates
    
    def test_job_status_transitions(self, db_session: Session, sample_dataset):
        """Test valid job status transitions"""
        valid_transitions = {
            "pending": ["running", "failed"],
            "running": ["completed", "failed"],
            "completed": [],  # Terminal state
            "failed": []      # Terminal state
        }
        
        for initial_status, valid_next in valid_transitions.items():
            job = Job(
                dataset_id=sample_dataset.id,
                job_type="metadata_extraction",
                status=initial_status
            )
            db_session.add(job)
        
        db_session.commit()
        
        # Verify all jobs were created successfully
        jobs = db_session.query(Job).filter(
            Job.dataset_id == sample_dataset.id
        ).all()
        
        assert len(jobs) == len(valid_transitions)
        statuses = [job.status for job in jobs]
        assert all(s in valid_transitions.keys() for s in statuses)
    
    def test_dataset_format_validation(self, db_session: Session):
        """Test dataset format type validation"""
        valid_formats = ["rosbag", "hdf5", "parquet", "custom"]
        
        for format_type in valid_formats:
            dataset = Dataset(
                source={"type": "http", "url": f"https://example.com/test.{format_type}"},
                format_type=format_type
            )
            db_session.add(dataset)
        
        db_session.commit()
        
        # Verify all datasets were created successfully
        datasets = db_session.query(Dataset).all()
        assert len(datasets) == len(valid_formats)
        formats = [d.format_type for d in datasets]
        assert all(f in valid_formats for f in formats)
    
    def test_processing_job_progress_validation(self, db_session: Session, sample_dataset):
        """Test processing job progress validation"""
        # Test valid progress values
        valid_progress_values = [0.0, 0.25, 0.5, 0.75, 1.0]
        
        for progress in valid_progress_values:
            job = Job(
                dataset_id=sample_dataset.id,
                job_type="metadata_extraction",
                status="running",
                progress=progress
            )
            db_session.add(job)
        
        db_session.commit()
        
        # Verify all jobs were created successfully
        jobs = db_session.query(Job).filter(
            Job.dataset_id == sample_dataset.id
        ).all()
        
        assert len(jobs) == len(valid_progress_values)
        progress_values = [job.progress for job in jobs]
        assert all(p in valid_progress_values for p in progress_values) 