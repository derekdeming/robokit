import pytest
from unittest.mock import Mock, patch
from datetime import datetime, timedelta

from api.v1.endpoints.datasets import rerun_visualization_background
from schemas.dataset import RerunVisualizationParams, JobType, JobCreate
from services.rerun_service import RerunBuildResult, RerunStreamResult


class TestRerunVisualizationEndpoints:
    """Test rerun visualization background processing."""
    
    @pytest.mark.asyncio
    @patch('api.v1.endpoints.datasets.get_db_context')
    @patch('api.v1.endpoints.datasets.RerunService')
    @patch('api.v1.endpoints.datasets.RerunVisualizationParams.model_validate')
    async def test_rerun_visualization_background_file_mode(self, mock_validate, mock_rerun_service, mock_db_context):
        """Test file mode RRD generation."""
        mock_params = Mock()
        mock_params.mode = "file"
        mock_validate.return_value = mock_params
        
        mock_db = Mock()
        mock_db_context.return_value.__enter__.return_value = mock_db
        
        mock_service = Mock()
        mock_rerun_service.return_value = mock_service
        
        build_result = RerunBuildResult(
            rrd_path="/fake/path.rrd",
            rrd_url="http://test.com/file.rrd",
            blueprint_url="http://test.com/blueprint.rbl",
            frames_written=1500,
            sdk_version="0.24.1",
            viewer_version="0.24.1"
        )
        mock_service.build_recording.return_value = build_result
        
        result = await rerun_visualization_background(123, {"mode": "file"}, 456)
        
        assert result["full_result"]["rrd_url"] == "http://test.com/file.rrd"
        assert result["full_result"]["frames_written"] == 1500
        assert result["summary"]["mode"] == "file"
        assert result["summary"]["frames_written"] == 1500
        mock_service.build_recording.assert_called_once_with(123, mock_params, 456)
    
    @pytest.mark.asyncio
    @patch('api.v1.endpoints.datasets.get_db_context')
    @patch('api.v1.endpoints.datasets.RerunService')
    @patch('api.v1.endpoints.datasets.RerunVisualizationParams.model_validate')
    async def test_rerun_visualization_background_stream_mode(self, mock_validate, mock_rerun_service, mock_db_context):
        """Test streaming mode visualization."""
        mock_params = Mock()
        mock_params.mode = "stream"
        mock_validate.return_value = mock_params
        
        mock_db = Mock()
        mock_db_context.return_value.__enter__.return_value = mock_db
        
        mock_service = Mock()
        mock_rerun_service.return_value = mock_service
        
        expires_at = datetime.now() + timedelta(seconds=1800)
        stream_result = RerunStreamResult(
            viewer_url="rerun+http://localhost:9876/proxy",
            frames_sent=250,
            expires_at=expires_at,
            sdk_version="0.24.1",
            viewer_version="0.24.1"
        )
        mock_service.stream_recording.return_value = stream_result
        
        result = await rerun_visualization_background(123, {"mode": "stream"}, 456)
        
        assert result["full_result"]["viewer_url"] == "rerun+http://localhost:9876/proxy"
        assert result["full_result"]["frames_sent"] == 250
        assert result["summary"]["mode"] == "stream"
        assert result["summary"]["frames_sent"] == 250
        mock_service.stream_recording.assert_called_once_with(123, mock_params)
    
    @pytest.mark.asyncio
    @patch('api.v1.endpoints.datasets.RerunVisualizationParams.model_validate')
    async def test_rerun_visualization_background_invalid_params(self, mock_validate):
        """Test parameter validation."""
        mock_validate.side_effect = ValueError("Invalid stride value")
        
        with pytest.raises(ValueError, match="Invalid parameters: Invalid stride value"):
            await rerun_visualization_background(123, {"stride": -1}, 456)
    
    @pytest.mark.asyncio
    @patch('api.v1.endpoints.datasets.get_db_context')
    @patch('api.v1.endpoints.datasets.RerunService')
    @patch('api.v1.endpoints.datasets.RerunVisualizationParams.model_validate')
    async def test_rerun_visualization_background_service_error(self, mock_validate, mock_rerun_service, mock_db_context):
        """Test service error handling."""
        mock_params = Mock()
        mock_params.mode = "file"
        mock_validate.return_value = mock_params
        
        mock_db = Mock()
        mock_db_context.return_value.__enter__.return_value = mock_db
        
        mock_service = Mock()
        mock_rerun_service.return_value = mock_service
        mock_service.build_recording.side_effect = RuntimeError("Failed to create visualization")
        
        with pytest.raises(RuntimeError, match="Failed to create visualization"):
            await rerun_visualization_background(123, {"mode": "file"}, 456)


class TestRerunEndpointIntegration:
    """Integration tests for rerun visualization endpoints."""
    
    @patch('api.v1.endpoints.datasets.BackgroundTasks.add_task')
    def test_create_rerun_visualization_job(self, mock_add_task, test_app, test_db, sample_hf_dataset):
        """Test job creation via API."""
        dataset_id = sample_hf_dataset.id
        
        job_data = {
            "dataset_id": dataset_id,
            "job_type": "rerun_visualization"
        }
        
        response = test_app.post(f"/api/v1/datasets/{dataset_id}/jobs", json=job_data)
        
        assert response.status_code == 200
        job = response.json()
        assert job["job_type"] == "rerun_visualization"
        assert job["status"] == "pending"
        assert job["dataset_id"] == dataset_id
        
        mock_add_task.assert_called_once()
        args = mock_add_task.call_args[0]
        assert len(args) >= 1
        
    def test_run_rerun_analysis_with_params(self, test_app, test_db, sample_hf_dataset):
        """Test analysis with custom parameters."""
        dataset_id = sample_hf_dataset.id
        
        params = {
            "mode": "file",
            "stride": 3,
            "max_frames": 2000,
            "jpeg_quality": 85,
            "timeline": "frame",
            "episode_index": 1,
            "blueprint": "quality_triage"
        }
        
        with patch('api.v1.endpoints.datasets.BackgroundTasks.add_task') as mock_add_task:
            response = test_app.post(
                f"/api/v1/datasets/{dataset_id}/analyses/rerun_visualization",
                json=params
            )
        
        assert response.status_code == 200
        job = response.json()
        assert job["job_type"] == "rerun_visualization"
        assert job["status"] == "pending"
        
        mock_add_task.assert_called_once()
        
    def test_run_rerun_analysis_invalid_params(self, test_app, test_db, sample_hf_dataset):
        """Test parameter validation."""
        dataset_id = sample_hf_dataset.id
        
        params = {
            "mode": "file",
            "stride": 0,
            "max_frames": 1000
        }
        
        response = test_app.post(
            f"/api/v1/datasets/{dataset_id}/analyses/rerun_visualization",
            json=params
        )
        
        assert response.status_code == 422
        
    def test_get_rerun_analysis_result(self, test_app, test_db, sample_hf_dataset, sample_completed_job):
        """Test retrieving completed analysis results."""
        dataset_id = sample_hf_dataset.id
        
        from services.dataset_service import JobService
        
        job_data = JobCreate(dataset_id=dataset_id, job_type=JobType.RERUN_VISUALIZATION)
        job = JobService.create_job(test_db, job_data)
        
        result_data = {
            "rrd_url": "http://localhost:8000/api/v1/datasets/123/artifacts/456/recording.rrd",
            "blueprint_url": "http://localhost:8000/api/v1/datasets/123/artifacts/456/blueprint.rbl",
            "frames_written": 1500,
            "sdk_version": "0.24.1",
            "viewer_version": "0.24.1"
        }
        
        summary_data = {
            "mode": "file",
            "frames_written": 1500,
            "episode_index": 0,
            "success": True
        }
        
        JobService.update_job_result(test_db, job.id, result_data, summary_data)
        
        response = test_app.get(f"/api/v1/datasets/{dataset_id}/analyses/rerun_visualization/latest")
        
        assert response.status_code == 200
        data = response.json()
        assert data["full_result"]["rrd_url"] == result_data["rrd_url"]
        assert data["full_result"]["frames_written"] == 1500
        assert data["summary"]["success"] is True
        
    def test_get_rerun_analysis_history(self, test_app, test_db, sample_hf_dataset):
        """Test retrieving analysis history."""
        dataset_id = sample_hf_dataset.id
        
        from services.dataset_service import JobService
        
        for i in range(3):
            job_data = JobCreate(dataset_id=dataset_id, job_type=JobType.RERUN_VISUALIZATION)
            job = JobService.create_job(test_db, job_data)
            summary = {
                "mode": "file" if i % 2 == 0 else "stream",
                "frames_written": 1000 + i * 500,
                "episode_index": i,
                "success": True
            }
            JobService.update_job_result(test_db, job.id, {}, summary)
        
        response = test_app.get(f"/api/v1/datasets/{dataset_id}/analyses/rerun_visualization")
        
        assert response.status_code == 200
        history = response.json()
        assert len(history["versions"]) == 3
        
        versions = sorted(history["versions"], key=lambda x: x["summary"]["episode_index"])
        
        for i, entry in enumerate(versions):
            assert entry["summary"]["episode_index"] == i
            assert entry["summary"]["frames_written"] == 1000 + i * 500
        
    def test_rerun_job_parameter_schemas(self, test_app):
        """Test parameter schema exposure."""
        response = test_app.get("/api/v1/datasets/job-parameter-schemas")
        
        assert response.status_code == 200
        schemas = response.json()
        assert "rerun_visualization" in schemas
        
        rerun_schema = schemas["rerun_visualization"]
        properties = rerun_schema["properties"]
        
        expected_properties = ["mode", "stride", "max_frames", "episode_index", 
                             "jpeg_quality", "timeline", "include_streams"]
        for prop in expected_properties:
            assert prop in properties
        
        assert properties["mode"]["enum"] == ["file", "stream"]
        assert properties["timeline"]["enum"] == ["time", "frame"]
        
    @patch('api.v1.endpoints.datasets.run_analysis_background')
    def test_rerun_analysis_background_task_scheduling(self, mock_run_bg, test_app, test_db, sample_hf_dataset):
        """Test background task scheduling."""
        dataset_id = sample_hf_dataset.id
        
        params = {
            "mode": "stream",
            "max_frames": 3000,
            "streaming_ttl_seconds": 3600
        }
        
        response = test_app.post(
            f"/api/v1/datasets/{dataset_id}/analyses/rerun_visualization",
            json=params
        )
        
        assert response.status_code == 200
        job = response.json()
        
        assert job["job_type"] == "rerun_visualization"
        assert job["status"] == "pending"


class TestRerunJobStatusAndPolling:
    """Test job status tracking and polling."""
    
    def test_job_progress_updates(self, test_app, test_db, sample_hf_dataset):
        """Test job progress updates."""
        dataset_id = sample_hf_dataset.id
        
        from services.dataset_service import JobService
        
        job_data = JobCreate(dataset_id=dataset_id, job_type=JobType.RERUN_VISUALIZATION)
        job = JobService.create_job(test_db, job_data)
        
        JobService.update_job_status(test_db, job.id, "running", 0.25)
        JobService.update_job_status(test_db, job.id, "running", 0.50)
        JobService.update_job_status(test_db, job.id, "running", 0.75)
        
        response = test_app.get(f"/api/v1/datasets/{dataset_id}/jobs/{job.id}")
        
        assert response.status_code == 200
        job_data = response.json()
        assert job_data["status"] == "running"
        assert job_data["progress"] == 0.75
        
    def test_failed_rerun_job_error_handling(self, test_app, test_db, sample_hf_dataset):
        """Test error handling for failed jobs."""
        dataset_id = sample_hf_dataset.id
        
        from services.dataset_service import JobService
        
        job_data = JobCreate(dataset_id=dataset_id, job_type=JobType.RERUN_VISUALIZATION)
        job = JobService.create_job(test_db, job_data)
        
        error_message = "Failed to load video files for episode 5"
        JobService.update_job_status(test_db, job.id, "failed", 0.0, error_message=error_message)
        
        response = test_app.get(f"/api/v1/datasets/{dataset_id}/jobs/{job.id}")
        
        assert response.status_code == 200
        job_data = response.json()
        assert job_data["status"] == "failed"
        assert job_data["error_message"] == error_message
        assert job_data["progress"] == 0.0
        
    def test_dataset_status_with_rerun_jobs(self, test_app, test_db, sample_hf_dataset):
        """Test dataset status includes rerun jobs."""
        dataset_id = sample_hf_dataset.id
        
        from services.dataset_service import JobService
        
        job_data = JobCreate(dataset_id=dataset_id, job_type=JobType.RERUN_VISUALIZATION)
        job = JobService.create_job(test_db, job_data)
        JobService.update_job_status(test_db, job.id, "running", 0.6)
        
        response = test_app.get(f"/api/v1/datasets/{dataset_id}/status")
        
        assert response.status_code == 200
        status = response.json()
        
        latest_jobs = status["latest_jobs"]
        assert "rerun_visualization" in latest_jobs
        rerun_job = latest_jobs["rerun_visualization"]
        
        assert rerun_job is not None
        assert rerun_job["status"] == "running"
        assert rerun_job["progress"] == 0.6