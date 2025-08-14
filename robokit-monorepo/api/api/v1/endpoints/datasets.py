from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Body
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from pathlib import Path

from core.database import get_db, get_db_context
from core.exceptions import RoboKitException, ConflictException
from services.dataset_service import DatasetService, JobService
from services.rerun_service import RerunService
from schemas.dataset import (
    Dataset, DatasetCreate, DatasetUpdate,
    Job, JobCreate, JobUpdate,
    JobType, JobStatus, DatasetFormat,
    JOB_PARAMETER_MODELS, get_job_parameter_schemas,
    RerunVisualizationParams,
)

router = APIRouter()

@router.get("/search")
def search_datasets(db: Session = Depends(get_db)):
    """Temporary simple search: returns all datasets. More flexible criteria coming later."""
    return DatasetService.get_datasets(db)

@router.get("/job-parameter-schemas")
def job_parameter_schemas():
    """Expose JSON Schemas for job parameter models so the frontend can auto-generate UIs."""
    return get_job_parameter_schemas()


@router.get("/{dataset_id}/artifacts/{job_id}/{filename}")
@router.head("/{dataset_id}/artifacts/{job_id}/{filename}")
async def get_dataset_artifact(dataset_id: int, job_id: int, filename: str, db: Session = Depends(get_db)):
    """Serve dataset artifacts like RRD files with authentication."""
    from core.config import settings
    
    # Verify job exists and belongs to the dataset
    job = JobService.get_job(db, job_id)
    if not job or job.dataset_id != dataset_id:
        raise HTTPException(status_code=404, detail="Job not found")
    
    artifacts_dir = Path(settings.ARTIFACTS_DIR or ".artifacts")
    file_path = artifacts_dir / f"dataset_{dataset_id}" / "rerun" / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Artifact not found")
    
    content_type = "application/octet-stream"
    if filename.endswith(".rrd"):
        content_type = "application/x-rerun-rrd"
    elif filename.endswith(".rbl"):
        content_type = "application/x-rerun-blueprint"
    
    response = FileResponse(
        path=str(file_path),
        media_type=content_type,
        filename=filename
    )
    
    # Add CORS headers for Rerun viewer
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, HEAD, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "*"
    
    return response


@router.post("/", response_model=Dataset)
async def create_dataset(
    background_tasks: BackgroundTasks,
    dataset_data: DatasetCreate,
    db: Session = Depends(get_db)
):
    """Create a new dataset from a generic source"""
    try:
        dataset = DatasetService.create_dataset(db=db, dataset=dataset_data)
        
        # Create metadata extraction job
        job_params = {"auto_extract": True}
        job = JobService.create_job_with_metadata(
            db=db,
            dataset_id=dataset.id,
            job_type="metadata_extraction",
            parameters=job_params
        )
        
        # Start background processing for metadata extraction
        background_tasks.add_task(
            run_analysis_background,
            job.id,
            dataset.id,
            "metadata_extraction",
            job_params
        )
        
        return dataset
        
    except ConflictException as e:
        raise HTTPException(status_code=409, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=List[Dataset])
def list_datasets(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """List all datasets"""
    return DatasetService.get_datasets(db=db, skip=skip, limit=limit)


@router.get("/{dataset_id}", response_model=Dataset)
def get_dataset(dataset_id: int, db: Session = Depends(get_db)):
    """Get a specific dataset"""
    dataset = DatasetService.get_dataset(db=db, dataset_id=dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@router.put("/{dataset_id}", response_model=Dataset)
def update_dataset(
    dataset_id: int,
    dataset_update: DatasetUpdate,
    db: Session = Depends(get_db)
):
    """Update a dataset"""
    return DatasetService.update_dataset(db=db, dataset_id=dataset_id, dataset_update=dataset_update)


@router.delete("/{dataset_id}")
def delete_dataset(dataset_id: int, db: Session = Depends(get_db)):
    """Delete a dataset"""
    DatasetService.delete_dataset(db=db, dataset_id=dataset_id)
    return {"message": "Dataset deleted successfully"}


@router.get("/{dataset_id}/status")
def get_dataset_status(dataset_id: int, db: Session = Depends(get_db)):
    """Get a quick overview of dataset status"""
    dataset = DatasetService.get_dataset(db, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    return {
        "dataset_id": dataset_id,
        # Return select latest jobs for quick overview
        "latest_jobs": {
            'metadata_extraction': JobService.get_latest_job_by_type(db, dataset_id, 'metadata_extraction'),
            'rerun_visualization': JobService.get_latest_job_by_type(db, dataset_id, 'rerun_visualization'),
        }
    }



# Analysis version management
@router.get("/{dataset_id}/analyses/{job_type}")
def get_analysis_versions(dataset_id: int, job_type: str, db: Session = Depends(get_db)):
    """Get all versions of a specific analysis type"""
    history = DatasetService.get_analysis_history(db, dataset_id, job_type)
    
    return {
        "dataset_id": dataset_id,
        "job_type": job_type,
        "versions": [
            {
                "job_id": job.id,
                "version": job.result_metadata.get("version", "v1") if job.result_metadata else "v1",
                "model": job.result_metadata.get("model") if job.result_metadata else None,
                "parameters": job.result_metadata.get("parameters") if job.result_metadata else None,
                "created_at": job.completed_at,
                "summary": job.result_summary,
                "status": job.status
            }
            for job in history
        ]
    }


@router.get("/{dataset_id}/analyses/{job_type}/latest")
def get_latest_analysis(dataset_id: int, job_type: str, db: Session = Depends(get_db)):
    """Get the most recent analysis"""
    latest = DatasetService.get_latest_analysis(db, dataset_id, job_type)
    
    if not latest:
        raise HTTPException(status_code=404, detail="No analysis found")
    
    return {
        "job_id": latest.id,
        "version": latest.result_metadata.get("version", "v1") if latest.result_metadata else "v1",
        "model": latest.result_metadata.get("model") if latest.result_metadata else None,
        "parameters": latest.result_metadata.get("parameters") if latest.result_metadata else None,
        "created_at": latest.completed_at,
        "summary": latest.result_summary,
        "full_result": latest.result
    }



@router.post("/{dataset_id}/analyses/{job_type}")
def run_new_analysis(
    dataset_id: int,
    job_type: str,
    background_tasks: BackgroundTasks,
    parameters: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """Run a new analysis with specific parameters"""
    # Validate job type
    if job_type not in [jt.value for jt in JobType]:
        raise HTTPException(status_code=400, detail="Invalid job type")
    
    # Validate parameters via pydantic model when available
    try:
        ParamModel = JOB_PARAMETER_MODELS.get(job_type)
        if ParamModel is not None:
            parameters = ParamModel(**(parameters or {})).model_dump(mode="json")  # normalized
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Invalid parameters for {job_type}: {e}")

    # Create new job with version metadata
    job = JobService.create_job_with_metadata(
        db=db,
        dataset_id=dataset_id,
        job_type=job_type,
        parameters=parameters
    )
    
    # Start background processing
    background_tasks.add_task(
        run_analysis_background,
        job.id,
        dataset_id,
        job_type,
        parameters
    )
    
    return job


# Processing jobs CRUD
@router.post("/{dataset_id}/jobs", response_model=Job)
def create_job(
    dataset_id: int,
    job_data: JobCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Create a new processing job for a dataset"""
    dataset = DatasetService.get_dataset(db=db, dataset_id=dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    # Create processing job
    job = JobService.create_job(db=db, job=job_data)
    
    # Start background processing
    background_tasks.add_task(
        run_job_background,
        job.id,
        dataset_id,
        job_data.job_type,
        {}
    )
    
    return job


@router.get("/{dataset_id}/jobs", response_model=List[Job])
def list_jobs(
    dataset_id: int,
    latest_per_type: bool = False,
    db: Session = Depends(get_db)
):
    """List processing jobs for a dataset.

    - Set `latest_per_type=true` to return the most recent job for each job_type.
    - Default returns all jobs for the dataset.
    """
    if latest_per_type:
        return JobService.get_dataset_latest_jobs_by_type(db=db, dataset_id=dataset_id)
    return JobService.get_dataset_jobs(db=db, dataset_id=dataset_id)


@router.get("/{dataset_id}/jobs/{job_id}", response_model=Job)
def get_job(dataset_id: int, job_id: int, db: Session = Depends(get_db)):
    """Get a specific processing job"""
    job = JobService.get_job(db=db, job_id=job_id)
    if not job or job.dataset_id != dataset_id:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.put("/{dataset_id}/jobs/{job_id}", response_model=Job)
def update_job(
    dataset_id: int,
    job_id: int,
    job_update: JobUpdate,
    db: Session = Depends(get_db)
):
    """Update a processing job"""
    job = JobService.get_job(db=db, job_id=job_id)
    if not job or job.dataset_id != dataset_id:
        raise HTTPException(status_code=404, detail="Job not found")
    
    update_data = job_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(job, field, value)
    
    db.commit()
    db.refresh(job)
    return job


# Background task functions
async def run_analysis_background(job_id: int, dataset_id: int, job_type: str, parameters: Dict[str, Any]):
    """Background task to run analysis"""
    from core.database import get_db_context
    from services.dataset_service import JobService
    
    try:
        # Step 1: Update job status to running and release DB session
        with get_db_context() as db:
            JobService.update_job_status(db, job_id, "running", 0.1)
        
        # Step 2: Validate job type before proceeding
        handlers = {
            JobType.METADATA_EXTRACTION.value: extract_metadata_background,
            JobType.ATTENTION_ANALYSIS.value: analyze_attention_background,
            JobType.CONVERSION.value: convert_dataset_background,
            JobType.VALIDATION.value: validate_dataset_background,
            JobType.INDEXING.value: index_dataset_background,
            JobType.EVALUATE_QUALITY_HEURISTICS.value: evaluate_quality_heuristics_background,
            JobType.RERUN_VISUALIZATION.value: rerun_visualization_background,
        }
        if job_type not in handlers:
            raise ValueError(f"Unknown job type: {job_type}")

        # Step 3: Run the handler without holding a DB session
        result = await handlers[job_type](dataset_id, parameters, job_id)
        
        # Step 4: Validate result structure
        if not isinstance(result, dict) or "full_result" not in result or "summary" not in result:
            raise ValueError(f"Handler for {job_type} returned invalid result structure")

        # Step 5: Reacquire DB session to update results
        with get_db_context() as db:
            JobService.update_job_result(db, job_id, result["full_result"], result["summary"])
        
    except Exception as e:
        error_msg = f"Error in {job_type} analysis for dataset {dataset_id}: {str(e)}"
        print(f"Background task error (job_id={job_id}): {error_msg}")
        import traceback
        traceback.print_exc()
        
        # Mark job failed with specific error message
        try:
            with get_db_context() as db:
                JobService.update_job_status(db, job_id, "failed", 0.0, error_message=error_msg)
        except Exception as db_error:
            print(f"Failed to update job status to failed: {db_error}")
        return


async def run_job_background(job_id: int, dataset_id: int, job_type: str, parameters: Dict[str, Any]):
    """Generic background job runner"""
    await run_analysis_background(job_id, dataset_id, job_type, parameters)


async def extract_metadata_background(dataset_id: int, parameters: Dict[str, Any], job_id: int) -> Dict[str, Any]:
    """Extract metadata from dataset"""
    from services.dataset_service import DatasetService
    from models.dataset import Dataset as DatasetModel
    from schemas.dataset import HuggingFaceSource
    from core.database import get_db_context

    # Load dataset to inspect source
    with get_db_context() as db:
        ds: DatasetModel = db.query(DatasetModel).filter(DatasetModel.id == dataset_id).first()
        if not ds:
            raise ValueError(f"Dataset not found: id={dataset_id}")

        src = ds.source or {}
        source_type = src.get("type")
        dataset_type = ds.format_type
        if source_type == "huggingface":
            repo_id = src.get("repo_id")
            revision = src.get("revision")
            # Route by format_type
            if str(dataset_type).lower() == "lerobot":
                return DatasetService.extract_lerobot_metadata_from_hf(repo_id, revision)
            if str(dataset_type).lower() == "rlds":
                return DatasetService.extract_rlds_metadata_from_hf(repo_id, revision)
            raise ValueError(
                f"Metadata extraction for HuggingFace currently supports dataset_type in {{lerobot,rlds}}; "
                f"dataset_id={dataset_id}, dataset_type={dataset_type}, source_type={source_type}"
            )

        raise ValueError(
            f"Unsupported dataset source type for metadata extraction: {source_type}; "
            f"dataset_id={dataset_id}, dataset_type={dataset_type}, source_type={source_type}"
        )


async def analyze_attention_background(dataset_id: int, parameters: Dict[str, Any], job_id: int) -> Dict[str, Any]:
    import asyncio
    from services.attention_service import AttentionService
    from schemas.dataset import AttentionAnalysisParams
    
    try:
        params = AttentionAnalysisParams.model_validate(parameters or {})
    except Exception as e:
        raise ValueError(f"Invalid attention analysis parameters: {e}")
    
    def run_analysis():
        with get_db_context() as db:
            service = AttentionService(db)
            return service.run_attention_for_episode(dataset_id, params, job_id)
    
    try:
        result = await asyncio.to_thread(run_analysis)
    except Exception as e:
        raise RuntimeError(f"Attention analysis execution failed: {e}")
    
    if not isinstance(result, dict):
        raise ValueError(f"AttentionService returned invalid result type: {type(result)}")
    
    return {
        "full_result": result,
        "summary": result.get("summary", {})
    }


async def convert_dataset_background(dataset_id: int, parameters: Dict[str, Any], job_id: int) -> Dict[str, Any]:
    """Convert dataset format"""
    # TODO: Implement dataset conversion
    return {
        "full_result": {
            "source_format": parameters.get("source_format", "rosbag"),
            "target_format": parameters.get("target_format", "hdf5"),
            "output_path": f"converted_{dataset_id}.hdf5",
            "success": True,
            "compression_ratio": 0.8
        },
        "summary": {
            "conversion_successful": True,
            "compression_ratio": 0.8
        }
    }


async def validate_dataset_background(dataset_id: int, parameters: Dict[str, Any], job_id: int) -> Dict[str, Any]:
    """Validate dataset"""
    # TODO: Implement dataset validation
    return {
        "full_result": {
            "is_valid": True,
            "validation_errors": [],
            "validation_warnings": ["Low resolution in some frames"],
            "data_quality_score": 0.85,
            "validation_metadata": {
                "validation_method": "comprehensive",
                "checks_performed": ["integrity", "format", "metadata"]
            }
        },
        "summary": {
            "is_valid": True,
            "quality_score": 0.85,
            "warning_count": 1
        }
    }


async def index_dataset_background(dataset_id: int, parameters: Dict[str, Any], job_id: int) -> Dict[str, Any]:
    """Create search indices"""
    # TODO: Implement search indexing
    return {
        "full_result": {
            "index_path": f"indices/{dataset_id}",
            "index_type": "spatial_temporal",
            "indexed_frames": 3600,
            "search_metadata": {
                "spatial_bounds": [[0, 0], [100, 100]],
                "temporal_bounds": [0, 120.5]
            }
        },
        "summary": {
            "index_created": True,
            "indexed_frames": 3600,
            "search_ready": True
        }
    } 


async def evaluate_quality_heuristics_background(dataset_id: int, parameters: Dict[str, Any], job_id: int) -> Dict[str, Any]:
    """Thin wrapper that resolves dataset source and calls service implementation."""
    from core.database import get_db_context
    from models.dataset import Dataset as DatasetModel
    from services.dataset_service import DatasetService

    with get_db_context() as db:
        ds: DatasetModel = db.query(DatasetModel).filter(DatasetModel.id == dataset_id).first()
        if not ds:
            raise ValueError(f"Dataset not found: id={dataset_id}")
        src = ds.source or {}
        if src.get("type") != "huggingface" or str(ds.format_type).lower() not in ("lerobot", "rlds"):
            raise ValueError("evaluate_quality_heuristics currently supports HuggingFace LeRobot/RLDS datasets only")

        repo_id = src.get("repo_id")
        revision = src.get("revision")
        # For now, reuse LeRobot heuristics for RLDS only when Parquet episodes detected by info.json
        return DatasetService.evaluate_quality_heuristics_from_hf(repo_id=repo_id, revision=revision, parameters=parameters)


async def rerun_visualization_background(dataset_id: int, parameters: Dict[str, Any], job_id: int) -> Dict[str, Any]:
    """Generate Rerun RRD visualization."""
    import asyncio
    
    try:
        params = RerunVisualizationParams.model_validate(parameters or {})
    except Exception as e:
        raise ValueError(f"Invalid parameters: {e}")
    
    if params.mode == "file":
        def build_in_thread():
            with get_db_context() as db:
                rerun_svc = RerunService(db)
                return rerun_svc.build_recording(dataset_id, params, job_id)
        
        result = await asyncio.to_thread(build_in_thread)
        return {
            "full_result": {
                "rrd_url": result.rrd_url,
                "blueprint_url": result.blueprint_url,
                "local_path": str(result.rrd_path) if result.rrd_path else None,
                "frames_written": result.frames_written,
                "sdk_version": result.sdk_version,
                "viewer_version": result.viewer_version,
            },
            "summary": {
                "frames_written": result.frames_written,
                "sdk_version": result.sdk_version,
                "mode": "file",
            }
        }
    else:
        with get_db_context() as db:
            rerun_svc = RerunService(db)
            result = rerun_svc.stream_recording(dataset_id, params)
        return {
            "full_result": {
                "viewer_url": result.viewer_url,
                "frames_sent": result.frames_sent,
                "sdk_version": result.sdk_version,
                "viewer_version": result.viewer_version,
                "ttl_seconds": params.streaming_ttl_seconds,
            },
            "summary": {
                "frames_sent": result.frames_sent,
                "sdk_version": result.sdk_version,
                "mode": "stream",
            }
        }