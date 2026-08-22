"""
OmniGuard AI - FastAPI Backend
Stateless gateway that orchestrates viewport analysis via Gemini 3.7 Flash.
Screenshots are processed ephemerally — never stored.
"""

import base64
import json
import os
import logging
from io import BytesIO

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import google.generativeai as genai
from PIL import Image

from models import (
    AnalyzeRequest,
    AnalyzeResponse,
    Detection,
    BoundingBox,
    HealthResponse,
)
from prompts import SYSTEM_INSTRUCTION, ANALYZE_PROMPT

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.7-flash")

if not GEMINI_API_KEY:
    logging.warning(
        "⚠️  GEMINI_API_KEY not set. Copy .env.example → .env and add your key."
    )

genai.configure(api_key=GEMINI_API_KEY)

# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="OmniGuard AI",
    description="Real-time multimodal dark-pattern detection gateway",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Extension will connect from chrome-extension:// origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger = logging.getLogger("omniguard")
logging.basicConfig(level=logging.INFO)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def decode_screenshot(b64_string: str) -> Image.Image:
    """Decode a base64 PNG screenshot into a PIL Image."""
    # Strip optional data URI prefix
    if "," in b64_string:
        b64_string = b64_string.split(",", 1)[1]
    image_bytes = base64.b64decode(b64_string)
    return Image.open(BytesIO(image_bytes))


def parse_gemini_response(text: str) -> dict:
    """Parse Gemini's JSON response, handling markdown code fences if present."""
    cleaned = text.strip()
    # Strip markdown code fences if Gemini wraps the JSON
    if cleaned.startswith("```"):
        # Remove opening fence (```json or ```)
        first_newline = cleaned.index("\n")
        cleaned = cleaned[first_newline + 1 :]
    if cleaned.endswith("```"):
        cleaned = cleaned[: -3]
    cleaned = cleaned.strip()
    return json.loads(cleaned)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(status="ok", model=GEMINI_MODEL)


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze_page(request: AnalyzeRequest):
    """
    Analyze a webpage screenshot for dark patterns.

    Accepts a base64-encoded PNG screenshot, sends it to Gemini 3.7 Flash
    for multimodal analysis, and returns structured detection results.

    Privacy: The screenshot is processed in-memory and never persisted.
    """
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY not configured. See .env.example.",
        )

    try:
        # 1. Decode the screenshot
        image = decode_screenshot(request.screenshot)
        logger.info(
            f"📸 Analyzing screenshot: {image.size[0]}x{image.size[1]} "
            f"from {request.url or 'unknown URL'}"
        )

        # 2. Create the Gemini model with system instruction
        model = genai.GenerativeModel(
            model_name=GEMINI_MODEL,
            system_instruction=SYSTEM_INSTRUCTION,
        )

        # 3. Send multimodal request (image + text prompt)
        response = model.generate_content(
            [ANALYZE_PROMPT, image],
            generation_config=genai.types.GenerationConfig(
                temperature=0.1,  # Low temperature for consistent, factual output
                max_output_tokens=4096,
            ),
        )

        # 4. Parse the structured JSON response
        result = parse_gemini_response(response.text)

        # 5. Build validated response
        detections = []
        for det in result.get("detections", []):
            bbox_data = det.get("bbox", {})
            detections.append(
                Detection(
                    category=det.get("category", "unknown"),
                    label=det.get("label", "Unknown Pattern"),
                    description=det.get("description", ""),
                    risk_score=min(max(float(det.get("risk_score", 0.0)), 0.0), 1.0),
                    bbox=BoundingBox(
                        x=float(bbox_data.get("x", 0)),
                        y=float(bbox_data.get("y", 0)),
                        w=float(bbox_data.get("w", 0)),
                        h=float(bbox_data.get("h", 0)),
                    ),
                    deceptive_text=det.get("deceptive_text"),
                )
            )

        return AnalyzeResponse(
            success=True,
            detections=detections,
            summary=result.get("summary", "Analysis complete."),
            risk_level=result.get("risk_level", "safe"),
            detection_count=len(detections),
        )

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Gemini response as JSON: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"Gemini returned invalid JSON: {str(e)}",
        )
    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Analysis failed: {str(e)}",
        )


# ---------------------------------------------------------------------------
# SSE Streaming endpoint (for real-time inference state)
# ---------------------------------------------------------------------------
@app.post("/analyze/stream")
async def analyze_page_stream(request: AnalyzeRequest):
    """
    Streaming version of /analyze using Server-Sent Events.
    Sends status updates as the analysis progresses.
    """
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY not configured.",
        )

    async def event_generator():
        try:
            # Send status: processing
            yield f"data: {json.dumps({'status': 'processing', 'message': 'Capturing viewport...'})}\n\n"

            image = decode_screenshot(request.screenshot)

            yield f"data: {json.dumps({'status': 'analyzing', 'message': 'Running Gemini analysis...'})}\n\n"

            model = genai.GenerativeModel(
                model_name=GEMINI_MODEL,
                system_instruction=SYSTEM_INSTRUCTION,
            )

            response = model.generate_content(
                [ANALYZE_PROMPT, image],
                generation_config=genai.types.GenerationConfig(
                    temperature=0.1,
                    max_output_tokens=4096,
                ),
            )

            result = parse_gemini_response(response.text)

            yield f"data: {json.dumps({'status': 'complete', 'result': result})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=True)
