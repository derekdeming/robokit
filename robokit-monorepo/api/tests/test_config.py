import pytest
import os
from unittest.mock import patch
from pydantic import ValidationError
from core.config import Settings, get_settings


class TestSettings:
    """Test Settings class behavior"""
    
    def test_database_url_construction_logic(self):
        """Test database URL construction with custom host"""
        settings = Settings(
            DATABASE_HOST="customhost",
            DATABASE_PORT=5433,
            DATABASE_NAME="testdb",
            DATABASE_USER="testuser",
            DATABASE_PASSWORD="testpass",
            PGADMIN_DEFAULT_EMAIL="admin@test.com",
            PGADMIN_DEFAULT_PASSWORD="adminpass",
            API_SECRET_KEY="test-secret"
        )
        
        expected_url = f"postgresql://{settings.DATABASE_USER}:{settings.DATABASE_PASSWORD}@customhost:5433/{settings.DATABASE_NAME}"
        assert settings.get_database_url() == expected_url
    
    def test_database_url_construction_with_defaults(self):
        """Test database URL construction with default host"""
        # Ensure environment doesn't override defaults for this test
        with patch.dict(os.environ, {
            "DATABASE_HOST": "localhost",
            "DATABASE_PORT": "9999"
        }, clear=False):
            settings = Settings(
                DATABASE_NAME="testdb",
                DATABASE_USER="testuser",
                DATABASE_PASSWORD="testpass",
                PGADMIN_DEFAULT_EMAIL="admin@test.com",
                PGADMIN_DEFAULT_PASSWORD="adminpass",
                API_SECRET_KEY="test-secret"
            )

            expected_url = (
                f"postgresql://{settings.DATABASE_USER}:{settings.DATABASE_PASSWORD}"
                f"@localhost:9999/{settings.DATABASE_NAME}"
            )
            assert settings.get_database_url() == expected_url
    
    def test_cors_origins_parsing_logic(self):
        """Test CORS origins parsing for multiple origins"""
        with patch.dict(os.environ, {
            "API_CORS_ORIGINS": "http://localhost:3000,https://example.com,https://app.example.com"
        }):
            settings = Settings()
            
            # Test that CORS origins are properly parsed
            origins = settings.CORS_ORIGINS.split(",")
            assert "http://localhost:3000" in origins
            assert "https://example.com" in origins
            assert "https://app.example.com" in origins
            assert len(origins) == 3
    
    def test_boolean_environment_variables_logic(self):
        """Test boolean environment variable parsing logic"""
        test_cases = [
            ("true", True),
            ("false", False),
            ("TRUE", True),
            ("FALSE", False),
            ("1", True),
            ("0", False)
        ]
        
        for env_value, expected in test_cases:
            with patch.dict(os.environ, {
                "API_DEBUG": env_value
            }):
                settings = Settings()
                assert settings.DEBUG is expected
    
    def test_integer_environment_variables_logic(self):
        """Test integer environment variable parsing logic"""
        test_cases = [
            ("30", 30),
            ("60", 60),
            ("120", 120),
            ("5432", 5432),
            ("5433", 5433)
        ]
        
        for env_value, expected in test_cases:
            with patch.dict(os.environ, {
                "DATABASE_NAME": "testdb",
                "DATABASE_USER": "testuser",
                "DATABASE_PASSWORD": "testpass",
                "PGADMIN_DEFAULT_EMAIL": "admin@test.com",
                "PGADMIN_DEFAULT_PASSWORD": "adminpass",
                "API_SECRET_KEY": "test-secret-key",
                "ACCESS_TOKEN_EXPIRE_MINUTES": env_value
            }):
                settings = Settings()
                assert settings.ACCESS_TOKEN_EXPIRE_MINUTES == expected


class TestGetSettings:
    """Test get_settings function caching behavior"""
    
    def test_get_settings_caching_behavior(self):
        """Test that get_settings returns cached instance"""
        with patch.dict(os.environ, {
            "PGADMIN_DEFAULT_EMAIL": "admin@test.com",
            "PGADMIN_DEFAULT_PASSWORD": "adminpass",
            "API_SECRET_KEY": "test-secret-key"
        }):
            # First call
            settings1 = get_settings()
            
            # Second call should return the same instance
            settings2 = get_settings()
            
            assert settings1 is settings2
    
    def test_get_settings_consistency_across_calls(self):
        """Test that get_settings returns consistent settings across calls"""
        with patch.dict(os.environ, {
            "PGADMIN_DEFAULT_EMAIL": "admin@test.com",
            "PGADMIN_DEFAULT_PASSWORD": "adminpass",
            "API_SECRET_KEY": "test-secret-key",
            "APP_NAME": "Test API"
        }):
            settings1 = get_settings()
            settings2 = get_settings()
            
            # Verify settings are consistent
            assert settings1.APP_NAME == settings2.APP_NAME
            assert settings1.APP_VERSION == settings2.APP_VERSION
            assert settings1.DEBUG == settings2.DEBUG


class TestSettingsValidation:
    """Test settings validation logic"""
    
    def test_invalid_integer_validation(self):
        """Test validation of invalid integer values"""
        with patch.dict(os.environ, {
            "PGADMIN_DEFAULT_EMAIL": "admin@test.com",
            "PGADMIN_DEFAULT_PASSWORD": "adminpass",
            "API_SECRET_KEY": "test-secret-key",
            "DATABASE_PORT": "invalid_port"  # Invalid port
        }):
            with pytest.raises(Exception):
                Settings()
    
    def test_invalid_boolean_validation(self):
        """Test validation of invalid boolean values"""
        with patch.dict(os.environ, {
            "PGADMIN_DEFAULT_EMAIL": "admin@test.com",
            "PGADMIN_DEFAULT_PASSWORD": "adminpass",
            "API_SECRET_KEY": "test-secret-key",
            "API_DEBUG": "maybe"  # Invalid boolean
        }):
            with pytest.raises(Exception):
                Settings() 