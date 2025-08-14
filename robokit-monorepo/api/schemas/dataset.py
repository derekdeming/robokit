from pydantic import BaseModel, Field, HttpUrl, ConfigDict, field_validator
from typing import Optional, Dict, Any, List, Union, Annotated, Literal, Type
from datetime import datetime, timezone
from enum import Enum


class DatasetFormat(str, Enum):
    ROSBAG = "rosbag"
    HDF5 = "hdf5"
    PARQUET = "parquet"
    CUSTOM = "custom"
    LEROBOT = "lerobot"
    RLDS = "rlds"


class JobType(str, Enum):
    METADATA_EXTRACTION = "metadata_extraction"
    ATTENTION_ANALYSIS = "attention_analysis"
    CONVERSION = "conversion"
    VALIDATION = "validation"
    INDEXING = "indexing"
    EVALUATE_QUALITY_HEURISTICS = "evaluate_quality_heuristics"
    RERUN_VISUALIZATION = "rerun_visualization"


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


# Dataset schemas
class DatasetBase(BaseModel):
    format_type: DatasetFormat = Field(..., description="Dataset format")


class HTTPSource(BaseModel):
    type: Literal["http"]
    url: HttpUrl = Field(..., description="HTTP(S) URL for dataset")


class HuggingFaceSource(BaseModel):
    type: Literal["huggingface"]
    repo_id: str = Field(..., description="Hugging Face repo id, e.g., owner/repo")
    revision: str = Field(..., description="Revision (branch, tag, or commit SHA)")


DatasetSource = Annotated[Union[HTTPSource, HuggingFaceSource], Field(discriminator="type")]


class DatasetCreate(DatasetBase):
    source: DatasetSource = Field(..., description="Generic dataset source descriptor")


class DatasetUpdate(BaseModel):
    source: Optional[DatasetSource] = None
    dataset_metadata: Optional[Dict[str, Any]] = None


class Dataset(DatasetBase):
    id: int
    source: DatasetSource
    dataset_metadata: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# Processing job schemas
class JobBase(BaseModel):
    dataset_id: int = Field(..., description="Dataset ID")
    job_type: JobType = Field(..., description="Type of job")


class JobCreate(JobBase):
    pass


class JobUpdate(BaseModel):
    status: Optional[JobStatus] = None
    progress: Optional[float] = Field(None, ge=0.0, le=1.0)
    result: Optional[Dict[str, Any]] = None
    result_summary: Optional[Dict[str, Any]] = None
    result_metadata: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None


class Job(JobBase):
    id: int
    status: JobStatus
    progress: float
    result: Optional[Dict[str, Any]] = None
    result_summary: Optional[Dict[str, Any]] = None
    result_metadata: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# Parameter models for each job type
class MetadataExtractionParams(BaseModel):
    auto_extract: bool = True


class AttentionAnalysisParams(BaseModel):
    model: Union[str, Dict[str, Any]] = Field(default="default", description="Model identifier or config")
    episode_index: int = Field(default=0, ge=0, description="Episode to analyze")
    stride: int = Field(default=2, ge=1, le=10, description="Frame sampling stride")
    max_frames: Optional[int] = Field(default=1000, ge=1, le=10000, description="Maximum frames to process")
    specific_decoder_token_index: Optional[int] = Field(default=None, description="Specific decoder token for attention")
    overlay_alpha: float = Field(default=0.5, ge=0.0, le=1.0, description="Attention overlay transparency")
    use_rgb: bool = Field(default=False, description="Use RGB color space for visualization")
    show_proprio_border: bool = Field(default=True, description="Show proprioception attention border")
    proprio_border_width: int = Field(default=15, ge=1, le=50, description="Proprioception border width")
    
    @field_validator('specific_decoder_token_index')
    @classmethod
    def validate_decoder_token_index(cls, v):
        if v is not None and v < 0:
            raise ValueError('specific_decoder_token_index must be non-negative when provided')
        return v


class ConversionParams(BaseModel):
    source_format: DatasetFormat
    target_format: DatasetFormat


class ValidationParams(BaseModel):
    validation_method: Literal["quick", "comprehensive"] = "comprehensive"


class IndexingParams(BaseModel):
    index_type: Literal["spatial_temporal", "temporal"] = "spatial_temporal"


class EvaluateQualityHeuristicsParams(BaseModel):
    max_episodes: Optional[int] = None
    model: str = "default"


class RerunVisualizationParams(BaseModel):
    """Parameters for generating Rerun RRD visualizations."""
    
    mode: Literal["file", "stream"] = Field(default="file", description="file: generate .rrd file; stream: live gRPC streaming")

    episode_index: Optional[int] = Field(None, ge=0, description="Single episode index")
    episode_start: Optional[int] = Field(None, ge=0, description="Start episode (inclusive)")
    episode_end: Optional[int] = Field(None, ge=0, description="End episode (exclusive)")
    stride: int = Field(1, ge=1, description="Frame stride for sampling")
    max_frames: Optional[int] = Field(5000, ge=1, le=5000000, description="Max frames to process")
    downscale_long_side: Optional[int] = Field(1280, ge=64, le=4096, description="Downscale images to this max dimension")
    jpeg_quality: int = Field(90, ge=1, le=100, description="JPEG compression quality")
    timeline: Literal["time", "frame"] = Field("time", description="Timeline type")
    
    include_streams: Dict[str, List[str]] = Field(
        default_factory=lambda: {
            "images": ["*"],
            "depth": [],
            "lidar": [],
            "joints": ["*"],
            "forces": [],
            "torques": [],
        },
        description="Which sensor streams to include")

    blueprint: Literal["episode_review", "quality_triage", "alignment", "minimal"] = Field("episode_review", description="Viewer layout preset")
    streaming_ttl_seconds: Optional[int] = Field(1800, ge=30, le=86400, description="Stream server TTL in seconds")


# Mapping of job type -> parameter model (for validation and schema generation)
JOB_PARAMETER_MODELS: Dict[str, Type[BaseModel]] = {
    JobType.METADATA_EXTRACTION.value: MetadataExtractionParams,
    JobType.ATTENTION_ANALYSIS.value: AttentionAnalysisParams,
    JobType.CONVERSION.value: ConversionParams,
    JobType.VALIDATION.value: ValidationParams,
    JobType.INDEXING.value: IndexingParams,
    JobType.EVALUATE_QUALITY_HEURISTICS.value: EvaluateQualityHeuristicsParams,
    JobType.RERUN_VISUALIZATION.value: RerunVisualizationParams,
}


def get_job_parameter_schemas() -> Dict[str, Dict[str, Any]]:
    """Return JSON Schemas for all job parameter models keyed by job type."""
    return {job_type: model.model_json_schema() for job_type, model in JOB_PARAMETER_MODELS.items()}
