---
name: agency-memory
description: Drafts and saves a project's Agency Memory notes (problem solved, capabilities required, industries that could reuse it, patterns, time spent, lessons learned) to Supabase after a client work session. Use this whenever Tami finishes a discovery call debrief, a build session, or a project wrap-up and wants to capture what was learned, log client pain points, record what would be done differently, or otherwise update a project's memory/notes for future reuse — even if she just says "save this" or "log what we did" without naming the skill. Always drafts from the conversation and gets Tami's review before writing anything to the database.
---

# Agency Memory

Per the Agency OS charter, Agency Memory is what lets a future lead get answered with data instead of memory: six short notes per project, captured after every engagement, no scoring or retrieval yet — just don't let it go unrecorded. This skill turns a work session into that record: read the conversation, draft the six fields, get Tami's sign-off, save.

Supabase project ref for every query below: `kndpvdixtlirwgsqvgjh`. Use the `mcp__Supabase__execute_sql` tool — this is DML against an existing table, never `apply_migration`.

## 1. Identify the project

If this conversation has clearly centered on one project the whole time, use it. Otherwise run:

```sql
select id, name, status from projects order by name;
```

List the results and ask Tami which project this session was about.

## 2. Pull existing memory first

Fetch what's already saved before drafting anything, so the draft extends prior notes instead of clobbering them — a project can go through this skill more than once across its life (once after discovery, again at wrap-up):

```sql
select memory_problem_solved, memory_capabilities, memory_industries,
       memory_patterns, memory_time_note, memory_lessons
from projects where id = '<project_id>';
```

## 3. Draft from the conversation, not from assumption

Re-read this conversation for content relevant to each field:

- **Problem solved** — the client pain point or business problem that came up
- **Capabilities required** — what was actually built, decided, or implemented
- **Industries that could reuse this** — the client's business type, plus any adjacent industry with the same problem
- **Patterns** — anything that echoes work on other projects, or a reusable approach worth naming
- **Time note** — any explicit mention of hours/days spent; don't invent a figure if none was said
- **Lessons** — anything that went wrong, ran slow, or you'd do differently next time

Not every session touches every field, and that's fine — leave a field out rather than padding it with something generic just to fill the slot. A blank is more honest than filler, and filler is exactly what Tami has asked to not get. Write each field as a short phrase or one terse sentence: this is a private reference note for pattern-matching later, not client-facing copy, so skip adjectives that don't carry information and don't restate what the field label already says.

## 4. Review before saving

Show Tami the full draft, one field at a time. Where a field already had content, show old vs. new (or a merged version) so she can see exactly what's changing. Ask her to approve as-is, edit any field, or drop a field that has nothing new to add.

Do not write to Supabase until she has explicitly approved the final version. No auto-save.

## 5. Save only what changed

```sql
update projects set
  memory_problem_solved = '<escaped text>',
  memory_lessons = '<escaped text>'
where id = '<project_id>';
```

Only include the fields that actually changed. Escape single quotes in text values (`'` → `''`) before writing the query. After running it, confirm the save succeeded and tell Tami exactly what got written.
