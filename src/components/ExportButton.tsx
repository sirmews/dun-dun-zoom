import { ArrowDownToLine, LoaderCircle } from 'lucide-react';

type ExportButtonProps = {
  isExporting: boolean;
  exportProgress: number;
  exportUrl: string | null;
  disabled: boolean;
  idleLabel: string;
  exportLabel: string;
  downloadName: string;
  onClick: () => void;
};

export default function ExportButton({
  isExporting,
  exportProgress,
  exportUrl,
  disabled,
  idleLabel,
  exportLabel,
  downloadName,
  onClick,
}: ExportButtonProps) {
  if (exportUrl) {
    return (
      <a className="export-button export-ready" href={exportUrl} download={downloadName}>
        <span className="export-button-content">
          <ArrowDownToLine size={17} /> Download
        </span>
      </a>
    );
  }

  return (
    <button
      className={`export-button ${isExporting ? 'export-progress' : ''}`}
      disabled={disabled || isExporting}
      onClick={onClick}
    >
      {isExporting && (
        <span className="export-progress-fill" style={{ width: `${exportProgress}%` }} />
      )}
      <span className="export-button-content">
        {isExporting ? (
          <>
            <LoaderCircle size={17} className="spin" /> {exportLabel} {exportProgress}%
          </>
        ) : (
          <>
            <ArrowDownToLine size={17} /> {idleLabel}
          </>
        )}
      </span>
    </button>
  );
}
