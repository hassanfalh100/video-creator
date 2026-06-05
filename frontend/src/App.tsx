import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mode, SourceImage, VIDEO_PRESETS } from './utils/types';
import { useVideoRecorder } from './hooks/useVideoRecorder';
import { fmt } from './utils/timeUtils';
import "@hyperframes/player";

// Extend JSX for HyperFrames player
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'hyperframes-player': any;
    }
  }
}

export default function App() {
  const {
    canvasRef,
    state,
    startPlayback,
    stopPlayback,
    showStatus,
    clearStatus,
    calcDurationScroll,
    calcDurationSlides,
    getQualityLabel,
  } = useVideoRecorder();

  const [mode, setMode] = useState<Mode>('scroll');
  const [singleImage, setSingleImage] = useState<HTMLImageElement | null>(null);
  const [sourceImages, setSourceImages] = useState<SourceImage[]>([]);
  const [imageUrl, setImageUrl] = useState('');
  const [slideUrls, setSlideUrls] = useState(
    'https://picsum.photos/1080/1920?random=1\nhttps://picsum.photos/1080/1920?random=2\nhttps://picsum.photos/1080/1920?random=3\nhttps://picsum.photos/1080/1920?random=4\nhttps://picsum.photos/1080/1920?random=5'
  );
  const [scrollSpeed, setScrollSpeed] = useState(50);
  const [numQuestions, setNumQuestions] = useState(5);
  const [pauseDuration, setPauseDuration] = useState(5);
  const [fps, setFps] = useState(30);
  const [fpsSlides, setFpsSlides] = useState(30);
  const [slideDuration, setSlideDuration] = useState(4);
  const [transitionDuration, setTransitionDuration] = useState(1.0);
  const [width, setWidth] = useState(1080);
  const [height, setHeight] = useState(1920);
  const [quality, setQuality] = useState('25000000');
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [imgInfo, setImgInfo] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [hyperCompositionUrl, setHyperCompositionUrl] = useState('');
  const [renderer, setRenderer] = useState<'classic' | 'hyper'>('classic');

  const handleDownload = useCallback((url: string, filename: string) => {
    setDownloadUrl(url);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);
    a.click();
  }, []);

  const handleScrape = useCallback(async () => {
    if (!scrapeUrl.trim()) {
      showStatus('الرجاء إدخال رابط الموقع أولاً.', 'error');
      return;
    }
    setIsScraping(true);
    showStatus('جاري سحب الروابط من الموقع...', 'info');
    try {
      const response = await fetch('/api/scrape-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: scrapeUrl.trim() }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'فشل سحب الصور');
      }
      const data = await response.json();
      if (data.urls && data.urls.length > 0) {
        setSlideUrls(data.urls.join('\n'));
        setMode('slides');
        showStatus(`✅ تم سحب ${data.urls.length} رابط بنجاح!`, 'success');
      } else {
        showStatus('❌ لم يتم العثور على صور متوافقة في هذا الرابط.', 'error');
      }
    } catch (err: any) {
      showStatus(err.message, 'error');
    }
    setIsScraping(false);
  }, [scrapeUrl, showStatus]);

  const generateHyperComposition = useCallback(() => {
    const isScroll = mode === 'scroll';
    const totalDuration = isScroll 
      ? calcDurationScroll(singleImage, scrollSpeed, numQuestions, pauseDuration, width, height)
      : calcDurationSlides(sourceImages.length, slideDuration, transitionDuration);

    const html = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap" rel="stylesheet">
  <style>
    body, html { margin: 0; padding: 0; background: #000; overflow: hidden; font-family: 'Cairo', sans-serif; }
    #video-canvas { width: ${width}px; height: ${height}px; position: relative; }
    .badge {
      position: absolute; bottom: 30px; right: 30px;
      padding: 15px 25px; background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(10px); border-radius: 20px;
      border: 1px solid rgba(255,255,255,0.2); color: #fff;
      display: flex; flex-direction: column; align-items: center; gap: 8px;
    }
    .progress-track { width: 100px; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; }
    .progress-fill { height: 100%; background: #3b82f6; border-radius: 3px; width: 0%; }
    
    @keyframes fillProgress { from { width: 0%; } to { width: 100%; } }
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0%); opacity: 1; } }
    @keyframes slideOut { from { transform: translateX(0%); opacity: 1; } to { transform: translateX(-100%); opacity: 0; } }
  </style>
</head>
<body>
      <div id="video-canvas" data-duration="${totalDuration}">
    ${isScroll && singleImage ? `
      <img src="${singleImage.src}" style="width: 100%; position: absolute; top: 0;" 
           data-animate='{"top": "-${singleImage.naturalHeight * (width / singleImage.naturalWidth) - height}px", "duration": ${totalDuration}, "ease": "linear"}'>
    ` : sourceImages.map((img, i) => {
         const start = i * (slideDuration + transitionDuration);
         // Keep image visible long enough for the next image's transition to complete
         const duration = slideDuration + transitionDuration + transitionDuration;
         return `
       <div data-start="${start}" data-duration="${duration}" 
             style="position: absolute; inset: 0; z-index: ${i}; transform: translateX(${i === 0 ? 0 : 100}%);"
             ${i > 0 ? `data-animate='{"transform": "translateX(0%)", "duration": ${transitionDuration}, "ease": "easeInOut"}'` : ''}>
          <img src="${img.img.src}" style="width: 100%; height: 100%; object-fit: contain; background: #000;">
          
          <!-- UI Badge for each slide -->
          <div class="badge" style="bottom: 30px; right: 30px;">
             <div style="font-size: 24px; font-weight: 800; color: #60a5fa;">🖼️ ${i + 1} / ${sourceImages.length}</div>
             <div class="progress-track">
               <div class="progress-fill" style="animation: fillProgress ${slideDuration + transitionDuration}s linear infinite;"></div>
             </div>
          </div>
        </div>`;
     }).join('')}

    <!-- UI Badge (Scroll only, Slides have per-slide badges) -->
    ${isScroll ? `
    <div class="badge" data-start="0" data-duration="${totalDuration}">
       <div id="badge-text" style="font-size: 24px; font-weight: 800; color: #60a5fa;">📝 1 / ${numQuestions}</div>
       <div class="progress-track">
         <div class="progress-fill" style="animation: fillProgress ${totalDuration/numQuestions}s linear infinite;"></div>
       </div>
    </div>
    ` : ''}
  </div>
</body>
</html>
    `;

    if (hyperCompositionUrl) URL.revokeObjectURL(hyperCompositionUrl);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    setHyperCompositionUrl(url);
    if (renderer === 'hyper') {
      showStatus('🚀 تم تحديث قالب HyperFrames!', 'success');
    }
  }, [mode, singleImage, sourceImages, scrollSpeed, numQuestions, pauseDuration, width, height, slideDuration, transitionDuration, calcDurationScroll, calcDurationSlides, showStatus, renderer]);

  // Automatically regenerate HyperFrames composition when relevant data changes
  useEffect(() => {
    if (renderer === 'hyper' && (singleImage || sourceImages.length > 0)) {
      generateHyperComposition();
    }
  }, [renderer, singleImage, sourceImages, generateHyperComposition]);

   const handleLoad = useCallback(async () => {
     if (mode === 'scroll') {
       if (!imageUrl.trim()) { showStatus('الرجاء إدخال رابط الصورة.', 'error'); return; }
       setLoading(true);
       showStatus('جاري تحميل الصورة...', 'info');
       try {
         const response = await fetch('/api/download-image', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ url: imageUrl.trim() }),
         });
         if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
         const result = await response.json();
         if (!result.base64) throw new Error('No image data received from server');
         const img = new Image();
         img.crossOrigin = 'anonymous';
         img.onload = () => {
           setSingleImage(img);
           setImgInfo(`صورة واحدة بمقاس ${result.width} × ${result.height} بكسل`);
           
           // Sync video settings with image dimensions
           setWidth(result.width);
           setHeight(result.height);
           
           showStatus('✅ تم تحميل الصورة بنجاح وتحديث مقاسات الفيديو!', 'success');
           
           if (canvasRef.current) {
             const W = result.width, H = result.height;
             const ctx = canvasRef.current.getContext('2d', { alpha: false })!;
             ctx.imageSmoothingEnabled = true;
             ctx.imageSmoothingQuality = 'high';
             canvasRef.current.width = W;
             canvasRef.current.height = H;
             ctx.fillStyle = '#000';
             ctx.fillRect(0, 0, W, H);
             ctx.drawImage(img, 0, 0, W, H);
           }
         };
         img.onerror = () => {
           showStatus('❌ فشل معالجة الصورة.', 'error');
           setLoading(false);
         };
         img.src = `data:image/jpeg;base64,${result.base64}`;
       } catch (err) {
         console.error('Error loading image:', err);
         showStatus('❌ فشل تحميل الصورة.', 'error');
       }
       setLoading(false);
     } else {
       const urls = slideUrls.split('\n').map(s => s.trim()).filter(s => s.length > 0);
       if (urls.length === 0) { showStatus('الرجاء إضافة روابط الصور.', 'error'); return; }
       setLoading(true);
       showStatus(`جاري تحميل ${urls.length} صورة...`, 'info');
       try {
         const response = await fetch('/api/download-images', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ urls }),
         });
         if (!response.ok) {
           let errorDetail = `HTTP error! status: ${response.status}`;
           try {
             const errorJson = await response.json();
             if (errorJson.message) errorDetail = errorJson.message;
             else if (errorJson.detail) errorDetail = errorJson.detail;
           } catch (e) {}
           throw new Error(errorDetail);
         }
         const results = await response.json();
         const loadPromises = results.map((result: any, i: number) => {
           return new Promise<SourceImage | null>((resolve) => {
             if (!result.base64 || result.width <= 0) return resolve(null);
             const img = new Image();
             img.crossOrigin = 'anonymous';
             img.onload = () => resolve({ img, url: urls[i] });
             img.onerror = () => resolve(null);
             img.src = `data:image/jpeg;base64,${result.base64}`;
           });
         });
         const images = await Promise.all(loadPromises);
         const validImages = images.filter((img): img is SourceImage => img !== null);
         setSourceImages(validImages);
         if (validImages.length === 0) {
           showStatus('❌ فشل تحميل جميع الصور.', 'error');
         } else {
           const firstImg = validImages[0].img;
           const imgW = firstImg.naturalWidth;
           const imgH = firstImg.naturalHeight;

           setImgInfo(`تم تحميل ${validImages.length} صورة بنجاح | المقاس: ${imgW}×${imgH} بكسل`);
           
           // Sync video settings with the first image's dimensions
           setWidth(imgW);
           setHeight(imgH);

           showStatus(`✅ تم تحميل ${validImages.length} صورة وتحديث مقاسات الفيديو!`, 'success');
           
           if (canvasRef.current) {
             const W = imgW, H = imgH;
             canvasRef.current.width = W;
             canvasRef.current.height = H;
             const ctx = canvasRef.current.getContext('2d', { alpha: false })!;
             ctx.fillStyle = '#000';
             ctx.fillRect(0, 0, W, H);
             ctx.drawImage(firstImg, 0, 0, W, H);
           }
         }
       } catch (err) {
         console.error('Error loading images:', err);
         showStatus('❌ فشل تحميل الصور.', 'error');
       }
       setLoading(false);
     }
   }, [mode, imageUrl, slideUrls, width, height, canvasRef, showStatus]);

  const handlePreview = useCallback(() => {
    if (state.previewing || state.recording) stopPlayback();
    else startPlayback(mode, false, singleImage, sourceImages, scrollSpeed, numQuestions, pauseDuration, fps, fpsSlides, slideDuration, transitionDuration, width, height, quality, handleDownload, 1);
  }, [state.previewing, state.recording, stopPlayback, startPlayback, mode, singleImage, sourceImages, scrollSpeed, numQuestions, pauseDuration, fps, fpsSlides, slideDuration, transitionDuration, width, height, quality, handleDownload]);

  const handleRecord = useCallback(() => {
    startPlayback(mode, true, singleImage, sourceImages, scrollSpeed, numQuestions, pauseDuration, fps, fpsSlides, slideDuration, transitionDuration, width, height, quality, handleDownload, speedMultiplier);
  }, [startPlayback, mode, singleImage, sourceImages, scrollSpeed, numQuestions, pauseDuration, fps, fpsSlides, slideDuration, transitionDuration, width, height, quality, handleDownload, speedMultiplier]);

  const handlePresetChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (!val) return;
    const [w, h] = val.split('x').map(Number);
    if (!isNaN(w) && !isNaN(h)) { setWidth(w); setHeight(h); }
  }, []);

  const durationSec = mode === 'scroll'
    ? calcDurationScroll(singleImage, scrollSpeed, numQuestions, pauseDuration, width, height)
    : calcDurationSlides(sourceImages.length, slideDuration, transitionDuration);
  const m = Math.floor(durationSec / 60), s = Math.floor(durationSec % 60);
  const durStr = m > 0 ? `${m} دقيقة و ${s} ثانية` : `${s} ثانية`;

  return (
    <div className="app-container">
      {/* Sidebar - Right */}
      <div className="sidebar">
        <h2>⚙️ إعدادات الفيديو</h2>
        
        <div className="mode-tabs">
          <button className={`mode-tab ${mode === 'scroll' ? 'active' : ''}`} onClick={() => { setMode('scroll'); clearStatus(); }}>📜 تمرير</button>
          <button className={`mode-tab ${mode === 'slides' ? 'active' : ''}`} onClick={() => { setMode('slides'); clearStatus(); }}>🖼️ شرائح</button>
          <button className={`mode-tab ${mode === 'scrape' ? 'active' : ''}`} onClick={() => { setMode('scrape'); clearStatus(); }}>🌐 سحب</button>
        </div>

        <div className="card">
          <label>تقنية الرندرة</label>
          <div className="mode-tabs">
            <button className={`mode-tab ${renderer === 'classic' ? 'active' : ''}`} onClick={() => setRenderer('classic')}>⚡ Classic (Canvas)</button>
            <button className={`mode-tab ${renderer === 'hyper' ? 'active' : ''}`} onClick={() => { setRenderer('hyper'); generateHyperComposition(); }}>🚀 HyperFrames</button>
          </div>
        </div>

        <div className="card">
          {mode === 'scroll' ? (
            <>
              <div className="form-group">
                <label>رابط الصورة</label>
                <div className="input-wrapper">
                  <span className="input-icon">🔗</span>
                  <input type="url" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="رابط صورة الأسئلة..." dir="ltr" />
                </div>
              </div>
              <div className="row">
                <div className="form-group">
                  <label>السرعة</label>
                  <select value={scrollSpeed} onChange={e => setScrollSpeed(Number(e.target.value))}>
                    <option value={20}>🐢 20</option>
                    <option value={50}>🚶 50</option>
                    <option value={100}>🏃 100</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>الأسئلة</label>
                  <input type="number" value={numQuestions} onChange={e => setNumQuestions(Number(e.target.value))} />
                </div>
              </div>
            </>
          ) : mode === 'slides' ? (
            <>
              <div className="form-group">
                <label>روابط الصور (سطر لكل رابط)</label>
                <textarea value={slideUrls} onChange={e => setSlideUrls(e.target.value)} rows={5} dir="ltr" />
              </div>
              <div className="row">
                <div className="form-group">
                  <label>مدة الشريحة</label>
                  <input type="number" value={slideDuration} onChange={e => setSlideDuration(Number(e.target.value))} />
                </div>
                <div className="form-group">
                  <label>الانتقال</label>
                  <input type="number" step="0.1" value={transitionDuration} onChange={e => setTransitionDuration(Number(e.target.value))} />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="form-group">
                <label>رابط الموقع لسحب الصور</label>
                <div className="input-wrapper">
                  <span className="input-icon">🌐</span>
                  <input 
                    type="url" 
                    value={scrapeUrl} 
                    onChange={e => setScrapeUrl(e.target.value)} 
                    placeholder="https://example.com/page.html" 
                    dir="ltr" 
                  />
                </div>
              </div>
              <button 
                className="btn btn-primary" 
                style={{ width: '100%' }} 
                onClick={handleScrape}
                disabled={isScraping}
              >
                {isScraping ? <span className="spinner"></span> : '🔍 سحب روابط الصور'}
              </button>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '10px' }}>
                سيتم البحث عن الصور داخل وسم article وإضافتها إلى وضع الشرائح.
              </p>
            </>
          )}
        </div>

        <div className="card">
          <div className="form-group">
            <label>المقاس الجاهز</label>
            <select onChange={handlePresetChange} value={width + 'x' + height}>
              {VIDEO_PRESETS.map((p, i) => <option key={i} value={`${p.width}x${p.height}`}>{p.label}</option>)}
            </select>
          </div>
          <div className="row">
            <div className="form-group"><label>العرض</label><input type="number" value={width} onChange={e => setWidth(Number(e.target.value))} /></div>
            <div className="form-group"><label>الارتفاع</label><input type="number" value={height} onChange={e => setHeight(Number(e.target.value))} /></div>
          </div>
          <div className="form-group">
            <label>جودة الفيديو</label>
            <select value={quality} onChange={e => setQuality(e.target.value)}>
              <option value="5000000">قياسي</option>
              <option value="25000000">عالي</option>
              <option value="50000000">فائق</option>
            </select>
          </div>
          <div className="form-group">
            <label>سرعة التسجيل (تجريبي)</label>
            <select value={speedMultiplier} onChange={e => setSpeedMultiplier(Number(e.target.value))}>
              <option value={1}>Normal (1x)</option>
              <option value={1.5}>Fast (1.5x)</option>
              <option value={2}>Turbo (2x)</option>
            </select>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              تسريع العملية قد يؤثر على جودة الفيديو في بعض المتصفحات.
            </p>
          </div>
        </div>

        <div className="duration-estimate">
          <div style={{ fontWeight: 800, color: 'var(--primary)', marginBottom: '5px' }}>⏱️ المدة المتوقعة</div>
          <div style={{ fontSize: '1.1rem' }}>{durStr}</div>
        </div>
      </div>

      {/* Main Content - Left */}
      <div className="main-content">
        <div className="video-controls">
          <button className="btn btn-outline" onClick={handleLoad} disabled={loading}>
            {loading ? <span className="spinner"></span> : '📥 تحميل المحتوى'}
          </button>
          <button className="btn btn-primary" onClick={handlePreview} disabled={(!singleImage && mode === 'scroll') || (sourceImages.length === 0 && (mode === 'slides' || mode === 'scrape'))}>
            {state.previewing ? '⏹ إيقاف' : '👁️ معاينة'}
          </button>
          <button className="btn btn-success" onClick={handleRecord} disabled={state.recording || (!singleImage && mode === 'scroll') || (sourceImages.length === 0 && (mode === 'slides' || mode === 'scrape'))}>
            {state.recording ? <span className="spinner"></span> : '🎥 تسجيل'}
          </button>
          <button className="btn btn-danger" onClick={stopPlayback} disabled={!state.recording && !state.previewing}>⏹ إيقاف</button>
        </div>

        <div className="preview-container">
          <div className="preview-area">
            {!singleImage && sourceImages.length === 0 && (
              <div style={{ color: '#94a3b8', textAlign: 'center' }}>
                <div style={{ fontSize: '4rem', marginBottom: '10px' }}>🎥</div>
                <p>قم بتحميل المحتوى لبدء المعاينة</p>
              </div>
            )}
            <canvas ref={canvasRef} style={{ display: (renderer === 'classic' && (singleImage || sourceImages.length > 0)) ? 'block' : 'none' }} />
            
            {renderer === 'hyper' && hyperCompositionUrl && (
              <hyperframes-player 
                key={hyperCompositionUrl} // Force re-mount when URL changes
                src={hyperCompositionUrl}
                style={{ width: '100%', height: '100%' }}
                autoplay
                loop
              ></hyperframes-player>
            )}
          </div>

          {(state.recording || state.previewing) && (
            <div className="card">
              <div className="progress-bar"><div className="fill" style={{ width: `${state.progress * 100}%` }}></div></div>
              <div className="progress-text">
                <span>{state.elapsed}</span>
                <span style={{ fontWeight: 800, color: 'var(--primary)' }}>{state.percent}</span>
                <span>{state.remaining}</span>
              </div>
            </div>
          )}

          {imgInfo && <div className="status show info">
            <span style={{ fontSize: '2rem' }}>🖼️</span> 
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.9rem', opacity: 0.7, fontWeight: 600 }}>تفاصيل المحتوى المحمل:</span>
              <span>{imgInfo.replace('🖼️', '').trim()}</span>
            </div>
          </div>}

          {state.recording && (
            <div className="status show info" style={{ background: '#fffbeb', color: '#92400e', border: '2px solid #fef3c7' }}>
              <span style={{ fontSize: '2rem' }}>⚠️</span>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 800 }}>تنبيه هام:</span>
                <span>يرجى عدم مغادرة هذه الصفحة أو تصغير المتصفح أثناء التسجيل لضمان جودة الفيديو النهائية.</span>
              </div>
            </div>
          )}
          {state.statusMsg && <div className={`status show ${state.statusType}`}>
            <span style={{ fontSize: '2rem' }}>
              {state.statusType === 'success' ? '✅' : state.statusType === 'error' ? '❌' : 'ℹ️'}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.9rem', opacity: 0.7, fontWeight: 600 }}>الحالة الحالية:</span>
              <span>{state.statusMsg}</span>
            </div>
          </div>}
          {downloadUrl && <a className="download-link show" href={downloadUrl} download="video.webm">⬇️ تحميل الفيديو النهائي</a>}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
        :root {
          --primary: #2563eb;
          --primary-hover: #1d4ed8;
          --primary-light: #eff6ff;
          --success: #059669;
          --danger: #dc2626;
          --bg-main: #f8fafc;
          --card-bg: #ffffff;
          --border: #e2e8f0;
          --text-main: #1e293b;
          --text-muted: #64748b;
          --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
        }
        body { background: var(--bg-main); color: var(--text-main); direction: rtl; font-family: 'Cairo', sans-serif; margin: 0; }
        .app-container { display: grid; grid-template-columns: 400px 1fr; height: 100vh; overflow: hidden; }
        @media (max-width: 1024px) { .app-container { grid-template-columns: 1fr; height: auto; overflow: visible; } }
        .sidebar { background: var(--card-bg); border-left: 1px solid var(--border); padding: 24px; overflow-y: auto; }
        .sidebar h2 { font-size: 1.5rem; font-weight: 800; color: var(--primary); margin-bottom: 24px; }
        .main-content { padding: 32px; overflow-y: auto; background: var(--bg-main); display: flex; flex-direction: column; }
        .video-controls { background: var(--card-bg); padding: 16px; border-radius: 16px; border: 1px solid var(--border); box-shadow: var(--shadow); margin-bottom: 24px; display: flex; justify-content: center; gap: 10px; position: sticky; top: 0; z-index: 10; }
        .preview-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 16px;
          min-height: 0;
          height: calc(100vh - 120px); /* Fill available space but respect controls */
        }

        .preview-area { 
          flex: 1;
          position: relative; 
          background: #0f172a; 
          border-radius: 20px; 
          overflow: hidden; 
          border: 4px solid #fff;
          box-shadow: var(--shadow-lg);
          display: flex;
          align-items: center;
          justify-content: center;
          /* Keep the area height constrained */
          max-height: 100%;
          width: 100%;
          margin: 0 auto;
        }

        canvas {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          box-shadow: 0 0 30px rgba(0,0,0,0.5);
        }
        .card { background: var(--card-bg); border-radius: 12px; padding: 16px; margin-bottom: 16px; border: 1px solid var(--border); box-shadow: var(--shadow); }
        .form-group { margin-bottom: 20px; }
        .form-group label { 
          display: block; 
          font-size: 0.85rem; 
          font-weight: 700; 
          color: var(--text-muted); 
          margin-bottom: 8px; 
          transition: all 0.2s ease;
          padding-right: 4px;
        }
        .form-group:focus-within label { color: var(--primary); transform: translateX(-2px); }

        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          transition: all 0.2s ease;
        }

        .input-icon {
          position: absolute;
          right: 14px;
          color: var(--text-muted);
          font-size: 1.1rem;
          pointer-events: none;
          transition: all 0.2s ease;
          z-index: 1;
        }
        .form-group:focus-within .input-icon { color: var(--primary); transform: scale(1.1); }

        .form-group input, .form-group select, .form-group textarea { 
          width: 100%; 
          padding: 10px 12px; 
          padding-right: 40px; /* Space for icon */
          background: #f1f5f9; 
          border: 2px solid transparent; 
          border-radius: 10px; 
          color: var(--text-main); 
          font-size: 0.85rem; 
          font-weight: 600;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); 
          outline: none; 
          font-family: inherit; 
          box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.05);
          box-sizing: border-box; /* Crucial to prevent overflow */
          display: block;
        }

        .form-group textarea { padding-right: 12px; min-height: 80px; line-height: 1.4; }

        .form-group input:hover, .form-group select:hover, .form-group textarea:hover {
          background: #e2e8f0;
        }

        .form-group input:focus, .form-group select:focus, .form-group textarea:focus { 
          border-color: var(--primary); 
          background: #fff;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 0 0 3px rgba(37, 99, 235, 0.1);
          transform: translateY(-1px);
        }
        .btn { padding: 10px 18px; border: none; border-radius: 10px; font-weight: 700; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px; font-family: inherit; }
        .btn-primary { background: var(--primary); color: #fff; }
        .btn-success { background: var(--success); color: #fff; }
        .btn-danger { background: var(--danger); color: #fff; }
        .btn-outline { background: #fff; border: 2px solid var(--border); color: var(--text-muted); }
        .mode-tabs { display: flex; gap: 4px; background: var(--bg-main); padding: 4px; border-radius: 10px; margin-bottom: 20px; }
        .mode-tab { flex: 1; padding: 8px; border: none; border-radius: 8px; cursor: pointer; font-weight: 700; background: transparent; color: var(--text-muted); }
        .mode-tab.active { background: #fff; color: var(--primary); shadow: var(--shadow); }
        .progress-bar { width: 100%; height: 12px; background: var(--border); border-radius: 10px; overflow: hidden; box-shadow: inset 0 2px 4px rgba(0,0,0,0.05); }
        .fill { height: 100%; background: var(--primary); transition: width 0.1s; box-shadow: 0 0 10px rgba(37, 99, 235, 0.3); }
        .progress-text { display: flex; justify-content: space-between; font-size: 1.1rem; font-weight: 700; margin-top: 12px; direction: ltr; }
        .status { 
          padding: 20px 28px; 
          border-radius: 20px; 
          margin-top: 20px; 
          display: none; 
          font-size: 1.3rem; 
          font-weight: 800;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05);
          animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          width: 100%;
          box-sizing: border-box;
          line-height: 1.4;
        }
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .status.show { display: flex; align-items: center; gap: 12px; }
        .status.info { background: var(--primary-light); color: var(--primary); border: 2px solid rgba(37, 99, 235, 0.1); }
        .status.success { background: #ecfdf5; color: var(--success); border: 2px solid rgba(5, 150, 105, 0.1); }
        .status.error { background: #fef2f2; color: var(--danger); border: 2px solid rgba(220, 38, 38, 0.1); }
        .duration-estimate { background: var(--primary-light); padding: 12px; border-radius: 12px; border-right: 4px solid var(--primary); }
        .download-link { display: none; margin-top: 10px; padding: 12px; background: var(--success); color: #fff; text-decoration: none; border-radius: 10px; text-align: center; font-weight: 700; }
        .download-link.show { display: block; }
        .spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      `}</style>
    </div>
  );
}
