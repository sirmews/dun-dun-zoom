import { ChangeEvent, PointerEvent, useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  Crosshair,
  ImagePlus,
  LoaderCircle,
  Play,
  RefreshCw,
  Target,
  Upload,
} from 'lucide-react';

type Point = { x: number; y: number };

const MAX_DIM = 1600;
const MAX_FILE_MB = 25;
const STEPS = 4;

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState('');
  const [target, setTarget] = useState<Point | null>(null);
  const [maxZoom, setMaxZoom] = useState(4);
  const [duration, setDuration] = useState(3);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const drawFrame = (progress: number) => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    const width = 900;
    const height = Math.round((width * image.naturalHeight) / image.naturalWidth);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Hard snap zoom: hold on each step, then instantly jump to the next.
    // No easing between steps — that's what makes the dramatic "dun-dun-dun" punch.
    const totalSteps = STEPS;
    const stepIndex = Math.min(Math.floor(progress * totalSteps), totalSteps - 1);
    const zoomLevel = stepFractionToZoom(stepIndex, totalSteps, maxZoom);

    if (zoomLevel <= 1.001) {
      ctx.drawImage(image, 0, 0, width, height);
      return;
    }

    const sourceWidth = image.naturalWidth / zoomLevel;
    const sourceHeight = image.naturalHeight / zoomLevel;
    const cx = (target?.x ?? 0.5) * image.naturalWidth;
    const cy = (target?.y ?? 0.5) * image.naturalHeight;
    const sourceX = Math.max(0, Math.min(image.naturalWidth - sourceWidth, cx - sourceWidth / 2));
    const sourceY = Math.max(0, Math.min(image.naturalHeight - sourceHeight, cy - sourceHeight / 2));
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);

    // Dramatic vignette that intensifies as we zoom in
    const vignetteAlpha = Math.min(0.35, ((zoomLevel - 1) / (maxZoom - 1)) * 0.35);
    if (vignetteAlpha > 0.01) {
      const gradient = ctx.createRadialGradient(
        width / 2,
        height / 2,
        Math.min(width, height) * 0.3,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.7,
      );
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, `rgba(0,0,0,${vignetteAlpha})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }
  };

  const stepFractionToZoom = (step: number, total: number, maxZ: number): number => {
    const t = step / (total - 1);
    return 1 + (maxZ - 1) * t;
  };

  // Show full image when not playing
  useEffect(() => {
    if (!isPlaying) drawFrame(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, target, maxZoom, isPlaying]);

  // Play the zoom animation
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - started) / 1000;
      const progress = Math.min(elapsed / duration, 1);
      drawFrame(progress);
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        // Hold final frame briefly then reset to full view
        setTimeout(() => setIsPlaying(false), 600);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, duration]);

  const loadFile = async (file?: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`That image is ${(file.size / 1024 / 1024).toFixed(0)} MB. Please choose one under ${MAX_FILE_MB} MB.`);
      return;
    }
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    if (exportUrl) URL.revokeObjectURL(exportUrl);
    setExportUrl(null);
    setError('');
    setIsLoading(true);
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = image;
      if (w <= MAX_DIM && h <= MAX_DIM) {
        imageRef.current = image;
        setImageUrl(url);
        setImageName(file.name);
        setTarget(null);
        setIsLoading(false);
        return;
      }
      const scale = MAX_DIM / Math.max(w, h);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const context = canvas.getContext('2d');
      if (!context) {
        setIsLoading(false);
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) {
          setIsLoading(false);
          return;
        }
        const compressedUrl = URL.createObjectURL(blob);
        const compressed = new Image();
        compressed.onload = () => {
          imageRef.current = compressed;
          setImageUrl(compressedUrl);
          setImageName(file.name);
          setTarget(null);
          setIsLoading(false);
          URL.revokeObjectURL(url);
        };
        compressed.src = compressedUrl;
      }, 'image/jpeg', 0.92);
    };
    image.onerror = () => {
      setError('That image could not be loaded. Try a different file.');
      setIsLoading(false);
    };
    image.src = url;
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => loadFile(event.target.files?.[0]);

  const pickTarget = (event: PointerEvent<HTMLDivElement>) => {
    if (!imageUrl || isPlaying) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setTarget({
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    });
  };

  const exportGif = async () => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas || isExporting) return;
    if (!target) {
      setError('Click on the image to pick where the zoom should land first.');
      return;
    }
    setIsExporting(true);
    setError('');
    try {
      const GIF = (await import('gif.js')).default;
      const encoder = new GIF({ workers: 2, quality: 10, workerScript: '/gif.worker.js' });
      const frameCount = STEPS * 3; // 3 frames per step: hold, hold, snap
      const frameDelay = Math.round((duration * 1000) / frameCount);
      for (let index = 0; index < frameCount; index += 1) {
        drawFrame(index / (frameCount - 1));
        encoder.addFrame(canvas, { copy: true, delay: frameDelay });
      }
      encoder.on('finished', (blob: Blob) => {
        setExportUrl(URL.createObjectURL(blob));
        setIsExporting(false);
        drawFrame(0);
      });
      encoder.on('abort', () => {
        setError('The GIF could not be created. Please try again.');
        setIsExporting(false);
      });
      encoder.render();
    } catch {
      setError('The GIF library failed to load. Please refresh and try again.');
      setIsExporting(false);
    }
  };

  const reset = () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    if (exportUrl) URL.revokeObjectURL(exportUrl);
    setImageUrl(null);
    setImageName('');
    setExportUrl(null);
    setTarget(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">DUN DUN DUN</div>
        <div className="topbar-meta">Runs locally in your browser</div>
      </header>

      <section className="intro">
        <div>
          <h1>Zoom GIF Maker</h1>
          <p className="intro-copy">Upload an image, click where you want the zoom to land, and export a GIF. The zoom snaps closer in four steps. Everything runs in your browser.</p>
        </div>
        <div className="step-list">
          <div className={`step ${imageUrl ? 'active' : ''}`}><span>01</span><div><strong>Upload</strong><small>Choose a photo</small></div></div>
          <div className={`step ${target ? 'active' : ''}`}><span>02</span><div><strong>Set target</strong><small>Click where to zoom</small></div></div>
          <div className={`step ${exportUrl ? 'active' : ''}`}><span>03</span><div><strong>Export</strong><small>Download the GIF</small></div></div>
        </div>
      </section>

      <section className="workspace">
        <div className="preview-panel panel">
          <div className="panel-heading">
            <div>
              <span className="section-label">Preview</span>
              <h2>{isPlaying ? 'Zooming' : 'Your image'}</h2>
            </div>
            <span className="preview-badge">
              <span className="live-dot" /> {isPlaying ? 'Playing' : target ? 'Target set' : 'Ready'}
            </span>
          </div>
          <div className={`canvas-wrap ${!imageUrl ? 'empty' : ''} ${target && !isPlaying ? 'has-target' : ''}`} onPointerDown={pickTarget}>
            {imageUrl ? (
              <>
                <canvas ref={canvasRef} className="preview-canvas" />
                {target && !isPlaying && (
                  <div className="target-marker" style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%` }}>
                    <Target size={26} />
                    <span className="target-pulse" />
                  </div>
                )}
                {!target && !isPlaying && <div className="canvas-hint">Click where you want the zoom to land</div>}
              </>
            ) : isLoading ? (
              <div className="empty-state">
                <LoaderCircle size={28} className="spin empty-icon" />
                <h3>Optimizing image</h3>
                <p>Resizing for faster processing and a smaller GIF.</p>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon"><ImagePlus size={27} /></div>
                <h3>Upload a photo</h3>
                <p>Pick an image, then click where you want the zoom to land. Large images are resized automatically.</p>
                <button className="primary-button" onClick={() => fileInputRef.current?.click()}><Upload size={17} /> Choose image</button>
              </div>
            )}
          </div>
          <div className="preview-footer">
            <span>{imageName || 'No image selected'}</span>
            <button className="text-button" onClick={() => fileInputRef.current?.click()}>
              {imageUrl ? 'Replace image' : 'Browse files'}
            </button>
          </div>
        </div>

        <aside className="controls-panel panel">
          <div className="panel-heading compact">
            <div>
              <span className="section-label">Settings</span>
              <h2>Options</h2>
            </div>
          </div>
          <div className="control-stack">
            <label className="control">
              <div className="control-title"><span>Zoom depth</span><output>{maxZoom.toFixed(1)}×</output></div>
              <input type="range" min="2" max="8" step="0.5" value={maxZoom} onChange={(e) => setMaxZoom(Number(e.target.value))} />
              <div className="range-labels"><span> Mild</span><span>Extreme</span></div>
            </label>
            <label className="control">
              <div className="control-title"><span>Total duration</span><output>{duration.toFixed(1)} sec</output></div>
              <input type="range" min="1.5" max="6" step="0.5" value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
              <div className="range-labels"><span>Fast</span><span>Slow burn</span></div>
            </label>
          </div>
          <div className="control-note">
            <div className="note-icon"><Crosshair size={15} /></div>
            <p><strong>{STEPS} steps</strong><br />The zoom jumps closer in {STEPS} stages, holding on each before snapping to the next.</p>
          </div>
          <div className="action-stack">
            <button className="play-button" disabled={!imageUrl || !target || isExporting || isPlaying} onClick={() => setIsPlaying(true)}>
              <Play size={17} fill="currentColor" /> Preview zoom
            </button>
            <button className="export-button" disabled={!imageUrl || !target || isExporting} onClick={exportGif}>
              {isExporting ? <><LoaderCircle size={17} className="spin" /> Creating GIF</> : <><ArrowDownToLine size={17} /> Create GIF</>}
            </button>
            {exportUrl && <a className="download-link" href={exportUrl} download="dun-dun-dun.gif">Download your GIF <ArrowDownToLine size={14} /></a>}
            <button className="reset-button" onClick={reset}><RefreshCw size={12} /> Clear and start over</button>
          </div>
          {error && <p className="error-message">{error}</p>}
        </aside>
      </section>

      <footer className="footer">
        <span>DUN DUN DUN</span>
        <span>Images are processed locally.</span>
      </footer>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} hidden />
    </main>
  );
}

export default App;
