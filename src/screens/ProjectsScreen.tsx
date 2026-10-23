import { useMemo, useState } from 'react';
import { ArrowRight, PhoneForwarded, Plus, Search } from 'lucide-react';
import { useStore } from '../store';
import { hrefFor } from '../router';
import { DIRECTION_LABEL, LEAD_METHODS, PRODUCTS, type Project } from '../types';

function ProjectRow({ project }: { project: Project }) {
  const { dialer } = project;
  const enabled = project.processors.filter(p => p.enabled);
  const closed = enabled.filter(p => p.status === 'closed').length;
  const open = enabled.length - closed;
  const disabled = project.processors.length - enabled.length;
  const transfer = project.processors.some(p => p.slot === 'transfer' && p.enabled);
  return <a href={hrefFor({ screen: 'project', projectId: project.id })} className="project-row">
    <div className="min-w-0">
      <div className="row-title">{project.name}</div>
      <div className="chips">
        {PRODUCTS.filter(p => project.products.includes(p.key)).map(p => <span key={p.key} className="chip">{p.label}</span>)}
        {dialer.direction && <span className="chip outline">{DIRECTION_LABEL[dialer.direction]}</span>}
        {dialer.clientDialer !== null && <span className="chip outline">{dialer.clientDialer ? 'Client’s dialer' : 'Our dialer'}{dialer.provider ? ` · ${dialer.provider}` : ''}</span>}
        {project.leadIngestion.methods.length > 0 && <span className="chip outline">Leads: {LEAD_METHODS.filter(m => project.leadIngestion.methods.includes(m.key))
          .map(m => (m.key === 'api' && project.leadIngestion.connectors.some(c => c.trim()) ? `API (${project.leadIngestion.connectors.filter(c => c.trim()).join(', ')})` : m.label)).join(', ')}</span>}
        {transfer && <span className="chip outline"><PhoneForwarded size={11} /> Transfer</span>}
      </div>
    </div>
    <div className="stage-counts">
      {closed > 0 && <span className="chip status-chip closed" title="Enabled and closed">{closed} closed</span>}
      {open > 0 && <span className="chip status-chip open" title="Enabled and still open">{open} open</span>}
      {disabled > 0 && <span className="chip status-chip disabled" title="Disabled: don’t apply to this project">{disabled} disabled</span>}
      {project.processors.length === 0 && <span className="row-meta">No processors</span>}
    </div>
    <ArrowRight size={15} className="muted" />
  </a>;
}

export default function ProjectsScreen() {
  const { file } = useStore();
  const [query, setQuery] = useState('');
  const projects = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...file.projects].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return sorted;
    // Search reaches into processors and checklists too: "which project has the SOP processor" should find it.
    return sorted.filter(a => [
      a.name, a.dialer.provider, ...a.leadIngestion.connectors,
      ...a.processors.flatMap(p => [p.name, p.description]),
      ...a.checklists.flatMap(c => [c.name, c.templateId, ...c.parameters.flatMap(q => [q.name, q.auditId])]),
    ].some(text => text.toLowerCase().includes(q)));
  }, [file.projects, query]);

  return <main className="page narrow">
    <div className="page-head">
      <div><div className="eyebrow">FDE Canvas</div><h1 className="page-title">Projects</h1></div>
      <a className="button primary" href={hrefFor({ screen: 'new' })}><Plus size={14} /> New project</a>
    </div>

    {file.projects.length > 0 && <label className="search">
      <Search size={14} className="muted" />
      <input placeholder="Search projects, processors, checklists, parameters…" value={query} onChange={e => setQuery(e.target.value)} />
    </label>}

    {file.projects.length === 0
      ? <div className="empty"><div className="empty-title">No projects yet.</div><p className="muted">Answer a few questions and the project’s diagram fills itself in, or import an FDE Canvas file.</p><a className="button primary" href={hrefFor({ screen: 'new' })}><Plus size={14} /> New project</a></div>
      : projects.length === 0
        ? <div className="empty"><div className="empty-title">Nothing matches “{query}”.</div></div>
        : <div className="surface list">{projects.map(project => <ProjectRow key={project.id} project={project} />)}</div>}
  </main>;
}
