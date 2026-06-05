"""
Image service for downloading and processing images from URLs.
"""

import os
import base64
import httpx
import hashlib
from pathlib import Path
from fastapi import HTTPException

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"

# Hard limits for safety/stability
MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10MB

async def download_image(url: str) -> dict:
    """
    Download an image from a URL and save it locally.
    Returns the local file path, image dimensions, and base64 encoded image data.
    """
    # Ensure upload directory exists
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    # Generate a unique filename based on URL hash
    url_hash = hashlib.md5(url.encode()).hexdigest()
    ext = _get_extension(url)
    filename = f"{url_hash}{ext}"
    filepath = UPLOAD_DIR / filename

    def _encode_cached_image(path: Path, expected_filename: str) -> dict:
        from PIL import Image

        # Validate by opening with PIL (will raise if corrupted/unsupported)
        with Image.open(path) as img:
            width, height = img.size
        
        with open(path, "rb") as f:
            image_data = f.read()
        
        base64_data = base64.b64encode(image_data).decode("utf-8")
        return {
            "path": str(path),
            "width": width,
            "height": height,
            "filename": expected_filename,
            "base64": base64_data,
        }

    # If already downloaded, return cached info
    if filepath.exists():
        try:
            return _encode_cached_image(filepath, filename)
        except Exception:
            # If cached file is corrupted, remove and re-download
            try:
                os.remove(filepath)
            except Exception:
                pass

    # Download the image
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()

            # Enforce size limit
            content = response.content
            if len(content) > MAX_IMAGE_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"Image too large (max {MAX_IMAGE_BYTES} bytes).",
                )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to download image from {url}: {str(e)}",
        )

    # Save to disk
    with open(filepath, "wb") as f:
        f.write(content)

    # Get dimensions and base64 encode
    from PIL import Image
    import io

    try:
        img = Image.open(io.BytesIO(content))
        img.verify()  # validate content is a real image
        # re-open to get size after verify
        img = Image.open(io.BytesIO(content))
        width, height = img.size
    except Exception as e:
        # Remove invalid file to keep cache clean
        try:
            os.remove(filepath)
        except Exception:
            pass
        raise HTTPException(
            status_code=400,
            detail=f"Invalid or unsupported image content: {str(e)}",
        )

    base64_data = base64.b64encode(content).decode("utf-8")
    return {
        "path": str(filepath),
        "width": width,
        "height": height,
        "filename": filename,
        "base64": base64_data,
    }

def _get_extension(url: str) -> str:
    """Extract file extension from URL or default to .jpg."""
    try:
        # Remove query parameters and fragments
        path = url.split("?")[0].split("#")[0]
        ext = os.path.splitext(path)[1].lower()
        if ext in [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]:
            return ext
    except Exception:
        pass
    return ".jpg"  # Default extension

def cleanup_old_files(max_age_hours: int = 1):
    """Clean up old uploaded files."""
    if not UPLOAD_DIR.exists():
        return

    import time
    now = time.time()
    for f in os.listdir(UPLOAD_DIR):
        filepath = UPLOAD_DIR / f
        if filepath.is_file():
            age_hours = (now - os.path.getmtime(filepath)) / 3600
            if age_hours > max_age_hours:
                os.remove(filepath)
