import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal" role="dialog" aria-label={title}>
      <div className="flex-between"><h2 className="modal-title">{title}</h2><button className="button ghost icon" aria-label="Close" onClick={onClose}><X size={15} /></button></div>
      {children}
    </div>
  </div>;
}

export function ConfirmModal({ title, body, confirmLabel, danger, onConfirm, onClose }: {
  title: string; body: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return <Modal title={title} onClose={onClose}>
    <p className="muted body-text">{body}</p>
    <div className="modal-actions">
      <button className="button" onClick={onClose}>Cancel</button>
      <button className={`button ${danger ? 'danger' : 'primary'}`} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
    </div>
  </Modal>;
}
