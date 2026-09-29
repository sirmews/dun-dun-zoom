import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type ControlNoteProps = {
  icon: LucideIcon;
  children: ReactNode;
};

export default function ControlNote({ icon: Icon, children }: ControlNoteProps) {
  return (
    <div className="control-note">
      <div className="note-icon">
        <Icon size={15} />
      </div>
      <p>{children}</p>
    </div>
  );
}
