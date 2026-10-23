// The project canvas: the platform's call architecture, with this project's processors in place.
// Green means switched on / set, red means not used / not set.
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, Info, ListChecks, MessagesSquare, Plus, Settings2, Trash2 } from 'lucide-react';
import { newChecklist, newProcessor, parameterProcessor, useStore } from '../store';
import { hrefFor, navigate } from '../router';
import { ConfirmModal } from '../components/Modal';
import { DIRECTION_LABEL, LEAD_METHODS, PRODUCTS, RECORDING_FORMAT_LABEL, RECORDING_VIA_LABEL, SCHEDULER_SOURCE_LABEL, SLOTS, recordingsAutomatic, type Project, type Checklist, type Processor, type SlotKey, type Status } from '../types';
import { ProjectPanel, ChecklistPanel, DialerPanel, LeadPanel, ProcessorPanel, RecordingsPanel } from './panels';

export type Selection =
  | { kind: 'processor'; id: string }
  | { kind: 'checklist'; id: string }
  | { kind: 'lead' }
  | { kind: 'dialer' }
  | { kind: 'recordings' }
  | { kind: 'project' };

type Update = (change: (a: Project) => Project) => void;


export default function ProjectCanvas({ projectId }: { projectId: string }) {
  const { file, updateProject, deleteProject } = useStore();
  const project = file.projects.find(a => a.id === projectId);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  // On narrow screens the panel sits under the canvas; bring it into view when something is picked.
  useEffect(() => {
    if (selection && window.matchMedia('(max-width: 1099px)').matches) panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selection]);

  if (!project) {
    return <main className="page narrow"><div className="empty"><div className="empty-title">That project isn’t in this file.</div><p className="muted">It may have been deleted, or you imported a different file.</p><a className="button" href="#/">Back to projects</a></div></main>;
  }

  const update: Update = change => updateProject(project.id, change);
  const isSelected = (s: Selection) => JSON.stringify(s) === JSON.stringify(selection);
  const select = (s: Selection) => setSelection(isSelected(s) ? null : s);

  const inSlot = (slot: SlotKey) => project.processors.filter(p => p.slot === slot);
  const addProcessor = (slot: SlotKey, extra: Partial<Processor> = {}) => {
    const processor = { ...newProcessor(slot), ...extra };
    update(a => ({ ...a, processors: [...a.processors, processor] }));
    setSelection({ kind: 'processor', id: processor.id });
  };
  const setEnabled = (id: string, enabled: boolean) =>
    update(a => ({ ...a, processors: a.processors.map(p => (p.id === id ? { ...p, enabled } : p)) }));
  const setStatus = (id: string, status: Status) =>
    update(a => ({ ...a, processors: a.processors.map(p => (p.id === id ? { ...p, status } : p)) }));
  const addChecklist = () => {
    const checklist = newChecklist();
    update(a => ({ ...a, checklists: [...a.checklists, checklist] }));
    setSelection({ kind: 'checklist', id: checklist.id });
  };

  // A section shows only when the project has that product. Processors already in a hidden section are
  // kept, and come back as they were if the product is switched on again. Post call always shows.
  const showVoice = project.products.includes('voicebot');
  const showAnalytics = project.products.includes('speech_analytics');

  const slotProps: SlotHelpers = { inSlot, isSelected, select, addProcessor, setEnabled, setStatus };
  const { leadIngestion, dialer, recordings } = project;
  // Direction decides the start of the call. Outbound: leads are ingested, pre-processed and dialled.
  // SIP inbound: there's no lead ingestion; the customer calls in and the inbound pre call processor fetches
  // their details from the client's API instead. Until it's set, the outbound path shows.
  // A path that doesn't match the direction still shows if it holds processors, so nothing goes missing.
  const usesOutbound = dialer.direction !== 'inbound';
  const usesInbound = dialer.direction === 'inbound' || dialer.direction === 'both';
  const showOutbound = usesOutbound || (['pre_call', 'no_answer', 'pre_call_connected'] as const).some(s => inSlot(s).length);
  const showInbound = usesInbound || inSlot('inbound_pre_call').length > 0;
  const laneTitle = (name: string, used: boolean) =>
    (showOutbound && showInbound) || !used ? <div className={`arch-lane-title ${used ? '' : 'mismatch'}`}>{name}{used ? '' : ` · has processors, but calls are ${dialer.direction ? DIRECTION_LABEL[dialer.direction] : 'not set'}`}</div> : null;
  const whose = dialer.clientDialer === true ? 'Client’s dialer · details pushed via API' : dialer.clientDialer === false ? 'Our dialer' : 'Whose dialer? Not set';

  return <main className="page">
    <a href="#/" className="back"><ArrowLeft size={12} /> Projects</a>
    <div className="page-head">
      <div className="min-w-0">
        <h1 className="page-title">{project.name}</h1>
        <div className="chips">
          {PRODUCTS.filter(p => project.products.includes(p.key)).map(p => <span key={p.key} className="chip">{p.label}</span>)}
          {project.notes && <span className="muted small truncate project-notes">{project.notes}</span>}
        </div>
      </div>
      <div className="head-actions">
        <a className="button" href={hrefFor({ screen: 'edit', projectId: project.id })}><MessagesSquare size={13} /> Edit with questions</a>
        <button className="button danger" onClick={() => setConfirmDelete(true)}><Trash2 size={13} /> Delete</button>
        <button className={`button ${isSelected({ kind: 'project' }) ? 'active' : ''}`} onClick={() => select({ kind: 'project' })}><Settings2 size={13} /> Project details</button>
      </div>
    </div>

    <div className={selection ? 'canvas-layout' : ''}>
      <div className="arch">
        {!showVoice && !showAnalytics && <div className="empty compact"><div className="empty-title">No products picked.</div><p className="muted">Open Project details and choose Voice bot, Speech analytics, or both.</p></div>}
        {showVoice && <section className="surface arch-section">
          <div className="arch-section-title">Voice bot</div>
          <div className="arch-row">
            <div className="arch-paths">
            {showOutbound && <div className="arch-lane">
            {laneTitle('Outbound', usesOutbound)}
            <div className="arch-row">
            <div className="arch-col">
              <Node status={leadIngestion.status} title="Lead ingestion" selected={isSelected({ kind: 'lead' })} onClick={() => select({ kind: 'lead' })}>
                {leadIngestion.methods.length
                  ? <>
                    <div className="node-chips">{LEAD_METHODS.filter(m => leadIngestion.methods.includes(m.key)).map(m => <span key={m.key} className="node-chip">{m.label}</span>)}</div>
                    {leadIngestion.methods.includes('api') && leadIngestion.connectors.some(c => c.trim()) && <span className="node-sub">Connectors: {leadIngestion.connectors.filter(c => c.trim()).join(', ')}</span>}
                  </>
                  : <span className="node-sub">How do leads arrive? Not set</span>}
              </Node>
              <Branch label="Before dialling" />
              <SingleSlot slot="pre_call" {...slotProps} />
            </div>

            <Arrow />

            <div className="arch-col wide">
              <Node status={dialer.status} title="Dialer: dials the calls" selected={isSelected({ kind: 'dialer' })} onClick={() => select({ kind: 'dialer' })}>
                <span className="node-sub">{whose}{dialer.provider ? ` · ${dialer.provider}` : ''}</span>
                <span className="node-sub">{dialer.direction ? DIRECTION_LABEL[dialer.direction] : 'Inbound or outbound? Not set'}</span>
              </Node>
              <div className="arch-forks">
                <div><Branch label="Customer doesn’t pick up" /><SingleSlot slot="no_answer" {...slotProps} /></div>
                <div><Branch label="Customer picks up" /><SingleSlot slot="pre_call_connected" {...slotProps} /></div>
              </div>
            </div>
            </div>
            </div>}

            {showInbound && <div className="arch-lane">
              {laneTitle('SIP inbound', usesInbound)}
              <div className="arch-row">
                <div className="arch-col">
                  <Node status={dialer.status} title="Customer calls in" selected={isSelected({ kind: 'dialer' })} onClick={() => select({ kind: 'dialer' })}>
                    <span className="node-sub">SIP inbound{dialer.provider ? ` · ${dialer.provider}` : ''}</span>
                    <span className="node-sub">No lead ingestion: the lead is built from the call</span>
                  </Node>
                </div>
                <Arrow />
                <div className="arch-col wide">
                  <Branch label="Before the bot speaks: fetch from the client’s API, enrich lead attributes" />
                  <SingleSlot slot="inbound_pre_call" {...slotProps} />
                </div>
              </div>
            </div>}
            </div>

            <Arrow />

            <div className="arch-col widest arch-group">
              <div className="arch-group-title">During call</div>
              <div className="arch-group-body">
                <MultiSlot slot="during_call" {...slotProps} />
                <div>
                  <div className="arch-decision">Transfer?</div>
                  <Branch label="Yes" />
                  <SingleSlot slot="transfer" {...slotProps} extra={project.transferTo ? `Transfers to ${project.transferTo}` : undefined} />
                </div>
              </div>
            </div>
          </div>
        </section>}

        {showAnalytics && <section className="surface arch-section">
          <div className="arch-section-title">Speech analytics</div>
          <div className="arch-row">
            <div className="arch-col narrow">
              {recordingsAutomatic(project)
                // Both products: the voice bot's calls reach speech analytics through the internal queue. Nothing to set up.
                ? <Node title="Recordings from"><span className="node-sub">Voice bot calls, via the internal queue. No separate ingestion needed.</span></Node>
                : <Node status={recordings.status} title="Recording ingestion" selected={isSelected({ kind: 'recordings' })} onClick={() => select({ kind: 'recordings' })}>
                  {recordings.format || recordings.via
                    ? <>
                      <div className="node-chips">
                        {recordings.format && <span className="node-chip">{RECORDING_FORMAT_LABEL[recordings.format]}</span>}
                        {recordings.via && <span className="node-chip">{recordings.via === 'scheduler' && recordings.schedulerSource
                          ? `Scheduler · ${SCHEDULER_SOURCE_LABEL[recordings.schedulerSource]}` : RECORDING_VIA_LABEL[recordings.via]}</span>}
                      </div>
                      {recordings.via === 'scheduler' && recordings.schedulerConfig.trim() && <span className="node-sub">{recordings.schedulerConfig.trim().split('\n')[0]}</span>}
                    </>
                    : <span className="node-sub">{recordings.notes || 'What arrives, and what picks it up? Not set'}</span>}
                </Node>}
            </div>
            <Arrow />
            <div className="arch-col">
              <Node title="CDR → recording extraction"><span className="node-sub">Call recording + metadata</span></Node>
              <Branch label="Org level, not checklist level" />
              <SingleSlot slot="resource_pre" {...slotProps} />
            </div>
            <Arrow />
            <div className="arch-col widest">
              <Node title="Checklist processing">
                <span className="node-sub">{project.checklists.length ? `${project.checklists.length} checklist${project.checklists.length === 1 ? '' : 's'}` : 'No checklists mapped'}</span>
              </Node>
              <div className="arch-checklists">
                {project.checklists.map(checklist => <ChecklistCard key={checklist.id} checklist={checklist} project={project} slotProps={slotProps} />)}
                <button className="add-card" onClick={addChecklist}><Plus size={12} /> Checklist</button>
              </div>
            </div>
          </div>
        </section>}

        <section className="surface arch-section">
          <div className="arch-section-title">Post call</div>
          <div className="arch-row">
            <div className="arch-col">
              <Branch label="Once the call’s results are ready" />
              <SingleSlot slot="resource_post" {...slotProps} />
            </div>
          </div>
        </section>
      </div>

      {selection && <aside ref={panelRef} className="surface panel">
        {selection.kind === 'processor' && <ProcessorPanel project={project} processorId={selection.id} update={update} onClose={() => setSelection(null)} />}
        {selection.kind === 'checklist' && <ChecklistPanel project={project} checklistId={selection.id} update={update} onSelect={setSelection} onClose={() => setSelection(null)} />}
        {selection.kind === 'lead' && <LeadPanel project={project} update={update} onClose={() => setSelection(null)} />}
        {selection.kind === 'dialer' && <DialerPanel project={project} update={update} onClose={() => setSelection(null)} />}
        {selection.kind === 'recordings' && <RecordingsPanel project={project} update={update} onClose={() => setSelection(null)} />}
        {selection.kind === 'project' && <ProjectPanel project={project} update={update} onClose={() => setSelection(null)} />}
      </aside>}
    </div>

    {confirmDelete && <ConfirmModal
      title={`Delete ${project.name}?`}
      body={`${project.name}, with its ${project.processors.length} processor${project.processors.length === 1 ? '' : 's'} and ${project.checklists.length} checklist${project.checklists.length === 1 ? '' : 's'}, will be removed from this browser. Export first if you might need it; this can’t be undone.`}
      confirmLabel="Delete project"
      danger
      onConfirm={() => { deleteProject(project.id); navigate({ screen: 'projects' }); }}
      onClose={() => setConfirmDelete(false)}
    />}
  </main>;
}

// ---- Diagram pieces

// A setting on the diagram: red while open, green once closed. Fixed platform steps stay neutral.
function Node({ status, title, selected, onClick, children }: { status?: Status; title: string; selected?: boolean; onClick?: () => void; children?: ReactNode }) {
  const tone = status ?? '';
  const body = <><div className="node-top"><span className="node-title">{title}</span>{status && <span className="status-tag">{status === 'closed' ? 'Closed' : 'Open'}</span>}</div>{children}</>;
  return onClick
    ? <button className={`arch-node clickable ${tone} ${selected ? 'selected' : ''}`} onClick={onClick}>{body}</button>
    : <div className={`arch-node ${tone}`}>{body}</div>;
}

function Arrow() {
  return <div className="arch-arrow" aria-hidden="true"><ArrowRight size={15} /></div>;
}

function Branch({ label }: { label: string }) {
  return <div className="arch-branch"><ArrowDown size={13} className="arch-branch-icon" /><span>{label}</span></div>;
}

type SlotHelpers = {
  inSlot: (slot: SlotKey) => Processor[];
  isSelected: (s: Selection) => boolean;
  select: (s: Selection) => void;
  addProcessor: (slot: SlotKey, extra?: Partial<Processor>) => void;
  setEnabled: (id: string, enabled: boolean) => void;
  setStatus: (id: string, status: Status) => void;
};
type SlotProps = SlotHelpers & { slot: SlotKey; extra?: string };

function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return <span role="switch" aria-checked={on} aria-label={label} tabIndex={0} className={`mini-switch ${on ? 'on' : ''}`}
    onClick={(event: MouseEvent) => { event.stopPropagation(); onChange(!on); }}
    onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); onChange(!on); } }}>
    <span className="mini-switch-thumb" />
  </span>;
}

function SlotHelp({ slot }: { slot: SlotKey }) {
  const info = SLOTS[slot];
  return <span className="slot-help" title={`${info.when}${info.hook ? `\n\nPlatform hook: ${info.hook}` : ''}`}><Info size={11} /></span>;
}

// Disabled processors are grey. Enabled ones are red while open and green once closed.
const tone = (p: Pick<Processor, 'enabled' | 'status'> | undefined) => (!p || !p.enabled ? 'disabled' : p.status);

function StatusButton({ processor, setStatus }: { processor: Processor; setStatus: (id: string, status: Status) => void }) {
  const closed = processor.status === 'closed';
  return <span role="button" tabIndex={0} className="status-button" title={closed ? 'Reopen' : 'Mark as closed'}
    onClick={(event: MouseEvent) => { event.stopPropagation(); setStatus(processor.id, closed ? 'open' : 'closed'); }}
    onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); setStatus(processor.id, closed ? 'open' : 'closed'); } }}>
    {closed ? 'Closed' : 'Open'}
  </span>;
}

function ProcessorCard({ processor, helpers, kicker, extra }: { processor: Processor; helpers: SlotHelpers; kicker?: ReactNode; extra?: string }) {
  const { isSelected, select, setEnabled, setStatus } = helpers;
  return <button className={`card processor ${tone(processor)} ${isSelected({ kind: 'processor', id: processor.id }) ? 'selected' : ''}`}
    onClick={() => select({ kind: 'processor', id: processor.id })} data-testid={`processor-${processor.id}`}>
    <div className="card-top">
      {kicker ?? <span />}
      <span className="card-controls">
        {processor.enabled && <StatusButton processor={processor} setStatus={setStatus} />}
        <Switch on={processor.enabled} label={`${processor.enabled ? 'Disable' : 'Enable'} ${processor.name}`} onChange={on => setEnabled(processor.id, on)} />
      </span>
    </div>
    <div className="card-title">{processor.name}</div>
    {processor.description && <div className="card-desc">{processor.description}</div>}
    {!processor.enabled && <div className="card-sub">Disabled</div>}
    {extra && processor.enabled && <div className="card-sub">{extra}</div>}
  </button>;
}

// One processor at this point, switched on or off. Switching on for the first time creates it.
function SingleSlot(props: SlotProps) {
  const { slot, inSlot, addProcessor } = props;
  const processors = inSlot(slot);
  const kicker = <span className="card-kicker">{SLOTS[slot].label}<SlotHelp slot={slot} /></span>;
  if (processors.length === 0) {
    return <button className="card slot-empty" onClick={() => addProcessor(slot)}>
      <div className="card-top">{kicker}<Switch on={false} label={`Enable ${SLOTS[slot].label}`} onChange={() => addProcessor(slot)} /></div>
      <div className="card-sub">Not used</div>
    </button>;
  }
  // Older files can hold more than one here; show them all rather than hide any.
  // A processor still carrying its default name would show the same words twice, so it keeps just the ⓘ.
  return <div className="slot-stack">{processors.map(p => <ProcessorCard key={p.id} processor={p} helpers={props} extra={props.extra}
    kicker={p.name.trim() === SLOTS[slot].label ? <span className="card-kicker"><SlotHelp slot={slot} /></span> : kicker} />)}</div>;
}

// Any number of processors at this point, each switched on or off.
function MultiSlot(props: SlotProps) {
  const { slot, inSlot, addProcessor } = props;
  const processors = inSlot(slot);
  const on = processors.filter(p => p.enabled).length;
  return <div className="multi-slot">
    <div className="multi-slot-head"><span className="card-kicker">{SLOTS[slot].label}<SlotHelp slot={slot} /></span><span className="mono muted small">{processors.length ? `${on}/${processors.length} on` : ''}</span></div>
    <div className="slot-stack">
      {processors.length === 0 && <div className="card slot-empty static"><div className="card-sub">None</div></div>}
      {processors.map(p => <ProcessorCard key={p.id} processor={p} helpers={props} />)}
      <button className="add-card" onClick={() => addProcessor(slot)}><Plus size={12} /> Processor</button>
    </div>
  </div>;
}

// A checklist with its parameters; each parameter has a pre and a post processor point.
function ChecklistCard({ checklist, project, slotProps }: { checklist: Checklist; project: Project; slotProps: SlotHelpers }) {
  const { isSelected, select, addProcessor, setEnabled } = slotProps;
  return <div className={`checklist-card ${isSelected({ kind: 'checklist', id: checklist.id }) ? 'selected' : ''}`}>
    <button className="checklist-head" onClick={() => select({ kind: 'checklist', id: checklist.id })}>
      <span className="card-kicker"><ListChecks size={11} /> Checklist{checklist.templateId ? ` · ${checklist.templateId}` : ''}</span>
      <span className="card-title">{checklist.name}</span>
    </button>
    {checklist.parameters.length === 0
      ? <div className="card-sub param-empty">No parameters with processors. Open the checklist to add parameters.</div>
      : <div className="param-list">
          <div className="param-row param-labels"><span /><span>Pre</span><span>Post</span></div>
          {checklist.parameters.map(q => <div key={q.id} className="param-row">
            <span className="param-name">{q.name || 'Unnamed parameter'}{q.auditId && <span className="mono muted"> · {q.auditId}</span>}</span>
            {(['audit_pre', 'audit_post'] as const).map(slot => {
              const p = parameterProcessor(project, slot, q.id);
              return <span key={slot} className={`param-cell ${tone(p)} ${p ? '' : 'unused'} ${p && isSelected({ kind: 'processor', id: p.id }) ? 'selected' : ''}`}
                title={p ? `${p.name} · ${p.enabled ? (p.status === 'closed' ? 'closed' : 'open') : 'disabled'}${p.description ? `\n\n${p.description}` : ''}` : `${SLOTS[slot].label}: not used`}
                onClick={() => (p ? select({ kind: 'processor', id: p.id }) : addProcessor(slot, { checklistId: checklist.id, parameterId: q.id, name: `${q.name || 'Parameter'}: ${slot === 'audit_pre' ? 'pre' : 'post'} processor` }))}>
                <Switch on={!!p?.enabled} label={`${slot === 'audit_pre' ? 'Pre' : 'Post'} processor for ${q.name}`}
                  onChange={on => (p ? setEnabled(p.id, on) : addProcessor(slot, { checklistId: checklist.id, parameterId: q.id, name: `${q.name || 'Parameter'}: ${slot === 'audit_pre' ? 'pre' : 'post'} processor` }))} />
              </span>;
            })}
          </div>)}
        </div>}
  </div>;
}
