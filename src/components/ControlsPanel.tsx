import type { ReactNode } from 'react';

type ControlsPanelProps = {
  children: ReactNode;
};

export default function ControlsPanel({ children }: ControlsPanelProps) {
  return (
    <aside className="controls-panel panel">
      <div className="panel-heading compact">
        <div>
          <span className="section-label">Settings</span>
          <h2>Options</h2>
        </div>
      </div>
      {children}
    </aside>
  );
}
