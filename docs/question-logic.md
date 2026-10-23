# Question logic

How the new-project questions work: which questions are asked, when, what each answer writes to the project, and the rules the flow follows. **Keep this file in step with the code.** When a question or rule changes in [`src/intake/questions.ts`](../src/intake/questions.ts) or [`src/intake/IntakeFlow.tsx`](../src/intake/IntakeFlow.tsx), update this file and the flow diagram on the app's **How it works** page ([`src/screens/LogicScreen.tsx`](../src/screens/LogicScreen.tsx)) in the same commit.

The same flow is used to create a project (**New project**) and to edit one (**Edit with questions**, which opens on the review screen).

## The questions, in order

Questions are grouped into four sections. A question is only asked when its condition holds; hidden questions are skipped and left out of the review.

Conditions used below:

| Name | True when |
|---|---|
| **Voice bot** | Products include voice bot |
| **Speech analytics** | Products include speech analytics |
| **Both products** | Products include voice bot *and* speech analytics |
| **Outbound path** | Voice bot, and direction is Outbound or *not answered yet* (outbound is assumed until direction is picked) |
| **Inbound path** | Voice bot, and direction is Inbound |

### Basics

| # | Question | Asked when | Type | Writes to |
|---|---|---|---|---|
| 1 | Which project is this? | Always | Text (**required**) | `name` |
| 2 | What’s live on this project? | Always | One of: Voice bot / Speech analytics / Both (**required**) | `products` |

### Voice bot

| # | Question | Asked when | Type | Writes to |
|---|---|---|---|---|
| 2a | How does the call reach the bot? | Voice bot | One of: SIP / PSTN / WSB | `dialer.connection` |
| 3 | Which way do the calls go? | Voice bot | One of: Outbound / Inbound | `dialer.direction` |
| 4 | How do leads reach us? | Outbound path | Pick any of: API / SFTP / Manual / S3 push, plus optional note | `leadIngestion.methods`, `leadIngestion.notes` |
| 4a | ↳ Which connectors send them? | API is picked in 4 | List of names, any number | `leadIngestion.connectors` |
| 5 | Is there a pre call processor? | Outbound path | Processor yes/no | `pre_call` processor |
| 6 | Whose dialer dials the calls? | Outbound path | One of: The client’s dialer / Ours / Not sure yet, plus optional note | `dialer.clientDialer` (true / false / null), `dialer.notes` |
| 7 | Which dialer / telephony provider is it? | Voice bot (either direction) | One of: Ozonetel, Exotel, Plivo, Airtel, Tata Communications, Genesys, Other / not sure | `dialer.provider` (Other = empty) |
| 8 | When the customer doesn’t pick up, does a processor run? | Outbound path | Processor yes/no | `no_answer` processor |
| 9 | When the customer picks up, does a processor run before the bot speaks? | Outbound path | Processor yes/no | `pre_call_connected` processor |
| 10 | When a customer calls in, is there an inbound pre call processor? | Inbound path | Processor yes/no | `inbound_pre_call` processor |
| 11 | Does anything run during the call? | Voice bot | Yes/no, then a list of processors | `during_call` processors (any number) |
| 12 | Is the call ever transferred? | Voice bot | Processor yes/no, plus “Transfers to” | `transfer` processor, `transferTo` |

The connection (2a) applies to either direction and doesn't change the path. Inbound has no lead ingestion: question 10 (the inbound pre call processor calling the client’s API) takes its place, so questions 4–6, 8 and 9 aren't asked.

### Speech analytics

| # | Question | Asked when | Type | Writes to |
|---|---|---|---|---|
| 13a | What arrives for each call? | Speech analytics **only** (not with both products) | One of: With metadata / Without metadata / Presigned URL | `recordings.format` |
| 13a.1 | What’s the dedupe key? | Speech analytics **only** | Text, e.g. `call_id`: what identifies a call so the same recording isn't analysed twice | `recordings.dedupeKey` |
| 13b | What picks the recordings up? | Speech analytics **only** | One of: Speech analytics API / Scheduler, plus optional note | `recordings.via`, `recordings.notes` |
| 13b.1 | Does the API request include a callback_url? | Speech analytics only, and Speech analytics API picked in 13b | One of: Yes / No | `recordings.callbackUrl` |
| 13b.2 | Is enable_subcategory_callback set to true? | Yes to 13b.1 | One of: Yes / No | `recordings.subcategoryCallback` |
| 13c | Where does the scheduler pick them up from? | Speech analytics only, and Scheduler picked in 13b | One of: SFTP / S3, then a **Scheduler configuration** text box for which calls to analyse (e.g. only calls longer than 30 seconds, only certain dispositions) | `recordings.schedulerSource`, `recordings.schedulerConfig` |
| 14 | Is there a resource listen pre processor (pre-analytics processor)? | Speech analytics | Processor yes/no | `resource_pre` processor |
| 15 | Which checklists are mapped? | Speech analytics | Rows of checklist name + template ID, opening with one row. Analysis needs at least one checklist; it can still be skipped, and the canvas flags it. | `checklists` |
| 15.n | Which parameters of *checklist n* have processors? | One per checklist from 15 | Rows of parameter name + audit parameter ID, each with a Pre processor and Post processor switch and “What does it do?” | the checklist's `parameters`, `audit_pre` / `audit_post` processors |

**Both products:** speech analytics gets the voice bot's own calls through the internal queue, so there's no recording ingestion to set up and questions 13a–13c (including 13a.1, 13b.1 and 13b.2) aren't asked. **The dedupe key is the interaction ID.** On the canvas the Recordings box reads “Voice bot calls, via the internal queue” with a “Dedupe key = interaction ID” chip, no status, and can't be edited. Recording details already stored are kept, and come back if the project goes back to speech analytics only.

### Post call

| # | Question | Asked when | Type | Writes to |
|---|---|---|---|---|
| 16 | Is there a resource post processor? | Always (with or without speech analytics) | Processor yes/no | `resource_post` processor |

## Answer types

- **One of (choice):** picks a single value. The flow moves to the next question on its own about 0.3 s later, unless the question's note box is open or the question has a text box (13c's scheduler configuration), which appears once an option is picked.
- **Pick any (multi):** toggles values on and off. It doesn't move on by itself; press Continue or Enter.
- **Processor yes/no:**
  - **Yes** switches the slot's processor on, creating it if it doesn't exist, and shows “What does it do?” and an optional name. It stays on the question so they can be filled in.
  - **No** switches it off and moves on. A processor nobody wrote anything in is removed; one with a description is kept, disabled, so nothing typed is lost.
- **Processor list (during call):** **Yes** adds an empty row (or re-enables existing ones); each row is a name and “What does it do?”, with **+ Another processor**. **No** removes empty rows and disables the rest.
- **Text:** a single line (the dedupe key). Enter continues.
- **Checklists:** no yes/no: the question opens with an empty row, and **+ Another checklist** adds more. Each checklist then gets its own parameters question (15.n), named after the checklist.
- **Parameter switches:** switching a parameter's pre or post processor on creates it, named “*parameter*: pre processor” or “*parameter*: post processor”. Switching it off removes it if its description is empty, otherwise disables it.
- **Notes:** questions 4 and 6 have an **Add a note** link that opens a free-text box, stored on the project.

## Answered, required and skipping

- Only the **name** and **products** are required. Every other question can be skipped; the button reads **Skip** until it's answered, then **Continue**.
- A question counts as answered when:
  - project name and text: not blank
  - one of: a value is picked. On the provider question, “Other / not sure” only counts once the dialer question has been answered too.
  - pick any: at least one is picked
  - processor yes/no and processor list: a processor exists in the slot (enabled = yes, disabled = no), or No was clicked in this session
  - checklists: at least one checklist with a name or template ID
  - parameters: the checklist has at least one parameter
- “No was clicked in this session” isn't saved. When editing an existing project, a slot that was answered No and left empty shows as unanswered (—) in the review.

## Changing earlier answers

- Hidden questions keep their data. Switching direction from Outbound to Inbound hides the outbound questions but doesn't delete their processors; the canvas shows that path with a warning while it still holds processors.
- Unpicking API keeps the connectors while you're in the flow, but they're cleared on save (see below). The same goes for the scheduler's source and configuration when Speech analytics API is picked instead of Scheduler.

## Saving

The review screen lists every visible question with its answer; clicking one jumps back to it. **Create project** / **Save changes** stays disabled until the name and a product are set.

On save, the project is tidied:

- The name is trimmed.
- Checklists with no name, no template ID and no parameters are dropped; the rest are trimmed, and an unnamed one becomes “Untitled checklist”. Parameters with no name and no audit ID are dropped.
- Empty rows in the during call list (no name, no description) are dropped; any other unnamed processor becomes “Unnamed processor”.
- The dedupe key is trimmed.
- Connectors are trimmed and blanks dropped. If API isn't a lead method, connectors are cleared.
- If recordings aren't picked up by a scheduler, the scheduler source and configuration are cleared; otherwise the configuration is trimmed.
- If recordings aren't picked up by the speech analytics API, the callback_url answer is cleared; without a callback_url, the enable_subcategory_callback answer is cleared too.

Everything new starts **open** (red); status is changed on the canvas, not in the questions.

## Keyboard

- **1–9** picks the matching option (not while typing in a box).
- **Enter** continues (not inside a multi-line box; blocked on a required question that isn't answered).

## The diagram behind the questions

Each question names the diagram boxes it's about; the diagram pans to them and lights them up. When a question covers boxes on both call paths (the provider question, say), only the path in use is lit. Box colours follow the answers:

- **Grey:** said no, or the section / path doesn't apply (product not selected, or the other call direction)
- **Red:** enabled and open
- **Green:** enabled and closed (a box with several processors is green only when all are closed)
- **Neutral:** not answered yet. With both products, Recording ingestion and CDR extraction stay neutral, since they're automatic.
