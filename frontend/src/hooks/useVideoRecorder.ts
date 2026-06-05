import { useRef, useCallback, useState } from 'react';
import { SourceImage, Mode, QUALITY_LABELS } from '../utils/types';
import { setupCanvas, drawScrollFrame, drawSlideFrame } from '../utils/canvasUtils';
import { fmt } from '../utils/timeUtils';

interface RecorderState {
  recording: boolean;
  previewing: boolean;
  progress: number;
  elapsed: string;
  remaining: string;
  percent: string;
  statusMsg: string;
  statusType: string;
}

export function useVideoRecorder() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const frameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animStartRef = useRef(0);
  const totalMsRef = useRef(10000);
  const virtualTimeRef = useRef(0); // For offline/background recording
  const workerRef = useRef<Worker | null>(null);

  // Initialize Worker for background timer
  const getWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    const code = `
      let timer = null;
      self.onmessage = (e) => {
        if (e.data.action === 'start') {
          if (timer) clearInterval(timer);
          timer = setInterval(() => self.postMessage('tick'), e.data.interval);
        } else if (e.data.action === 'stop') {
          if (timer) clearInterval(timer);
          timer = null;
        }
      };
    `;
    const blob = new Blob([code], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    workerRef.current = new Worker(url);
    return workerRef.current;
  }, []);
  const stoppedByUserRef = useRef(false);

  const [state, setState] = useState<RecorderState>({
    recording: false,
    previewing: false,
    progress: 0,
    elapsed: '0:00',
    remaining: '0:00',
    percent: '0%',
    statusMsg: '',
    statusType: '',
  });

  const updateUI = useCallback((ms: number, totalMs: number) => {
    const sec = ms / 1000;
    const prog = ms / totalMs;
    setState(prev => ({
      ...prev,
      progress: prog,
      elapsed: `⏱️ ${fmt(sec)}`,
      remaining: `-${fmt(Math.max(0, Math.round(totalMs / 1000 - sec)))}`,
      percent: `${Math.round(prog * 100)}%`,
    }));
  }, []);

  const showStatus = useCallback((msg: string, type: string = 'info') => {
    setState(prev => ({ ...prev, statusMsg: msg, statusType: type }));
  }, []);

  const clearStatus = useCallback(() => {
    setState(prev => ({ ...prev, statusMsg: '', statusType: '' }));
  }, []);

  const getFps = useCallback((mode: Mode, fps: number, fpsSlides: number) => {
    return mode === 'scroll' ? fps : fpsSlides;
  }, []);

  const getBitrate = useCallback((quality: string) => {
    return parseInt(quality, 10) || 25000000;
  }, []);

  const getQualityLabel = useCallback((quality: string) => {
    return QUALITY_LABELS[quality] || '25Mbps';
  }, []);

  // Scroll mode calculations
  const getScrollDist = useCallback((img: HTMLImageElement, W: number, H: number) => {
    const iW = img.naturalWidth;
    const iH = img.naturalHeight;
    const sc = W / iW;
    const sH = iH * sc;
    if (sH >= H) return sH - H;
    const mz = H / sH * 1.02;
    return (iH - (H / (sc * mz))) * sc;
  }, []);

  const calcDurationScroll = useCallback((img: HTMLImageElement | null, scrollSpeed: number, nq: number, pause: number, W: number, H: number) => {
    if (!img) return 0;
    const dist = getScrollDist(img, W, H);
    const sPerQ = dist / nq;
    const tPerQ = sPerQ / scrollSpeed;
    return Math.max(3, Math.min(600, Math.round(nq * tPerQ + nq * pause)));
  }, [getScrollDist]);

  const calcDurationSlides = useCallback((count: number, slideDur: number, transDur: number) => {
    if (count === 0) return 0;
    return Math.max(2, Math.min(1200, Math.round(count * slideDur + (count - 1) * transDur)));
  }, []);

  const startPlayback = useCallback((
    mode: Mode,
    isRecord: boolean,
    singleImage: HTMLImageElement | null,
    sourceImages: SourceImage[],
    scrollSpeed: number,
    numQuestions: number,
    pauseDuration: number,
    fps: number,
    fpsSlides: number,
    slideDuration: number,
    transitionDuration: number,
    width: number,
    height: number,
    quality: string,
    onDownload: (url: string, filename: string) => void,
    speedMultiplier: number = 1
  ) => {
    if (!canvasRef.current) return;

    const W = width || 1080;
    const H = height || 1920;
    const fpsVal = getFps(mode, fps, fpsSlides);
    const bitrate = getBitrate(quality);

    // Setup canvas
    ctxRef.current = setupCanvas(canvasRef.current, W, H);
    const ctx = ctxRef.current;

    // Calculate duration
    let durationSec: number;
    if (mode === 'scroll') {
      if (!singleImage) { showStatus('الرجاء تحميل الصورة أولاً.', 'error'); return; }
      durationSec = calcDurationScroll(singleImage, scrollSpeed, numQuestions, pauseDuration, W, H);
    } else {
      if (sourceImages.length === 0) { 
        showStatus('الرجاء إضافة صور أو سحب روابط أولاً ثم تحميل المحتوى.', 'error'); 
        return; 
      }
      durationSec = calcDurationSlides(sourceImages.length, slideDuration, transitionDuration);
    }

    totalMsRef.current = durationSec * 1000;
    if (durationSec < 2) { showStatus('المدة قصيرة جداً.', 'error'); return; }

    // Draw initial frame
    if (mode === 'scroll' && singleImage) {
      drawScrollFrame(ctx, singleImage, 0, W, H, numQuestions, 0);
    } else if (sourceImages.length > 0) {
      drawSlideFrame(ctx, sourceImages, 0, 'show', 0, 0, W, H, slideDuration * 1000);
    }

    if (isRecord) {
      // Start recording
      const stream = canvasRef.current.captureStream(60);
      streamRef.current = stream;

      const codecs = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
      let selectedMime = '';
      for (const m of codecs) {
        if (MediaRecorder.isTypeSupported(m)) { selectedMime = m; break; }
      }
      if (!selectedMime) { showStatus('❌ متصفحك لا يدعم تسجيل الفيديو.', 'error'); return; }

      chunksRef.current = [];
      try {
        recorderRef.current = new MediaRecorder(stream, {
          mimeType: selectedMime,
          videoBitsPerSecond: bitrate,
        });
      } catch (e) {
        try {
          recorderRef.current = new MediaRecorder(stream, { mimeType: selectedMime });
        } catch (e2) {
          showStatus('❌ فشل المسجل.', 'error');
          return;
        }
      }

      const ext = selectedMime.includes('mp4') ? 'mp4' : 'webm';

      recorderRef.current.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorderRef.current.onstop = () => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
        if (chunksRef.current.length === 0) {
          showStatus('❌ لم يتم تسجيل بيانات.', 'error');
          return;
        }
        const blob = new Blob(chunksRef.current, { type: selectedMime });
        const url = URL.createObjectURL(blob);
        const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
        const label = getQualityLabel(quality);

        if (blob.size > 1000) {
          showStatus(
            `✅ تم إنشاء الفيديو! المدة: ${fmt(Math.round(totalMsRef.current / 1000))} | الحجم: ${sizeMB} MB | الجودة: ${label}`,
            'success'
          );
        } else {
          showStatus(`⚠️ الحجم صغير جداً (${sizeMB} MB).`, 'warning');
        }

        onDownload(url, `video.${ext}`);
        setState(prev => ({ ...prev, recording: false }));
      };

      recorderRef.current.onerror = () => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
        showStatus('❌ خطأ في التسجيل.', 'error');
        setState(prev => ({ ...prev, recording: false }));
      };

      stoppedByUserRef.current = false;
      setState(prev => ({ ...prev, recording: true, previewing: false }));
      animStartRef.current = performance.now();
      virtualTimeRef.current = 0; // Reset virtual clock
      recorderRef.current.start(100);
      showStatus(`🎥 جاري التسجيل... ${fmt(durationSec)} | ${getQualityLabel(quality)}`, 'info');

      // Start background worker timer
      const worker = getWorker();
      worker.onmessage = () => {
        runLoop(mode, true, singleImage, sourceImages, scrollSpeed, numQuestions, pauseDuration, fpsVal, slideDuration, transitionDuration, W, H);
      };
      worker.postMessage({ action: 'start', interval: Math.floor(1000 / (fpsVal * speedMultiplier)) });
    } else {
      // Preview
      setState(prev => ({ ...prev, previewing: true, recording: false }));
      animStartRef.current = performance.now();
      clearStatus();
      if (frameTimerRef.current) clearTimeout(frameTimerRef.current);
      runLoop(mode, false, singleImage, sourceImages, scrollSpeed, numQuestions, pauseDuration, fpsVal, slideDuration, transitionDuration, W, H);
    }
  }, [getFps, getBitrate, getQualityLabel, getScrollDist, calcDurationScroll, calcDurationSlides, showStatus, clearStatus]);

  const runLoop = useCallback((
    mode: Mode,
    isRecord: boolean,
    singleImage: HTMLImageElement | null,
    sourceImages: SourceImage[],
    scrollSpeed: number,
    numQuestions: number,
    pauseDuration: number,
    fpsVal: number,
    slideDuration: number,
    transitionDuration: number,
    W: number,
    H: number
  ) => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    const frameMs = 1000 / fpsVal;
    const totalMs = totalMsRef.current;

    // Use virtual time for recording to avoid background throttling issues
    // Use real time for preview to keep it smooth
    let elapsed: number;
    if (isRecord) {
      virtualTimeRef.current += frameMs;
      elapsed = virtualTimeRef.current;
    } else {
      elapsed = performance.now() - animStartRef.current;
    }

    if (mode === 'scroll' && singleImage) {
      const dist = getScrollDist(singleImage, W, H);
      const spd = scrollSpeed;
      const nq = numQuestions;
      const p = pauseDuration;
      const sPerQ = dist / nq;
      const tScroll = sPerQ / spd;
      const segMs = (tScroll + p) * 1000;
      const idx = Math.floor(elapsed / segMs);
      const inside = elapsed - idx * segMs;
      const tScrollMs = tScroll * 1000;
      const prog = inside < tScrollMs
        ? (idx + inside / tScrollMs) / nq
        : (idx + 1) / nq;

      // Calculate progress within current segment (scroll + pause)
      const itemProgress = Math.min(1, inside / segMs);

      drawScrollFrame(ctx, singleImage, Math.min(prog, 1), W, H, nq, itemProgress);

      if (inside < tScrollMs) {
        showStatus('');
      } else {
        showStatus(`⏸️ سؤال ${idx + 1} من ${nq}`, 'question');
      }
    } else if (mode === 'slides' || mode === 'scrape') {
      const n = sourceImages.length;
      if (n === 0) return;

      const perSlide = slideDuration * 1000;
      const trans = transitionDuration * 1000;

      let accum = 0;
      let slideIdx = 0;
      let phase = 'show';
      let localMs = 0;
      let transDur = 0;

      for (let i = 0; i < n; i++) {
        if (elapsed < accum + perSlide) {
          slideIdx = i;
          phase = 'show';
          localMs = elapsed - accum;
          break;
        }
        accum += perSlide;
        if (i < n - 1) {
          if (elapsed < accum + trans) {
            slideIdx = i;
            phase = 'transition';
            localMs = elapsed - accum;
            transDur = trans;
            break;
          }
          accum += trans;
        }
        if (i === n - 1) {
          slideIdx = i;
          phase = 'show';
          localMs = perSlide;
        }
      }

      drawSlideFrame(ctx, sourceImages, slideIdx, phase, localMs, transDur, W, H, perSlide);

      if (phase === 'show') {
        showStatus(`🖼️ عرض الصورة ${slideIdx + 1} من ${n}`, 'info');
      } else if (phase === 'transition') {
        showStatus(`↩️ انتقال إلى الصورة ${slideIdx + 2} من ${n}`, 'question');
      }
    }

    updateUI(elapsed, totalMs);

    if (elapsed >= totalMs) {
      if (workerRef.current) {
        workerRef.current.postMessage({ action: 'stop' });
      }
      if (frameTimerRef.current) { 
        if (typeof frameTimerRef.current === 'number') {
          clearTimeout(frameTimerRef.current);
        } else {
          cancelAnimationFrame(frameTimerRef.current);
        }
        frameTimerRef.current = null; 
      }
      setTimeout(() => {
        if (isRecord && recorderRef.current && recorderRef.current.state === 'recording') {
          try { recorderRef.current.stop(); } catch (e) {}
        }
        if (!isRecord) {
          setState(prev => ({ ...prev, previewing: false }));
          showStatus('✅ انتهت المعاينة.', 'info');
        }
      }, frameMs + 100);
      return;
    }

    if (!isRecord) {
      frameTimerRef.current = requestAnimationFrame(() => {
        runLoop(mode, isRecord, singleImage, sourceImages, scrollSpeed, numQuestions, pauseDuration, fpsVal, slideDuration, transitionDuration, W, H);
      });
    }
  }, [getScrollDist, updateUI, showStatus, calcDurationScroll, calcDurationSlides, getFps, getBitrate, getQualityLabel]);

  const stopPlayback = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ action: 'stop' });
    }
    if (frameTimerRef.current) {
      if (typeof frameTimerRef.current === 'number') {
        clearTimeout(frameTimerRef.current);
      } else {
        cancelAnimationFrame(frameTimerRef.current);
      }
      frameTimerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      try { recorderRef.current.stop(); } catch (e) {}
    }
    if (streamRef.current) {
      try { streamRef.current.getTracks().forEach(t => t.stop()); } catch (e) {}
      streamRef.current = null;
    }
    setState(prev => ({
      ...prev,
      recording: false,
      previewing: false,
      progress: 0,
    }));
    showStatus('⏹️ تم الإيقاف.', 'warning');
  }, [showStatus]);

  return {
    canvasRef,
    state,
    setState,
    startPlayback,
    stopPlayback,
    showStatus,
    clearStatus,
    calcDurationScroll,
    calcDurationSlides,
    getQualityLabel,
  };
}