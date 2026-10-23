import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { useStore } from '../store';
import { navigate } from '../router';
import { ConfirmModal } from '../components/Modal';
import { ProductPicker, SelectField, StatusControl, TextArea, TextField, Toggle } from '../components/fields';
import { DIRECTION_LABEL, LEAD_METHODS, SLOTS, type Project, type Direction, type Processor } from '../types';
import { addParameter, removeParameter, setParameter } from '../intake/questions';
import type { Selection } from './ProjectCanvas';

type Update = (change: (project: Project) => Project) => void;

function PanelHead({ kicker, title, onClose }: { kicker: string; title: string; onClose: () => void }) {
  return <div className="panel-head">
    <div className="min-w-0"><div className="eyebrow">{kicker}</div><h2 className="panel-title">{title || 'Untitled'}</h2></div>
    <button className="button ghost icon" aria-label="Close panel" onClick={onClose}><X size={15} /></button>
  </div>;
}

function DeleteButton({ label, body, onConfirm }: { label: string; body: string; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return <>
    <button className="button ghost danger delete-button" onClick={() => setConfirming(true)}><Trash2 size={13} /> {label}</button>
    {confirming && <ConfirmModal title={`${label}?`} body={body} confirmLabel={label} danger onConfirm={onConfirm} onClose={() => setConfirming(false)} />}
  </>;
}

export function ProcessorPanel({ project, processorId, update, onClose }: { project: Project; processorId: string; update: Update; onClose: () => void }) {
  const processor = project.processors.find(p => p.id === processorId);
  if (!processor) return <div className="panel-empty"><div className="empty-title">That processor is gone.</div></div>;
  const slot = SLOTS[processor.slot];
  const set = (patch: Partial<Processor>) => update(a => ({ ...a, processors: a.processors.map(p => (p.id === processor.id ? { ...p, ...patch } : p)) }));
  const checklist = project.checklists.find(c => c.id === processor.checklistId);
  const parameter = checklist?.parameters.find(q => q.id === processor.parameterId);

  return <div>
    <PanelHead kicker={slot.label} title={processor.name} onClose={onClose} />
    {parameter && <div className="small muted mt-xs">{checklist?.name} · {parameter.name || 'Unnamed parameter'}{parameter.auditId ? ` (${parameter.auditId})` : ''}</div>}
    <div className="slot-info">
      <div className="small">{slot.when}</div>
      {slot.hook && <div className="small muted mt-xs">Platform hook <span className="mono">{slot.hook}</span></div>}
    </div>
    <div className="section-tight"><Toggle label={processor.enabled ? 'Enabled' : 'Disabled: doesn’t apply to this project'} checked={processor.enabled} onChange={enabled => set({ enabled })} /></div>
    {processor.enabled && <StatusControl value={processor.status} onChange={status => set({ status })} />}
    <TextField label="Name" value={processor.name} autoFocus={processor.name === 'New processor'} onChange={name => set({ name })} />
    {processor.slot === 'transfer' && <TextField label="Transfers to" value={project.transferTo} placeholder="Queue, number or dialer API" onChange={transferTo => update(a => ({ ...a, transferTo }))} />}
    <TextArea label="What it does" rows={8} value={processor.description} placeholder="Reads… calls… writes… what happens when it fails" onChange={description => set({ description })} />
    <p className="muted tiny-note">Never paste keys, tokens or passwords here: this file gets exported and shared.</p>
    <DeleteButton label="Delete processor" body={`“${processor.name}” will be removed from ${project.name}. To keep what’s written but mark it as not applying, disable it instead.`}
      onConfirm={() => { update(a => ({ ...a, processors: a.processors.filter(p => p.id !== processor.id) })); onClose(); }} />
  </div>;
}

export function LeadPanel({ project, update, onClose }: { project: Project; update: Update; onClose: () => void }) {
  const lead = project.leadIngestion;
  const set = (patch: Partial<Project['leadIngestion']>) => update(a => ({ ...a, leadIngestion: { ...a.leadIngestion, ...patch } }));
  return <div>
    <PanelHead kicker="Lead ingestion" title="How leads arrive" onClose={onClose} />
    <StatusControl value={lead.status} onChange={status => set({ status })} />
    <span className="field-label mt">Methods</span>
    <div className="product-picker">
      {LEAD_METHODS.map(method => {
        const on = lead.methods.includes(method.key);
        return <button type="button" key={method.key} className={`pick ${on ? 'on' : ''}`} aria-pressed={on}
          onClick={() => set({ methods: on ? lead.methods.filter(m => m !== method.key) : [...lead.methods, method.key] })}>
          <span className="pick-box">{on ? '✓' : ''}</span>{method.label}
        </button>;
      })}
    </div>
    {lead.methods.includes('api') && <>
      <span className="field-label mt">Connectors</span>
      <div className="intake-rows">
        {(lead.connectors.length ? lead.connectors : ['']).map((name, i, names) => <div key={i} className="intake-row">
          <input className="field" placeholder="Connector name, e.g. LSQ" value={name} onChange={e => set({ connectors: names.map((n, j) => (j === i ? e.target.value : n)) })} />
          {names.length > 1 && <button className="button ghost icon" aria-label="Remove connector" onClick={() => set({ connectors: names.filter((_, j) => j !== i) })}><Trash2 size={13} /></button>}
        </div>)}
        <button className="add-card" onClick={() => set({ connectors: [...(lead.connectors.length ? lead.connectors : ['']), ''] })}><Plus size={12} /> Another connector</button>
      </div>
    </>}
    <TextArea label="Notes" value={lead.notes} placeholder="Who sends them, how often, file format, auth…" onChange={notes => set({ notes })} />
  </div>;
}

export function DialerPanel({ project, update, onClose }: { project: Project; update: Update; onClose: () => void }) {
  const dialer = project.dialer;
  const set = (patch: Partial<Project['dialer']>) => update(a => ({ ...a, dialer: { ...a.dialer, ...patch } }));
  const whose = dialer.clientDialer === true ? 'yes' : dialer.clientDialer === false ? 'no' : '';
  return <div>
    <PanelHead kicker="Dialer" title="Dials the calls" onClose={onClose} />
    <StatusControl value={dialer.status} onChange={status => set({ status })} />
    <SelectField label="Client’s dialer integration?" value={whose}
      options={[{ value: '', label: 'Not set' }, { value: 'yes', label: 'Yes: their dialer, details pushed via API' }, { value: 'no', label: 'No: we dial' }]}
      onChange={v => set({ clientDialer: v === 'yes' ? true : v === 'no' ? false : null })} />
    <SelectField label="Which way do the calls go?" value={dialer.direction ?? ''}
      options={[{ value: '', label: 'Not set' }, ...(Object.keys(DIRECTION_LABEL) as Direction[]).map(d => ({ value: d, label: DIRECTION_LABEL[d] }))]}
      onChange={v => set({ direction: (v || null) as Direction | null })} />
    <TextField label="Dialer / provider" value={dialer.provider} placeholder="e.g. Ozonetel" onChange={provider => set({ provider })} />
    <TextArea label="Notes" value={dialer.notes} placeholder="SIP headers, DIDs…" onChange={notes => set({ notes })} />
  </div>;
}

export function RecordingsPanel({ project, update, onClose }: { project: Project; update: Update; onClose: () => void }) {
  return <div>
    <PanelHead kicker="Speech analytics" title="Recordings from" onClose={onClose} />
    <StatusControl value={project.recordingStatus} onChange={recordingStatus => update(a => ({ ...a, recordingStatus }))} />
    <TextArea label="Where CDRs and recordings come from" value={project.recordingSource} placeholder="e.g. their dialer’s S3 bucket, SF, an SFTP drop…" onChange={recordingSource => update(a => ({ ...a, recordingSource }))} />
  </div>;
}

export function ChecklistPanel({ project, checklistId, update, onSelect, onClose }: {
  project: Project; checklistId: string; update: Update; onSelect: (s: Selection) => void; onClose: () => void;
}) {
  const checklist = project.checklists.find(c => c.id === checklistId);
  if (!checklist) return <div className="panel-empty"><div className="empty-title">That checklist is gone.</div></div>;
  const set = (patch: Partial<typeof checklist>) => update(a => ({ ...a, checklists: a.checklists.map(c => (c.id === checklist.id ? { ...c, ...patch } : c)) }));
  const processorsOf = (parameterId: string) => project.processors.filter(p => p.parameterId === parameterId);
  return <div>
    <PanelHead kicker="Speech-analytics checklist" title={checklist.name} onClose={onClose} />
    <TextField label="Name" value={checklist.name} autoFocus={checklist.name === 'New checklist'} onChange={name => set({ name })} />
    <TextField label="Template ID" mono value={checklist.templateId} placeholder="e.g. 1001" onChange={templateId => set({ templateId })} />
    <div className="section">
      <div className="eyebrow">Parameters</div>
      <p className="muted small">Add the parameters that have a pre or post processor; switch those on from the diagram.</p>
      <div className="param-edit-list">
        {checklist.parameters.map(q => <div key={q.id} className="param-edit">
          <input className="field" placeholder="Parameter name" value={q.name} onChange={e => update(a => setParameter(a, checklist.id, q.id, { name: e.target.value }))} />
          <input className="field mono narrow-field" placeholder="Audit ID" value={q.auditId} onChange={e => update(a => setParameter(a, checklist.id, q.id, { auditId: e.target.value }))} />
          <button className="button ghost icon" aria-label="Remove parameter" title="Removes the parameter and its processors" onClick={() => update(a => removeParameter(a, checklist.id, q.id))}><Trash2 size={13} /></button>
          {processorsOf(q.id).map(p => <button key={p.id} className="link small param-proc-link" onClick={() => onSelect({ kind: 'processor', id: p.id })}>{SLOTS[p.slot].label}{p.enabled ? '' : ' (off)'}</button>)}
        </div>)}
      </div>
      <button className="add-card mt" onClick={() => update(a => addParameter(a, checklist.id))}><Plus size={12} /> Parameter</button>
    </div>
    <TextArea label="Notes" value={checklist.notes} onChange={notes => set({ notes })} />
    <DeleteButton label="Delete checklist" body={`“${checklist.name}”, its ${checklist.parameters.length} parameter${checklist.parameters.length === 1 ? '' : 's'} and their processors will be removed.`}
      onConfirm={() => { update(a => ({ ...a, checklists: a.checklists.filter(c => c.id !== checklist.id), processors: a.processors.filter(p => p.checklistId !== checklist.id) })); onClose(); }} />
  </div>;
}

export function ProjectPanel({ project, update, onClose }: { project: Project; update: Update; onClose: () => void }) {
  const { deleteProject } = useStore();
  return <div>
    <PanelHead kicker="Project details" title={project.name} onClose={onClose} />
    <TextField label="Name" value={project.name} onChange={name => update(a => ({ ...a, name }))} />
    <span className="field-label mt">Products</span>
    <ProductPicker value={project.products} onChange={products => update(a => ({ ...a, products }))} />
    <TextArea label="Notes" value={project.notes} rows={4} onChange={notes => update(a => ({ ...a, notes }))} />
    <DeleteButton label="Delete project" body={`${project.name}, with its ${project.processors.length} processor${project.processors.length === 1 ? '' : 's'} and ${project.checklists.length} checklist${project.checklists.length === 1 ? '' : 's'}, will be removed. Export first if you might need it.`}
      onConfirm={() => { deleteProject(project.id); navigate({ screen: 'projects' }); }} />
  </div>;
}
