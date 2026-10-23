// New project (and "edit with questions"), asked one question at a time over the panning diagram.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CornerDownLeft, Pencil, Plus, Trash2, X } from 'lucide-react';
import { newProject, parameterProcessor, useStore } from '../store';
import { navigate } from '../router';
import { InfoTip } from '../components/InfoTip';
import { SLOTS, type Project, type SlotKey } from '../types';
import Backdrop from './Backdrop';
import {
  SECTION_ORDER, addChecklist, addParameter, addProcessorTo, disableSlot, enableSlot, removeChecklist, removeParameter, removeProcessor,
  setChecklist, setParameter, setProcessor, slotAnswer, slotProcessors, toggleParameterProcessor, visibleSteps, type Step,
} from './questions';

const YES_NO = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];

type Phase = 'asking' | 'review';

function isAnswered(step: Step, a: Project, saidNo: Set<string>): boolean {
  switch (step.kind) {
    case 'name': return !!a.name.trim();
    case 'choice': return step.get(a) !== undefined;
    case 'multi': return step.get(a).length > 0;
    case 'processor': case 'processors': return slotAnswer(a, step.slot, saidNo) !== undefined;
    case 'checklists': return a.checklists.length > 0 || saidNo.has('checklists');
    case 'parameters': return (a.checklists.find(c => c.id === step.checklistId)?.parameters.length ?? 0) > 0;
  }
}
const isRequired = (step: Step) => step.id === 'name' || step.id === 'products';

function summary(step: Step, a: Project, saidNo: Set<string>): string {
  const firstLine = (text: string) => text.split('\n')[0].slice(0, 80);
  switch (step.kind) {
    case 'name': return a.name || '—';
    case 'choice': {
      const v = step.get(a);
      if (v === undefined) return '—';
      const label = step.options.find(o => o.value === v)?.label ?? (v || 'Not sure');
      const text = step.text?.get(a).trim();
      return text ? `${label} · ${firstLine(text)}` : label;
    }
    case 'multi': {
      const v = step.get(a);
      if (!v.length) return '—';
      const names = step.list && v.includes(step.list.showFor) ? step.list.get(a).filter(n => n.trim()) : [];
      return step.options.filter(o => v.includes(o.value)).map(o => o.label ?? o.value).join(', ') + (names.length ? ` · ${names.join(', ')}` : '');
    }
    case 'processor': {
      const answer = slotAnswer(a, step.slot, saidNo);
      const p = slotProcessors(a, step.slot)[0];
      return answer === 'yes' ? `Yes${p?.description ? ` · ${firstLine(p.description)}` : ''}` : answer === 'no' ? 'No' : '—';
    }
    case 'processors': {
      const on = slotProcessors(a, step.slot).filter(p => p.enabled);
      return on.length ? on.map(p => p.name || 'Unnamed').join(', ') : slotAnswer(a, step.slot, saidNo) === 'no' ? 'None' : '—';
    }
    case 'checklists': return a.checklists.length ? a.checklists.map(c => c.name || 'Unnamed').join(', ') : saidNo.has('checklists') ? 'None' : '—';
    case 'parameters': {
      const c = a.checklists.find(c => c.id === step.checklistId);
      if (!c?.parameters.length) return '—';
      const count = (slot: 'audit_pre' | 'audit_post') => c.parameters.filter(q => parameterProcessor(a, slot, q.id)?.enabled).length;
      return `${c.parameters.length} parameter${c.parameters.length === 1 ? '' : 's'} · ${count('audit_pre')} pre · ${count('audit_post')} post`;
    }
  }
}

// Drop the empty rows people add and never fill in, so the saved project only holds real things.
function tidy(a: Project): Project {
  const blankMulti = (p: Project['processors'][number]) => SLOTS[p.slot].multi && !p.name.trim() && !p.description.trim();
  return {
    ...a,
    name: a.name.trim(),
    // Connectors only mean something while leads come in by API.
    // Scheduler details only mean something while a scheduler picks the recordings up.
    recordings: {
      ...a.recordings,
      ...(a.recordings.via === 'scheduler' ? { schedulerConfig: a.recordings.schedulerConfig.trim() } : { schedulerSource: null, schedulerConfig: '' }),
      // callback_url only applies to API ingestion, and enable_subcategory_callback only with a callback_url.
      ...(a.recordings.via === 'api' ? {} : { callbackUrl: null }),
      ...(a.recordings.via === 'api' && a.recordings.callbackUrl === true ? {} : { subcategoryCallback: null }),
    },
    leadIngestion: { ...a.leadIngestion, connectors: a.leadIngestion.methods.includes('api') ? a.leadIngestion.connectors.map(c => c.trim()).filter(Boolean) : [] },
    checklists: a.checklists
      .filter(c => c.name.trim() || c.templateId.trim() || c.parameters.length)
      .map(c => ({ ...c, name: c.name.trim() || 'Untitled checklist', parameters: c.parameters.filter(q => q.name.trim() || q.auditId.trim()) })),
    processors: a.processors.filter(p => !blankMulti(p)).map(p => ({ ...p, name: p.name.trim() || 'Unnamed processor' })),
  };
}

export default function IntakeFlow({ projectId }: { projectId?: string }) {
  const { file, saveProject } = useStore();
  const existing = projectId ? file.projects.find(a => a.id === projectId) : undefined;
  const editing = !!existing;
  const [project, setProject] = useState<Project>(() => (existing ? structuredClone(existing) : newProject('', [])));
  const [saidNo, setSaidNo] = useState<Set<string>>(() => new Set());
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>(editing ? 'review' : 'asking');
  const [noteOpen, setNoteOpen] = useState(false);
  const advanceTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(advanceTimer.current), []);

  const visible = useMemo(() => visibleSteps(project), [project]);
  const step = visible[Math.min(index, visible.length - 1)];
  const exitTo = () => navigate(editing ? { screen: 'project', projectId: project.id } : { screen: 'projects' });

  useEffect(() => { setNoteOpen(!!(step.note && step.note.get(project).trim())); }, [step.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (change: (a: Project) => Project) => setProject(change);
  const markNo = (key: string, no: boolean) => setSaidNo(prev => { const next = new Set(prev); if (no) next.add(key); else next.delete(key); return next; });

  const go = (delta: number) => {
    window.clearTimeout(advanceTimer.current);
    if (delta > 0 && index >= visible.length - 1) { setPhase('review'); return; }
    setIndex(i => Math.max(0, Math.min(visible.length - 1, i + delta)));
  };
  const advanceSoon = () => { window.clearTimeout(advanceTimer.current); advanceTimer.current = window.setTimeout(() => go(1), 320); };

  // Picking an option. Single choices move on by themselves unless a note is being written;
  // a "yes" to a processor stays put so its "what does it do?" can be filled in.
  const choose = (value: string) => {
    if (step.kind === 'choice') { update(a => step.set(a, value)); if (!noteOpen && !step.text) advanceSoon(); }
    else if (step.kind === 'multi') { const cur = step.get(project); update(a => step.set(a, cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value])); }
    else if (step.kind === 'processor') {
      if (value === 'yes') { update(a => enableSlot(a, step.slot)); markNo(step.slot, false); }
      else { update(a => disableSlot(a, step.slot)); markNo(step.slot, true); advanceSoon(); }
    } else if (step.kind === 'processors') {
      if (value === 'yes') { update(a => { const on = slotProcessors(a, step.slot); return on.length ? { ...a, processors: a.processors.map(p => (p.slot === step.slot ? { ...p, enabled: true } : p)) } : addProcessorTo(a, step.slot); }); markNo(step.slot, false); }
      else { update(a => ({ ...a, processors: a.processors.filter(p => p.slot !== step.slot || p.name.trim() || p.description.trim()).map(p => (p.slot === step.slot ? { ...p, enabled: false } : p)) })); markNo(step.slot, true); advanceSoon(); }
    } else if (step.kind === 'checklists') {
      if (value === 'yes') { update(a => (a.checklists.length ? a : addChecklist(a))); markNo('checklists', false); }
      else { update(a => ({ ...a, checklists: a.checklists.filter(c => c.name.trim() || c.templateId.trim() || c.parameters.length) })); markNo('checklists', true); advanceSoon(); }
    }
  };

  const options = step.kind === 'choice' || step.kind === 'multi' ? step.options
    : step.kind === 'processor' || step.kind === 'processors' || step.kind === 'checklists' ? YES_NO : [];
  const selected = (value: string) => {
    if (step.kind === 'choice') return step.get(project) === value;
    if (step.kind === 'multi') return step.get(project).includes(value);
    if (step.kind === 'processor' || step.kind === 'processors') return slotAnswer(project, step.slot, saidNo) === value;
    if (step.kind === 'checklists') return value === 'yes' ? project.checklists.length > 0 : saidNo.has('checklists') && !project.checklists.length;
    return false;
  };

  // Keyboard: Enter continues, 1–9 picks an option. Nothing fires while typing in a text box.
  useEffect(() => {
    if (phase !== 'asking') return;
    const onKey = (event: KeyboardEvent) => {
      const tag = event.target instanceof HTMLElement ? event.target.tagName : '';
      if (tag === 'TEXTAREA') return;
      if (event.key === 'Enter' && !event.shiftKey) {
        if (!isRequired(step) || isAnswered(step, project, saidNo)) { event.preventDefault(); go(1); }
        return;
      }
      if (tag !== 'INPUT' && /^[1-9]$/.test(event.key)) {
        const option = options[Number(event.key) - 1];
        if (option) choose(option.value);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // After every hook, so the hook order never changes between renders.
  if (projectId && !existing) {
    return <div className="intake"><div className="intake-missing"><div className="empty-title">That project isn’t in this file.</div><a className="button" href="#/">Back to projects</a></div></div>;
  }

  const answered = isAnswered(step, project, saidNo);
  const visibleSections = SECTION_ORDER.filter(s => visible.some(v => v.section === s));
  const missingRequired = visible.some(s => isRequired(s) && !isAnswered(s, project, saidNo));

  const save = () => {
    const tidied = tidy(project);
    saveProject(tidied);
    navigate({ screen: 'project', projectId: tidied.id });
  };

  return <div className="intake">
    <Backdrop project={project} focus={phase === 'asking' ? step.focus : 'all'} saidNo={saidNo} />

    <header className="intake-header">
      <div className="intake-brand"><span className="wordmark">FDE Canvas</span><span className="eyebrow">{editing ? `Edit ${existing?.name}` : 'New project'}</span></div>
      <nav className="intake-sections">
        {visibleSections.map(s => {
          const done = visible.filter(v => v.section === s).every(v => isAnswered(v, project, saidNo));
          return <span key={s} className={`intake-section ${phase === 'asking' && step.section === s ? 'current' : ''} ${done ? 'done' : ''}`}>{s}</span>;
        })}
      </nav>
      <button className="button ghost" onClick={exitTo}><X size={14} /> {editing ? 'Cancel' : 'Exit'}</button>
    </header>
    <div className="intake-progress"><div className="intake-progress-fill" style={{ width: `${phase === 'review' ? 100 : Math.max(3, (index / visible.length) * 100)}%` }} /></div>

    <main className="intake-main">
      {phase === 'asking' && <section className="intake-question" key={step.id}>
        <div className="intake-chapter"><span className="intake-chapter-dot" />{step.section}</div>
        <h1 className="intake-title">{step.title}{step.info && <span className="intake-title-info"><InfoTip text={step.info} size={15} /></span>}</h1>
        {step.hint && <p className="intake-hint">{step.hint}</p>}

        <div className="intake-body">
          {step.kind === 'name' && <input autoFocus className="intake-input" placeholder="e.g. Acme Lending" value={project.name} onChange={e => update(a => ({ ...a, name: e.target.value }))} />}

          {options.length > 0 && <div className={`intake-options ${options.length > 5 ? 'two' : ''}`}>
            {options.map((option, i) => <button key={option.value} type="button" className={`intake-option ${selected(option.value) ? 'selected' : ''}`} onClick={() => choose(option.value)}>
              <span className="intake-key">{selected(option.value) ? <Check size={12} strokeWidth={3} /> : i + 1}</span>
              <span className="intake-option-text"><span className="intake-option-label">{option.label ?? option.value}</span>{'hint' in option && option.hint && <span className="intake-option-hint">{option.hint}</span>}</span>
              {'info' in option && <InfoTip text={option.info} />}
            </button>)}
          </div>}

          {step.kind === 'processor' && slotAnswer(project, step.slot, saidNo) === 'yes' && (() => {
            const p = slotProcessors(project, step.slot)[0];
            return p && <div className="intake-fields">
              <label className="intake-field"><span className="field-label">What does it do?</span>
                <textarea autoFocus className="field" rows={4} placeholder="Reads… calls… writes… what happens when it fails" value={p.description} onChange={e => update(a => setProcessor(a, p.id, { description: e.target.value }))} /></label>
              <label className="intake-field"><span className="field-label">Name (optional)</span>
                <input className="field" value={p.name} onChange={e => update(a => setProcessor(a, p.id, { name: e.target.value }))} /></label>
              {step.extra && <label className="intake-field"><span className="field-label">{step.extra.label}</span>
                <input className="field" placeholder={step.extra.placeholder} value={step.extra.get(project)} onChange={e => update(a => step.extra!.set(a, e.target.value))} /></label>}
            </div>;
          })()}

          {step.kind === 'choice' && step.text && step.get(project) !== undefined && <div className="intake-fields">
            <label className="intake-field"><span className="field-label">{step.text.label}</span>
              <textarea autoFocus={!step.text.get(project)} className="field" rows={4} placeholder={step.text.placeholder} value={step.text.get(project)} onChange={e => update(a => step.text!.set(a, e.target.value))} /></label>
          </div>}

          {step.kind === 'multi' && step.list && step.get(project).includes(step.list.showFor) && <NameRows list={step.list} project={project} update={update} />}

          {step.kind === 'processors' && slotAnswer(project, step.slot, saidNo) === 'yes' && <ProcessorRows slot={step.slot} project={project} update={update} />}

          {step.kind === 'checklists' && project.checklists.length > 0 && <div className="intake-rows">
            <p className="intake-hint intake-subhint">Add each checklist with its template ID. Their parameters come next.</p>
            {project.checklists.map((c, i) => <div key={c.id} className="intake-row">
              <input autoFocus={i === project.checklists.length - 1 && !c.name} className="field" placeholder="Checklist name, e.g. Consumer Payments - Support" value={c.name} onChange={e => update(a => setChecklist(a, c.id, { name: e.target.value }))} />
              <input className="field mono narrow-field" placeholder="Template ID" value={c.templateId} onChange={e => update(a => setChecklist(a, c.id, { templateId: e.target.value }))} />
              <button className="button ghost icon" aria-label="Remove checklist" onClick={() => update(a => removeChecklist(a, c.id))}><Trash2 size={13} /></button>
            </div>)}
            <button className="add-card" onClick={() => update(addChecklist)}><Plus size={12} /> Another checklist</button>
          </div>}

          {step.kind === 'parameters' && <ParameterRows checklistId={step.checklistId} project={project} update={update} />}

          {step.note && <div className="intake-note-wrap">
            {noteOpen
              ? <textarea autoFocus={!step.note.get(project)} className="field" rows={3} placeholder={step.note.placeholder} value={step.note.get(project)} onChange={e => update(a => step.note!.set(a, e.target.value))} />
              : <button type="button" className="intake-note-toggle" onClick={() => setNoteOpen(true)}><Plus size={12} /> Add a note</button>}
          </div>}
        </div>

        <div className="intake-actions">
          {index > 0 && <button className="button ghost" onClick={() => go(-1)}><ArrowLeft size={14} /> Back</button>}
          <button className="button primary" disabled={isRequired(step) && !answered} onClick={() => go(1)}>{answered || step.kind === 'parameters' ? 'Continue' : 'Skip'} <ArrowRight size={14} /></button>
          <span className="intake-kbd">{options.length && !answered ? `Press 1–${Math.min(9, options.length)} to choose` : <><CornerDownLeft size={11} /> Enter</>}</span>
          {editing && <button className="button ghost push-right" onClick={() => setPhase('review')}>Back to review</button>}
        </div>
      </section>}

      {phase === 'review' && <section className="intake-question">
        <div className="intake-chapter"><span className="intake-chapter-dot" />Review</div>
        <h1 className="intake-title">{editing ? 'Change anything that’s moved on.' : 'Here’s the project. Look right?'}</h1>
        <p className="intake-hint">Click any answer to change it.</p>
        <div className="intake-review">
          {visibleSections.map(s => <div key={s}>
            <div className="intake-review-section">{s}</div>
            {visible.filter(v => v.section === s).map(v => <button key={v.id} type="button" className="intake-review-row" onClick={() => { setIndex(visible.indexOf(v)); setPhase('asking'); }}>
              <span className="muted">{v.title}</span>
              <span className={`intake-review-answer ${isRequired(v) && !isAnswered(v, project, saidNo) ? 'missing' : ''}`}>{summary(v, project, saidNo)}<Pencil size={11} className="intake-review-edit" /></span>
            </button>)}
          </div>)}
        </div>
        <div className="intake-actions">
          {!editing && <button className="button ghost" onClick={() => setPhase('asking')}><ArrowLeft size={14} /> Back</button>}
          <button className="button primary" disabled={missingRequired} onClick={save}>{editing ? 'Save changes' : 'Create project'} <ArrowRight size={14} /></button>
          {missingRequired && <span className="muted small">The project needs a name and a product.</span>}
        </div>
      </section>}
    </main>
  </div>;
}

type NameList = NonNullable<Extract<Step, { kind: 'multi' }>['list']>;

function NameRows({ list, project, update }: { list: NameList; project: Project; update: (change: (a: Project) => Project) => void }) {
  // Always show at least one box to type into.
  const names = list.get(project).length ? list.get(project) : [''];
  const setAt = (i: number, value: string) => update(a => list.set(a, names.map((n, j) => (j === i ? value : n))));
  return <div className="intake-rows">
    <p className="intake-hint intake-subhint">{list.label}</p>
    {names.map((name, i) => <div key={i} className="intake-row">
      <input className="field" placeholder={list.placeholder} value={name} onChange={e => setAt(i, e.target.value)} />
      {names.length > 1 && <button className="button ghost icon" aria-label="Remove" onClick={() => update(a => list.set(a, names.filter((_, j) => j !== i)))}><Trash2 size={13} /></button>}
    </div>)}
    <button className="add-card" onClick={() => update(a => list.set(a, [...names, '']))}><Plus size={12} /> {list.addLabel}</button>
  </div>;
}

function ProcessorRows({ slot, project, update }: { slot: SlotKey; project: Project; update: (change: (a: Project) => Project) => void }) {
  const list = slotProcessors(project, slot);
  return <div className="intake-rows">
    {list.map((p, i) => <div key={p.id} className="intake-proc">
      <div className="intake-row">
        <input autoFocus={i === list.length - 1 && !p.name} className="field" placeholder="Processor name, e.g. Disposition tool" value={p.name} onChange={e => update(a => setProcessor(a, p.id, { name: e.target.value }))} />
        <button className="button ghost icon" aria-label="Remove processor" onClick={() => update(a => removeProcessor(a, p.id))}><Trash2 size={13} /></button>
      </div>
      <textarea className="field" rows={2} placeholder="What does it do?" value={p.description} onChange={e => update(a => setProcessor(a, p.id, { description: e.target.value }))} />
    </div>)}
    <button className="add-card" onClick={() => update(a => addProcessorTo(a, slot))}><Plus size={12} /> Another processor</button>
  </div>;
}

function ParameterRows({ checklistId, project, update }: { checklistId: string; project: Project; update: (change: (a: Project) => Project) => void }) {
  const checklist = project.checklists.find(c => c.id === checklistId);
  if (!checklist) return null;
  return <div className="intake-rows">
    {checklist.parameters.map((q, i) => <div key={q.id} className="intake-proc">
      <div className="intake-row">
        <input autoFocus={i === checklist.parameters.length - 1 && !q.name} className="field" placeholder="Parameter, e.g. Platinum SOP adherence" value={q.name} onChange={e => update(a => setParameter(a, checklistId, q.id, { name: e.target.value }))} />
        <input className="field mono narrow-field" placeholder="Audit param ID" value={q.auditId} onChange={e => update(a => setParameter(a, checklistId, q.id, { auditId: e.target.value }))} />
        <button className="button ghost icon" aria-label="Remove parameter" onClick={() => update(a => removeParameter(a, checklistId, q.id))}><Trash2 size={13} /></button>
      </div>
      {(['audit_pre', 'audit_post'] as const).map(slot => {
        const p = parameterProcessor(project, slot, q.id);
        const on = !!p?.enabled;
        return <div key={slot} className="intake-param-proc">
          <button type="button" className={`pick ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => update(a => toggleParameterProcessor(a, checklistId, q.id, slot, !on))}>
            <span className="pick-box">{on ? '✓' : ''}</span>{slot === 'audit_pre' ? 'Pre processor' : 'Post processor'}
          </button>
          {on && p && <textarea className="field" rows={2} placeholder="What does it do?" value={p.description} onChange={e => update(a => setProcessor(a, p.id, { description: e.target.value }))} />}
        </div>;
      })}
    </div>)}
    <button className="add-card" onClick={() => update(a => addParameter(a, checklistId))}><Plus size={12} /> {checklist.parameters.length ? 'Another parameter' : 'Add a parameter'}</button>
  </div>;
}
