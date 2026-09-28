import { ChangeEvent, useEffect, useRef, useState, useCallback } from 'react';
import { parseGIF, decompressFrames } from 'gifuct-js';
import {
  ArrowDownToLine,
  Film,
  LoaderCircle,
  Play,
  Pause,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';

type Frame = {
  index: number;
  imageData: ImageData;
  delay: number;
  disposal: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

const MAX_FILE_MB = 50;
const CANVAS_W = 800;

export default function GifEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const framesRef = useRef<Frame[]>([]);
  const playRef = useRef<number>(0);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [gifDims, setGifDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [gifName, setGifName] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selectedFrame, setSelectedFrame] = useState<number | null>(null);

  const renderFrame = useCallback((frameIndex: number) => {
    const canvas = canvasRef.current;
    const frameList = framesRef.current;
    if (!canvas || frameList.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dims = { w: canvas.width, h: canvas.height };
    ctx.clearRect(0, 0, dims.w, dims.h);

    for (let i = 0; i <= frameIndex; i++) {
      const f = frameList[i];
      if (!f) continue;
      ctx.putImageData(f.imageData, f.left, f.top);
      // For disposal type 2 (restore to background), we'd need to clear after, but since
      // we composite the full frame stack each time, we can handle it by not propagating.
      // Simplest approach: for disposal=2, clear the region for subsequent frames.
    }
  }, []);

  // Composite all frames up to the given index to handle GIF disposal properly
  const compositeFrame = useCallback((frameIndex: number) => {
    const canvas = canvasRef.current;
    const frameList = framesRef.current;
    if (!canvas || frameList.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i <= frameIndex; i++) {
      const f = frameList[i];
      if (!f) continue;
      ctx.putImageData(f.imageData, f.left, f.top);
      // If this frame's disposal is "restore to background" (2), and we're not the last,
      // the next frame should not see it. We handle this by clearing after put.
      if (f.disposal === 2 && i < frameIndex) {
        ctx.clearRect(f.left, f.top, f.width, f.height);
      }
    }
  }, []);

  const drawCurrentFrame = useCallback((frameIndex: number) => {
    compositeFrame(frameIndex);
  }, [compositeFrame]);

  // Show first frame when not playing
  useEffect(() => {
    if (!isPlaying && frames.length > 0) {
      drawCurrentFrame(0);
    }
  }, [frames, isPlaying, drawCurrentFrame]);

  // Playback loop
  useEffect(() => {
    if (!isPlaying || frames.length === 0) return;
    let frameIdx = 0;
    let lastTime = performance.now();
    let accumulated = 0;

    const tick = (now: number) => {
      const delta = now - lastTime;
      lastTime = now;
      accumulated += delta * speed;

      const currentFrame = frames[frameIdx];
      if (!currentFrame) return;
      const frameDelay = currentFrame.delay > 0 ? currentFrame.delay : 100;

      if (accumulated >= frameDelay) {
        accumulated -= frameDelay;
        frameIdx = (frameIdx + 1) % frames.length;
        drawCurrentFrame(frameIdx);
      }
      playRef.current = requestAnimationFrame(tick);
    };
    playRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(playRef.current);
  }, [isPlaying, frames, speed, drawCurrentFrame]);

  const loadGif = async (file?: File) => {
    if (!file) return;
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`That GIF is ${(file.size / 1024 / 1024).toFixed(0)} MB. Please choose one under ${MAX_FILE_MB} MB.`);
      return;
    }
    if (exportUrl) URL.revokeObjectURL(exportUrl);
    setExportUrl(null);
    setError('');
    setIsLoading(true);
    setFrames([]);
    framesRef.current = [];
    setSelectedFrame(null);

    try {
      const buffer = await file.arrayBuffer();
      const gif = parseGIF(buffer);
      const parsedFrames = decompressFrames(gif, true);

      if (parsedFrames.length === 0) {
        setError('No frames found in this GIF.');
        setIsLoading(false);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = gif.lsd.width;
      canvas.height = gif.lsd.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setError('Could not process this GIF.');
        setIsLoading(false);
        return;
      }

      const built: Frame[] = [];
      for (let i = 0; i < parsedFrames.length; i++) {
        const pf = parsedFrames[i];
        const patchImageData = new ImageData(
          new Uint8ClampedArray(pf.patch),
          pf.dims.width,
          pf.dims.height,
        );
        built.push({
          index: i,
          imageData: patchImageData,
          delay: pf.delay,
          disposal: pf.disposalType,
          left: pf.dims.left,
          top: pf.dims.top,
          width: pf.dims.width,
          height: pf.dims.height,
        });
      }

      const w = gif.lsd.width;
      const h = gif.lsd.height;
      const scale = Math.min(1, CANVAS_W / w);
      const displayW = Math.round(w * scale);
      const displayH = Math.round(h * scale);

      const mainCanvas = canvasRef.current;
      if (mainCanvas) {
        mainCanvas.width = displayW;
        mainCanvas.height = displayH;
        // We need to scale the frames — use a temp canvas at native size, then draw scaled
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tempCtx = tempCanvas.getContext('2d')!;

        const scaledFrames: Frame[] = [];
        for (let i = 0; i < built.length; i++) {
          tempCtx.clearRect(0, 0, w, h);
          for (let j = 0; j <= i; j++) {
            const f = built[j];
            tempCtx.putImageData(f.imageData, f.left, f.top);
            if (f.disposal === 2 && j < i) {
              tempCtx.clearRect(f.left, f.top, f.width, f.height);
            }
          }
          const scaledImageData = tempCtx.getImageData(0, 0, w, h);
          // Draw scaled to main canvas
          const mainCtx = mainCanvas.getContext('2d')!;
          // Create a temp canvas for the full frame at native size
          const fullCanvas = document.createElement('canvas');
          fullCanvas.width = w;
          fullCanvas.height = h;
          fullCanvas.getContext('2d')!.putImageData(scaledImageData, 0, 0);
          mainCtx.clearRect(0, 0, displayW, displayH);
          mainCtx.drawImage(fullCanvas, 0, 0, w, h, 0, 0, displayW, displayH);
          // Capture the scaled ImageData
          const capturedScaled = mainCtx.getImageData(0, 0, displayW, displayH);
          scaledFrames.push({
            index: i,
            imageData: capturedScaled,
            delay: built[i].delay,
            disposal: built[i].disposal,
            left: 0,
            top: 0,
            width: displayW,
            height: displayH,
          });
        }
        framesRef.current = scaledFrames;
        setFrames(scaledFrames);
        setGifDims({ w: displayW, h: displayH });
        setGifName(file.name);
        drawCurrentFrame(0);
      }
    } catch {
      setError('That GIF could not be loaded. Make sure it is a valid GIF file.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => loadGif(event.target.files?.[0]);

  const togglePlay = () => {
    if (frames.length === 0) return;
    setIsPlaying((p) => !p);
  };

  const deleteFrame = (frameIndex: number) => {
    if (frames.length <= 1) {
      setError('You need at least one frame.');
      return;
    }
    const updated = frames.filter((_, i) => i !== frameIndex).map((f, i) => ({ ...f, index: i }));
    framesRef.current = updated;
    setFrames(updated);
    setSelectedFrame(null);
    setIsPlaying(false);
    if (updated.length > 0) drawCurrentFrame(0);
  };

  const exportGif = async () => {
    const frameList = framesRef.current;
    const canvas = canvasRef.current;
    if (!canvas || frameList.length === 0 || isExporting) return;
    setIsExporting(true);
    setError('');
    try {
      const GIF = (await import('gif.js')).default;
      const encoder = new GIF({ workers: 2, quality: 10, workerScript: '/gif.worker.js' });
      for (let i = 0; i < frameList.length; i++) {
        drawCurrentFrame(i);
        encoder.addFrame(canvas, { copy: true, delay: Math.max(20, Math.round(frameList[i].delay / speed)) });
      }
      encoder.on('finished', (blob: Blob) => {
        setExportUrl(URL.createObjectURL(blob));
        setIsExporting(false);
        drawCurrentFrame(0);
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
    if (exportUrl) URL.revokeObjectURL(exportUrl);
    setFrames([]);
    framesRef.current = [];
    setGifDims({ w: 0, h: 0 });
    setGifName('');
    setExportUrl(null);
    setError('');
    setSelectedFrame(null);
    setIsPlaying(false);
    setSpeed(1);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const totalDuration = frames.length > 0
    ? (frames.reduce((sum, f) => sum + (f.delay > 0 ? f.delay : 100), 0) / speed / 1000).toFixed(1)
    : '0.0';

  return (
    <>
      <section className="intro">
        <div>
          <h1>GIF Editor</h1>
          <p className="intro-copy">Drop in a GIF and trim it down to just the frames you need. Delete unwanted frames, adjust the playback speed, and export a cleaner version. Everything runs in your browser.</p>
        </div>
        <div className="step-list">
          <div className={`step ${frames.length > 0 ? 'active' : ''}`}><span>01</span><div><strong>Upload</strong><small>Drop a GIF</small></div></div>
          <div className={`step ${frames.length > 0 ? 'active' : ''}`}><span>02</span><div><strong>Trim</strong><small>Delete frames</small></div></div>
          <div className={`step ${exportUrl ? 'active' : ''}`}><span>03</span><div><strong>Export</strong><small>Download GIF</small></div></div>
        </div>
      </section>

      <section className="workspace">
        <div className="preview-panel panel">
          <div className="panel-heading">
            <div>
              <span className="section-label">Preview</span>
              <h2>{isPlaying ? 'Playing' : 'First frame'}</h2>
            </div>
            <span className="preview-badge">
              <span className="live-dot" /> {frames.length} frames
            </span>
          </div>
          <div className={`canvas-wrap ${frames.length === 0 && !isLoading ? 'empty' : ''}`}>
            {frames.length > 0 ? (
              <canvas ref={canvasRef} className="preview-canvas" />
            ) : isLoading ? (
              <div className="empty-state">
                <LoaderCircle size={28} className="spin empty-icon" />
                <h3>Reading GIF</h3>
                <p>Extracting individual frames from your file.</p>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon"><Film size={27} /></div>
                <h3>Drop a GIF</h3>
                <p>Pick a GIF file to extract its frames. You can then delete the ones you do not need and adjust the speed.</p>
                <button className="primary-button" onClick={() => fileInputRef.current?.click()}><Upload size={17} /> Choose GIF</button>
              </div>
            )}
          </div>
          <div className="preview-footer">
            <span>{gifName || 'No GIF selected'}</span>
            <button className="text-button" onClick={() => fileInputRef.current?.click()}>
              {frames.length > 0 ? 'Replace GIF' : 'Browse files'}
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
              <div className="control-title"><span>Playback speed</span><output>{speed.toFixed(2)}×</output></div>
              <input type="range" min="0.25" max="3" step="0.25" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
              <div className="range-labels"><span>Slow</span><span>Fast</span></div>
            </label>
          </div>
          <div className="control-note">
            <div className="note-icon"><Film size={15} /></div>
            <p><strong>{frames.length} frames</strong><br />Total duration: {totalDuration} sec at current speed. Delete frames below to trim the GIF.</p>
          </div>
          <div className="action-stack">
            <button className="play-button" disabled={frames.length === 0} onClick={togglePlay}>
              {isPlaying ? <><Pause size={17} fill="currentColor" /> Pause</> : <><Play size={17} fill="currentColor" /> Play preview</>}
            </button>
            <button className="export-button" disabled={frames.length === 0 || isExporting} onClick={exportGif}>
              {isExporting ? <><LoaderCircle size={17} className="spin" /> Creating GIF</> : <><ArrowDownToLine size={17} /> Export GIF</>}
            </button>
            {exportUrl && <a className="download-link" href={exportUrl} download="edited.gif">Download your GIF <ArrowDownToLine size={14} /></a>}
            <button className="reset-button" onClick={reset}><RefreshCw size={12} /> Clear and start over</button>
          </div>
          {error && <p className="error-message">{error}</p>}
        </aside>
      </section>

      {frames.length > 0 && (
        <section className="frame-list-section">
          <div className="frame-list-header">
            <span className="section-label">Frames</span>
            <span className="frame-list-count">{frames.length} total</span>
          </div>
          <div className="frame-strip">
            {frames.map((frame, i) => (
              <div
                key={i}
                className={`frame-thumb ${selectedFrame === i ? 'selected' : ''}`}
                onClick={() => { setSelectedFrame(i); setIsPlaying(false); drawCurrentFrame(i); }}
              >
                <FrameThumb frame={frame} gifDims={gifDims} />
                <div className="frame-thumb-info">
                  <span className="frame-thumb-num">{i + 1}</span>
                  <span className="frame-thumb-delay">{frame.delay}ms</span>
                </div>
                <button
                  className="frame-delete"
                  onClick={(e) => { e.stopPropagation(); deleteFrame(i); }}
                  title="Delete frame"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      <input ref={fileInputRef} type="file" accept="image/gif" onChange={handleFileChange} hidden />
    </>
  );
}

function FrameThumb({ frame, gifDims }: { frame: Frame; gifDims: { w: number; h: number } }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = gifDims.w;
    canvas.height = gifDims.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.putImageData(frame.imageData, 0, 0);
  }, [frame, gifDims]);
  return <canvas ref={ref} className="frame-thumb-canvas" />;
}
