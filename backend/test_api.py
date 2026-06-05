import asyncio
import os
from typing import Any

import httpx

BASE_URL = os.environ.get("API_BASE_URL", "http://127.0.0.1:8000")

# Using placeholder images (should be large enough for success, small for safety)
OK_IMAGE_URL = "https://picsum.photos/seed/ok/600/400"
BAD_URL = "https://example.invalid/non-existent-image.png"

# Try to get a "too large" response (may or may not work depending on remote server/CDN limits)
# Fallback: if this fails differently, we still verify other endpoints.
LARGE_IMAGE_URL = "https://picsum.photos/seed/large/3000/3000"

async def post_json(client: httpx.AsyncClient, path: str, payload: Any):
    r = await client.post(f"{BASE_URL}{path}", json=payload, timeout=60.0)
    text = r.text
    try:
        data = r.json()
    except Exception:
        data = text
    return r.status_code, data

async def main():
    async with httpx.AsyncClient() as client:
        # Health
        code, data = await post_json(client, "/api/health", {})
        # health_check is GET in code; above would fail—use GET properly
        # We'll call GET separately:
        r = await client.get(f"{BASE_URL}/api/health", timeout=30.0)
        print("GET /api/health:", r.status_code, r.json())

        # download-image success
        code, data = await post_json(client, "/api/download-image", {"url": OK_IMAGE_URL})
        print("POST /api/download-image (ok):", code, {k: data.get(k) for k in ["width","height","filename","base64"]})

        # download-image failure
        code, data = await post_json(client, "/api/download-image", {"url": BAD_URL})
        print("POST /api/download-image (bad):", code, data)

        # download-images mixed
        code, data = await post_json(client, "/api/download-images", {"urls": [OK_IMAGE_URL, BAD_URL]})
        print("POST /api/download-images (mixed):", code, "count=", len(data))
        # show summary
        summary = []
        for item in data:
            summary.append({
                "filename": item.get("filename"),
                "width": item.get("width"),
                "height": item.get("height"),
                "has_base64": bool(item.get("base64")),
            })
        print("Summary:", summary)

        # Cache check: call same ok image twice
        code1, data1 = await post_json(client, "/api/download-image", {"url": OK_IMAGE_URL})
        code2, data2 = await post_json(client, "/api/download-image", {"url": OK_IMAGE_URL})
        print("Cache check status:", code1, code2, "same filename:", data1.get("filename") == data2.get("filename"))

        # cleanup_old_files guard test: simulate by calling startup? can't easily.
        # We can at least call download-image to ensure UPLOAD_DIR exists without crash.
        # Large image test
        code, data = await post_json(client, "/api/download-image", {"url": LARGE_IMAGE_URL})
        print("POST /api/download-image (large-ish):", code, "detail/base64:", (data if isinstance(data, dict) else str(data))[:300])

if __name__ == "__main__":
    asyncio.run(main())
