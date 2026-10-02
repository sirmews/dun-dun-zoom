import { useEffect, useRef, useState } from 'react';
import {
  LoaderCircle,
  Sparkles,
} from 'lucide-react';
import StepList from '@/components/StepList';
import ControlsPanel from '@/components/ControlsPanel';
import RangeControl from '@/components/RangeControl';
import ControlNote from '@/components/ControlNote';
import ActionStack from '@/components/ActionStack';

type Format = {
  id: string;
  label: string;
  dims: string;
  ratio: string;
  width: number;
  height: number;
};

const FORMATS: Format[] = [
  { id: 'square', label: 'Square', dims: '1080 × 1080', ratio: '1:1', width: 1080, height: 1080 },
  { id: 'landscape', label: 'Landscape', dims: '1200 × 627', ratio: '1.91:1', width: 1200, height: 627 },
];

const BACKGROUNDS = [
  { id: 'paper', name: 'Paper', path: '/texture-paper.svg' },
  { id: 'ink', name: 'Ink wash', path: '/texture-ink.svg' },
  { id: 'linen', name: 'Linen', path: '/texture-linen.svg' },
  { id: 'grid', name: 'Grid', path: '/texture-grid.svg' },
  { id: 'clay', name: 'Clay', path: '/texture-clay.svg' },
  { id: 'charcoal', name: 'Charcoal', path: '/texture-charcoal.svg' },
] as const;

export default function QuoteTool() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [selectedBackground, setSelectedBackground] = useState<typeof BACKGROUNDS[number]['id']>(BACKGROUNDS[0].id);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState('');
  const [format, setFormat] = useState<Format>(FORMATS[0]);
  const [quote, setQuote] = useState('');
  const [author, setAuthor] = useState('');
  const [fontSize, setFontSize] = useState(42);
  const [overlayOpacity, setOverlayOpacity] = useState(55);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const drawPreview = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = format.width;
    canvas.height = format.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = format;

    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, width, height);

    if (imageRef.current) {
      const img = imageRef.current;
      const imgRatio = img.naturalWidth / img.naturalHeight;
      const canvasRatio = width / height;
      let drawW: number, drawH: number;
      if (imgRatio > canvasRatio) {
        drawW = width;
        drawH = width / imgRatio;
      } else {
        drawH = height;
        drawW = height * imgRatio;
      }
      const dx = (width - drawW) / 2;
      const dy = (height - drawH) / 2;
      ctx.drawImage(img, dx, dy, drawW, drawH);
    }

    if (overlayOpacity > 0) {
      ctx.fillStyle = `rgba(0,0,0,${overlayOpacity / 100})`;
      ctx.fillRect(0, 0, width, height);
    }

    if (!quote.trim()) return;

    const padding = Math.round(width * 0.08);
    const maxWidth = width - padding * 2;
    const lineHeight = fontSize * 1.4;

    ctx.font = `600 ${fontSize}px Manrope, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'alphabetic';

    const words = quote.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);

    const authorLine = author.trim() ? `\u2014 ${author.trim()}` : '';
    const authorSize = Math.round(fontSize * 0.6);
    ctx.font = `500 ${authorSize}px Manrope, sans-serif`;
    const authorHeight = authorLine ? authorSize * 1.4 : 0;

    const totalHeight = lines.length * lineHeight + authorHeight + lineHeight * 0.3;
    const startY = (height - totalHeight) / 2 + fontSize;

    ctx.font = `600 ${fontSize}px Manrope, sans-serif`;
    ctx.textAlign = 'center';
    lines.forEach((line, i) => {
      ctx.fillText(line, width / 2, startY + i * lineHeight);
    });

    if (authorLine) {
      ctx.font = `500 ${authorSize}px Manrope, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(authorLine, width / 2, startY + lines.length * lineHeight + authorSize);
    }
    ctx.textAlign = 'start';
  };

  useEffect(() => {
    drawPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, format, quote, author, fontSize, overlayOpacity]);

  useEffect(() => {
    const background = BACKGROUNDS.find((item) => item.id === selectedBackground);
    if (!background) return;
    setIsLoading(true);
    setImageUrl(null);
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      setImageUrl(background.path);
      setImageName(background.name);
      setIsLoading(false);
    };
    image.onerror = () => {
      setError('That background could not be loaded. Please choose another.');
      setIsLoading(false);
    };
    image.src = background.path;
  }, [selectedBackground]);

  const selectBackground = (background: typeof BACKGROUNDS[number]) => {
    if (exportUrl) {
      URL.revokeObjectURL(exportUrl);
      setExportUrl(null);
    }
    setError('');
    setSelectedBackground(background.id);
  };

  const exportImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setError('');
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          setError('The image could not be created. Please try again.');
          return;
        }
        if (exportUrl) URL.revokeObjectURL(exportUrl);
        setExportUrl(URL.createObjectURL(blob));
      }, 'image/png');
    } catch {
      setError('The image could not be created. Please try again.');
    }
  };

  const reset = () => {
    if (exportUrl) URL.revokeObjectURL(exportUrl);
    setSelectedBackground(BACKGROUNDS[0].id);
    imageRef.current = null;
    setExportUrl(null);
    setError('');
    setQuote('');
    setAuthor('');
    setFontSize(42);
    setOverlayOpacity(55);
    setFormat(FORMATS[0]);
  };

  const handleQuoteChange = (value: string) => {
    if (exportUrl) { URL.revokeObjectURL(exportUrl); setExportUrl(null); }
    setQuote(value);
  };

  const handleAuthorChange = (value: string) => {
    if (exportUrl) { URL.revokeObjectURL(exportUrl); setExportUrl(null); }
    setAuthor(value);
  };

  const handleFormatChange = (newFormat: Format) => {
    if (exportUrl) { URL.revokeObjectURL(exportUrl); setExportUrl(null); }
    setFormat(newFormat);
  };

  const handleFontSizeChange = (v: number) => {
    if (exportUrl) { URL.revokeObjectURL(exportUrl); setExportUrl(null); }
    setFontSize(v);
  };

  const handleOverlayChange = (v: number) => {
    if (exportUrl) { URL.revokeObjectURL(exportUrl); setExportUrl(null); }
    setOverlayOpacity(v);
  };

  const hasContent = Boolean(quote.trim());

  return (
    <>
      <section className="intro">
        <div>
          <h1>LinkedIn Quote Maker</h1>
          <p className="intro-copy">Create polished quote images for LinkedIn posts. Pick a background, type your quote, and export at the exact dimensions LinkedIn recommends.</p>
        </div>
        <StepList
          steps={[
            { label: 'Background', description: 'Choose an image', active: Boolean(imageUrl) },
            { label: 'Quote', description: 'Add your text', active: hasContent },
            { label: 'Export', description: 'Download PNG', active: Boolean(exportUrl) },
          ]}
        />
      </section>

      <section className="workspace">
        <div className="preview-panel panel">
          <div className="panel-heading">
            <div>
              <span className="section-label">Preview</span>
              <h2>{isLoading ? 'Loading background' : 'Your image'}</h2>
            </div>
            <span className="preview-badge">
              <span className="live-dot" /> {format.label} · {format.ratio}
            </span>
          </div>
          <div className={`canvas-wrap ${!imageUrl ? 'empty' : ''} quote-canvas-wrap`}>
            {imageUrl ? (
              <canvas ref={canvasRef} className="preview-canvas" />
            ) : (
              <div className="empty-state">
                <LoaderCircle size={28} className="spin empty-icon" />
                <h3>{isLoading ? 'Loading background' : 'Choose a background'}</h3>
                <p>Select one of the ready-made backgrounds below.</p>
              </div>
            )}
          </div>
          <div className="preview-footer">
            <span>{imageName || 'No background selected'}</span>
            <span className="preview-footer-note">Choose below</span>
          </div>
          <div className="background-picker" aria-label="Choose a background">
            <div className="background-picker-header">
              <div>
                <span className="section-label">Textures</span>
                <h2>Choose a finish</h2>
              </div>
              <span className="background-picker-hint">Scroll horizontally</span>
            </div>
            <div className="background-strip">
              {BACKGROUNDS.map((background) => (
                <button
                  key={background.id}
                  className={`background-card ${selectedBackground === background.id ? 'selected' : ''}`}
                  onClick={() => selectBackground(background)}
                  aria-label={`Use ${background.name} texture`}
                  aria-pressed={selectedBackground === background.id}
                >
                  <img src={background.path} alt="" />
                  <span>{background.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <ControlsPanel>
          <div className="control-stack">
            <div className="control">
              <div className="control-title"><span>Format</span></div>
              <div className="format-selector">
                {FORMATS.map((f) => (
                  <button
                    key={f.id}
                    className={`format-option ${format.id === f.id ? 'active' : ''}`}
                    onClick={() => handleFormatChange(f)}
                  >
                    <span className="format-option-label">{f.label}</span>
                    <span className="format-option-dims">{f.dims}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="control">
              <div className="control-title"><span>Quote</span></div>
              <textarea
                className="quote-textarea"
                placeholder="Enter your quote here..."
                value={quote}
                onChange={(e) => handleQuoteChange(e.target.value)}
                rows={3}
              />
            </div>

            <div className="control">
              <div className="control-title"><span>Author (optional)</span></div>
              <input
                className="quote-author-input"
                type="text"
                placeholder="e.g. Maya Angelou"
                value={author}
                onChange={(e) => handleAuthorChange(e.target.value)}
              />
            </div>

            <RangeControl
              label="Text size"
              value={`${fontSize}px`}
              min={24}
              max={72}
              step={2}
              current={fontSize}
              onChange={handleFontSizeChange}
              lowLabel="Small"
              highLabel="Large"
            />

            <RangeControl
              label="Background darkening"
              value={`${overlayOpacity}%`}
              min={0}
              max={85}
              step={5}
              current={overlayOpacity}
              onChange={handleOverlayChange}
              lowLabel="Clear"
              highLabel="Dark"
            />
          </div>

          <ControlNote icon={Sparkles}>
            <strong>LinkedIn-ready sizes</strong><br />Square (1080×1080) fills more feed space and is ideal for quotes. Landscape (1200×627) matches LinkedIn's standard link-preview ratio. Export as PNG for sharpest text.
          </ControlNote>

          <ActionStack
            playLabel="Preview"
            playDisabled
            isPlaying={false}
            onPlay={() => {}}
            exportIdleLabel="Create image"
            exportLabel="Creating"
            downloadName="linkedin-quote.png"
            isExporting={false}
            exportProgress={0}
            exportUrl={exportUrl}
            exportDisabled={!imageUrl || !hasContent}
            onExport={exportImage}
            onReset={reset}
            error={error}
          />
        </ControlsPanel>
      </section>


    </>
  );
}
