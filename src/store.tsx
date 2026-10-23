// All state lives in one CanvasFile. Every edit autosaves to this browser; the JSON file you export is the
// copy you keep and share. "dirty" means there are edits the last exported file doesn't have.
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Project, CanvasFile, Checklist, ChecklistParameter, Connection, Direction, LeadMethod, Processor, Product, RecordingFormat, RecordingVia, SchedulerSource, SlotKey, Status } from './types';
import { SLOTS } from './types';
// The example projects name real clients, so sample.ts is gitignored: a fresh clone (and the deployed site)
// starts empty, and only machines that have the file show the examples on first run.
const sampleModules = import.meta.glob<{ sampleFile: CanvasFile }>('./sample.ts', { eager: true });
const emptyFile: CanvasFile = { version: 8, projects: [] };
const sampleFile = Object.values(sampleModules)[0]?.sampleFile ?? emptyFile;

const DATA_KEY = 'fde-canvas:data';
const DIRTY_KEY = 'fde-canvas:dirty';

export const today = () => new Date().toISOString().slice(0, 10);
export const newId = () => Math.random().toString(36).slice(2, 10);

export const newProject = (name: string, products: Product[]): Project => ({
  id: newId(), name, products, notes: '',
  leadIngestion: { methods: [], connectors: [], notes: '', status: 'open' },
  dialer: { clientDialer: null, provider: '', connection: null, direction: null, notes: '', status: 'open' },
  transferTo: '',
  recordings: { format: null, via: null, dedupeKey: '', schedulerSource: null, schedulerConfig: '', callbackUrl: null, subcategoryCallback: null, notes: '', status: 'open' },
  checklists: [], processors: [],
});
export const newProcessor = (slot: SlotKey): Processor => ({
  id: newId(), slot, enabled: true, status: 'open',
  // A single-slot processor is usually just called after its slot; several in one slot need their own names.
  name: SLOTS[slot].multi ? 'New processor' : SLOTS[slot].label,
  description: '', checklistId: null, parameterId: null,
});
export const newChecklist = (): Checklist => ({ id: newId(), name: 'New checklist', templateId: '', notes: '', parameters: [] });
export const newParameter = (): ChecklistParameter => ({ id: newId(), name: '', auditId: '' });
// The pre or post processor attached to one checklist parameter, if any.
export const parameterProcessor = (project: Project, slot: 'audit_pre' | 'audit_post', parameterId: string) =>
  project.processors.find(p => p.slot === slot && p.parameterId === parameterId);


// ---- Import validation: accept our own files (current and earlier versions), fill in anything optional,
// reject the rest with a reason.

const SLOT_KEYS = Object.keys(SLOTS) as SlotKey[];
const PRODUCT_KEYS: Product[] = ['voicebot', 'speech_analytics'];
const LEAD_METHOD_KEYS: LeadMethod[] = ['api', 'sftp', 'manual'];
const DIRECTIONS: Direction[] = ['inbound', 'outbound'];
const CONNECTIONS: Connection[] = ['sip', 'pstn', 'wsb'];
// Anything without a status yet (older files) starts open.
const status = (value: unknown): Status => (value === 'closed' ? 'closed' : 'open');
// Version 1 files placed processors in lifecycle stages; each maps to the point that stage now covers.
const STAGE_TO_SLOT: Record<string, SlotKey> = {
  pre_call: 'pre_call', during_call: 'during_call', pre_analytics: 'resource_pre', analytics: 'audit_post', post_call: 'resource_post',
};

const str = (value: unknown) => (typeof value === 'string' ? value : '');
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const bool = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null);

const FORMATS: RecordingFormat[] = ['with_metadata', 'without_metadata', 'presigned_url'];
const VIAS: RecordingVia[] = ['api', 'scheduler'];
const SCHEDULER_SOURCES: SchedulerSource[] = ['sftp', 's3'];

// Before version 7 a project kept one free-text recordingSource. It becomes the notes, and the picks that map
// cleanly (our API; an SFTP drop or S3 bucket, which a scheduler reads) carry over.
function readRecordings(a: Record<string, unknown>): Project['recordings'] {
  const r = obj(a.recordings);
  if (a.recordings !== undefined) {
    const via = VIAS.includes(r.via as RecordingVia) ? (r.via as RecordingVia) : null;
    return {
      format: FORMATS.includes(r.format as RecordingFormat) ? (r.format as RecordingFormat) : null,
      via,
      dedupeKey: str(r.dedupeKey),
      schedulerSource: via === 'scheduler' && SCHEDULER_SOURCES.includes(r.schedulerSource as SchedulerSource) ? (r.schedulerSource as SchedulerSource) : null,
      schedulerConfig: via === 'scheduler' ? str(r.schedulerConfig) : '',
      callbackUrl: via === 'api' ? bool(r.callbackUrl) : null,
      subcategoryCallback: via === 'api' && r.callbackUrl === true ? bool(r.subcategoryCallback) : null,
      notes: str(r.notes),
      status: status(r.status),
    };
  }
  const legacy = str(a.recordingSource);
  const via: RecordingVia | null = /speech analytics api/i.test(legacy) ? 'api' : /sftp|s3/i.test(legacy) ? 'scheduler' : null;
  return {
    format: null,
    via,
    dedupeKey: '',
    schedulerSource: via === 'scheduler' ? (/sftp/i.test(legacy) ? 'sftp' : 's3') : null,
    schedulerConfig: '',
    callbackUrl: null,
    subcategoryCallback: null,
    notes: legacy,
    status: status(a.recordingStatus),
  };
}

export function parseCanvasFile(text: string): CanvasFile {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('That file isn’t valid JSON.'); }
  const file = obj(raw);
  // Files from before the rename to "projects" keep their list under "accounts".
  const list = Array.isArray(file.projects) ? file.projects : file.accounts;
  if (!Array.isArray(list)) throw new Error('That isn’t an FDE Canvas file: there’s no "projects" list.');
  const projects = list.map((rawProject, index): Project => {
    const a = obj(rawProject);
    if (!str(a.name).trim()) throw new Error(`Project ${index + 1} has no name.`);
    const checklists = arr(a.checklists).map((rawChecklist): Checklist => {
      const c = obj(rawChecklist);
      const parameters = arr(c.parameters).map((rawParameter): ChecklistParameter => {
        const q = obj(rawParameter);
        return { id: str(q.id) || newId(), name: str(q.name), auditId: str(q.auditId) };
      });
      return { id: str(c.id) || newId(), name: str(c.name) || 'Untitled checklist', templateId: str(c.templateId), notes: str(c.notes), parameters };
    });
    const checklistById = new Map(checklists.map(c => [c.id, c]));
    const processors = arr(a.processors).map((rawProcessor): Processor => {
      const p = obj(rawProcessor);
      const slot = SLOT_KEYS.includes(p.slot as SlotKey) ? (p.slot as SlotKey) : STAGE_TO_SLOT[str(p.stage)] ?? 'audit_post';
      // Earlier versions also kept a location, link and update log per processor; those are no longer tracked.
      const checklist = checklistById.get(str(p.checklistId));
      let parameterId: string | null = checklist?.parameters.some(q => q.id === str(p.parameterId)) ? str(p.parameterId) : null;
      // Earlier versions stored the audit parameter id as text on the processor; it becomes a parameter of
      // the checklist, so the processor hangs off that parameter.
      if (checklist && !parameterId && str(p.parameter)) {
        const auditId = str(p.parameter);
        let parameter = checklist.parameters.find(q => q.auditId === auditId);
        if (!parameter) {
          parameter = { id: newId(), name: str(p.name).replace(/:.*$/, '').trim(), auditId };
          checklist.parameters.push(parameter);
        }
        parameterId = parameter.id;
      }
      return {
        id: str(p.id) || newId(),
        slot,
        enabled: p.enabled !== false,
        status: status(p.status),
        name: str(p.name) || SLOTS[slot].label,
        description: str(p.description),
        checklistId: checklist ? checklist.id : null,
        parameterId,
      };
    });

    // Version 1 kept telephony details; the dialer settings and transfer target carry over.
    const telephony = obj(a.telephony);
    const dialer = obj(a.dialer);
    const hotTransfer = obj(telephony.hotTransfer);
    const legacyNotes = [str(telephony.notes), str(telephony.integration) && str(telephony.integration) !== 'dialer' && str(telephony.integration) !== 'none' ? `Connection: ${str(telephony.integration)}` : '']
      .filter(Boolean).join('\n');
    const clientDialer = typeof dialer.clientDialer === 'boolean' ? dialer.clientDialer
      : telephony.integration === 'dialer' ? true : null;
    // Hot transfer used to be a telephony flag. If a during-call processor is the transfer tool, it now runs at
    // the Transfer point; otherwise an empty transfer processor records that transfer happens.
    if (hotTransfer.enabled === true && !processors.some(p => p.slot === 'transfer')) {
      const transferTool = processors.find(p => p.slot === 'during_call' && /transfer/i.test(p.name));
      if (transferTool) transferTool.slot = 'transfer';
      else processors.push(newProcessor('transfer'));
    }
    const lead = obj(a.leadIngestion);
    // Before version 8 a project could be inbound and outbound at once; that's no longer possible, so it comes in unset
    // (its processors stay, and the canvas shows the path that doesn't match with a warning).
    const direction = DIRECTIONS.includes(dialer.direction as Direction) ? (dialer.direction as Direction)
      : DIRECTIONS.includes(telephony.direction as Direction) ? (telephony.direction as Direction) : null;
    // Inbound used to mean SIP inbound.
    const connection = CONNECTIONS.includes(dialer.connection as Connection) ? (dialer.connection as Connection)
      : direction === 'inbound' && a.dialer !== undefined && dialer.connection === undefined ? 'sip' : null;

    return {
      id: str(a.id) || newId(),
      name: str(a.name).trim(),
      products: arr(a.products).filter((p): p is Product => PRODUCT_KEYS.includes(p as Product)),
      notes: str(a.notes),
      leadIngestion: {
        methods: arr(lead.methods).filter((m): m is LeadMethod => LEAD_METHOD_KEYS.includes(m as LeadMethod)),
        connectors: arr(lead.connectors).map(str).map(c => c.trim()).filter(Boolean),
        // S3 push used to be a lead method; voice bot leads never arrive that way, so it's dropped, with a note so it isn't lost silently.
        notes: arr(lead.methods).includes('s3') ? [str(lead.notes), 'Was marked as arriving by S3 push.'].filter(Boolean).join('\n') : str(lead.notes),
        status: status(lead.status),
      },
      dialer: {
        clientDialer,
        provider: str(dialer.provider) || str(telephony.provider),
        connection,
        direction,
        notes: str(dialer.notes) || legacyNotes,
        status: status(dialer.status),
      },
      transferTo: str(a.transferTo) || str(hotTransfer.to),
      recordings: readRecordings(a),
      checklists,
      // Before the inbound pre call processor existed, inbound projects kept it at "pre call connected".
      processors: direction === 'inbound' && !processors.some(p => p.slot === 'inbound_pre_call')
        ? processors.map(p => (p.slot === 'pre_call_connected' ? { ...p, slot: 'inbound_pre_call' as const } : p))
        : processors,
    };
  });
  return { version: 8, exportedAt: str(file.exportedAt) || undefined, projects };
}

function loadSaved(): CanvasFile {
  try {
    const saved = localStorage.getItem(DATA_KEY);
    if (saved) return parseCanvasFile(saved);
  } catch { /* storage blocked or corrupt: start from the example, if there is one */ }
  return sampleFile;
}

function loadDirty() {
  try { return localStorage.getItem(DIRTY_KEY) === '1'; } catch { return false; }
}

type Store = {
  file: CanvasFile;
  dirty: boolean;
  updateProject: (id: string, change: (project: Project) => Project) => void;
  // Adds the project, or replaces the one with the same id.
  saveProject: (project: Project) => void;
  deleteProject: (id: string) => void;
  importFile: (text: string) => void;
  exportFile: () => void;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [file, setFile] = useState<CanvasFile>(loadSaved);
  const [dirty, setDirty] = useState(loadDirty);

  useEffect(() => {
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify(file));
      localStorage.setItem(DIRTY_KEY, dirty ? '1' : '0');
    } catch { /* storage unavailable: edits still work for this session */ }
  }, [file, dirty]);

  const edit = useCallback((change: (current: CanvasFile) => CanvasFile) => { setFile(change); setDirty(true); }, []);

  const store = useMemo<Store>(() => ({
    file,
    dirty,
    updateProject: (id, change) => edit(current => ({ ...current, projects: current.projects.map(a => (a.id === id ? change(a) : a)) })),
    saveProject: project => edit(current => ({
      ...current,
      projects: current.projects.some(a => a.id === project.id)
        ? current.projects.map(a => (a.id === project.id ? project : a))
        : [...current.projects, project],
    })),
    deleteProject: id => edit(current => ({ ...current, projects: current.projects.filter(a => a.id !== id) })),
    importFile: text => {
      const imported = parseCanvasFile(text);
      setFile(imported);
      setDirty(false);
    },
    exportFile: () => {
      const exported: CanvasFile = { ...file, version: 8, exportedAt: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `fde-canvas-${today()}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      setFile(exported);
      setDirty(false);
    },
  }), [file, dirty, edit]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside StoreProvider');
  return store;
}
