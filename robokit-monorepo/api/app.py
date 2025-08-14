from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from core.config import get_settings
from core.database import init_db
from core.exceptions import RoboKitException
from api.v1.endpoints import datasets

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    init_db()
    yield
    # Shutdown
    pass


def create_application() -> FastAPI:
    """Create and configure the FastAPI application"""
    app = FastAPI(
        title=settings.APP_NAME,
        description="Scientific computing API for RoboKit - dataset processing and analysis",
        version=settings.APP_VERSION,
        lifespan=lifespan
    )
    
    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if settings.CORS_ORIGINS == "*" else settings.CORS_ORIGINS.split(","),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Include routers
    app.include_router(datasets.router, prefix=f"{settings.API_V1_STR}/datasets", tags=["datasets"])

    # Expose OpenAPI schema at stable path for client generators
    @app.get("/openapi.json", include_in_schema=False)
    async def openapi_schema():
        return app.openapi()
    
    # Root endpoints
    @app.get("/")
    async def root():
        """Root endpoint"""
        return {
            "message": "Welcome to RoboKit Scientific Computing API",
            "description": "Dataset processing and analysis service",
            "version": settings.APP_VERSION
        }
    
    @app.get("/health")
    async def health_check():
        """Health check endpoint"""
        return {
            "status": "healthy",
            "service": "robokit-scientific-api",
            "version": settings.APP_VERSION,
            "database": "connected"
        }
    
    @app.get("/api/v1/status")
    async def get_status():
        """Get API status"""
        return {
            "service": "robokit-scientific-api",
            "status": "running",
            "version": settings.APP_VERSION,
            "database": "connected",
            "capabilities": [
                "dataset_processing",
                "attention_analysis", 
                "format_conversion",
                "background_jobs"
            ]
        }
    
    # Exception handlers
    @app.exception_handler(RoboKitException)
    async def robokit_exception_handler(request, exc: RoboKitException):
        """Handle RoboKit exceptions"""
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "detail": exc.message,
                "details": exc.details
            }
        )
    

    
    return app


# Create the application instance
app = create_application() 