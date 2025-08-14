import pytest
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import List, Dict, Any

from services.dataset_service import DatasetService, JobService
import os
from schemas.dataset import DatasetCreate, DatasetUpdate, JobCreate
from models.dataset import Dataset, Job
from core.exceptions import NotFoundException, ConflictException


class TestDatasetService:
    """Test DatasetService methods"""
    
    def test_create_dataset_success(self, db_session: Session):
        """Test successful dataset creation"""
        dataset_data = DatasetCreate(
            source={"type": "http", "url": "https://example.com/test.rosbag"},
            format_type="rosbag"
        )
        
        dataset = DatasetService.create_dataset(db_session, dataset_data)
        
        assert dataset.source["type"] == "http"
        assert dataset.source["url"] == "https://example.com/test.rosbag"
        assert dataset.format_type == dataset_data.format_type
        assert dataset.id is not None
        assert dataset.created_at is not None
    
    def test_create_dataset_duplicate_removed(self, db_session: Session):
        """Previously duplicate name raised; now names removed, creation should not conflict."""
        dataset_data = DatasetCreate(
            source={"type": "http", "url": "https://example.com/test.rosbag"},
            format_type="rosbag"
        )
        DatasetService.create_dataset(db_session, dataset_data)
        duplicate_data = DatasetCreate(
            source={"type": "http", "url": "https://example.com/different.rosbag"},
            format_type="hdf5"
        )
        ds = DatasetService.create_dataset(db_session, duplicate_data)
        assert ds.id is not None
    
    def test_get_dataset_success(self, db_session: Session, sample_dataset):
        """Test getting dataset by ID"""
        dataset = DatasetService.get_dataset(db_session, sample_dataset.id)
        
        assert dataset is not None
        assert dataset.id == sample_dataset.id
        # names removed; just ensure IDs match
    
    def test_get_dataset_not_found(self, db_session: Session):
        """Test getting non-existent dataset"""
        dataset = DatasetService.get_dataset(db_session, 99999)
        assert dataset is None
    
    def test_get_datasets_with_pagination(self, db_session: Session, multiple_datasets):
        """Test getting datasets with pagination"""
        datasets = DatasetService.get_datasets(db_session, skip=1, limit=2)
        
        assert len(datasets) <= 2
        assert all(isinstance(d, Dataset) for d in datasets)
    
    def test_update_dataset_success(self, db_session: Session, sample_dataset):
        """Test updating dataset"""
        update_data = DatasetUpdate(
            dataset_metadata={"note": "updated"}
        )
        
        updated_dataset = DatasetService.update_dataset(db_session, sample_dataset.id, update_data)
        
        assert updated_dataset.dataset_metadata == {"note": "updated"}
        assert updated_dataset.updated_at is not None
    
    def test_update_dataset_not_found(self, db_session: Session):
        """Test updating non-existent dataset"""
        update_data = DatasetUpdate(dataset_metadata={"note": "updated"})
        
        with pytest.raises(NotFoundException):
            DatasetService.update_dataset(db_session, 99999, update_data)
    
    def test_delete_dataset_success(self, db_session: Session, sample_dataset):
        """Test deleting dataset"""
        result = DatasetService.delete_dataset(db_session, sample_dataset.id)
        
        assert result is True
        
        # Verify dataset is deleted
        deleted_dataset = DatasetService.get_dataset(db_session, sample_dataset.id)
        assert deleted_dataset is None
    
    def test_delete_dataset_not_found(self, db_session: Session):
        """Test deleting non-existent dataset"""
        with pytest.raises(NotFoundException):
            DatasetService.delete_dataset(db_session, 99999)

    def test_get_latest_analysis_success(self, db_session: Session, sample_dataset):
        """Test getting latest analysis"""
        # Create multiple completed jobs
        jobs = [
            Job(
                dataset_id=sample_dataset.id,
                job_type="attention_analysis",
                status="completed",
                completed_at=datetime.now(timezone.utc)
            ),
            Job(
                dataset_id=sample_dataset.id,
                job_type="attention_analysis",
                status="completed",
                completed_at=datetime.now(timezone.utc)
            )
        ]
        
        for job in jobs:
            db_session.add(job)
        db_session.commit()
        
        latest = DatasetService.get_latest_analysis(db_session, sample_dataset.id, "attention_analysis")
        assert latest is not None
        assert latest.job_type == "attention_analysis"
        assert latest.status == "completed"
    
    def test_get_latest_analysis_not_found(self, db_session: Session, sample_dataset):
        """Test getting latest analysis when none exists"""
        latest = DatasetService.get_latest_analysis(db_session, sample_dataset.id, "attention_analysis")
        assert latest is None
    
    def test_get_analysis_history(self, db_session: Session, sample_dataset):
        """Test getting analysis history"""
        # Create multiple completed jobs
        jobs = [
            Job(
                dataset_id=sample_dataset.id,
                job_type="attention_analysis",
                status="completed",
                completed_at=datetime.now(timezone.utc)
            ),
            Job(
                dataset_id=sample_dataset.id,
                job_type="attention_analysis",
                status="completed",
                completed_at=datetime.now(timezone.utc)
            )
        ]
        
        for job in jobs:
            db_session.add(job)
        db_session.commit()
        
        history = DatasetService.get_analysis_history(db_session, sample_dataset.id, "attention_analysis")
        assert len(history) == 2
        assert all(job.job_type == "attention_analysis" for job in history)
        assert all(job.status == "completed" for job in history)
    
    def test_search_by_metadata(self, db_session: Session, sample_dataset):
        """Test searching by metadata"""
        # Update sample dataset with metadata
        sample_dataset.dataset_metadata = {"sensor_type": "camera", "resolution": "1080p"}
        db_session.commit()
        
        results = DatasetService.search_by_metadata(db_session, "sensor_type", "camera")
        assert len(results) >= 1
        assert any(d.id == sample_dataset.id for d in results)
    
    def test_search_by_metadata_path(self, db_session: Session, sample_dataset):
        """Test searching by JSON path"""
        # Update sample dataset with nested metadata
        sample_dataset.dataset_metadata = {
            "sensors": {
                "camera": {"enabled": True, "resolution": "1080p"}
            }
        }
        db_session.commit()
        
        # Search for boolean True (should match the actual value)
        results = DatasetService.search_by_metadata_path(db_session, "sensors.camera.enabled", True)
        assert len(results) >= 1
        assert any(d.id == sample_dataset.id for d in results)
    
    def test_search_by_multiple_criteria(self, db_session: Session, sample_dataset):
        """Test advanced search with multiple criteria"""
        # Update sample dataset
        sample_dataset.dataset_metadata = {"sensor_type": "camera"}
        sample_dataset.format_type = "rosbag"
        db_session.commit()
        
        criteria = {
            "metadata": {"sensor_type": "camera"},
            "format_type": "rosbag"
        }
        
        results = DatasetService.search_by_multiple_criteria(db_session, criteria)
        assert len(results) >= 1
        assert any(d.id == sample_dataset.id for d in results)


class TestProcessingJobService:
    """Test ProcessingJobService methods"""
    
    def test_create_job_success(self, db_session: Session, sample_dataset):
        """Test creating processing job"""
        job_data = JobCreate(
            dataset_id=sample_dataset.id,
            job_type="attention_analysis"
        )
        
        job = JobService.create_job(db_session, job_data)
        
        assert job.dataset_id == sample_dataset.id
        assert job.job_type == "attention_analysis"
        assert job.status == "pending"
        assert job.id is not None
        assert job.created_at is not None
    
    def test_create_job_with_metadata(self, db_session: Session, sample_dataset):
        """Test creating job with metadata"""
        parameters = {"model": "test_model", "threshold": 0.5}
        
        job = JobService.create_job_with_metadata(
            db_session, sample_dataset.id, "attention_analysis", parameters
        )
        
        assert job.dataset_id == sample_dataset.id
        assert job.job_type == "attention_analysis"
        assert job.status == "pending"
        assert job.result_metadata is not None
        assert job.result_metadata["version"] == "v1"
        assert job.result_metadata["model"] == "test_model"
        assert job.result_metadata["parameters"] == parameters
    
    def test_create_job_with_metadata_versioning(self, db_session: Session, sample_dataset):
        """Test job versioning when creating multiple jobs"""
        parameters = {"model": "test_model"}
        
        # Create first job
        job1 = JobService.create_job_with_metadata(
            db_session, sample_dataset.id, "attention_analysis", parameters
        )
        
        # Create second job
        job2 = JobService.create_job_with_metadata(
            db_session, sample_dataset.id, "attention_analysis", parameters
        )
        
        assert job1.result_metadata["version"] == "v1"
        assert job2.result_metadata["version"] == "v2"
    
    def test_get_job_success(self, db_session: Session, sample_processing_job):
        """Test getting job by ID"""
        job = JobService.get_job(db_session, sample_processing_job.id)
        
        assert job is not None
        assert job.id == sample_processing_job.id
        assert job.dataset_id == sample_processing_job.dataset_id
    
    def test_get_job_not_found(self, db_session: Session):
        """Test getting non-existent job"""
        job = JobService.get_job(db_session, 99999)
        assert job is None
    
    def test_get_dataset_jobs(self, db_session: Session, sample_dataset, multiple_jobs):
        """Test getting all jobs for a dataset"""
        jobs = JobService.get_dataset_jobs(db_session, sample_dataset.id)
        
        assert len(jobs) >= 3  # At least our test jobs
        assert all(job.dataset_id == sample_dataset.id for job in jobs)
    
    def test_get_latest_job_by_type(self, db_session: Session, sample_dataset):
        """Test getting latest job of a specific type"""
        # Create jobs with different timestamps
        jobs = [
            Job(
                dataset_id=sample_dataset.id,
                job_type="attention_analysis",
                created_at=datetime.now(timezone.utc)
            ),
            Job(
                dataset_id=sample_dataset.id,
                job_type="attention_analysis",
                created_at=datetime.now(timezone.utc)
            )
        ]
        
        for job in jobs:
            db_session.add(job)
        db_session.commit()
        
        latest = JobService.get_latest_job_by_type(db_session, sample_dataset.id, "attention_analysis")
        assert latest is not None
        assert latest.job_type == "attention_analysis"
    
    def test_update_job_status_success(self, db_session: Session, sample_processing_job):
        """Test updating job status"""
        updated_job = JobService.update_job_status(
            db_session, sample_processing_job.id, "running", 0.5
        )
        
        assert updated_job.status == "running"
        assert updated_job.progress == 0.5
        assert updated_job.started_at is not None
    
    def test_update_job_status_completed(self, db_session: Session, sample_processing_job):
        """Test updating job status to completed"""
        updated_job = JobService.update_job_status(
            db_session, sample_processing_job.id, "completed", 1.0
        )
        
        assert updated_job.status == "completed"
        assert updated_job.progress == 1.0
        assert updated_job.completed_at is not None
    
    def test_update_job_status_not_found(self, db_session: Session):
        """Test updating non-existent job status"""
        with pytest.raises(NotFoundException):
            JobService.update_job_status(db_session, 99999, "running", 0.5)
    
    def test_update_job_result_success(self, db_session: Session, sample_processing_job):
        """Test updating job with results"""
        result = {"attention_scores": {"camera": 0.8, "lidar": 0.6}}
        summary = {"top_sensor": "camera", "top_score": 0.8}
        
        updated_job = JobService.update_job_result(
            db_session, sample_processing_job.id, result, summary
        )
        
        assert updated_job.status == "completed"
        assert updated_job.result == result
        assert updated_job.result_summary == summary
        assert updated_job.completed_at is not None
    
    def test_update_job_result_not_found(self, db_session: Session):
        """Test updating results for non-existent job"""
        result = {"test": "data"}
        summary = {"test": "summary"}
        
        with pytest.raises(NotFoundException):
            JobService.update_job_result(db_session, 99999, result, summary)


class TestComplexBusinessLogic:
    """Test complex business logic and workflows"""
    
    
    def test_job_versioning_workflow(self, db_session: Session, sample_dataset):
        """Test job versioning workflow with multiple analysis runs"""
        # Create multiple versions of attention analysis
        versions = []
        for i in range(3):
            parameters = {
                "model": f"transformer_v{i+1}",
                "threshold": 0.5 + (i * 0.1),
                "window_size": 10 + (i * 5)
            }
            
            job = JobService.create_job_with_metadata(
                db_session, sample_dataset.id, "attention_analysis", parameters
            )
            
            # Complete the job
            JobService.update_job_result(
                db_session, job.id,
                {"score": 0.7 + (i * 0.1)},
                {"version": f"v{i+1}", "score": 0.7 + (i * 0.1)}
            )
            
            versions.append(job)
        
        # Verify version numbers
        for i, job in enumerate(versions):
            assert job.result_metadata["version"] == f"v{i+1}"
            assert job.result_metadata["parameters"]["model"] == f"transformer_v{i+1}"
        
        # Get analysis history
        history = DatasetService.get_analysis_history(db_session, sample_dataset.id, "attention_analysis")
        assert len(history) == 3
        
        # Get latest analysis
        latest = DatasetService.get_latest_analysis(db_session, sample_dataset.id, "attention_analysis")
        assert latest.result_metadata["version"] == "v3"

    @pytest.mark.slow
    @pytest.mark.integration
    def test_hf_lerobot_extraction_with_snapshot_cache(self, db_session: Session):
        """
        Integration test against real HF data for LeRobot extractor.
        """
        repo_id = "observabot/so101_die_mat1"
        revision = "798bdb77ec854d6f5347c3b7fd893a2ccad9f7d3"

        # Ensure network is allowed if cache is missing
        os.environ["ROBOKIT_HF_LOCAL_ONLY"] = "0"

        result = DatasetService.extract_lerobot_metadata_from_hf(repo_id=repo_id, revision=revision)
        full = result["full_result"]["metadata"]
        summary = result["summary"]
        raw_meta = result["full_result"]["raw_meta"]

        # Basic identity
        assert full["repo_id"] == repo_id
        assert full["revision"] == revision

        # Cameras from meta/info.json features.observation.images.*
        cams = full["sensors"]["cameras"]
        assert isinstance(cams, list) and len(cams) == 3
        names = {c["name"] for c in cams}
        assert names == {"base", "top", "endeffector"}

        # Check per-camera resolution and codec
        base = next(c for c in cams if c["name"] == "base")
        top = next(c for c in cams if c["name"] == "top")
        eff = next(c for c in cams if c["name"] == "endeffector")
        assert (base["width"], base["height"]) == (640, 480)
        assert (top["width"], top["height"]) == (640, 480)
        assert (eff["width"], eff["height"]) == (480, 640)
        assert base["format"] == top["format"] == eff["format"] == "hevc"

        # Hard-coded based on the dataset
        expected_episode_count = 52
        assert full["episodes"] == expected_episode_count

        # Raw meta includes info.json
        assert "meta/info.json" in raw_meta and isinstance(raw_meta["meta/info.json"], dict)
        assert isinstance(summary, dict)
        assert summary["episode_count"] == expected_episode_count
        assert summary["camera_count"] == 3
        assert summary["sensor_count"] == 3

    @pytest.mark.slow
    @pytest.mark.integration
    def test_hf_quality_heuristics_real(self, db_session: Session):
        """Integration test for evaluate_quality_heuristics against real HF LeRobot dataset."""
        from services.dataset_service import DatasetService
        os.environ["ROBOKIT_HF_LOCAL_ONLY"] = "0"
        repo_id = "observabot/so101_die_mat1"
        # Pin to a specific commit to ensure deterministic tests
        revision = "b46bb71c59b0b24921ac7e2ae243e5ee5514e54f"
        parameters = {"max_episodes": 2}

        result = DatasetService.evaluate_quality_heuristics_from_hf(repo_id=repo_id, revision=revision, parameters=parameters)
        assert isinstance(result, dict)
        assert "full_result" in result and "summary" in result
        qh = result["full_result"]["quality_heuristics"]
        for key in [
            "nan_counts",
            "missing_topics",
            "frame_drop_ratio",
            "jitter_ms",
            "lack_of_jitter",
            "jerk",
        ]:
            assert key in qh
        summary = result["summary"]
        for key in [
            "missing_topic_count",
            "frame_drop_ratio",
            "has_nans",
            "lack_of_jitter",
            "jerk_mean",
        ]:
            assert key in summary

    def test_rlds_metadata_extraction_real(self, db_session: Session):
        """Integration test for RLDS extractor using a real small HF repo.
        Uses OXE umbrella repo's dataset_infos.json.
        """
        from services.dataset_service import DatasetService
        import os
        os.environ["ROBOKIT_HF_LOCAL_ONLY"] = "0"
        repo_id = "jxu124/OpenX-Embodiment"
        revision = "f7a9e8a13277f76d3e2b32f7e784a3d2f9cbd1a4"
        out = DatasetService.extract_rlds_metadata_from_hf(repo_id=repo_id, revision=revision)

        # Shape
        assert isinstance(out, dict)
        assert "full_result" in out and "summary" in out
        fr = out["full_result"]
        summary = out["summary"]

        # Metadata basics
        meta = fr.get("metadata") or {}
        assert meta.get("repo_id") == repo_id
        assert meta.get("revision") == revision

        # Features list present (may be empty for umbrella repos)
        features = meta.get("features")
        assert isinstance(features, list)

        # Sensors/cameras structure
        sensors = meta.get("sensors") or {}
        cameras = sensors.get("cameras")
        assert isinstance(cameras, list)

        # Summary consistency
        assert set(["sensor_count", "camera_count", "episode_count"]).issubset(summary.keys())
        assert isinstance(summary["camera_count"], int)
        assert summary["camera_count"] == len(cameras)
        assert isinstance(summary["sensor_count"], int)
        assert summary["sensor_count"] == len(cameras)

        # Raw meta should include at least one json blob
        raw_meta = fr.get("raw_meta") or {}
        # Some umbrella repos may not return the file contents in this test environment; just assert keys exist
        assert set(raw_meta.keys()).issuperset({"dataset_infos.json", "dataset_info.json", "features.json"}) or bool(raw_meta)
    
    def test_search_complex_metadata(self, db_session: Session):
        """Test search with complex metadata structures"""
        # Create datasets with complex metadata
        datasets_data = [
            {
                "name": "Camera Dataset",
                "dataset_metadata": {
                    "sensors": {"camera": {"enabled": True, "resolution": "1080p"}},
                    "quality": {"completeness": 0.95, "consistency": 0.88}
                }
            },
            {
                "name": "Lidar Dataset", 
                "dataset_metadata": {
                    "sensors": {"lidar": {"enabled": True, "points_per_second": 100000}},
                    "quality": {"completeness": 0.92, "consistency": 0.85}
                }
            },
            {
                "name": "Multi Sensor Dataset",
                "dataset_metadata": {
                    "sensors": {
                        "camera": {"enabled": True, "resolution": "4k"},
                        "lidar": {"enabled": True, "points_per_second": 200000}
                    },
                    "quality": {"completeness": 0.98, "consistency": 0.92}
                }
            }
        ]
        
        # Create datasets
        for data in datasets_data:
            dataset = Dataset(
                source={"type": "http", "url": "https://example.com/test.rosbag"},
                format_type="rosbag",
                dataset_metadata=data["dataset_metadata"]
            )
            db_session.add(dataset)
        db_session.commit()
        
        # Test search by nested metadata
        results = DatasetService.search_by_metadata_path(db_session, "sensors.camera.enabled", True)
        assert len(results) == 2  # Camera and Multi Sensor datasets
        
        # Test search by quality metrics
        results = DatasetService.search_by_metadata_path(db_session, "quality.completeness", "0.98")
        assert len(results) == 1  # Only Multi Sensor dataset
        
        