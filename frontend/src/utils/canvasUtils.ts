import { SourceImage } from './types';

export function setupCanvas(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

export function drawBadge(
  ctx: CanvasRenderingContext2D,
  current: number,
  total: number,
  isScroll: boolean,
  itemProgress: number,
  W: number,
  H: number
) {
  // Scale based on height
  const sc = H / 1000; 
  const pad = H * 0.03;
  const badgeW = (isScroll ? 105 : 115) * sc;
  const badgeH = 50 * sc;
  const bx = W - pad - badgeW;
  const by = H - pad - badgeH;

  ctx.save();
  // Glassmorphism effect
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 10 * sc;
  
  // High-quality transparent background
  ctx.fillStyle = 'rgba(15, 23, 42, 0.5)'; // Darker slate but transparent
  ctx.beginPath();
  ctx.roundRect(bx, by, badgeW, badgeH, 12 * sc);
  ctx.fill();

  // Glass highlight
  const grad = ctx.createLinearGradient(bx, by, bx, by + badgeH);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
  ctx.fillStyle = grad;
  ctx.fill();

  // Subtle border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1 * sc;
  ctx.stroke();

  // Content
  const icon = isScroll ? '📝' : '🖼️';
  const fontSize = Math.round(18 * sc);
  const text = `${icon} ${current} / ${total}`;
  
  ctx.font = `bold ${fontSize}px "Cairo", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Draw a subtle glow for the text to ensure readability
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 4 * sc;
  
  // Draw the full text (Icon + Numbers) centered
  ctx.fillStyle = '#fff';
  ctx.fillText(text, bx + badgeW / 2, by + badgeH / 2 - (4 * sc));
  
  // Reset shadow for the progress bar
  ctx.shadowBlur = 0;

  // Progress line for current item (Slide or Question)
  const barY = by + badgeH - (10 * sc);
  const barH = 5 * sc;
  const barW = badgeW - (28 * sc);
  const barX = bx + (14 * sc);
  
  // Track
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, 2.5 * sc);
  ctx.fill();

  // Fill
  const fillW = barW * Math.min(1, Math.max(0, itemProgress));
  if (fillW > 1) {
    const g = ctx.createLinearGradient(barX, barY, barX + fillW, barY);
    g.addColorStop(0, '#60a5fa'); // Lighter blue
    g.addColorStop(1, '#2563eb'); // Primary blue
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(barX, barY, fillW, barH, 2.5 * sc);
    ctx.fill();
    
    // Glow effect for the progress bar
    ctx.shadowColor = 'rgba(37, 99, 235, 0.5)';
    ctx.shadowBlur = 8 * sc;
    ctx.stroke();
  }
  ctx.restore();
}

export function drawScrollFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  prog: number,
  W: number,
  H: number,
  nq: number,
  itemProgress: number
) {
  const iW = img.naturalWidth;
  const iH = img.naturalHeight;
  const sc = W / iW;
  const sH = iH * sc;
  const uiSc = H / 1000; 
  
  let srcY: number, srcH: number, dstY: number;

  if (sH >= H) {
    srcY = (prog * (sH - H)) / sc;
    srcH = H / sc;
    dstY = 0;
  } else {
    const mz = H / sH * 1.02;
    const z = 1 + prog * (mz - 1);
    srcH = Math.min(H / (sc * z), iH);
    srcY = prog * (iH - srcH);
    srcY = Math.max(0, Math.min(srcY, iH - 1));
    srcH = Math.min(srcH, iH - srcY);
    dstY = (H - srcH * sc) / 2;
  }

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, srcY, iW, srcH, 0, dstY, W, srcH * sc);

  // Vertical progress bar
  const bx = W - (15 * uiSc);
  const bw = 10 * uiSc;
  const bH = H * 0.6;
  const by = (H - bH) / 2;
  
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bH, 5 * uiSc);
  ctx.fill();

  const fH = bH * prog;
  const fY = by + bH - fH;
  const grad = ctx.createLinearGradient(bx, fY, bx, fY + fH);
  grad.addColorStop(0, '#3b82f6');
  grad.addColorStop(1, '#2563eb');
  
  ctx.shadowColor = 'rgba(37, 99, 235, 0.4)';
  ctx.shadowBlur = 15 * uiSc;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(bx, fY, bw, fH, 5 * uiSc);
  ctx.fill();
  ctx.shadowBlur = 0;

  for (let q = 1; q < nq; q++) {
    const qy = by + bH - (q / nq) * bH;
    ctx.beginPath();
    ctx.arc(bx + bw / 2, qy, 6 * uiSc, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bx + bw / 2, qy, 4 * uiSc, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fill();
  }

  // Badge
  const curQ = Math.min(Math.ceil(prog * nq), nq);
  drawBadge(ctx, curQ, nq, true, itemProgress, W, H);
}

export function drawSlideFrame(
  ctx: CanvasRenderingContext2D,
  images: SourceImage[],
  slideIdx: number,
  phase: string,
  localMs: number,
  transDur: number | undefined,
  W: number,
  H: number,
  slideDurationMs: number
) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  if (images.length === 0) return;

  if (phase === 'transition' && slideIdx < images.length - 1) {
    const t = transDur || 1000;
    const p = Math.min(1, localMs / t);
    const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    drawImageCentered(ctx, images[slideIdx].img, W, H, -eased * W, 0);
    drawImageCentered(ctx, images[slideIdx + 1].img, W, H, (1 - eased) * W, 0);
    
    // In transition, progress is effectively 100% for the slide that just finished
    drawBadge(ctx, slideIdx + 1, images.length, false, 1, W, H);
  } else {
    const idx = Math.min(slideIdx, images.length - 1);
    drawImageCentered(ctx, images[idx].img, W, H, 0, 0);
    
    // Calculate progress within the current slide
    const itemProgress = localMs / slideDurationMs;
    drawBadge(ctx, slideIdx + 1, images.length, false, itemProgress, W, H);
  }
}

function drawImageCentered(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  W: number,
  H: number,
  ox: number,
  oy: number
) {
  const iW = img.naturalWidth;
  const iH = img.naturalHeight;
  const scale = Math.max(W / iW, H / iH);
  ctx.drawImage(img, (W - iW * scale) / 2 + ox, (H - iH * scale) / 2 + oy, iW * scale, iH * scale);
}

export async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${url}`));

    // Try to load directly first
    img.src = url;

    // If it's a data URL or blob URL, it should load fine.
    // If it's a cross-origin URL, we hope CORS is enabled on the server.
    // The backend already provides images as base64, so this is mostly for other uses.
  });
}