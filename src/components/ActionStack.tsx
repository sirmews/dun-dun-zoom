import type { ReactNode } from 'react';
import { Play, Pause, RefreshCw } from 'lucide-react';
import ExportButton from '@/components/ExportButton';

type ActionStackProps = {
  playLabel: string;
  playPausedLabel?: string;
  isPlaying: boolean;
  playDisabled: boolean;
  onPlay: () => void;
  exportIdleLabel: string;
  exportLabel: string;
  downloadName: string;
  isExporting: boolean;
  exportProgress: number;
  exportUrl: string | null;
  exportDisabled: boolean;
  onExport: () => void;
  onReset: () => void;
  error?: string;
  children?: ReactNode;
};

export default function ActionStack({
  playLabel,
  playPausedLabel,
  isPlaying,
  playDisabled,
  onPlay,
  exportIdleLabel,
  exportLabel,
  downloadName,
  isExporting,
  exportProgress,
  exportUrl,
  exportDisabled,
  onExport,
  onReset,
  error,
  children,
}: ActionStackProps) {
  return (
    <>
      <div className="action-stack">
        {children}
        <button className="play-button" disabled={playDisabled} onClick={onPlay}>
          {isPlaying && playPausedLabel ? (
            <>
              <Pause size={17} fill="currentColor" /> {playPausedLabel}
            </>
          ) : (
            <>
              <Play size={17} fill="currentColor" /> {playLabel}
            </>
          )}
        </button>
        <ExportButton
          isExporting={isExporting}
          exportProgress={exportProgress}
          exportUrl={exportUrl}
          disabled={exportDisabled}
          idleLabel={exportIdleLabel}
          exportLabel={exportLabel}
          downloadName={downloadName}
          onClick={onExport}
        />
        <button className="reset-button" onClick={onReset}>
          <RefreshCw size={12} /> Clear and start over
        </button>
      </div>
      {error && <p className="error-message">{error}</p>}
    </>
  );
}
