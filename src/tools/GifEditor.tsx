import { ChangeEvent, useEffect, useRef, useState, useCallback } from 'react';
import { parseGIF, decompressFrames } from 'gifuct-js';
import {
  Film,
  LoaderCircle,
  Play,
  Pause,
  RefreshCw,
  Trash2,
  Upload,
  Copy,
} from 'lucide-react';
import ExportButton from '@/components/ExportButton';

type Frame = {
  index: number;
  imageData: ImageData;
  delay: number;
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
  const [exportProgress, setExportProgress] = useState(0);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selectedFrame, setSelectedFrame] = useState<number | null>(null);

  const drawCurrentFrame = useCallback((frameIndex: number) => {
    const canvas = canvasRef.current;
    const frameList = framesRef.current;
    if (!canvas || frameList.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const f = frameList[frameIndex];
    if (!f) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.putImageData(f.imageData, 0, 0);
  }, []);

  // Show first frame when not playing and frames change
  useEffect(() => {
    if (!isPlaying && frames.length > 0) {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = gifDims.w;
        canvas.height = gifDims.h;
      }
      drawCurrentFrame(0);
    }
  }, [frames, isPlaying, gifDims, drawCurrentFrame]);

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
      if (!currentFrame) {
        playRef.current = requestAnimationFrame(tick);
        return;
      }
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
    setExportProgress(0);
    setError('');
    setIsLoading(true);
    setFrames([]);
    framesRef.current = [];
    setSelectedFrame(null);
    setIsPlaying(false);

    try {
      const buffer = await file.arrayBuffer();
      const gif = parseGIF(buffer);
      const parsedFrames = decompressFrames(gif, true);

      if (parsedFrames.length === 0) {
        setError('No frames found in this GIF.');
        setIsLoading(false);
        return;
      }

      const w = gif.lsd.width;
      const h = gif.lsd.height;
      const scale = Math.min(1, CANVAS_W / w);
      const displayW = Math.round(w * scale);
      const displayH = Math.round(h * scale);

      // Composite each frame at native resolution, then scale down
      const nativeCanvas = document.createElement('canvas');
      nativeCanvas.width = w;
      nativeCanvas.height = h;
      const nativeCtx = nativeCanvas.getContext('2d');
      if (!nativeCtx) {
        setError('Could not process this GIF.');
        setIsLoading(false);
        return;
      }

      // Scratch canvas for scaled output
      const scaledCanvas = document.createElement('canvas');
      scaledCanvas.width = displayW;
      scaledCanvas.height = displayH;
      const scaledCtx = scaledCanvas.getContext('2d');
      if (!scaledCtx) {
        setError('Could not process this GIF.');
        setIsLoading(false);
        return;
      }

      // Temp canvas for each frame patch — used so drawImage does proper alpha compositing
      // instead of putImageData which replaces all pixels (including transparent ones)
      const patchCanvas = document.createElement('canvas');
      const patchCtx = patchCanvas.getContext('2d');
      if (!patchCtx) {
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

        // Save canvas state for disposal type 3 (restore to previous)
        let savedState: ImageData | null = null;
        if (pf.disposalType === 3) {
          savedState = nativeCtx.getImageData(0, 0, w, h);
        }

        // Put the patch into a temp canvas, then drawImage onto the native canvas.
        // drawImage alpha-composites, so transparent pixels in the patch keep
        // the existing content underneath — which is how GIFs actually work.
        patchCanvas.width = pf.dims.width;
        patchCanvas.height = pf.dims.height;
        patchCtx.clearRect(0, 0, patchCanvas.width, patchCanvas.height);
        patchCtx.putImageData(patchImageData, 0, 0);
        nativeCtx.drawImage(patchCanvas, pf.dims.left, pf.dims.top);

        // Capture the composited frame, scaled to display size
        scaledCtx.clearRect(0, 0, displayW, displayH);
        scaledCtx.drawImage(nativeCanvas, 0, 0, w, h, 0, 0, displayW, displayH);
        const scaledImageData = scaledCtx.getImageData(0, 0, displayW, displayH);

        built.push({
          index: i,
          imageData: scaledImageData,
          delay: pf.delay,
        });

        // Handle disposal for the next frame
        if (pf.disposalType === 2) {
          // Restore to background: fill the frame's region with the GIF background color
          nativeCtx.clearRect(pf.dims.left, pf.dims.top, pf.dims.width, pf.dims.height);
        } else if (pf.disposalType === 3 && savedState) {
          // Restore to previous: put back the state before this frame
          nativeCtx.putImageData(savedState, 0, 0);
        }
        // Disposal type 0 or 1: leave the canvas as-is for the next frame
      }

      framesRef.current = built;
      setGifDims({ w: displayW, h: displayH });
      setGifName(file.name);

      // Set canvas dimensions and draw first frame
      const mainCanvas = canvasRef.current;
      if (mainCanvas) {
        mainCanvas.width = displayW;
        mainCanvas.height = displayH;
        const mainCtx = mainCanvas.getContext('2d');
        if (mainCtx) {
          mainCtx.putImageData(built[0].imageData, 0, 0);
        }
      }
      setFrames(built);
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

  const invalidateExport = () => {
    if (exportUrl) URL.revokeObjectURL(exportUrl);
    setExportUrl(null);
    setExportProgress(0);
  };

  const deleteFrame = (frameIndex: number) => {
    if (frames.length <= 1) {
      setError('You need at least one frame.');
      return;
    }
    const updated = frames.filter((_, i) => i !== frameIndex).map((f, i) => ({ ...f, index: i }));
    invalidateExport();
    framesRef.current = updated;
    setFrames(updated);
    setSelectedFrame(null);
    setIsPlaying(false);
  };

  const duplicateFrame = (frameIndex: number) => {
    const dup: Frame = { ...frames[frameIndex], imageData: frames[frameIndex].imageData };
    const updated = [...frames.slice(0, frameIndex + 1), dup, ...frames.slice(frameIndex + 1)].map((f, i) => ({ ...f, index: i }));
    invalidateExport();
    framesRef.current = updated;
    setFrames(updated);
    setIsPlaying(false);
  };

  const exportGif = async () => {
    const frameList = framesRef.current;
    const canvas = canvasRef.current;
    if (!canvas || frameList.length === 0 || isExporting) return;
    setIsExporting(true);
    setExportProgress(0);
    setError('');
    try {
      const GIF = (await import('gif.js')).default;
      const encoder = new GIF({ workers: 2, quality: 10, workerScript: '/gif.worker.js' });
      for (let i = 0; i < frameList.length; i++) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.putImageData(frameList[i].imageData, 0, 0);
        }
        encoder.addFrame(canvas, { copy: true, delay: Math.max(20, Math.round(frameList[i].delay / speed)) });
      }
      encoder.on('progress', (value: number) => setExportProgress(Math.round(value * 100)));
      encoder.on('finished', (blob: Blob) => {
        setExportUrl(URL.createObjectURL(blob));
        setExportProgress(100);
        setIsExporting(false);
        drawCurrentFrame(0);
      });
      encoder.on('abort', () => {
        setError('The GIF could not be created. Please try again.');
        setExportProgress(0);
        setIsExporting(false);
      });
      encoder.render();
    } catch {
      setError('The GIF library failed to load. Please refresh and try again.');
      setExportProgress(0);
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
    setExportProgress(0);
    setError('');
    setSelectedFrame(null);
    setIsPlaying(false);
    setSpeed(1);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const totalDuration = frames.length > 0
    ? (frames.reduce((sum, f) => sum + (f.delay > 0 ? f.delay : 100), 0) / speed / 1000).toFixed(1)
    : '0.0';

  const hasGif = frames.length > 0;

  return (
    <>
      <section className="intro">
        <div>
          <h1>GIF Editor</h1>
          <p className="intro-copy">Drop in a GIF and trim it down to just the frames you need. Delete unwanted frames, adjust the playback speed, and export a cleaner version. Everything runs in your browser.</p>
        </div>
        <div className="step-list">
          <div className={`step ${hasGif ? 'active' : ''}`}><span>01</span><div><strong>Upload</strong><small>Drop a GIF</small></div></div>
          <div className={`step ${hasGif ? 'active' : ''}`}><span>02</span><div><strong>Trim</strong><small>Delete frames</small></div></div>
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
          <div className={`canvas-wrap ${!hasGif && !isLoading ? 'empty' : ''}`}>
            {hasGif ? (
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
              {hasGif ? 'Replace GIF' : 'Browse files'}
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
              <input type="range" min="0.25" max="3" step="0.25" value={speed} onChange={(e) => { invalidateExport(); setSpeed(Number(e.target.value)); }} />
              <div className="range-labels"><span>Slow</span><span>Fast</span></div>
            </label>
          </div>
          <div className="control-note">
            <div className="note-icon"><Film size={15} /></div>
            <p><strong>{frames.length} frames</strong><br />Total duration: {totalDuration} sec at current speed. Delete frames below to trim the GIF.</p>
          </div>
          <div className="action-stack">
            <button className="play-button" disabled={!hasGif} onClick={togglePlay}>
              {isPlaying ? <><Pause size={17} fill="currentColor" /> Pause</> : <><Play size={17} fill="currentColor" /> Play preview</>}
            </button>
            <ExportButton
              isExporting={isExporting}
              exportProgress={exportProgress}
              exportUrl={exportUrl}
              disabled={!hasGif}
              idleLabel="Export GIF"
              exportLabel="Creating GIF"
              downloadName="edited.gif"
              onClick={exportGif}
            />
            <button className="reset-button" onClick={reset}><RefreshCw size={12} /> Clear and start over</button>
          </div>
          {error && <p className="error-message">{error}</p>}
        </aside>
      </section>

      {hasGif && (
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
                <div className="frame-actions">
                  <button
                    className="frame-action frame-duplicate"
                    onClick={(e) => { e.stopPropagation(); duplicateFrame(i); }}
                    title="Duplicate frame"
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    className="frame-action frame-delete"
                    onClick={(e) => { e.stopPropagation(); deleteFrame(i); }}
                    title="Delete frame"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
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
