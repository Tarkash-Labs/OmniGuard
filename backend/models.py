"""
OmniGuard AI - Pydantic Models
Data models for API requests, responses, and detection results.
"""

from pydantic import BaseModel, Field
from typing import Optional


class BoundingBox(BaseModel):
    """Normalized bounding box coordinates (0-1 range relative to viewport)."""
    x: float = Field(..., description="Left edge (0-1)")
    y: float = Field(..., description="Top edge (0-1)")
    w: float = Field(..., description="Width (0-1)")
    h: float = Field(..., description="Height (0-1)")


class Detection(BaseModel):
    """A single dark pattern detection."""
    category: str = Field(
        ...,
        description="Dark pattern category",
        examples=[
            "urgency_trap",
            "disguised_click",
            "sneak_into_basket",
            "forced_continuity",
            "confirmshaming",
            "hidden_cost",
        ],
    )
    label: str = Field(..., description="Short human-readable label for the pattern")
    description: str = Field(
        ..., description="Plain-English explanation of why this is deceptive"
    )
    risk_score: float = Field(
        ..., ge=0.0, le=1.0, description="Severity score from 0 (low) to 1 (critical)"
    )
    bbox: BoundingBox = Field(..., description="Bounding box around the deceptive element")
    deceptive_text: Optional[str] = Field(
        None, description="The actual deceptive text/copy found"
    )


class AnalyzeRequest(BaseModel):
    """Request body for the /analyze endpoint."""
    screenshot: str = Field(
        ..., description="Base64-encoded PNG screenshot of the viewport"
    )
    url: Optional[str] = Field(None, description="URL of the page being analyzed")
    viewport_width: Optional[int] = Field(None, description="Viewport width in pixels")
    viewport_height: Optional[int] = Field(None, description="Viewport height in pixels")


class AnalyzeResponse(BaseModel):
    """Response from the /analyze endpoint."""
    success: bool = Field(True, description="Whether analysis completed successfully")
    detections: list[Detection] = Field(
        default_factory=list, description="List of detected dark patterns"
    )
    summary: str = Field(
        "", description="Overall summary of the page's deceptive patterns"
    )
    risk_level: str = Field(
        "safe",
        description="Overall risk level: safe, low, medium, high, critical",
    )
    detection_count: int = Field(0, description="Total number of detections")


class HealthResponse(BaseModel):
    """Response for the /health endpoint."""
    status: str = "ok"
    model: str = ""
    version: str = "1.0.0"
