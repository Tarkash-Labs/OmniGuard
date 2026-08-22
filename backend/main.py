"""
OmniGuard AI - FastAPI Backend
Stateless gateway that orchestrates viewport analysis via Gemini 3.7 Flash.
Screenshots are processed ephemerally — never stored.

Uses the new google-genai SDK (replaces deprecated google-generativeai).
"""

import base64
import json
import os
import logging
from io import BytesIO
import httpx

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from google import genai
from google.genai import types
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

FALLBACK_API_KEY = os.getenv("FALLBACK_API_KEY", "")
FALLBACK_API_URL = os.getenv("FALLBACK_API_URL", "https://integrate.api.nvidia.com/v1/chat/completions")
FALLBACK_MODEL = os.getenv("FALLBACK_MODEL", "meta/llama-3.2-90b-vision-instruct")

if not GEMINI_API_KEY:
    logging.warning(
        "⚠️  GEMINI_API_KEY not set. Copy .env.example → .env and add your key."
    )

# Initialize the new genai client
client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

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
    if not client:
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

        # 2. Convert PIL image to bytes for the API
        img_buffer = BytesIO()
        image.save(img_buffer, format="PNG")
        img_bytes = img_buffer.getvalue()

        # 3. Send multimodal request using the new google-genai SDK (Async)
        try:
            response = await client.aio.models.generate_content(
                model=GEMINI_MODEL,
                contents=[
                    types.Content(
                        role="user",
                        parts=[
                            types.Part.from_bytes(
                                data=img_bytes,
                                mime_type="image/png",
                            ),
                            types.Part.from_text(text=ANALYZE_PROMPT),
                        ],
                    )
                ],
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION,
                    temperature=0.1,  # Low temperature for consistent, factual output
                    max_output_tokens=4096,
                ),
            )
        except Exception as e:
            logger.warning(f"Primary model {GEMINI_MODEL} failed: {e}. Attempting fallback to {FALLBACK_MODEL}...")
            if FALLBACK_API_KEY and FALLBACK_API_URL:
                b64_image = base64.b64encode(img_bytes).decode("utf-8")
                payload = {
                    "model": FALLBACK_MODEL,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "image_url": {"url": f"data:image/png;base64,{b64_image}"},
                                    "type": "image_url"
                                },
                                {
                                    "type": "text",
                                    "text": f"{SYSTEM_INSTRUCTION}\n\n{ANALYZE_PROMPT}"
                                }
                            ]
                        }
                    ],
                    "temperature": 0.1,
                    "max_tokens": 4096,
                }
                headers = {
                    "Authorization": f"Bearer {FALLBACK_API_KEY}",
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                }
                async with httpx.AsyncClient(timeout=60.0) as http_client:
                    fb_response = await http_client.post(FALLBACK_API_URL, json=payload, headers=headers)
                    fb_response.raise_for_status()
                    fallback_text = fb_response.json()["choices"][0]["message"]["content"]
                    
                    class DummyResponse:
                        pass
                    response = DummyResponse()
                    response.text = fallback_text
            else:
                raise e

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
    if not client:
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

            # Convert PIL image to bytes
            img_buffer = BytesIO()
            image.save(img_buffer, format="PNG")
            img_bytes = img_buffer.getvalue()

            try:
                response = await client.aio.models.generate_content(
                    model=GEMINI_MODEL,
                    contents=[
                        types.Content(
                            role="user",
                            parts=[
                                types.Part.from_bytes(
                                    data=img_bytes,
                                    mime_type="image/png",
                                ),
                                types.Part.from_text(text=ANALYZE_PROMPT),
                            ],
                        )
                    ],
                    config=types.GenerateContentConfig(
                        system_instruction=SYSTEM_INSTRUCTION,
                        temperature=0.1,
                        max_output_tokens=4096,
                    ),
                )
            except Exception as e:
                logger.warning(f"Primary model {GEMINI_MODEL} failed in stream: {e}. Fallback to {FALLBACK_MODEL}...")
                if FALLBACK_API_KEY and FALLBACK_API_URL:
                    b64_image = base64.b64encode(img_bytes).decode("utf-8")
                    payload = {
                        "model": FALLBACK_MODEL,
                        "messages": [
                            {
                                "role": "user",
                                "content": [
                                    {
                                        "image_url": {"url": f"data:image/png;base64,{b64_image}"},
                                        "type": "image_url"
                                    },
                                    {
                                        "type": "text",
                                        "text": f"{SYSTEM_INSTRUCTION}\n\n{ANALYZE_PROMPT}"
                                    }
                                ]
                            }
                        ],
                        "temperature": 0.1,
                        "max_tokens": 4096,
                    }
                    headers = {
                        "Authorization": f"Bearer {FALLBACK_API_KEY}",
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    }
                    async with httpx.AsyncClient(timeout=60.0) as http_client:
                        fb_response = await http_client.post(FALLBACK_API_URL, json=payload, headers=headers)
                        fb_response.raise_for_status()
                        fallback_text = fb_response.json()["choices"][0]["message"]["content"]
                        
                        class DummyResponse:
                            pass
                        response = DummyResponse()
                        response.text = fallback_text
                else:
                    raise e

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
