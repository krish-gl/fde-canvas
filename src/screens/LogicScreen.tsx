// "How it works": every path through the new-project questions, drawn as a flow. Branches split where an answer
// changes what's asked next and merge again once the remaining questions are the same.
// The layout is by hand; option labels come from the questions themselves. When the questions change, update this
// diagram and docs/question-logic.md together.
import { steps } from '../intake/questions';

type Kind = 'question' | 'pick' | 'route' | 'end';
type Section = 'Basics' | 'Voice bot' | 'Speech analytics' | 'Post call';
type Node = { col: number; row: number; kind: Kind; section?: Section; title: string; options?: string[]; sub?: string; w?: number };

const COLS = [140, 400, 680, 960];
const ROW = 110;
const SIZE: Record<Kind, { w: number; h: number }> = {
  question: { w: 244, h: 80 }, pick: { w: 244, h: 80 }, route: { w: 176, h: 38 }, end: { w: 244, h: 44 },
};
const WORLD = { w: 1100, h: 17 * ROW + 100 };

const optionsOf = (id: string) => {
  const step = steps.find(s => s.id === id);
  return step && 'options' in step ? step.options.map(o => o.label ?? o.value) : [];
};
const YES_NO = ['Yes', 'No'];

const NODES = {
  name:          { col: 2, row: 0,  kind: 'question', section: 'Basics', title: 'Which project is this?', sub: 'Required' },
  products:      { col: 2, row: 1,  kind: 'question', section: 'Basics', title: 'What’s live on this project?', options: optionsOf('products'), w: 290 },

  direction:     { col: 1, row: 2,  kind: 'question', section: 'Voice bot', title: 'Which way do the calls go?', options: optionsOf('direction') },
  lead:          { col: 0, row: 3,  kind: 'pick',     section: 'Voice bot', title: 'How do leads reach us?', options: optionsOf('lead') },
  routeApi:      { col: 0, row: 4,  kind: 'route',    title: 'API picked?' },
  connectors:    { col: 1, row: 4,  kind: 'question', section: 'Voice bot', title: 'Which connectors send them?', sub: 'Any number of names' },
  preCall:       { col: 0, row: 5,  kind: 'question', section: 'Voice bot', title: 'Pre call processor?', options: YES_NO },
  dialer:        { col: 0, row: 6,  kind: 'question', section: 'Voice bot', title: 'Whose dialer dials the calls?', options: ['Client’s', 'Ours', 'Not sure'] },
  providerOut:   { col: 0, row: 7,  kind: 'question', section: 'Voice bot', title: 'Dialer / telephony provider?', sub: optionsOf('provider').join(' · ') },
  providerIn:    { col: 2, row: 7,  kind: 'question', section: 'Voice bot', title: 'Dialer / telephony provider?', sub: optionsOf('provider').join(' · ') },
  noAnswer:      { col: 0, row: 8,  kind: 'question', section: 'Voice bot', title: 'No answer call processor?', options: YES_NO },
  connected:     { col: 0, row: 9,  kind: 'question', section: 'Voice bot', title: 'Pre call connected processor?', options: YES_NO },
  routeDir:      { col: 0, row: 10, kind: 'route',    title: 'Direction?' },
  inboundPre:    { col: 2, row: 10, kind: 'question', section: 'Voice bot', title: 'Inbound pre call processor?', options: YES_NO },
  during:        { col: 1, row: 11, kind: 'question', section: 'Voice bot', title: 'Anything during the call?', sub: 'Yes: list each processor · No' },
  transfer:      { col: 1, row: 12, kind: 'question', section: 'Voice bot', title: 'Is the call ever transferred?', sub: 'Yes: what it transfers to · No' },
  routeProducts: { col: 1, row: 13, kind: 'route',    title: 'Speech analytics too?' },

  recordings:    { col: 3, row: 2,  kind: 'question', section: 'Speech analytics', title: 'Where do recordings come from?', sub: optionsOf('recordings').join(' · ') },
  resourcePre:   { col: 3, row: 13, kind: 'question', section: 'Speech analytics', title: 'Resource listen pre processor (pre-analytics processor)?', options: YES_NO },
  checklists:    { col: 3, row: 14, kind: 'question', section: 'Speech analytics', title: 'Any checklists mapped?', options: YES_NO },
  parameters:    { col: 3, row: 15, kind: 'question', section: 'Speech analytics', title: 'Parameters, one question per checklist', sub: 'Each parameter: pre / post processor' },

  resourcePost:  { col: 2, row: 16, kind: 'question', section: 'Post call', title: 'Resource post processor?', options: YES_NO },
  review:        { col: 2, row: 17, kind: 'end',      title: 'Review, then save' },
} satisfies Record<string, Node>;
type Id = keyof typeof NODES;

type Box = { x: number; y: number; w: number; h: number; cx: number; cy: number };
function boxOf(id: Id): Box {
  const n: Node = NODES[id];
  const { h } = SIZE[n.kind];
  const w = n.w ?? SIZE[n.kind].w;
  const cx = COLS[n.col];
  // Every node sits centred in its row's band, so nodes on one row share a centre line.
  const cy = n.row * ROW + 40 + 20;
  return { x: cx - w / 2, y: cy - h / 2, w, h, cx, cy };
}

// How an edge leaves one node and reaches the next:
//   down       bottom → top (a dog-leg through the gap between rows when the columns differ)
//   across     side → facing side of a node on the same row
//   sideDown   side → along the row to the target's column → down into its top
//   downSide   bottom → down to the target's centre line → into its facing side
type Route = 'down' | 'across' | 'sideDown' | 'downSide';
type Edge = { from: Id; to: Id; route: Route; label?: string };

const EDGES: Edge[] = [
  { from: 'name', to: 'products', route: 'down' },
  { from: 'products', to: 'direction', route: 'sideDown', label: 'Voice bot · Both' },
  { from: 'products', to: 'recordings', route: 'sideDown', label: 'Speech analytics' },

  { from: 'direction', to: 'lead', route: 'sideDown', label: 'Outbound · Both' },
  { from: 'direction', to: 'providerIn', route: 'sideDown', label: 'SIP inbound' },
  { from: 'lead', to: 'routeApi', route: 'down' },
  { from: 'routeApi', to: 'connectors', route: 'across', label: 'Yes' },
  { from: 'routeApi', to: 'preCall', route: 'down', label: 'No' },
  { from: 'connectors', to: 'preCall', route: 'downSide' },
  { from: 'preCall', to: 'dialer', route: 'down' },
  { from: 'dialer', to: 'providerOut', route: 'down' },
  { from: 'providerOut', to: 'noAnswer', route: 'down' },
  { from: 'noAnswer', to: 'connected', route: 'down' },
  { from: 'connected', to: 'routeDir', route: 'down' },
  { from: 'routeDir', to: 'inboundPre', route: 'across', label: 'Both' },
  { from: 'providerIn', to: 'inboundPre', route: 'down' },
  { from: 'routeDir', to: 'during', route: 'downSide', label: 'Outbound' },
  { from: 'inboundPre', to: 'during', route: 'downSide' },
  { from: 'during', to: 'transfer', route: 'down' },
  { from: 'transfer', to: 'routeProducts', route: 'down' },
  { from: 'routeProducts', to: 'resourcePre', route: 'across', label: 'Yes: recordings arrive via the internal queue' },
  { from: 'routeProducts', to: 'resourcePost', route: 'downSide', label: 'No' },

  { from: 'recordings', to: 'resourcePre', route: 'down' },
  { from: 'resourcePre', to: 'checklists', route: 'down' },
  { from: 'checklists', to: 'parameters', route: 'down', label: 'Yes' },
  { from: 'checklists', to: 'resourcePost', route: 'sideDown', label: 'No' },
  { from: 'parameters', to: 'resourcePost', route: 'downSide' },

  { from: 'resourcePost', to: 'review', route: 'down' },
];

type Point = [number, number];
function pointsOf({ from, to, route }: Edge): Point[] {
  const a = boxOf(from), b = boxOf(to);
  const toRight = b.cx > a.cx;
  switch (route) {
    case 'down': {
      if (a.cx === b.cx) return [[a.cx, a.y + a.h], [b.cx, b.y]];
      const midY = (a.y + a.h + b.y) / 2;
      return [[a.cx, a.y + a.h], [a.cx, midY], [b.cx, midY], [b.cx, b.y]];
    }
    case 'across': return [[toRight ? a.x + a.w : a.x, a.cy], [toRight ? b.x : b.x + b.w, b.cy]];
    case 'sideDown': return [[toRight ? a.x + a.w : a.x, a.cy], [b.cx, a.cy], [b.cx, b.y]];
    case 'downSide': return [[a.cx, a.y + a.h], [a.cx, b.cy], [toRight ? b.x : b.x + b.w, b.cy]];
  }
}

// Labels sit on the first segment: beside a vertical one, above a horizontal one.
function labelAt(points: Point[]): { x: number; y: number; vertical: boolean } {
  const [[x1, y1], [x2, y2]] = points;
  return x1 === x2 ? { x: x1 + 8, y: Math.min(y1, y2) + Math.abs(y2 - y1) / 2 - 8, vertical: true } : { x: (x1 + x2) / 2, y: y1 - 20, vertical: false };
}

export default function LogicScreen() {
  return <main className="page">
    <div className="page-head">
      <div>
        <div className="eyebrow">How it works</div>
        <h1 className="page-title">Every path through the new-project questions</h1>
        <p className="muted logic-intro">Branches split where an answer changes what’s asked next, and merge again once the rest of the questions are the same. Hidden questions are skipped; anything not marked required can be skipped too.</p>
      </div>
    </div>

    <div className="logic-legend">
      <span><i className="logic-swatch kind-question" />Question, pick one</span>
      <span><i className="logic-swatch kind-pick" />Question, pick any</span>
      <span><i className="logic-swatch kind-route" />No question: follows an earlier answer</span>
    </div>

    <div className="logic-scroll surface">
      <div className="logic-world" style={{ width: WORLD.w, height: WORLD.h }}>
        <svg className="logic-lines" width={WORLD.w} height={WORLD.h} aria-hidden="true">
          <defs><marker id="logic-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>
          {EDGES.map(edge => <polyline key={`${edge.from}-${edge.to}`} points={pointsOf(edge).map(p => p.join(',')).join(' ')} markerEnd="url(#logic-arrow)" />)}
        </svg>
        {EDGES.filter(edge => edge.label).map(edge => {
          const at = labelAt(pointsOf(edge));
          return <div key={`${edge.from}-${edge.to}`} className={`logic-label ${at.vertical ? '' : 'centred'}`} style={{ left: at.x, top: at.y }}>{edge.label}</div>;
        })}
        {(Object.keys(NODES) as Id[]).map(id => {
          const n: Node = NODES[id];
          const b = boxOf(id);
          return <div key={id} className={`logic-node kind-${n.kind}`} style={{ left: b.x, top: b.y, width: b.w, height: b.h }}>
            {n.section && <span className="logic-section">{n.section}</span>}
            <span className="logic-title">{n.title}</span>
            {n.options && <span className="logic-options">{n.options.map(o => <span key={o} className="logic-option">{o}</span>)}</span>}
            {n.sub && <span className="logic-sub" title={n.sub}>{n.sub}</span>}
          </div>;
        })}
      </div>
    </div>
  </main>;
}
