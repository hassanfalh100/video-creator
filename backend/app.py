"""
Video Creator - FastAPI Backend
Provides image download API for the frontend React app.
"""

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
from contextlib import asynccontextmanager
import logging
import httpx
from bs4 import BeautifulSoup
import re

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from services.image_service import download_image, cleanup_old_files

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: cleanup old files
    logger.info("Starting up: cleaning up old files")
    cleanup_old_files(max_age_hours=2)
    yield

app = FastAPI(
    title="Video Creator API",
    description="Backend API for the Video Creator application",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global exception handler caught: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "message": str(exc)},
    )

# Models
class ImageDownloadRequest(BaseModel):
    url: str

class BatchImageDownloadRequest(BaseModel):
    urls: List[str]

class ScrapeRequest(BaseModel):
    url: str

class ImageInfo(BaseModel):
    path: str
    width: int
    height: int
    filename: str
    base64: Optional[str] = None

# Routes
@app.get("/api/health")
async def health_check():
    return {"status": "ok", "message": "Video Creator API is running"}

@app.post("/api/download-image", response_model=ImageInfo)
async def api_download_image(request: ImageDownloadRequest):
    """
    Download a single image from a URL and return its info.
    """
    logger.info(f"Downloading single image: {request.url}")
    try:
        result = await download_image(request.url)
        return result
    except Exception as e:
        logger.error(f"Error downloading image: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/download-images", response_model=List[ImageInfo])
async def api_download_images(request: BatchImageDownloadRequest):
    """
    Download multiple images from URLs and return their info.
    """
    logger.info(f"Downloading {len(request.urls)} images")
    results = []
    for url in request.urls:
        try:
            result = await download_image(url)
            results.append(result)
        except Exception as e:
            logger.warning(f"Failed to download {url}: {e}")
            # If one fails, still return others in a consistent shape
            results.append({
                "path": "",
                "width": 0,
                "height": 0,
                "filename": f"Failed: {url[:50]}",
                "base64": None,
            })
    return results

@app.post("/api/scrape-images")
async def api_scrape_images(request: ScrapeRequest):
    """
    Scrape images from a given URL specifically looking for article images.
    """
    logger.info(f"Scraping images from: {request.url}")
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(request.url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
            })
            response.raise_for_status()
            
        soup = BeautifulSoup(response.text, 'html.parser')
        article = soup.find('article')
        
        if not article:
            # Fallback to whole body if article not found
            article = soup
            
        image_urls = []
        # Find all <a> tags that contain an <img> tag
        links = article.find_all('a')
        for link in links:
            img = link.find('img')
            if img and link.get('href'):
                href = link.get('href')
                # Filter for typical blogger/image URLs if needed, or just take all
                if any(ext in href.lower() for ext in ['.jpg', '.jpeg', '.png', '.webp']):
                    image_urls.append(href)
        
        # Unique URLs
        image_urls = list(dict.fromkeys(image_urls))
        logger.info(f"Found {len(image_urls)} images")
        return {"urls": image_urls}
        
    except Exception as e:
        logger.error(f"Error scraping images: {e}")
        raise HTTPException(status_code=400, detail=f"فشل سحب الصور من الموقع: {str(e)}")

@app.get("/api/supported-sizes")
async def get_supported_sizes():
    """
    Return supported video preset sizes.
    """
    return {
        "presets": [
            {"label": "يوتيوب - فيديو عادي أفقي", "width": 1920, "height": 1080, "ratio": "16:9", "platform": "youtube"},
            {"label": "يوتيوب - Shorts", "width": 1080, "height": 1920, "ratio": "9:16", "platform": "youtube"},
            {"label": "فيسبوك - فيديو أفقي", "width": 1920, "height": 1080, "ratio": "16:9", "platform": "facebook"},
            {"label": "فيسبوك - Reels", "width": 1080, "height": 1920, "ratio": "9:16", "platform": "facebook"},
            {"label": "فيسبوك - فيديو مربع", "width": 1080, "height": 1080, "ratio": "1:1", "platform": "facebook"},
        ],
        "quality_options": [
            {"label": "قياسي 5Mbps", "value": 5000000},
            {"label": "جيد 12Mbps", "value": 12000000},
            {"label": "عالي 25Mbps", "value": 25000000},
            {"label": "فائق 50Mbps", "value": 50000000},
            {"label": "احترافي 80Mbps", "value": 80000000},
        ]
    }

# Routes
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)