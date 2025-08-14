import os

# Test database configuration
# These constants define the database names used for testing
TEST_DATABASE_NAME = "robokit_test"  # The test database that gets created/dropped for each test run
DEFAULT_DATABASE_NAME = "postgres"   # The default PostgreSQL database used to create/drop test databases

# Set test database name for this test session - must be done before any imports
os.environ["DATABASE_NAME"] = TEST_DATABASE_NAME

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from core.database import Base, get_db
from app import create_application
from models.dataset import Dataset, Job

# Use the test database URL from settings
from core.config import get_settings
settings = get_settings()
SQLALCHEMY_DATABASE_URL = settings.get_database_url()

# Create test engine
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
)

# Create test session
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def create_test_database():
    """Create test database if it doesn't exist"""
    # Create a connection to the default database to create our test database
    default_url = SQLALCHEMY_DATABASE_URL.replace(f"/{TEST_DATABASE_NAME}", f"/{DEFAULT_DATABASE_NAME}")
    default_engine = create_engine(default_url, isolation_level="AUTOCOMMIT")
    
    try:
        with default_engine.connect() as conn:
            # Check if test database exists
            result = conn.execute(text(f"SELECT 1 FROM pg_database WHERE datname = '{TEST_DATABASE_NAME}'"))
            if not result.fetchone():
                # Create test database
                conn.execute(text(f"CREATE DATABASE {TEST_DATABASE_NAME}"))
                print(f"✅ Created test database '{TEST_DATABASE_NAME}'")
            else:
                print(f"✅ Test database '{TEST_DATABASE_NAME}' already exists")
    except Exception as e:
        print(f"⚠️  Could not create test database: {e}")
        print("Tests will use existing database if available")
    finally:
        default_engine.dispose()


def drop_test_database():
    """Drop test database after tests"""
    try:
        # Terminate all connections to the test database
        default_url = SQLALCHEMY_DATABASE_URL.replace(f"/{TEST_DATABASE_NAME}", f"/{DEFAULT_DATABASE_NAME}")
        default_engine = create_engine(default_url, isolation_level="AUTOCOMMIT")
        
        with default_engine.connect() as conn:
            conn.execute(text(f"""
                SELECT pg_terminate_backend(pid) 
                FROM pg_stat_activity 
                WHERE datname = '{TEST_DATABASE_NAME}' AND pid <> pg_backend_pid()
            """))
            conn.execute(text(f"DROP DATABASE IF EXISTS {TEST_DATABASE_NAME}"))
            print(f"✅ Dropped test database '{TEST_DATABASE_NAME}'")
    except Exception as e:
        print(f"⚠️  Could not drop test database: {e}")
    finally:
        default_engine.dispose()


def override_get_db():
    """Override database dependency for testing"""
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


@pytest.fixture(scope="session")
def app():
    """Create test application"""
    # Create test database if it doesn't exist
    create_test_database()
    
    # Recreate tables to match current models
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    
    # Create app with overridden database
    app = create_application()
    app.dependency_overrides[get_db] = override_get_db
    
    yield app
    
    # Cleanup - drop all tables and the database
    Base.metadata.drop_all(bind=engine)
    drop_test_database()


@pytest.fixture(autouse=True)
def clean_database(app):
    """Clean database between tests"""
    # Clean all tables before each test
    with engine.connect() as conn:
        conn.execute(text("TRUNCATE TABLE jobs CASCADE"))
        conn.execute(text("TRUNCATE TABLE datasets CASCADE"))
        conn.commit()
    
    yield


@pytest.fixture
def client(app):
    """Create test client"""
    return TestClient(app)


@pytest.fixture
def test_app(app):
    """Alias for app fixture for backwards compatibility"""
    return TestClient(app)


@pytest.fixture
def db_session():
    """Create database session for testing"""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def test_db():
    """Alias for db_session fixture for backwards compatibility"""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def sample_dataset_data():
    """Sample dataset data for testing"""
    return {
        "source": {"type": "http", "url": "https://example.com/test.rosbag"},
        "format_type": "rosbag"
    }


@pytest.fixture
def sample_dataset(db_session, sample_dataset_data):
    """Create a sample dataset in the database"""
    dataset = Dataset(
        source=sample_dataset_data["source"],
        format_type=sample_dataset_data["format_type"]
    )
    db_session.add(dataset)
    db_session.commit()
    db_session.refresh(dataset)
    return dataset


@pytest.fixture
def sample_hf_dataset(db_session):
    """Create a sample HuggingFace dataset for testing"""
    dataset = Dataset(
        source={
            "type": "huggingface",
            "repo_id": "lerobot/pusht",
            "revision": "main"
        },
        format_type="lerobot"
    )
    db_session.add(dataset)
    db_session.commit()
    db_session.refresh(dataset)
    return dataset


@pytest.fixture
def sample_processing_job(db_session, sample_dataset):
    """Create a sample processing job"""
    job = Job(
        dataset_id=sample_dataset.id,
        job_type="metadata_extraction",
        status="completed",
        progress=1.0,
        result={"metadata": {"duration": 120.5, "sensors": ["camera", "lidar"]}},
        result_summary={"duration": 120.5, "sensor_count": 2}
    )
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)
    return job


@pytest.fixture
def sample_completed_job(db_session, sample_hf_dataset):
    """Create a sample completed job"""
    job = Job(
        dataset_id=sample_hf_dataset.id,
        job_type="rerun_visualization",
        status="completed",
        progress=1.0,
        result={
            "rrd_url": "http://localhost:8000/api/v1/datasets/123/artifacts/456/recording.rrd",
            "blueprint_url": "http://localhost:8000/api/v1/datasets/123/artifacts/456/blueprint.rbl",
            "frames_written": 1500,
            "sdk_version": "0.24.1",
            "viewer_version": "0.24.1"
        },
        result_summary={
            "mode": "file",
            "frames_written": 1500,
            "episode_index": 0,
            "success": True
        }
    )
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)
    return job


@pytest.fixture
def multiple_datasets(db_session):
    """Create multiple datasets for testing"""
    datasets = []
    for i in range(3):
        dataset = Dataset(
            source={"type": "http", "url": f"https://example.com/test{i+1}.rosbag"},
            format_type="rosbag"
        )
        db_session.add(dataset)
        datasets.append(dataset)
    
    db_session.commit()
    for dataset in datasets:
        db_session.refresh(dataset)
    
    return datasets


@pytest.fixture
def multiple_jobs(db_session, sample_dataset):
    """Create multiple processing jobs for testing"""
    jobs = []
    job_types = ["metadata_extraction", "attention_analysis", "conversion"]
    
    for i, job_type in enumerate(job_types):
        job = Job(
            dataset_id=sample_dataset.id,
            job_type=job_type,
            status="completed" if i == 0 else "pending",
            progress=1.0 if i == 0 else 0.0
        )
        db_session.add(job)
        jobs.append(job)
    
    db_session.commit()
    for job in jobs:
        db_session.refresh(job)
    
    return jobs 


# (No HF test fixtures needed; extraction uses huggingface_hub directly.)