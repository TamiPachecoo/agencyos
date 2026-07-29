# Agency OS — Project Charter (v2, scoped for solo build)

**Optimize for compounding, not just delivery.**
The dashboard, time tracking, leads, and task list are supporting tools. The real product is an agency that gets smarter after every engagement — one that answers "have I solved something like this before?" with data instead of memory.

## What this is

Agency OS is the shared dashboard and client hub that sits behind everything you run: Método Persea, Camarim Mineiro, Vicaf Hydro, and Amarelinha. One place to open in the morning and see what's happening across all four.

This version trades the original "build a platform for a future team" framing for a "build the smallest real thing, let patterns emerge" framing. Same long-term direction, realistic v1.

## Reality check on the original plan

The first draft was written like a spec for a small engineering team: full role-based permissions, RLS policies for multi-tenant data, mandatory migrations for every change, a Framework Library module, Capacity Planning, Finance — all before a single client screen existed. That's the right shape *eventually*, but building it first means guessing at abstractions before you've seen the real pattern twice. It's also a lot of surface area for one person to hand-maintain in vanilla JS.

This rewrite keeps the vision, cuts the v1 scope to what you'd actually use in the next few weeks.

## Known projects to account for

| Project | Status | Notes |
|---|---|---|
| PERSEA / Método Persea | Active | Mentoring brand, online course materials |
| Camarim Mineiro | Active | Bridal hair & makeup studio, bilingual site in progress |
| Vicaf Hydro | In progress | Vitor's company — clock-in/out, time logs, payroll |
| Amarelinha | Existing codebase on GitHub | Needs a `CLAUDE.md` still; treat as an **integration**, not a rebuild |

Amarelinha already has code and history — the first real step there is an audit (what exists, what state it's in, what's reusable) before anything gets pulled into Agency OS. Don't rewrite it to match the framework on day one.

## V1 scope — what actually ships first

Now that there's a real first client and roughly five projects running at once, two things earn their place in v1 that weren't there before: a lightweight lead pipeline, and time tracking. Everything else stays deferred.

**1. Dashboard**
One screen, all active projects. Per-project card: name, status, next deadline or milestone, hours logged this week, open tasks.

**2. Leads / Pipeline (new)**
This mirrors the real sales motion, not a generic CRM funnel. Stages:

New lead -> Discovery call scheduled -> Prototype in progress -> Presented to client -> Won (becomes a client) / Lost.

Each lead holds contact info, source, a running log of conversation notes (dated, "what was said, when" -- not a transcript system), and from discovery onward, a link to the prototype build. The discovery call is where pain points and workflow get captured as structured notes, not just a memory -- these notes are what the prototype gets built from, so they need to be logged before the prototype stage starts.

Once a lead is won, converting to a client carries that history forward: notes, the discovery findings, and a link to the prototype repo, so nothing is re-entered.

**3. Solution Prototype (new)**
Because speed here is the whole point -- a fast, sharp Claude Code prototype is what actually lands the client -- each lead in the "prototype in progress" stage gets a lightweight status: not started, building, ready to present, presented. A single field for the prototype link (repo or deployed preview URL) and a short note on what it demonstrates. This is intentionally thin: not a project-management layer, just enough to see at a glance which prototypes are in flight and which are stalled. Once a lead is won, the same prototype becomes the seed for the real build (Supabase wired in, pushed live) -- the tracker should make that handoff visible, not a fresh start.

Named "Solution Prototype" rather than just "prototype" on purpose — the client isn't buying a demo, they're buying confidence that you understood the problem. The prototype is how that gets communicated.

**4. Clients / Projects (light)**
A client record represents a *business*, not a single engagement — the relationship is with the business, and the business may come back for a second or third project later (today's website client is tomorrow's mobile app client). So the shape is Business → Projects → Deliverables: one client can have multiple project records under it, each with its own status, notes, and links out to existing docs (Google Business Profile, GitHub repo for Amarelinha, etc.). Nothing fancy here, just don't collapse "client" and "project" into the same record, since that's the thing that would need reworking later if a repeat client shows up.

**5. Time tracking (new)**
Log hours against a project with a couple of taps — not a timer-running app, just quick entry (project, date, hours, optional note). This is what makes "can I take on another client" answerable instead of a guess. Feeds two views:
- Per-project total (this week / this month)
- Breakdown across all active projects, so you can see at a glance where the hours are actually going

**6. Tasks (light)**
A simple list or kanban — today / this week / done — tagged by project. No dependencies yet; add that once you feel the lack of it.

## Agency Memory

Not a module — a habit the rest of the system supports. Agency OS should remember everything that makes future work easier: useful prompts, architectural decisions, reusable workflows, Supabase patterns, UI patterns, lessons learned, deployment issues, client preferences.

**V1 only stores this.** For every deliverable, capture a few structured notes: what business problem was solved, what capabilities it required, what industries could reuse it, what patterns showed up, how long it actually took, what you'd do differently. No scoring, no retrieval, no AI reading it back to you yet — just don't let it go unrecorded, because you can't mine data you never wrote down.

Future versions may use AI to retrieve and recommend relevant knowledge at intake (see the deferred knowledge graph below) — but that's only worth building once there's a real corpus of Agency Memory to draw from.

## Deliberately deferred (until there's a real need)

- Role/permission system (you're the only user right now)
- Full CRM automation (email sequences, automated follow-ups)
- Invoicing / finance module
- Formal capacity-planning module — the time-tracking breakdown above covers the "can I scale" question for now; a dedicated forecasting view can come later if the simple breakdown isn't enough
- Knowledge base module
- Framework Library as a formal module — instead, just keep shared components in one `/shared` folder and reuse by hand; formalize it once you've built the same thing three times
- **Knowledge graph + similarity scoring at intake** — the idea (compare a new lead against past projects, auto-suggest reusable capabilities) is good and worth building eventually. It's deferred because scoring needs a real corpus to score against; with a handful of projects, a human scanning a tag list is faster than any engine. Trigger to revisit: once there are ~15-20 tagged project records and you're manually cross-referencing "have I built something like this before" often enough to feel the friction

## Tech stack (unchanged, one caveat)

HTML/CSS/vanilla JS + Supabase stays reasonable for this scope. If the task list or dashboard state management starts feeling tangled as it grows, that's the signal to introduce a lightweight framework — not something to decide up front.

## Design

Same direction as before: minimal, calm, premium — Linear/Stripe/Notion-inspired. Design tokens for color and spacing from day one, since that costs nothing extra and saves rework.

## Order of operations

1. Audit Amarelinha's existing repo — what's there, what state, what's salvageable
2. Build the dashboard shell with static/seeded data for all active projects
3. Wire the dashboard to real data (Supabase tables: `clients`, `projects`, `leads`, `time_entries`)
4. Add the lead pipeline (discovery → prototype → presented → won/lost) and the Solution Prototype tracker
5. Add time tracking (quick entry + per-project and cross-project breakdown views)
6. Add the lightweight task list per project
7. Add Agency Memory fields to client/project records (problem solved, capabilities, patterns, time, lessons)
8. Only then revisit which parts of the original charter (finance, formal capacity planning, permissions, knowledge graph) are actually needed

## Success criteria for v1

- Open one screen, see all active projects and what's next on each
- Add a lead, log discovery notes, track a Solution Prototype through to presented, convert to a client without re-entering their info
- Log hours against a project in a few taps
- See, at a glance, how your hours are split across all ~5 active projects this week
- Every closed project leaves behind Agency Memory notes, even with no engine reading them back yet
- A repeat client's second project attaches to their existing business record, not a fresh one
- Amarelinha is represented alongside the others, not orphaned in a separate repo

---

## Project structure (current)

```
/css              — stylesheets, design tokens
/js               — vanilla JS, page logic
/shared           — reusable components (per charter: hand-reuse until built 3x, then formalize)
/pages            — additional HTML pages beyond the dashboard
/.claude/skills   — Claude Code skills for this repo (e.g. agency-memory)
index.html        — dashboard shell (entry point)
```

## Notes for future sessions

- No framework yet. Stay vanilla JS/HTML/CSS until state management actually hurts (see "Tech stack" above) — don't introduce one preemptively.
- Design tokens live in `css/tokens.css`. Reference them everywhere; don't hardcode colors/spacing in component styles.
- Supabase is wired in (step 3 done). Project: `Agencyos` (ref `kndpvdixtlirwgsqvgjh`) under the **AgencyOS** org — a dedicated org, deliberately separate from the `Amarelinha` Supabase project in the other org, since Amarelinha is an integration target (see "Reality check"), not shared infra.
  - Tables: `clients`, `projects`, `leads`, `time_entries`, `tasks` (tasks added in step 6), `payments`, `expenses` (finance, added after step 8 — see below), `discovery_forms` (see below). RLS is enabled with a permissive "allow all" policy on each — there's no auth/roles yet (deferred per charter), so this is an explicit, documented trade-off rather than an oversight. Tighten these policies once real auth exists.
  - `js/supabaseClient.js` holds the project URL + publishable key (safe to expose client-side; access is governed by RLS). Each page's JS file (`dashboard.js`, `leads.js`, `time.js`, `tasks.js`) queries Supabase directly — no backend layer.
  - The Supabase JS SDK is vendored at `shared/vendor/supabase.js` rather than loaded from a CDN, so the app has no runtime dependency on an external CDN being reachable.
  - `leads.notes` is a jsonb array of dated note objects rather than a separate table — kept to the charter's named table list for step 3; normalize later if it stops being enough.
  - Dashboard's "open tasks" count is computed live from `tasks` (status != 'done') — the earlier manually-set `projects.open_tasks` column was dropped once the real task system landed in step 6.
- Clicking a dashboard project card opens a detail dialog (`dashboard.js`) where you can set a GitHub repo URL, stored in `projects.links.github`. If set, it fetches the repo's description, language breakdown, and README directly from GitHub's public REST API (`api.github.com`) client-side — no auth, unauthenticated rate limit (60 req/hr/IP), public repos only. All fetched content is escaped before rendering since it's external/untrusted input.
- The Tasks page has a mic button (`js/tasks.js`) for live dictation into the task title via the browser's built-in `SpeechRecognition`/`webkitSpeechRecognition` API — no audio file is kept, no API key, no backend. Support varies by browser (best in Chrome/Edge); the button disables itself with an explanatory title when unsupported. If a "real" transcription pipeline (recorded audio + Whisper or similar, kept as a file) is ever wanted, that needs a Supabase Edge Function to keep the API key server-side plus a Storage bucket — deliberately not built now since the free browser-native approach covers the actual ask.
- Step 7 (Agency Memory) is done: `projects` has six free-text columns — `memory_problem_solved`, `memory_capabilities`, `memory_industries`, `memory_patterns`, `memory_time_note`, `memory_lessons` — editable from the same project detail dialog as the repo link. Per charter, this is capture-only: no scoring, no retrieval, nothing reads it back yet. Lives on `projects` (not `clients`), since the charter's "every deliverable" framing maps to a project/engagement, not the business record.
- `.claude/skills/agency-memory/SKILL.md` is a Claude Code skill that drafts those six memory fields from the current conversation after a client work session, shows the draft for review, and only writes to Supabase once approved — it never auto-saves. Run it right after a discovery call debrief or a project wrap-up rather than filling the fields in cold later, since the point is to capture what's fresh.
- A lightweight finance page (`pages/finance.html`, `js/finance.js`) shipped after step 8, ahead of the charter's original "defer invoicing/finance" call — this was an explicit, direct ask (not scope creep), so it's built to the same "smallest real thing" bar as everything else: no invoice generation, no tax handling, just tracking. Two tables: `payments` (`project_id`, `amount`, `due_date`, `paid_date`, `note` — a null `paid_date` means expected-but-not-received, so a single row type covers both projected and actual income) and `expenses` (`expense_date`, `category`, `description`, `amount`, `recurring`). The page shows a 6-month rolling overview (2 months back, current, 3 forward) of expected income, received income, expenses, and net, plus a per-project expected/received breakdown and quick-entry forms for both tables.
- **Discovery Workbook**: each lead can carry one custom questionnaire, built and reviewed from the lead detail dialog (`js/leads.js`) and answered by the client on a standalone public page (`pages/discovery.html`, `js/discovery.js`) that has no app nav — it's meant for someone outside the business. One `discovery_forms` row per lead (`lead_id` is unique): `questions` (jsonb array of question strings, editable until answered), `answers` (jsonb array of `{question, answer}` pairs, null until submitted), `share_token` (random 32-char hex, the only thing standing in for auth on the public link), `submitted_at`. The lead dialog builds/edits questions, shows the shareable link once created, and — once the client submits — shows the answers read-only as a permanent reference (survives lead → client conversion, since won leads stay in the `leads` table). A "Clear responses & resend" action wipes `answers`/`submitted_at` without touching the link or questions.
  - **Security trade-off worth knowing**: this is the first feature that hands the app's Supabase anon key to someone who isn't Tami — every table's RLS is "allow all" (see above), so whoever opens a discovery link technically has the same full read/write access to every table (clients, payments, other leads, everything) as the dashboard itself, not just their own form. That was already true of the anon key in general, but until now no one except Tami was ever given a URL into the app. Treat discovery links like you'd treat sharing the dashboard itself — fine for a trusted client, not something to post publicly. The real fix is scoped auth/RLS, deferred per charter's "role/permission system" item until there's more than one real user.
- **Project Questionnaires** (file-based): Projects can host custom questionnaire files (created by Claude Design or other tools) that clients fill out. Uploaded to project via project detail dialog, stored in Supabase Storage bucket `questionnaires`, tracked in `project_questionnaires` table. Supports:
  - **Single files**: HTML, PDF, DOCX — rendered directly or in iframe with form submission capture
  - **Folder archives**: ZIP files containing questionnaire folders (e.g., Claude Design exports) — extracted client-side using JSZip library with automatic asset loading (images, stylesheets, scripts) from within the ZIP
  Each questionnaire gets a unique share token; clients open `pages/questionnaire.html?token=<token>` — a public form page that loads the file, renders it, and captures form submissions. For ZIP files, the main `index.html` is automatically extracted and loaded with all assets (images, CSS, JS) resolved from within the archive. No manual extraction needed. Responses saved to `questionnaire_responses` table; clients can submit once per questionnaire. Same token-based auth as Discovery Workbook (see security trade-off above). Two tables: `project_questionnaires` (id, project_id, file_name, file_path, share_token, metadata (jsonb for ZIP detection), created_at) and `questionnaire_responses` (id, questionnaire_id, response_data (jsonb), submitted_at).
