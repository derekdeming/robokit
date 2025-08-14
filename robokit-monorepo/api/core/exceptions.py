from fastapi import HTTPException
from typing import Any, Dict, Optional


class RoboKitException(Exception):
    """Base exception for RoboKit application"""
    def __init__(self, message: str, status_code: int = 500, details: Optional[Dict[str, Any]] = None):
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)


class NotFoundException(RoboKitException):
    """Resource not found exception"""
    def __init__(self, resource: str, resource_id: Any):
        super().__init__(
            message=f"{resource} with id {resource_id} not found",
            status_code=404,
            details={"resource": resource, "resource_id": resource_id}
        )


class ConflictException(RoboKitException):
    """Resource conflict exception (e.g., duplicate email)"""
    def __init__(self, message: str, field: str, value: Any):
        super().__init__(
            message=message,
            status_code=409,
            details={"field": field, "value": value}
        )


class ValidationException(RoboKitException):
    """Validation exception"""
    def __init__(self, message: str, field: str):
        super().__init__(
            message=message,
            status_code=422,
            details={"field": field}
        )


def raise_not_found(resource: str, resource_id: Any) -> None:
    """Raise a not found exception"""
    raise NotFoundException(resource, resource_id)


def raise_conflict(message: str, field: str, value: Any) -> None:
    """Raise a conflict exception"""
    raise ConflictException(message, field, value)


def raise_validation_error(message: str, field: str) -> None:
    """Raise a validation exception"""
    raise ValidationException(message, field) 