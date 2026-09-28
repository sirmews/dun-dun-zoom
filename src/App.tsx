import { useState } from 'react';
import { Focus, Film } from 'lucide-react';
import ZoomTool from '@/tools/ZoomTool';
import GifEditor from '@/tools/GifEditor';

type Tool = 'zoom' | 'editor';

const TOOLS: { id: Tool; label: string; icon: typeof Focus }[] = [
  { id: 'zoom', label: 'Zoom Maker', icon: Focus },
  { id: 'editor', label: 'GIF Editor', icon: Film },
];

function App() {
  const [active, setActive] = useState<Tool>('zoom');

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">DUN DUN DUN</div>
        <nav className="tool-nav">
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              className={`nav-item ${active === tool.id ? 'active' : ''}`}
              onClick={() => setActive(tool.id)}
            >
              <tool.icon size={15} />
              {tool.label}
            </button>
          ))}
        </nav>
      </header>

      {active === 'zoom' && <ZoomTool />}
      {active === 'editor' && <GifEditor />}

      <footer className="footer">
        <span>DUN DUN DUN</span>
        <span>Images are processed locally.</span>
      </footer>
    </main>
  );
}

export default App;
