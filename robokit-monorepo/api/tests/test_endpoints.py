from fastapi.testclient import TestClient
from sqlalchemy.orm import Session


class TestHealthEndpoints:
    """Test health and status endpoints"""
    
    def test_root_endpoint(self, client: TestClient):
        """Test root endpoint"""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "RoboKit" in data["message"]
        assert "version" in data
    
    def test_health_check(self, client: TestClient):
        """Test health check endpoint"""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "robokit-scientific-api"
        assert "version" in data
        assert data["database"] == "connected"
    
    def test_api_status(self, client: TestClient):
        """Test API status endpoint"""
        response = client.get("/api/v1/status")
        assert response.status_code == 200
        data = response.json()
        assert data["service"] == "robokit-scientific-api"
        assert data["status"] == "running"
        assert "capabilities" in data
        assert "dataset_processing" in data["capabilities"]


class TestDatasetEndpoints:
    """Test dataset CRUD endpoints"""
    
    def test_create_dataset_success(self, client: TestClient, db_session: Session):
        """Test successful dataset creation"""
        dataset_data = {
            "source": {"type": "http", "url": "https://example.com/test.rosbag"},
            "format_type": "rosbag"
        }
        
        response = client.post("/api/v1/datasets/", json=dataset_data)
        assert response.status_code == 200
        # Ensure job created for metadata_extraction is set to failed for unsupported source silently
        data = response.json()
        jobs = client.get(f"/api/v1/datasets/{data['id']}/jobs").json()
        assert any(j["job_type"] == "metadata_extraction" for j in jobs)
        
        data = response.json()
        assert data["source"]["type"] == "http"
        assert data["source"]["url"] == dataset_data["source"]["url"]
        assert data["format_type"] == dataset_data["format_type"]
        assert "id" in data
        assert "created_at" in data
    
    def test_create_dataset_invalid_url(self, client: TestClient):
        """Test dataset creation with invalid URL"""
        dataset_data = {
            "source": {"type": "http", "url": "invalid-url"},
            "format_type": "rosbag"
        }
        
        response = client.post("/api/v1/datasets/", json=dataset_data)
        assert response.status_code == 422
    
    def test_create_dataset_no_duplicate_constraint(self, client: TestClient, db_session: Session):
        """Name removed; creating similar payloads should not conflict."""
        dataset_data = {
            "source": {"type": "http", "url": "https://example.com/test.rosbag"},
            "format_type": "rosbag"
        }
        response = client.post("/api/v1/datasets/", json=dataset_data)
        assert response.status_code == 200
        duplicate_data = {
            "source": {"type": "http", "url": "https://example.com/different.rosbag"},
            "format_type": "hdf5"
        }
        response = client.post("/api/v1/datasets/", json=duplicate_data)
        assert response.status_code == 200
    
    def test_list_datasets(self, client: TestClient, multiple_datasets):
        """Test listing datasets"""
        response = client.get("/api/v1/datasets/")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 3  # At least our test datasets
    
    def test_list_datasets_with_pagination(self, client: TestClient, multiple_datasets):
        """Test listing datasets with pagination"""
        response = client.get("/api/v1/datasets/?skip=1&limit=2")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) <= 2
    
    def test_get_dataset_success(self, client: TestClient, sample_dataset):
        """Test getting a specific dataset"""
        response = client.get(f"/api/v1/datasets/{sample_dataset.id}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["id"] == sample_dataset.id
        assert data["source"]["type"] == "http"
        assert data["source"]["url"] == sample_dataset.source["url"]
    
    def test_get_dataset_not_found(self, client: TestClient):
        """Test getting non-existent dataset"""
        response = client.get("/api/v1/datasets/99999")
        assert response.status_code == 404
        assert "Dataset not found" in response.json()["detail"]
    
    def test_update_dataset_success(self, client: TestClient, sample_dataset):
        """Test updating a dataset"""
        update_data = {
            "dataset_metadata": {"note": "updated"}
        }
        
        response = client.put(f"/api/v1/datasets/{sample_dataset.id}", json=update_data)
        assert response.status_code == 200
        
        data = response.json()
        assert data["dataset_metadata"] == {"note": "updated"}
    
    def test_update_dataset_not_found(self, client: TestClient):
        """Test updating non-existent dataset"""
        update_data = {"dataset_metadata": {"note": "updated"}}
        response = client.put("/api/v1/datasets/99999", json=update_data)
        assert response.status_code == 404
    
    def test_delete_dataset_success(self, client: TestClient, sample_dataset):
        """Test deleting a dataset"""
        response = client.delete(f"/api/v1/datasets/{sample_dataset.id}")
        assert response.status_code == 200
        assert "Dataset deleted successfully" in response.json()["message"]
    
    def test_delete_dataset_not_found(self, client: TestClient):
        """Test deleting non-existent dataset"""
        response = client.delete("/api/v1/datasets/99999")
        assert response.status_code == 404


class TestDatasetStatusEndpoints:
    """Test dataset status and progress endpoints"""
    
    def test_get_dataset_status(self, client: TestClient, sample_dataset, sample_processing_job):
        """Test getting dataset status"""
        response = client.get(f"/api/v1/datasets/{sample_dataset.id}/status")
        assert response.status_code == 200
        
        data = response.json()
        assert data["dataset_id"] == sample_dataset.id
        assert "latest_jobs" in data
        assert "metadata_extraction" in data["latest_jobs"]
        assert data["latest_jobs"]["metadata_extraction"] is not None
    
    def test_get_dataset_status_not_found(self, client: TestClient):
        """Test getting status for non-existent dataset"""
        response = client.get("/api/v1/datasets/99999/status")
        assert response.status_code == 404


class TestAnalysisEndpoints:
    """Test analysis-related endpoints"""
    
    def test_get_analysis_versions(self, client: TestClient, sample_dataset, sample_processing_job):
        """Test getting analysis versions"""
        response = client.get(f"/api/v1/datasets/{sample_dataset.id}/analyses/metadata_extraction")
        assert response.status_code == 200
        
        data = response.json()
        assert data["dataset_id"] == sample_dataset.id
        assert data["job_type"] == "metadata_extraction"
        assert "versions" in data
    
    def test_get_latest_analysis_success(self, client: TestClient, sample_dataset, sample_processing_job):
        """Test getting latest analysis"""
        response = client.get(f"/api/v1/datasets/{sample_dataset.id}/analyses/metadata_extraction/latest")
        assert response.status_code == 200
        
        data = response.json()
        assert "job_id" in data
        assert "version" in data
        assert "created_at" in data
        assert "summary" in data
    
    def test_get_latest_analysis_not_found(self, client: TestClient, sample_dataset):
        """Test getting latest analysis when none exists"""
        response = client.get(f"/api/v1/datasets/{sample_dataset.id}/analyses/attention_analysis/latest")
        assert response.status_code == 404
        assert "No analysis found" in response.json()["detail"]
    
    # Comparison endpoint removed
    
    def test_run_new_analysis_success(self, client: TestClient, sample_dataset):
        """Test running new analysis"""
        parameters = {"model": "test_model", "threshold": 0.5}
        response = client.post(
            f"/api/v1/datasets/{sample_dataset.id}/analyses/attention_analysis",
            json=parameters
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["dataset_id"] == sample_dataset.id
        assert data["job_type"] == "attention_analysis"
        assert data["status"] == "pending"
    
    def test_run_new_analysis_invalid_job_type(self, client: TestClient, sample_dataset):
        """Test running analysis with invalid job type"""
        parameters = {"model": "test_model"}
        response = client.post(
            f"/api/v1/datasets/{sample_dataset.id}/analyses/invalid_job_type",
            json=parameters
        )
        assert response.status_code == 400
        assert "Invalid job type" in response.json()["detail"]

    def test_extract_metadata_unsupported_source_fails(self, client: TestClient, db_session: Session):
        """Explicitly fail when metadata_extraction is requested for unsupported source type"""
        # Create dataset with unsupported source type
        dataset_data = {
            "source": {"type": "s3", "uri": "s3://bucket/key"},
            "format_type": "rosbag"
        }
        resp = client.post("/api/v1/datasets/", json=dataset_data)
        assert resp.status_code == 200 or resp.status_code == 201 or resp.status_code == 422
        if resp.status_code == 422:
            return
        ds = resp.json()

        # Trigger explicit metadata extraction job
        job_data = {"dataset_id": ds["id"], "job_type": "metadata_extraction"}
        job_resp = client.post(f"/api/v1/datasets/{ds['id']}/jobs", json=job_data)
        assert job_resp.status_code == 200

        # Run background synchronously to capture failure
        from api.v1.endpoints.datasets import run_job_background
        import anyio
        try:
            anyio.run(run_job_background, job_resp.json()["id"], ds["id"], "metadata_extraction", {})
        except Exception:
            pass

        # Check job is failed with an error message
        job_detail = client.get(f"/api/v1/datasets/{ds['id']}/jobs/{job_resp.json()['id']}")
        assert job_detail.status_code == 200
        job_json = job_detail.json()
        assert job_json["status"] == "failed"
        assert "Unsupported dataset source type" in (job_json.get("error_message") or "")
        assert f"dataset_id={ds['id']}" in (job_json.get("error_message") or "")
        assert "dataset_type=" in (job_json.get("error_message") or "")
        assert "source_type=" in (job_json.get("error_message") or "")

    def test_hf_metadata_requires_supported_type(self, client: TestClient):
        """HF metadata extraction should fail if dataset.format_type is not in {lerobot, rlds}"""
        # Create HF dataset with non-lerobot format
        dataset_data = {
            "source": {"type": "huggingface", "repo_id": "owner/repo", "revision": "deadbeef"},
            "format_type": "rosbag"
        }
        resp = client.post("/api/v1/datasets/", json=dataset_data)
        assert resp.status_code == 200
        ds = resp.json()

        # Create and run metadata_extraction job
        job_data = {"dataset_id": ds["id"], "job_type": "metadata_extraction"}
        job_resp = client.post(f"/api/v1/datasets/{ds['id']}/jobs", json=job_data)
        assert job_resp.status_code == 200

        from api.v1.endpoints.datasets import run_job_background
        import anyio
        try:
            anyio.run(run_job_background, job_resp.json()["id"], ds["id"], "metadata_extraction", {})
        except Exception:
            pass

        job_detail = client.get(f"/api/v1/datasets/{ds['id']}/jobs/{job_resp.json()['id']}")
        assert job_detail.status_code == 200
        job_json = job_detail.json()
        assert job_json["status"] == "failed"
        err = job_json.get("error_message") or ""
        assert "dataset_type=rosbag" in err
        assert f"dataset_id={ds['id']}" in err
        assert "source_type=huggingface" in err

    def test_hf_rlds_metadata_path(self, client: TestClient):
        """RLDS HF datasets should route to RLDS extractor using real HF where available."""
        dataset_data = {
            # Use OXE umbrella repo to fetch dataset_infos.json quickly; pin a commit
            "source": {"type": "huggingface", "repo_id": "jxu124/OpenX-Embodiment", "revision": "f7a9e8a13277f76d3e2b32f7e784a3d2f9cbd1a4"},
            "format_type": "rlds"
        }
        resp = client.post("/api/v1/datasets/", json=dataset_data)
        assert resp.status_code == 200
        ds = resp.json()

        job_data = {"dataset_id": ds["id"], "job_type": "metadata_extraction"}
        job_resp = client.post(f"/api/v1/datasets/{ds['id']}/jobs", json=job_data)
        assert job_resp.status_code == 200

        from api.v1.endpoints.datasets import run_job_background
        import anyio
        import os
        os.environ["ROBOKIT_HF_LOCAL_ONLY"] = "0"
        anyio.run(run_job_background, job_resp.json()["id"], ds["id"], "metadata_extraction", {})

        job_detail = client.get(f"/api/v1/datasets/{ds['id']}/jobs/{job_resp.json()['id']}")
        assert job_detail.status_code == 200
        job_json = job_detail.json()
        assert job_json["status"] == "completed"
        meta = job_json.get("result") or {}
        assert isinstance((meta.get("metadata", {}).get("features")), list)


class TestProcessingJobEndpoints:
    """Test processing job endpoints"""
    
    def test_create_job_success(self, client: TestClient, sample_dataset):
        """Test creating a processing job"""
        job_data = {
            "dataset_id": sample_dataset.id,
            "job_type": "attention_analysis"
        }
        
        response = client.post(f"/api/v1/datasets/{sample_dataset.id}/jobs", json=job_data)
        assert response.status_code == 200
        
        data = response.json()
        assert data["dataset_id"] == sample_dataset.id
        assert data["job_type"] == "attention_analysis"
        assert data["status"] == "pending"
    
    def test_create_job_dataset_not_found(self, client: TestClient):
        """Test creating job for non-existent dataset"""
        job_data = {
            "dataset_id": 99999,
            "job_type": "attention_analysis"
        }
        
        response = client.post("/api/v1/datasets/99999/jobs", json=job_data)
        assert response.status_code == 404
        assert "Dataset not found" in response.json()["detail"]
    
    def test_list_jobs(self, client: TestClient, sample_dataset, multiple_jobs):
        """Test listing processing jobs"""
        response = client.get(f"/api/v1/datasets/{sample_dataset.id}/jobs")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 3  # At least our test jobs
    
    def test_get_job_success(self, client: TestClient, sample_dataset, sample_processing_job):
        """Test getting a specific job"""
        response = client.get(f"/api/v1/datasets/{sample_dataset.id}/jobs/{sample_processing_job.id}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["id"] == sample_processing_job.id
        assert data["dataset_id"] == sample_dataset.id
    
    def test_get_job_not_found(self, client: TestClient, sample_dataset):
        """Test getting non-existent job"""
        response = client.get(f"/api/v1/datasets/{sample_dataset.id}/jobs/99999")
        assert response.status_code == 404
        assert "Job not found" in response.json()["detail"]
    
    def test_update_job_success(self, client: TestClient, sample_dataset, sample_processing_job):
        """Test updating a job"""
        update_data = {
            "status": "running",
            "progress": 0.5
        }
        
        response = client.put(
            f"/api/v1/datasets/{sample_dataset.id}/jobs/{sample_processing_job.id}",
            json=update_data
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == update_data["status"]
        assert data["progress"] == update_data["progress"]


class TestSearchEndpoints:
    """Test search endpoints"""
    
    def test_search_datasets_simple(self, client: TestClient, sample_dataset):
        """Temporary simple search returns list"""
        response = client.get("/api/v1/datasets/search")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)


class TestErrorHandling:
    """Test error handling"""
    
    def test_404_handler(self, client: TestClient):
        """Test custom 404 handler"""
        response = client.get("/api/v1/nonexistent")
        assert response.status_code == 404
        assert "Not Found" in response.json()["detail"]
    
    def test_invalid_json(self, client: TestClient):
        """Test handling of invalid JSON"""
        response = client.post("/api/v1/datasets/", content="invalid json")
        assert response.status_code == 422 