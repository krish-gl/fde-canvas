# FDE Canvas

A small local tool for keeping a visual record of each project: which processors exist and where they live, when each was last changed, which products the project uses, how leads arrive, whose dialer it is, and which speech-analytics checklists are mapped.

It isn't a task tracker. There are no tasks and no statuses.

## Run it

You need Node 20+ and pnpm. On this machine both live in `~/.local/node/bin`, which isn't on the default PATH:

```bash
export PATH="$HOME/.local/node/bin:$PATH"   # only needed if `node` isn't found
cd ~/Documents/code/fde-canvas
pnpm install        # first time only
pnpm dev
```

Then open http://localhost:5180.

Other commands:

| Command | What it does |
|---|---|
| `pnpm typecheck` | Type-check the code |
| `pnpm build` | Build a static copy into `dist/` |
| `pnpm preview` | Serve the built copy locally |

## Where your data lives

There's no backend and no database.

- **While you work:** every edit autosaves to this browser's local storage, so a refresh or closing the tab doesn't lose anything.
- **To keep it:** click **Export**. This downloads one JSON file, `fde-canvas-YYYY-MM-DD.json`, which is the copy to back up, put in a repo, or share.
- **To load it:** click **Import** and pick a file. This replaces everything in the browser with the file's contents. If you have edits you haven't exported, it asks first.

"Unexported changes" in the top bar means the browser has edits that your last exported file doesn't. Browser storage is per browser and per profile, and clearing site data wipes it. Export is what you actually keep.

A fresh copy starts with no projects. The example projects name real clients, so `src/sample.ts` and `examples/` are gitignored: if you have them locally, the examples show on first run and `examples/fde-canvas-example.json` can be imported at any time. Importing replaces what's in the browser, so export first. Delete any example from **Project details**.

## Screens

- **Projects:** every project, with its products, call direction, dialer, lead ingestion methods, transfer, and how many processors are on and off. Search matches processor names and descriptions, lead connectors, checklists and parameters. **New project** starts the questions.
- **How it works:** a flow diagram of every path through the questions: where an answer branches the flow and where branches merge again. The full rules are in [docs/question-logic.md](docs/question-logic.md).
- **New project (questions):** one question at a time, grouped into Basics, Voice bot, Speech analytics and Post call.
  - **The diagram:** the whole architecture is drawn behind the questions. It pans to the component each question is about and lights it up, then fills in as you answer: red for open, green for closed, grey for said no.
  - **Answering:** every question is multiple choice. A processor question is yes/no, with "What does it do?" when the answer is yes. Number keys pick options and Enter continues.
  - **Checklists:** you list your checklists, then answer one question per checklist for its parameters and their pre and post processors.
  - **Review:** a review screen at the end lets you click any answer to change it.
- **Project canvas:** the call architecture with this project's processors in place.
  - **Voice bot:** the direction (outbound, SIP inbound or both) decides how the call starts, so it's the first voice bot question.
    - **Outbound:** lead ingestion (API, SFTP, manual, S3 push; with API you also list the connectors, as many as there are) → *pre call processor* → dialer (the client's or ours, and the provider). The dialer branches two ways:
      - doesn't pick up → *no answer call processor*
      - picks up → *pre call connected processor*
    - **SIP inbound:** there's no lead ingestion. The customer calls in → *inbound pre call processor* (`inbound_precall_processing`), which calls the client's API and enriches the lead attributes used during the call. For inbound, this is the lead ingestion.
    - **Both:** both paths, one above the other.
    - Every path joins at During call → *during call processors* (any number); Transfer? → *transfer call processor*.
    - A path that doesn't match the direction is hidden, unless it still holds processors; then it shows with a warning.
  - **Speech analytics:** recording ingestion → CDR / recording extraction → *resource listen pre processor (pre-analytics processor)*. Then checklist processing: each checklist lists its parameters, and each parameter has a *pre* and a *post processor* switch.
    - **With both products,** recordings are the voice bot's calls, arriving through the internal queue, so there's nothing to set up.
    - **Speech analytics on its own:** what arrives for each call (with metadata, without metadata, or a presigned URL), and what picks it up: the speech analytics API, or a scheduler. A scheduler pulls from SFTP or S3, and its configuration says which calls to analyse (e.g. only calls over 30 seconds, only certain dispositions).
  - **Post call:** the *resource post processor*. This shows whether or not speech analytics is live.
  - **Enabled vs status:** these are two separate settings.
    - **Enabled / disabled** (the switch) says whether a point applies to this project. Disabled processors and unused points are **grey**.
    - **Status** applies while something is enabled: **open (red)** until the work is done, then **closed (green)**. Use the Open / Closed tag on a processor card, or the Status control in its panel. Lead ingestion, the dialer and recordings have a status too.
    - Anything new starts open.
  - **Editing:** click a processor to edit its name, what it does, whether it's enabled and its status. Click Lead ingestion, Dialer, Recordings or a checklist to edit those. **Edit with questions** reopens the questions for this project, starting on the review screen.

Never put API keys, tokens or passwords in a processor's description: the file is meant to be exported and shared.

## The file format

```jsonc
{
  "version": 7,
  "exportedAt": "2026-10-23T10:00:00.000Z",
  "projects": [
    {
      "id": "acme",
      "name": "Acme Lending",
      "products": ["voicebot", "speech_analytics"],   // either or both
      "notes": "",
      "leadIngestion": { "methods": ["api"], "connectors": ["LSQ"], "notes": "", "status": "open" },
                                                                         // methods: api | sftp | manual | s3
                                                                         // connectors: only used when methods has api
      "dialer": { "clientDialer": true, "provider": "Ozonetel", "direction": "inbound", "notes": "", "status": "closed" },
                                                                         // clientDialer: true | false | null
                                                                         // direction: inbound | outbound | both | null
      "transferTo": "",
      "recordings": {                                                    // speech analytics on its own
        "format": "with_metadata",                                       // with_metadata | without_metadata | presigned_url | null
        "via": "scheduler",                                              // api | scheduler | null
        "schedulerSource": "s3",                                         // sftp | s3 | null (scheduler only)
        "schedulerConfig": "Only calls longer than 30 seconds",          // scheduler only
        "notes": "", "status": "open"
      },
      "checklists": [
        {
          "id": "collections-1001", "name": "Collections - Support", "templateId": "1001", "notes": "",
          "parameters": [{ "id": "p-50001", "name": "SOP adherence", "auditId": "50001" }]
        }
      ],
      "processors": [
        {
          "id": "sop-adherence",
          "slot": "audit_post",        // see below
          "enabled": true,             // does it apply to this project (false = greyed out)
          "status": "closed",          // open (red) | closed (green), while enabled
          "name": "SOP adherence: Inconclusive → NA",
          "description": "Turns an Inconclusive answer into NA…",
          "checklistId": "collections-1001",   // audit parameter processors only
          "parameterId": "p-50001"     // audit parameter processors only
        }
      ]
    }
  ]
}
```

`slot` is one of:
- **Voice bot:** `pre_call`, `no_answer`, `pre_call_connected` (outbound), `inbound_pre_call` (SIP inbound), `during_call`, `transfer`
- **Speech analytics:** `resource_pre`, `audit_pre`, `audit_post` (the last two belong to a checklist parameter)
- **Post call:** `resource_post`

You can edit the file by hand. On import:
- Missing optional fields are filled with defaults.
- Unknown values (a misspelled slot, say) fall back to a safe default.
- A processor pointing at a checklist that doesn't exist is unmapped.
- Earlier versions are converted:
  - Stages map to the matching point, and telephony becomes the dialer settings.
  - A hot transfer becomes the transfer call processor.
  - An audit processor's parameter number becomes a parameter of its checklist.
  - Files from before projects were renamed keep their list under `accounts`; that's still read.
  - Anything without a status starts open.
  - On a SIP inbound project, a *pre call connected* processor from before version 6 becomes the *inbound pre call processor*.
  - Before version 7, recordings were one free-text `recordingSource`. It becomes the recordings notes; "Our Speech Analytics API" becomes picked up by the API, and an SFTP or S3 source becomes a scheduler on that source. `recordingStatus` becomes the recordings status.
  - Flows, file locations, links and update logs are dropped.
- A file with no `projects` list, or a project with no name, is rejected with a message, and nothing in the browser changes.

## Code map

Every question, when it's asked and what it writes is laid out in [docs/question-logic.md](docs/question-logic.md). Keep it and the How it works diagram up to date when the questions change.

```
src/
  types.ts          data shape and labels
  store.tsx         state, autosave, import validation, export
  sample.ts         the first-run example projects (gitignored: they name real clients)
  router.ts         hash routes (#/, #/new, #/how, #/p/<id>, #/p/<id>/edit)
  intake/
    questions.ts    the questions, which diagram component each is about, and how answers write to the project
    IntakeFlow.tsx  the one-question-at-a-time flow and review screen
    Backdrop.tsx    the panning diagram behind the questions
  App.tsx           top bar, import/export, routing
  screens/
    ProjectsScreen.tsx
    LogicScreen.tsx     the How it works page: the question flow as a diagram
    ProjectCanvas.tsx   the architecture diagram
    panels.tsx      processor, lead ingestion, dialer, recordings, checklist (and parameters) and project editors
  components/       modal, form fields and the ⓘ tooltip
  styles.css
docs/
  question-logic.md every question and rule, for whoever changes them
```
