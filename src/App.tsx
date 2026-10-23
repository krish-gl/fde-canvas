import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { useStore } from './store';
import { useRoute } from './router';
import { ConfirmModal } from './components/Modal';
import ProjectsScreen from './screens/ProjectsScreen';
import ProjectCanvas from './screens/ProjectCanvas';
import IntakeFlow from './intake/IntakeFlow';

export default function App() {
  const route = useRoute();
  const { dirty, exportFile, importFile } = useStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const flashTimer = useRef<number | undefined>(undefined);
  // Each message clears only itself: an older message's timer must not wipe a newer one.
  const flash = (text: string, error = false) => {
    window.clearTimeout(flashTimer.current);
    setMessage({ text, error });
    flashTimer.current = window.setTimeout(() => setMessage(null), error ? 6000 : 3000);
  };
  const runImport = (text: string) => {
    try { importFile(text); flash('File imported.'); } catch (error) { flash((error as Error).message, true); }
  };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    if (fileInput.current) fileInput.current.value = '';
    // Import replaces everything, so check first when there are edits that were never exported.
    if (dirty) setPendingImport(text); else runImport(text);
  };

  // The questions take over the whole screen, like FDE OS's intake.
  if (route.screen === 'new' || route.screen === 'edit') {
    return <IntakeFlow key={route.screen === 'edit' ? route.projectId : 'new'} projectId={route.screen === 'edit' ? route.projectId : undefined} />;
  }

  return <div className="app">
    <header className="topbar">
      <div className="topbar-left">
        <a href="#/" className="wordmark">FDE Canvas</a>
      </div>
      <div className="topbar-right">
        {dirty && <span className="dirty" title="Edits are saved in this browser. Export to keep them in your JSON file.">Unexported changes</span>}
        <button className="button" onClick={() => fileInput.current?.click()}><Upload size={13} /> Import</button>
        <button className={`button ${dirty ? 'primary' : ''}`} onClick={() => { exportFile(); flash('Exported. Keep that file somewhere safe.'); }}><Download size={13} /> Export</button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={event => onFile(event.target.files?.[0])} />
      </div>
    </header>

    {message && <div className={`flash ${message.error ? 'error' : ''}`} role="status">{message.text}</div>}

    {route.screen === 'projects' && <ProjectsScreen />}
    {route.screen === 'project' && <ProjectCanvas key={route.projectId} projectId={route.projectId} />}

    {pendingImport !== null && <ConfirmModal
      title="Replace your current data?"
      body="You have edits that aren’t in an exported file. Importing replaces everything here with the file’s contents. Export first if you want to keep them."
      confirmLabel="Import anyway"
      danger
      onConfirm={() => runImport(pendingImport)}
      onClose={() => setPendingImport(null)}
    />}
  </div>;
}
