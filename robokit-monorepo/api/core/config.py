from pydantic_settings import BaseSettings
from pydantic import Field, ConfigDict
from typing import Optional, List
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings with environment variable support"""

    # Database settings
    DATABASE_HOST: str
    DATABASE_PORT: int
    DATABASE_NAME: str
    DATABASE_USER: str
    DATABASE_PASSWORD: str

    # pgAdmin settings (required for local tooling/docker usage)
    PGADMIN_DEFAULT_EMAIL: str
    PGADMIN_DEFAULT_PASSWORD: str

    # Application settings (code-level defaults, can be overridden by env)
    APP_NAME: str = "RoboKit API"
    APP_VERSION: str = "0.0.1"
    API_V1_STR: str = "/api/v1"
    API_PORT: int = Field(alias="API_PORT")

    # Environment-controlled application flags
    DEBUG: bool = Field(alias="API_DEBUG")
    CORS_ORIGINS: str = Field(alias="API_CORS_ORIGINS")
    SECRET_KEY: str = Field(alias="API_SECRET_KEY")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # File storage settings
    ARTIFACTS_DIR: Optional[str] = Field(default=".artifacts", description="Directory for storing generated artifacts")
    ARTIFACTS_PUBLIC_BASE_URL: Optional[str] = Field(default=None, description="Public base URL for serving artifacts")

    # Read environment variables from project-level .env if present
    model_config = ConfigDict(env_file="../.env", case_sensitive=False, extra="ignore")

    def get_database_url(self) -> str:
        """Construct a PostgreSQL database URL from current settings."""
        return (
            f"postgresql://{self.DATABASE_USER}:{self.DATABASE_PASSWORD}"
            f"@{self.DATABASE_HOST}:{self.DATABASE_PORT}/{self.DATABASE_NAME}"
        )


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()

# Global settings instance
settings = get_settings()