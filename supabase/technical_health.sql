-- Technical Health: weekly project health checks + findings.
-- Applied directly to the Agencyos Supabase project (ref kndpvdixtlirwgsqvgjh)
-- via the Supabase MCP; kept here as the source of truth / for reapplying
-- against another environment. Mirrors the impact_workflows/impact_measurements
-- pattern: RLS restricted to authenticated, anon gets nothing.

create extension if not exists pgcrypto;

create table if not exists public.technical_health_reports (
  id uuid primary key default gen_random_uuid(),
  checked_at timestamptz not null default now(),
  overall_status text not null default 'healthy'
    check (overall_status in ('healthy','needs_attention','critical','unknown')),
  summary text,
  projects_checked integer not null default 0,
  sources_checked text[] not null default '{}',
  raw_report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.technical_health_findings (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.technical_health_reports(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  project_name text,
  severity text not null check (severity in ('healthy','needs_attention','critical','unknown')),
  category text,
  title text not null,
  details text,
  likely_cause text,
  recommended_action text,
  status text not null default 'new'
    check (status in ('new','investigating','fix_in_progress','resolved')),
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  source_refs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists technical_health_findings_project_status_idx on public.technical_health_findings(project_id,status,severity);
create index if not exists technical_health_reports_checked_at_idx on public.technical_health_reports(checked_at desc);

alter table public.technical_health_reports enable row level security;
alter table public.technical_health_findings enable row level security;

revoke all on table public.technical_health_reports from anon;
revoke all on table public.technical_health_findings from anon;
grant select,insert,update on table public.technical_health_reports to authenticated;
grant select,insert,update on table public.technical_health_findings to authenticated;

drop policy if exists "agency owner health reports" on public.technical_health_reports;
create policy "agency owner health reports" on public.technical_health_reports for all to authenticated using (true) with check (true);

drop policy if exists "agency owner health findings" on public.technical_health_findings;
create policy "agency owner health findings" on public.technical_health_findings for all to authenticated using (true) with check (true);
