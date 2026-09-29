import { NavLink, Routes, Route, Navigate } from 'react-router-dom';
import { Focus, Film } from 'lucide-react';
import ZoomTool from '@/tools/ZoomTool';
import GifEditor from '@/tools/GifEditor';

const TOOLS = [
  { path: '/zoom', label: 'Zoom Maker', icon: Focus },
  { path: '/editor', label: 'GIF Editor', icon: Film },
] as const;

function App() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span>DUN</span> <span>DUN</span> <span className="brand-dun-final">DUN</span></div>
        <nav className="tool-nav">
          {TOOLS.map((tool) => (
            <NavLink
              key={tool.path}
              to={tool.path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <tool.icon size={15} />
              {tool.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <Routes>
        <Route path="/zoom" element={<ZoomTool />} />
        <Route path="/editor" element={<GifEditor />} />
        <Route path="*" element={<Navigate to="/zoom" replace />} />
      </Routes>

      <footer className="footer">
        <span>DUN DUN DUN</span>
        <span>Made by Nav and free AI credits — <a href="https://perfectlycromulent.dev" target="_blank" rel="noopener noreferrer" style={{ color: '#ccc', textDecoration: 'underline' }}>perfectlycromulent.dev</a></span>
      </footer>
    </main>
  );
}

export default App;
