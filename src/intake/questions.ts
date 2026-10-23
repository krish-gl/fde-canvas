// The new-project questions, one at a time, grouped by section of the diagram. Each question names the
// diagram component it's about (`focus`), which the backdrop pans to and lights up while it's asked.
// Questions read and write the draft project directly, so the same flow also edits an existing project.
// docs/question-logic.md and the How it works diagram (screens/LogicScreen.tsx) lay these out: update both when they change.
import { newChecklist, newParameter, newProcessor, parameterProcessor } from '../store';
import {
  CONNECTION_LABEL, LEAD_METHODS, QUEUE_DEDUPE_KEY, RECORDING_FORMAT_LABEL, RECORDING_VIA_LABEL, SCHEDULER_SOURCE_LABEL, SLOTS, recordingsAutomatic,
  type Project, type Connection, type Direction, type LeadMethod, type Processor, type Product, type RecordingFormat, type RecordingVia, type SchedulerSource, type SlotKey,
} from '../types';

export type NodeId =
  | 'lead' | 'pre_call' | 'dialer' | 'no_answer' | 'pre_call_connected' | 'caller' | 'inbound_pre_call' | 'during_call' | 'transfer'
  | 'recordings' | 'cdr' | 'resource_pre' | 'checklists' | 'audit_pre' | 'audit_post' | 'resource_post';

export type SectionName = 'Basics' | 'Voice bot' | 'Speech analytics' | 'Post call';
export const SECTION_ORDER: SectionName[] = ['Basics', 'Voice bot', 'Speech analytics', 'Post call'];

export type Option = { value: string; label?: string; hint?: string; info?: string };

type Base = {
  id: string;
  section: SectionName;
  focus: NodeId[] | 'all';
  title: string;
  hint?: string;
  info?: string;
  when?: (a: Project) => boolean;
  // Optional free-text note stored on the project, e.g. lead ingestion notes.
  note?: { get: (a: Project) => string; set: (a: Project, text: string) => Project; placeholder: string };
};

export type Step =
  | Base & { kind: 'name' }
  // A short free-text answer, e.g. the dedupe key.
  | Base & { kind: 'text'; placeholder: string; get: (a: Project) => string; set: (a: Project, text: string) => Project }
  | Base & {
      kind: 'choice'; options: Option[]; get: (a: Project) => string | undefined; set: (a: Project, value: string) => Project;
      // A text box shown under the options once one is picked, e.g. the scheduler's configuration.
      text?: { label: string; placeholder: string; get: (a: Project) => string; set: (a: Project, text: string) => Project };
    }
  | Base & {
      kind: 'multi'; options: Option[]; get: (a: Project) => string[]; set: (a: Project, values: string[]) => Project;
      // A list of names asked under the options once one of them is picked, e.g. the connectors behind API.
      list?: { showFor: string; label: string; placeholder: string; addLabel: string; get: (a: Project) => string[]; set: (a: Project, values: string[]) => Project };
    }
  | Base & { kind: 'processor'; slot: SlotKey; extra?: { label: string; placeholder: string; get: (a: Project) => string; set: (a: Project, text: string) => Project } }
  | Base & { kind: 'processors'; slot: SlotKey }
  | Base & { kind: 'checklists' }
  // One per checklist: its parameters, and the pre / post processor on each.
  | Base & { kind: 'parameters'; checklistId: string };

const hasVoice = (a: Project) => a.products.includes('voicebot');
// Direction decides which path's questions follow: outbound or inbound, never both.
// Until it's answered, the outbound path is assumed.
const outbound = (a: Project) => hasVoice(a) && a.dialer.direction !== 'inbound';
const inbound = (a: Project) => hasVoice(a) && a.dialer.direction === 'inbound';
const hasAnalytics = (a: Project) => a.products.includes('speech_analytics');
// With the voice bot as well, recordings arrive from its calls through the internal queue: nothing to ask.
const recordingsAsked = (a: Project) => hasAnalytics(a) && !recordingsAutomatic(a);
const schedulerAsked = (a: Project) => recordingsAsked(a) && a.recordings.via === 'scheduler';
const callbackAsked = (a: Project) => recordingsAsked(a) && a.recordings.via === 'api';
const subcategoryAsked = (a: Project) => callbackAsked(a) && a.recordings.callbackUrl === true;
const yesNo = (value: boolean | null) => (value === true ? 'yes' : value === false ? 'no' : undefined);

const PRODUCT_CHOICE: Record<string, Product[]> = { voicebot: ['voicebot'], speech_analytics: ['speech_analytics'], both: ['voicebot', 'speech_analytics'] };
const productValue = (a: Project) =>
  a.products.length === 2 ? 'both' : a.products[0] === 'voicebot' ? 'voicebot' : a.products[0] === 'speech_analytics' ? 'speech_analytics' : undefined;

const PROVIDERS = ['Ozonetel', 'Exotel', 'Plivo', 'Airtel', 'Tata Communications', 'Genesys'];

export const steps: Step[] = [
  {
    id: 'name', section: 'Basics', kind: 'name', focus: 'all',
    title: 'Which project is this?', hint: 'Everything after this is a pick from options, with room to say what each processor does.',
  },
  {
    id: 'products', section: 'Basics', kind: 'choice', focus: 'all',
    title: 'What’s live on this project?',
    info: 'Decides which parts of the diagram apply. Post call applies either way.',
    options: [
      { value: 'voicebot', label: 'Voice bot', hint: 'Live calls handled by the bot', info: 'Brings in lead ingestion, the dialer, and the pre call, during call and transfer processors.' },
      { value: 'speech_analytics', label: 'Speech analytics', hint: 'Recorded calls analysed after the fact', info: 'Brings in recordings, the resource listen pre processor, checklists and audit parameter processors.' },
      { value: 'both', label: 'Both', info: `Every section applies. Speech analytics gets the voice bot’s calls through the internal queue, so there’s no recording ingestion to set up, and the dedupe key is the ${QUEUE_DEDUPE_KEY}.` },
    ],
    get: productValue,
    set: (a, v) => ({ ...a, products: PRODUCT_CHOICE[v] ?? [] }),
  },

  // Voice bot
  {
    id: 'connection', section: 'Voice bot', kind: 'choice', focus: ['dialer', 'caller'], when: hasVoice,
    title: 'How does the call reach the bot?',
    info: 'The telephony connection. It applies to outbound and inbound calls alike.',
    options: (Object.keys(CONNECTION_LABEL) as Connection[]).map(value => ({ value, label: CONNECTION_LABEL[value] })),
    get: a => a.dialer.connection ?? undefined,
    set: (a, v) => ({ ...a, dialer: { ...a.dialer, connection: v as Connection } }),
  },
  {
    id: 'direction', section: 'Voice bot', kind: 'choice', focus: ['lead', 'dialer', 'caller', 'inbound_pre_call'], when: hasVoice,
    title: 'Which way do the calls go?',
    info: 'This decides how the call starts, so the next questions depend on it. A project is one or the other, not both.',
    options: [
      { value: 'outbound', label: 'Outbound', hint: 'We call the leads', info: 'Leads are ingested, can go through a pre call processor, then the dialer calls them. Some won’t pick up.' },
      { value: 'inbound', label: 'Inbound', hint: 'Customers call in', info: 'No lead ingestion. When a customer calls in, the inbound pre call processor calls the client’s API and enriches the lead attributes used during the call.' },
    ],
    get: a => a.dialer.direction ?? undefined,
    set: (a, v) => ({ ...a, dialer: { ...a.dialer, direction: v as Direction } }),
  },
  {
    id: 'lead', section: 'Voice bot', kind: 'multi', focus: ['lead'], when: outbound,
    title: 'How do leads reach us?', hint: 'Pick all that apply.',
    info: 'Lead ingestion: how the client’s leads arrive before they’re dialled.',
    options: LEAD_METHODS.map(m => ({
      value: m.key, label: m.label,
      info: { api: 'The client calls our API to push leads.', sftp: 'Files dropped on an SFTP server on a schedule.', manual: 'Someone uploads a file by hand.', s3: 'Files pushed to an S3 bucket we read.' }[m.key],
    })),
    get: a => a.leadIngestion.methods,
    set: (a, values) => ({ ...a, leadIngestion: { ...a.leadIngestion, methods: values as LeadMethod[] } }),
    list: {
      showFor: 'api', label: 'Which connectors send them?', placeholder: 'Connector name, e.g. LSQ', addLabel: 'Another connector',
      get: a => a.leadIngestion.connectors,
      set: (a, connectors) => ({ ...a, leadIngestion: { ...a.leadIngestion, connectors } }),
    },
    note: { get: a => a.leadIngestion.notes, set: (a, notes) => ({ ...a, leadIngestion: { ...a.leadIngestion, notes } }), placeholder: 'Who sends them, how often, file format, auth…' },
  },
  {
    id: 'pre_call', section: 'Voice bot', kind: 'processor', slot: 'pre_call', focus: ['pre_call'], when: outbound,
    title: 'Is there a pre call processor?', info: SLOTS.pre_call.when,
  },
  {
    id: 'dialer', section: 'Voice bot', kind: 'choice', focus: ['dialer'], when: outbound,
    title: 'Whose dialer dials the calls?',
    info: 'With a client’s dialer integration, call details are pushed to us via API.',
    options: [
      { value: 'client', label: 'The client’s dialer', hint: 'Details pushed via API', info: 'Their dialer places the calls and pushes call details to us via API.' },
      { value: 'ours', label: 'Ours', info: 'We dial the leads ourselves.' },
      { value: 'unknown', label: 'Not sure yet' },
    ],
    get: a => (a.dialer.clientDialer === true ? 'client' : a.dialer.clientDialer === false ? 'ours' : undefined),
    set: (a, v) => ({ ...a, dialer: { ...a.dialer, clientDialer: v === 'client' ? true : v === 'ours' ? false : null } }),
    note: { get: a => a.dialer.notes, set: (a, notes) => ({ ...a, dialer: { ...a.dialer, notes } }), placeholder: 'SIP headers, DIDs, anything about the dialer…' },
  },
  {
    id: 'provider', section: 'Voice bot', kind: 'choice', focus: ['dialer', 'caller'], when: hasVoice,
    title: 'Which dialer / telephony provider is it?',
    options: [...PROVIDERS.map(p => ({ value: p })), { value: '', label: 'Other / not sure' }],
    get: a => (a.dialer.provider === '' && a.dialer.clientDialer === null ? undefined : a.dialer.provider),
    set: (a, provider) => ({ ...a, dialer: { ...a.dialer, provider } }),
  },
  {
    id: 'no_answer', section: 'Voice bot', kind: 'processor', slot: 'no_answer', focus: ['no_answer'],
    when: outbound,
    title: 'When the customer doesn’t pick up, does a processor run?', info: SLOTS.no_answer.when,
  },
  {
    id: 'pre_call_connected', section: 'Voice bot', kind: 'processor', slot: 'pre_call_connected', focus: ['pre_call_connected'], when: outbound,
    title: 'When the customer picks up, does a processor run before the bot speaks?', info: SLOTS.pre_call_connected.when,
  },
  {
    id: 'inbound_pre_call', section: 'Voice bot', kind: 'processor', slot: 'inbound_pre_call', focus: ['caller', 'inbound_pre_call'], when: inbound,
    title: 'When a customer calls in, is there an inbound pre call processor?',
    hint: 'It calls the client’s API and enriches the lead attributes; for inbound, this is the lead ingestion.',
    info: SLOTS.inbound_pre_call.when,
  },
  {
    id: 'during_call', section: 'Voice bot', kind: 'processors', slot: 'during_call', focus: ['during_call'], when: hasVoice,
    title: 'Does anything run during the call?', hint: 'Tools the bot calls, dispositions, lookups. Add each one.', info: SLOTS.during_call.when,
  },
  {
    id: 'transfer', section: 'Voice bot', kind: 'processor', slot: 'transfer', focus: ['transfer'], when: hasVoice,
    title: 'Is the call ever transferred?', info: SLOTS.transfer.when,
    extra: { label: 'Transfers to', placeholder: 'e.g. Ozonetel transfer API, agent queue', get: a => a.transferTo, set: (a, transferTo) => ({ ...a, transferTo }) },
  },

  // Speech analytics
  // Recordings: only asked for speech analytics on its own. With the voice bot too, they come through the internal queue.
  {
    id: 'recording_format', section: 'Speech analytics', kind: 'choice', focus: ['recordings'], when: recordingsAsked,
    title: 'What arrives for each call?',
    info: 'The recording ingestion for speech analytics: what we receive for each call.',
    options: [
      { value: 'with_metadata', label: RECORDING_FORMAT_LABEL.with_metadata, hint: 'The recording plus call details', info: 'Each recording comes with its call metadata (agent, disposition, duration…).' },
      { value: 'without_metadata', label: RECORDING_FORMAT_LABEL.without_metadata, hint: 'Just the audio' },
      { value: 'presigned_url', label: RECORDING_FORMAT_LABEL.presigned_url, hint: 'A link we download the recording from' },
    ],
    get: a => a.recordings.format ?? undefined,
    set: (a, format) => ({ ...a, recordings: { ...a.recordings, format: format as RecordingFormat } }),
  },
  {
    id: 'dedupe_key', section: 'Speech analytics', kind: 'text', focus: ['recordings', 'cdr'], when: recordingsAsked,
    title: 'What’s the dedupe key?',
    hint: 'What identifies a call, so the same recording isn’t analysed twice.',
    info: `With the voice bot too, recordings come through the internal queue and the dedupe key is the ${QUEUE_DEDUPE_KEY}, so this isn’t asked.`,
    placeholder: 'e.g. call_id',
    get: a => a.recordings.dedupeKey,
    set: (a, dedupeKey) => ({ ...a, recordings: { ...a.recordings, dedupeKey } }),
  },
  {
    id: 'recording_via', section: 'Speech analytics', kind: 'choice', focus: ['recordings', 'cdr'], when: recordingsAsked,
    title: 'What picks the recordings up?',
    options: [
      { value: 'api', label: RECORDING_VIA_LABEL.api, hint: 'They push each call to our API' },
      { value: 'scheduler', label: RECORDING_VIA_LABEL.scheduler, hint: 'We pull them on a schedule from SFTP or S3', info: 'A scheduler picks recordings up from an SFTP server or S3 bucket, filtered by its configuration.' },
    ],
    get: a => a.recordings.via ?? undefined,
    set: (a, via) => ({ ...a, recordings: { ...a.recordings, via: via as RecordingVia } }),
    note: { get: a => a.recordings.notes, set: (a, notes) => ({ ...a, recordings: { ...a.recordings, notes } }), placeholder: 'Whose system they come from, anything else about them…' },
  },
  {
    id: 'callback_url', section: 'Speech analytics', kind: 'choice', focus: ['recordings', 'cdr'], when: callbackAsked,
    title: 'Does the API request include a callback_url?',
    options: [{ value: 'yes', label: 'Yes', hint: 'We call it back with the results' }, { value: 'no', label: 'No' }],
    get: a => yesNo(a.recordings.callbackUrl),
    set: (a, v) => ({ ...a, recordings: { ...a.recordings, callbackUrl: v === 'yes' } }),
  },
  {
    id: 'subcategory_callback', section: 'Speech analytics', kind: 'choice', focus: ['recordings', 'cdr'], when: subcategoryAsked,
    title: 'Is enable_subcategory_callback set to true?',
    options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
    get: a => yesNo(a.recordings.subcategoryCallback),
    set: (a, v) => ({ ...a, recordings: { ...a.recordings, subcategoryCallback: v === 'yes' } }),
  },
  {
    id: 'scheduler', section: 'Speech analytics', kind: 'choice', focus: ['recordings', 'cdr'], when: schedulerAsked,
    title: 'Where does the scheduler pick them up from?',
    options: [{ value: 'sftp', label: SCHEDULER_SOURCE_LABEL.sftp }, { value: 's3', label: SCHEDULER_SOURCE_LABEL.s3 }],
    get: a => a.recordings.schedulerSource ?? undefined,
    set: (a, source) => ({ ...a, recordings: { ...a.recordings, schedulerSource: source as SchedulerSource } }),
    text: {
      label: 'Scheduler configuration: which calls to analyse',
      placeholder: 'e.g. Only calls longer than 30 seconds. Only dispositions Sale and Callback.',
      get: a => a.recordings.schedulerConfig,
      set: (a, schedulerConfig) => ({ ...a, recordings: { ...a.recordings, schedulerConfig } }),
    },
  },
  {
    id: 'resource_pre', section: 'Speech analytics', kind: 'processor', slot: 'resource_pre', focus: ['resource_pre'], when: hasAnalytics,
    title: 'Is there a resource listen pre processor (pre-analytics processor)?', hint: 'Org level, not checklist level.', info: SLOTS.resource_pre.when,
  },
  {
    id: 'checklists', section: 'Speech analytics', kind: 'checklists', focus: ['checklists'], when: hasAnalytics,
    title: 'Which checklists are mapped?',
    hint: 'Speech analytics needs at least one checklist to analyse calls.',
    info: 'Checklist processing runs each call against these checklists. A checklist has its own parameters, and each parameter can have a pre and a post processor.',
  },

  // Post call: applies whether or not speech analytics is live.
  {
    id: 'resource_post', section: 'Post call', kind: 'processor', slot: 'resource_post', focus: ['resource_post'],
    title: 'Is there a resource post processor?', hint: 'Pushing results to the client’s CRM, creating tickets.', info: SLOTS.resource_post.when,
  },
];

// The fixed questions, with one parameters question added after the checklists question for each checklist.
export function visibleSteps(a: Project): Step[] {
  return steps.filter(step => !step.when || step.when(a)).flatMap(step => step.kind !== 'checklists' ? [step] : [
    step,
    ...a.checklists.map((checklist, index): Step => ({
      id: `parameters:${checklist.id}`, section: 'Speech analytics', kind: 'parameters', checklistId: checklist.id, focus: ['checklists', 'audit_pre', 'audit_post'],
      title: `Which parameters of ${checklist.name.trim() || `checklist ${index + 1}`} have processors?`,
      hint: 'Add each parameter with its audit parameter ID, then switch on its pre or post processor.',
      info: `${SLOTS.audit_pre.when} / ${SLOTS.audit_post.when}`,
    })),
  ]);
}

// ---- Processor helpers shared by the processor questions

export const slotProcessors = (a: Project, slot: SlotKey) => a.processors.filter(p => p.slot === slot);

export function setProcessor(a: Project, id: string, patch: Partial<Processor>): Project {
  return { ...a, processors: a.processors.map(p => (p.id === id ? { ...p, ...patch } : p)) };
}

// "Yes" to a single point: switch its processor on, creating it if needed.
export function enableSlot(a: Project, slot: SlotKey): Project {
  const existing = slotProcessors(a, slot)[0];
  if (existing) return setProcessor(a, existing.id, { enabled: true });
  return { ...a, processors: [...a.processors, newProcessor(slot)] };
}

// "No": an untouched processor is removed; one with details is kept, switched off, so nothing typed is lost.
export function disableSlot(a: Project, slot: SlotKey): Project {
  const untouched = (p: Processor) => !p.description.trim() && (p.name === SLOTS[slot].label || p.name === 'New processor');
  return {
    ...a,
    processors: a.processors
      .filter(p => p.slot !== slot || !untouched(p))
      .map(p => (p.slot === slot ? { ...p, enabled: false } : p)),
  };
}

export const addProcessorTo = (a: Project, slot: SlotKey): Project => ({ ...a, processors: [...a.processors, { ...newProcessor(slot), name: '' }] });
export const removeProcessor = (a: Project, id: string): Project => ({ ...a, processors: a.processors.filter(p => p.id !== id) });
export const addChecklist = (a: Project): Project => ({ ...a, checklists: [...a.checklists, { ...newChecklist(), name: '' }] });

// Removing a checklist removes its parameters' processors with it.
export const removeChecklist = (a: Project, id: string): Project => ({
  ...a, checklists: a.checklists.filter(c => c.id !== id), processors: a.processors.filter(p => p.checklistId !== id),
});

export function setChecklist(a: Project, id: string, patch: Partial<Project['checklists'][number]>): Project {
  return { ...a, checklists: a.checklists.map(c => (c.id === id ? { ...c, ...patch } : c)) };
}

export const addParameter = (a: Project, checklistId: string): Project =>
  setChecklist(a, checklistId, { parameters: [...(a.checklists.find(c => c.id === checklistId)?.parameters ?? []), newParameter()] });

export function setParameter(a: Project, checklistId: string, parameterId: string, patch: Partial<{ name: string; auditId: string }>): Project {
  const checklist = a.checklists.find(c => c.id === checklistId);
  if (!checklist) return a;
  return setChecklist(a, checklistId, { parameters: checklist.parameters.map(q => (q.id === parameterId ? { ...q, ...patch } : q)) });
}

export function removeParameter(a: Project, checklistId: string, parameterId: string): Project {
  const checklist = a.checklists.find(c => c.id === checklistId);
  if (!checklist) return a;
  const without = setChecklist(a, checklistId, { parameters: checklist.parameters.filter(q => q.id !== parameterId) });
  return { ...without, processors: without.processors.filter(p => p.parameterId !== parameterId) };
}

// Switch a parameter's pre or post processor on (creating it) or off (keeping anything written).
export function toggleParameterProcessor(a: Project, checklistId: string, parameterId: string, slot: 'audit_pre' | 'audit_post', on: boolean): Project {
  const existing = parameterProcessor(a, slot, parameterId);
  if (existing) {
    if (!on && !existing.description.trim()) return removeProcessor(a, existing.id);
    return setProcessor(a, existing.id, { enabled: on });
  }
  if (!on) return a;
  const parameterName = a.checklists.find(c => c.id === checklistId)?.parameters.find(q => q.id === parameterId)?.name.trim();
  const name = `${parameterName || 'Parameter'}: ${slot === 'audit_pre' ? 'pre' : 'post'} processor`;
  return { ...a, processors: [...a.processors, { ...newProcessor(slot), name, checklistId, parameterId }] };
}

// A question counts as answered once it has a value; processor questions once yes or no was given.
export function slotAnswer(a: Project, slot: SlotKey, saidNo: Set<string>): 'yes' | 'no' | undefined {
  const list = slotProcessors(a, slot);
  if (list.some(p => p.enabled)) return 'yes';
  if (list.length > 0 || saidNo.has(slot)) return 'no';
  return undefined;
}
