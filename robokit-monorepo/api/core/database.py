from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from contextlib import contextmanager
from typing import Generator
import logging

from .config import get_settings

# Configure logging
logger = logging.getLogger(__name__)

# Base class for models
Base = declarative_base()


def get_database_url() -> str:
    """Get database URL from settings"""
    settings = get_settings()
    return settings.get_database_url()


def create_db_engine(database_url: str = None, echo: bool = None):
    """Create database engine with appropriate configuration"""
    settings = get_settings()
    
    if database_url is None:
        database_url = get_database_url()
    
    if echo is None:
        echo = settings.DEBUG
    
    return create_engine(
        database_url,
        pool_pre_ping=True,
        pool_recycle=300,
        echo=echo
    )


# Create engine and session for current environment
engine = create_db_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """Dependency to get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_context() -> Generator[Session, None, None]:
    """Context manager for database sessions"""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db() -> None:
    """Initialize database tables"""
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created") 