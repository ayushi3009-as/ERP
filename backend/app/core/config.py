from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    APP_NAME: str = "Micro ERP - Garments Manufacturing"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # CORS: found during the final security review with allow_origins=["*"]
    # combined with allow_credentials=True in main.py -- invalid per the CORS
    # spec (browsers reject wildcard-origin + credentials) and a real
    # misconfiguration for a system serving authenticated APIs. Comma-separated
    # list of real origins; defaults to localhost for development only.
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173")

    # Environment: "development" | "test" | "production"
    # Only "test" allows Base.metadata.create_all() as a schema shortcut
    # (see main.py _create_tables). development/production must use
    # Alembic migrations — see docs/MIGRATIONS.md.
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./microerp.db")

    # Redis
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    # JWT
    SECRET_KEY: str = os.getenv(
        "SECRET_KEY", "micro-erp-super-secret-key-change-in-production"
    )
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # MinIO / S3
    S3_ENDPOINT: str = os.getenv("S3_ENDPOINT", "http://localhost:9000")
    S3_ACCESS_KEY: str = os.getenv("S3_ACCESS_KEY", "minioadmin")
    S3_SECRET_KEY: str = os.getenv("S3_SECRET_KEY", "minioadmin")
    S3_BUCKET: str = os.getenv("S3_BUCKET", "microerp")

    # Email
    SMTP_HOST: str = os.getenv("SMTP_HOST", "")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM: str = os.getenv("SMTP_FROM", "noreply@microerp.com")

    # WhatsApp
    WHATSAPP_API_URL: str = os.getenv("WHATSAPP_API_URL", "")
    WHATSAPP_API_KEY: str = os.getenv("WHATSAPP_API_KEY", "")

    class Config:
        env_file = ".env"


settings = Settings()
