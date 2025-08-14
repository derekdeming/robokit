You are an advanced super senior staff engineer powers. You write excellent, modular code. You don't overly complicate things. You don't create super verbose commments in the code (only when necessary). You don't create super verbose functions and variable names. You write clean, advanced code. You should not hallucinate the code you write. You should only write code that is based on the information provided. You should not use fallback functions and we should fail or error out explicitly. 

If you're not sure about something, ask for clarification and you can always refer back to the @E2E_REPO.md file for more information. If you're implementing code from the SDK then you should search how the SDK works online. 

I scanned the rerun flow, the metadata extraction flow, and the shared job/DB plumbing. Here’s what I found and what to adjust.

What the DB is doing for both jobs. Both jobs do the same DB operations: create a row in jobs, set status to running, then update result and summary on completion. No complex writes; no dataset_metadata updates in either flow. The rerun job stores a small JSON result (URLs, counters). The metadata job can store a larger JSON result (raw meta text), but this is still just one JSONB write to jobs.result.

Key points in code:

datasets.py: 
async def run_analysis_background(job_id: int, dataset_id: int, job_type: str, parameters: Dict[str, Any]):
    """Background task to run analysis"""
    from core.database import get_db_context
    from services.dataset_service import JobService
    
    try:
        # Use database context manager for proper session management
        with get_db_context() as db:
            # Update job status to running
            JobService.update_job_status(db, job_id, "running", 0.1)

            # Dispatch table for analysis handlers
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

            result = await handlers[job_type](dataset_id, parameters, job_id)

            # Update job with results
            JobService.update_job_result(db, job_id, result["full_result"], result["summary"])


async def rerun_visualization_background(dataset_id: int, parameters: Dict[str, Any], job_id: int) -> Dict[str, Any]:
    """Generate Rerun RRD visualization."""
    try:
        params = RerunVisualizationParams.model_validate(parameters or {})
    except Exception as e:
        raise ValueError(f"Invalid parameters: {e}")
    
    with get_db_context() as db:
        rerun_svc = RerunService(db)
        if params.mode == "file":
            result = rerun_svc.build_recording(dataset_id, params, job_id) # this will generate RRD file
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
            # Stream mode
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


Why we're seeing lag specifically with rerun
The rerun job is CPU/IO heavy: it downloads and reads Parquet, opens videos, decodes frames, logs images, and saves an RRD file.

rerun_service.py:
def visualize_lerobot_dataset(
    repo_id: str,
    revision: str,
    episode_index: int,
    output_path: Path,
    max_frames: Optional[int] = None
) -> Path:
    app_id = f"{repo_id}/episode_{episode_index}"
    rr.init(app_id, spawn=False)
    
    fps, cameras = DatasetMetadata.get_lerobot_metadata(repo_id, revision)
    chunk = episode_index // 1000
    parquet_path = safe_hf_download(
        repo_id, revision,
        f"data/chunk-{chunk:03d}/episode_{episode_index:06d}.parquet"
    )
    ...
    table = pq.read_table(parquet_path)
    df = table.to_pandas()
    video_caps = VideoLoader.load_episode_videos(repo_id, revision, episode_index, cameras)
    ...
    rr.log("/", rr.ViewCoordinates.RDF, static=True)
    blueprint = RerunLogger.create_blueprint(list(video_caps.keys()))
    rr.send_blueprint(blueprint)
    num_frames = min(len(df), max_frames) if max_frames else len(df)
    
    for idx in range(num_frames):
        row = df.iloc[idx]
        RerunLogger.log_frame_data(row, video_caps, idx, fps)
    
    VideoLoader.cleanup(video_caps)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    rr.save(str(output_path))
    
    return output_path

That heavy work is executed inside an async function using a normal DB session, and the outer runner holds a DB session open for the entire job. This can block the event loop (synchronous CPU/IO inside async), making the server feel “laggy.”
Tie up a DB connection for the duration of the job, reducing available pool connections for other requests.


def build_recording(...):
    dataset = DatasetService.get_dataset(self.db, dataset_id)
    ...
    rrd_path = visualize_lerobot_dataset(...)
    ...
    result = RerunBuildResult(
        rrd_path=rrd_path,
        frames_written=frames_written
    )
    ...
    return result

Concrete issues to fix
Blocking async: Heavy, synchronous work runs in an async background handler. Move it to a thread or process.
Example: in rerun_visualization_background, call await asyncio.to_thread(rerun_svc.build_recording, dataset_id, params, job_id) rather than calling it directly.
Long‑held DB session: run_analysis_background keeps a DB session open across the entire job. Release it before running the long task and reacquire a fresh session for the completion update.
Pattern:
Open session → set status=running → close session.
Run heavy job (no session).
Open session → write results → close session.
Minor correctness:
frames_written in build_recording is guessed; compute actual num_frames and return that.
Ensure VideoLoader.cleanup happens in a finally so caps are released on error.