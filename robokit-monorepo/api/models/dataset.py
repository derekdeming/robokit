from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, Float, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from datetime import datetime, timezone
from core.database import Base


class Dataset(Base):
    """Dataset model for scientific processing"""
    __tablename__ = "datasets"
    
    id = Column(Integer, primary_key=True, index=True)
    # Generic dataset source, supports multiple provider types (e.g., http, huggingface)
    source = Column(JSONB, nullable=False)
    format_type = Column(String(50), nullable=False)  # rosbag, hdf5, parquet, etc.
    
    # Flexible metadata only
    dataset_metadata = Column(JSONB)  # Extracted dataset metadata
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))


class Job(Base):
    """Background processing job"""
    __tablename__ = "jobs"
    
    id = Column(Integer, primary_key=True, index=True)
    dataset_id = Column(Integer, nullable=False, index=True)
    job_type = Column(String(50), nullable=False)  # metadata_extraction, attention_analysis, conversion, validation, indexing
    status = Column(String(50), default="pending")  # pending, running, completed, failed
    progress = Column(Float, default=0.0)
    
    # Enhanced result storage
    result = Column(JSONB)  # Full analysis results
    result_summary = Column(JSONB)  # Quick summary for UI
    result_metadata = Column(JSONB)  # Version, model, parameters, etc.
    
    error_message = Column(Text)
    
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))


# Indexes for JSON search
Index('idx_dataset_metadata', Dataset.dataset_metadata, postgresql_using='gin')
Index('idx_job_result', Job.result, postgresql_using='gin')
Index('idx_job_metadata', Job.result_metadata, postgresql_using='gin')
Index('idx_dataset_source', Dataset.source, postgresql_using='gin')
Index('idx_dataset_source_type', Dataset.source['type'].astext)