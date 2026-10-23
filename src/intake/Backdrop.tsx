// The whole architecture drawn behind the questions. The camera pans to the component the current question
// is about and lights it up; components fill in green or red as they're answered.
import { useEffect, useRef, useState } from 'react';
import { recordingsAutomatic, type Processor, type Project } from '../types';
import { slotProcessors, type NodeId } from './questions';

// `path`: voice bot nodes that only exist on the outbound path or the inbound path.
type Box = { x: number; y: number; w: number; h: number; label: string; section: 'voice' | 'analytics' | 'post'; path?: 'out' | 'in' };

const H = 60;
const NODES: Record<NodeId, Box> = {
  lead:               { x: 0,   y: 0,   w: 200, h: H, label: 'Lead ingestion', section: 'voice', path: 'out' },
  pre_call:           { x: 0,   y: 150, w: 200, h: H, label: 'Pre call processor', section: 'voice', path: 'out' },
  dialer:             { x: 280, y: 0,   w: 280, h: H, label: 'Dialer: dials the calls', section: 'voice', path: 'out' },
  no_answer:          { x: 270, y: 150, w: 140, h: H, label: 'No answer processor', section: 'voice', path: 'out' },
  pre_call_connected: { x: 425, y: 150, w: 150, h: H, label: 'Pre call connected', section: 'voice', path: 'out' },
  caller:             { x: 0,   y: 300, w: 200, h: H, label: 'Customer calls in', section: 'voice', path: 'in' },
  inbound_pre_call:   { x: 280, y: 300, w: 280, h: H, label: 'Inbound pre call processor', section: 'voice', path: 'in' },
  during_call:        { x: 660, y: 40,  w: 210, h: H, label: 'During call processors', section: 'voice' },
  transfer:           { x: 900, y: 150, w: 200, h: H, label: 'Transfer call processor', section: 'voice' },
  recordings:         { x: 0,   y: 600, w: 180, h: H, label: 'Recording ingestion', section: 'analytics' },
  cdr:                { x: 240, y: 600, w: 210, h: H, label: 'CDR → recording extraction', section: 'analytics' },
  resource_pre:       { x: 240, y: 750, w: 210, h: H, label: 'Resource listen pre processor (pre-analytics)', section: 'analytics' },
  checklists:         { x: 520, y: 600, w: 300, h: H, label: 'Checklist processing', section: 'analytics' },
  audit_pre:          { x: 520, y: 750, w: 140, h: H, label: 'Parameter pre', section: 'analytics' },
  audit_post:         { x: 680, y: 750, w: 140, h: H, label: 'Parameter post', section: 'analytics' },
  resource_post:      { x: 920, y: 600, w: 200, h: H, label: 'Resource post processor', section: 'post' },
};

// Frames and labels drawn around groups of nodes.
const FRAMES = [
  { x: 640, y: -30, w: 480, h: 420, label: 'During call' },
];
const LABELS = [
  { x: 0, y: -60, text: 'Voice bot' },
  { x: 0, y: 260, text: 'Inbound' },
  { x: 0, y: 540, text: 'Speech analytics' },
  { x: 920, y: 540, text: 'Post call' },
];
const DECISIONS = [{ x: 900, y: 52, text: 'Transfer?' }];

const mid = (id: NodeId, side: 'r' | 'l' | 'b' | 't') => {
  const n = NODES[id];
  return side === 'r' ? [n.x + n.w, n.y + n.h / 2] : side === 'l' ? [n.x, n.y + n.h / 2] : side === 'b' ? [n.x + n.w / 2, n.y + n.h] : [n.x + n.w / 2, n.y];
};
// `path` lines fade with their path's nodes.
const LINES: Array<[number[], number[], ('out' | 'in')?]> = [
  [mid('lead', 'r'), mid('dialer', 'l'), 'out'],
  [mid('lead', 'b'), mid('pre_call', 't'), 'out'],
  [mid('dialer', 'b').map((v, i) => (i === 0 ? NODES.no_answer.x + NODES.no_answer.w / 2 : v)), mid('no_answer', 't'), 'out'],
  [mid('dialer', 'b').map((v, i) => (i === 0 ? NODES.pre_call_connected.x + NODES.pre_call_connected.w / 2 : v)), mid('pre_call_connected', 't'), 'out'],
  [mid('dialer', 'r'), [640, mid('dialer', 'r')[1]], 'out'],
  [mid('caller', 'r'), mid('inbound_pre_call', 'l'), 'in'],
  [mid('inbound_pre_call', 'r'), [640, mid('inbound_pre_call', 'r')[1]], 'in'],
  [[1000, 82], mid('transfer', 't')],
  [mid('recordings', 'r'), mid('cdr', 'l')],
  [mid('cdr', 'b'), mid('resource_pre', 't')],
  [mid('cdr', 'r'), mid('checklists', 'l')],
  [[NODES.audit_pre.x + NODES.audit_pre.w / 2, NODES.checklists.y + H], mid('audit_pre', 't')],
  [[NODES.audit_post.x + NODES.audit_post.w / 2, NODES.checklists.y + H], mid('audit_post', 't')],
  [mid('checklists', 'r'), mid('resource_post', 'l')],
];

const WORLD = { x: -20, y: -80, w: 1160, h: 910 };

// Disabled (said no) is grey; enabled things are red while open and green once closed; unanswered is neutral.
type State = 'closed' | 'open' | 'disabled' | 'unset';

const ofProcessors = (list: Processor[]): State | null => {
  const enabled = list.filter(p => p.enabled);
  if (!enabled.length) return null;
  return enabled.every(p => p.status === 'closed') ? 'closed' : 'open';
};

function stateOf(id: NodeId, a: Project, saidNo: Set<string>): State {
  switch (id) {
    case 'lead': return a.leadIngestion.methods.length ? a.leadIngestion.status : 'unset';
    case 'caller': return a.dialer.direction === 'inbound' ? a.dialer.status : 'unset';
    case 'dialer': return a.dialer.clientDialer !== null || a.dialer.direction ? a.dialer.status : 'unset';
    // With both products, recordings come from the voice bot's calls through the internal queue: nothing to track.
    case 'recordings': case 'cdr': return recordingsAutomatic(a) ? 'unset' : a.recordings.format || a.recordings.via ? a.recordings.status : 'unset';
    case 'checklists': return a.checklists.length ? ofProcessors(a.processors.filter(p => p.checklistId)) ?? 'open' : 'unset';
    case 'audit_pre': case 'audit_post': return ofProcessors(slotProcessors(a, id)) ?? 'unset';
    default: {
      const list = slotProcessors(a, id);
      return ofProcessors(list) ?? (list.length > 0 || saidNo.has(id) ? 'disabled' : 'unset');
    }
  }
}

export default function Backdrop({ project, focus, saidNo }: { project: Project; focus: NodeId[] | 'all' | null; saidNo: Set<string> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A question can be about nodes on both paths (e.g. the provider); only the path in use is lit and framed.
  // Until the direction is picked, both paths show.
  const direction = project.dialer.direction;
  const pathOff = (path?: 'out' | 'in') => (path === 'out' && direction === 'inbound') || (path === 'in' && direction === 'outbound');
  if (Array.isArray(focus) && focus.some(id => !pathOff(NODES[id].path))) focus = focus.filter(id => !pathOff(NODES[id].path));
  const lit = new Set(focus === 'all' || !focus ? [] : focus);
  const box = focus === 'all' || !focus || focus.length === 0
    ? WORLD
    : (() => {
        const boxes = focus.map(id => NODES[id]);
        const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
        return { x, y, w: Math.max(...boxes.map(b => b.x + b.w)) - x, h: Math.max(...boxes.map(b => b.y + b.h)) - y };
      })();
  // The question sits in the lower half, so the camera frames the band above it.
  const band = { w: size.w * 0.92, h: size.h * 0.34 };
  const scale = focus === 'all' || !focus ? Math.min(1, band.w / box.w, band.h / box.h) : Math.min(1.15, band.w / (box.w + 200), band.h / (box.h + 120));
  const tx = size.w / 2 - (box.x + box.w / 2) * scale;
  const ty = size.h * 0.22 - (box.y + box.h / 2) * scale;

  const products = project.products;
  const inactive = (section: Box['section'], path?: 'out' | 'in') =>
    (section === 'voice' && !products.includes('voicebot')) || (section === 'analytics' && !products.includes('speech_analytics')) || pathOff(path);

  return <div className="backdrop" ref={ref} aria-hidden="true">
    <div className="backdrop-world" style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}>
      <svg className="backdrop-lines" width={WORLD.w} height={WORLD.h} viewBox={`${WORLD.x} ${WORLD.y} ${WORLD.w} ${WORLD.h}`} style={{ left: WORLD.x, top: WORLD.y }}>
        <defs><marker id="bd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>
        {LINES.map(([a, b, path], i) => <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} markerEnd="url(#bd-arrow)" className={inactive(path ? 'voice' : 'post', path) ? 'inactive' : ''} />)}
      </svg>
      {FRAMES.map(f => <div key={f.label} className={`backdrop-frame ${inactive('voice') ? 'inactive' : ''}`} style={{ left: f.x, top: f.y, width: f.w, height: f.h }}><span>{f.label}</span></div>)}
      {LABELS.map(l => <div key={l.text} className={`backdrop-label ${l.text === 'Inbound' && inactive('voice', 'in') ? 'inactive' : ''}`} style={{ left: l.x, top: l.y }}>{l.text}</div>)}
      {DECISIONS.map(d => <div key={d.text} className="backdrop-decision" style={{ left: d.x, top: d.y }}>{d.text}</div>)}
      {(Object.keys(NODES) as NodeId[]).map(id => {
        const n = NODES[id];
        return <div key={id} className={`backdrop-node state-${stateOf(id, project, saidNo)} ${lit.has(id) ? 'lit' : ''} ${inactive(n.section, n.path) ? 'inactive' : ''}`}
          style={{ left: n.x, top: n.y, width: n.w, height: n.h }}>{n.label}</div>;
      })}
    </div>
  </div>;
}
