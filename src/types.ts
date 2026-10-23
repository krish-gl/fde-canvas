// The whole FDE Canvas file. This is exactly what Export writes and Import reads.
//
// A project is drawn on a fixed architecture: the points in a call's life where the platform lets a
// processor run. Each project records which of those points it uses, what runs there, and a few settings
// along the way (how leads arrive, whose dialer it is and which way it dials, which checklists are mapped).

export type Product = 'voicebot' | 'speech_analytics';
export type LeadMethod = 'api' | 'sftp' | 'manual' | 's3';
export type Direction = 'inbound' | 'outbound' | 'both';
// Speech analytics on its own: what arrives for each call, and what picks it up.
export type RecordingFormat = 'with_metadata' | 'without_metadata' | 'presigned_url';
export type RecordingVia = 'api' | 'scheduler';
export type SchedulerSource = 'sftp' | 's3';

// Two separate things. Enabled: does this point apply to the project at all (disabled is greyed out).
// Status: is the work on it done. Only meaningful while enabled: open is red, closed is green.
export type Status = 'open' | 'closed';

// Where a processor runs. Keep these keys stable: they're stored in exported files.
export type SlotKey =
  | 'pre_call' | 'no_answer' | 'pre_call_connected' | 'inbound_pre_call' | 'during_call' | 'transfer'
  | 'resource_pre' | 'audit_pre' | 'audit_post' | 'resource_post';

// The three sections of the diagram. Post call stands on its own: it applies with or without speech analytics.
export type Section = 'voicebot' | 'speech_analytics' | 'post_call';

export type Processor = {
  id: string;
  slot: SlotKey;
  enabled: boolean;
  status: Status;
  name: string;
  description: string;          // what it does
  // Audit parameter processors belong to one parameter of one checklist.
  checklistId: string | null;
  parameterId: string | null;   // ChecklistParameter.id
};

// A parameter of a speech-analytics checklist. Each can have one pre and one post processor.
export type ChecklistParameter = { id: string; name: string; auditId: string };  // auditId: the platform's audit_parameter_id, e.g. 50001

export type Checklist = { id: string; name: string; templateId: string; notes: string; parameters: ChecklistParameter[] };

export type Project = {
  id: string;
  name: string;
  products: Product[];
  notes: string;
  // connectors: the connectors leads come in through, when the method is API (several allowed).
  leadIngestion: { methods: LeadMethod[]; connectors: string[]; notes: string; status: Status };
  dialer: { clientDialer: boolean | null; provider: string; direction: Direction | null; notes: string; status: Status };
  transferTo: string;
  // How recordings reach speech analytics on its own. With the voice bot too, they come through the internal queue
  // and none of this applies (see recordingsAutomatic).
  recordings: {
    format: RecordingFormat | null;
    via: RecordingVia | null;
    schedulerSource: SchedulerSource | null;   // scheduler only
    schedulerConfig: string;                   // scheduler only: which calls to analyse, e.g. duration or disposition filters
    notes: string;
    status: Status;
  };
  checklists: Checklist[];
  processors: Processor[];
};

export type CanvasFile = { version: 7; exportedAt?: string; projects: Project[] };

// With both products, speech analytics gets the voice bot's own calls through an internal queue, so there's no
// recording source to set up. Recording source and status only apply to speech analytics on its own.
export const recordingsAutomatic = (project: Pick<Project, 'products'>) =>
  project.products.includes('voicebot') && project.products.includes('speech_analytics');

export const PRODUCTS: Array<{ key: Product; label: string }> = [
  { key: 'voicebot', label: 'Voice bot' },
  { key: 'speech_analytics', label: 'Speech analytics' },
];

export const LEAD_METHODS: Array<{ key: LeadMethod; label: string }> = [
  { key: 'api', label: 'API' },
  { key: 'sftp', label: 'SFTP' },
  { key: 'manual', label: 'Manual' },
  { key: 's3', label: 'S3 push' },
];

export const RECORDING_FORMAT_LABEL: Record<RecordingFormat, string> = {
  with_metadata: 'With metadata', without_metadata: 'Without metadata', presigned_url: 'Presigned URL',
};
export const RECORDING_VIA_LABEL: Record<RecordingVia, string> = { api: 'Speech analytics API', scheduler: 'Scheduler' };
export const SCHEDULER_SOURCE_LABEL: Record<SchedulerSource, string> = { sftp: 'SFTP', s3: 'S3' };

export const DIRECTION_LABEL: Record<Direction, string> = { inbound: 'SIP inbound', outbound: 'Outbound', both: 'Inbound + outbound' };

export type SlotInfo = {
  label: string;
  section: Section;
  multi: boolean;               // several processors can run here; otherwise one, switched on or off
  hook?: string;                // the platform function it implements, where known
  when: string;                 // when it runs and what it's typically for
};

export const SLOTS: Record<SlotKey, SlotInfo> = {
  // Outbound path
  pre_call: {
    label: 'Pre call processor', section: 'voicebot', multi: false, hook: 'precall_processing',
    when: 'Outbound. Runs after a lead is ingested, before it’s dialled. Mostly used to update lead attributes, e.g. fetching loan details from the client’s API.',
  },
  no_answer: {
    label: 'No answer call processor', section: 'voicebot', multi: false, hook: 'perform_actions_on_no_answer_calls',
    when: 'Outbound. Runs when the customer doesn’t pick up, e.g. pushing the attempt to the CRM or sending a WhatsApp on the first attempt.',
  },
  pre_call_connected: {
    label: 'Pre call connected processor', section: 'voicebot', multi: false,
    when: 'Outbound. Runs when the customer picks up, before the bot speaks.',
  },
  // Inbound path: there's no lead ingestion; this processor takes its place.
  inbound_pre_call: {
    label: 'Inbound pre call processor', section: 'voicebot', multi: false, hook: 'inbound_precall_processing',
    when: 'SIP inbound. Runs when a customer calls in, before the bot speaks. Calls the client’s API (e.g. with the caller’s number or SIP headers) and enriches lead attributes for the call; this takes the place of lead ingestion.',
  },
  during_call: {
    label: 'During call processors', section: 'voicebot', multi: true,
    when: 'Run while the bot is on the call, e.g. tools for lookups, payment links or dispositions.',
  },
  transfer: {
    label: 'Transfer call processor', section: 'voicebot', multi: false,
    when: 'Runs when the bot transfers the call, e.g. creating a ticket from the disposition, then hitting the dialer’s transfer API.',
  },
  resource_pre: {
    label: 'Resource listen pre processor (pre-analytics processor)', section: 'speech_analytics', multi: false,
    when: 'Org level, not checklist level. Runs on each recording after it’s extracted from the CDR and before checklists, e.g. enriching the request packet from a client API.',
  },
  // One per checklist parameter.
  audit_pre: {
    label: 'Audit parameter pre processor', section: 'speech_analytics', multi: false,
    when: 'Runs before this checklist parameter is evaluated.',
  },
  audit_post: {
    label: 'Audit parameter post processor', section: 'speech_analytics', multi: false, hook: 'exec_audit_parameter_post_processor',
    when: 'Runs on this parameter’s result after it’s evaluated, e.g. turning Inconclusive into NA.',
  },
  resource_post: {
    label: 'Resource post processor', section: 'post_call', multi: false, hook: 'exec_resource_post_processing_function',
    when: 'Runs once the call’s results are ready, e.g. pushing them to the client’s CRM and creating tickets.',
  },
};

export const SLOT_ORDER: SlotKey[] = [
  'pre_call', 'no_answer', 'pre_call_connected', 'inbound_pre_call', 'during_call', 'transfer', 'resource_pre', 'audit_pre', 'audit_post', 'resource_post',
];
