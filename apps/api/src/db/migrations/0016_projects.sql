-- Project tracking (moved in from the standalone Project Tracking tool): each StartupTN project with its
-- KPIs, milestones, KPI entries and the people mapped to it. People are the ERP's employees, so there are
-- no separate logins: who may do what comes from the signed-in employee and their roles.
create table projects (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,
  grp         text not null,                         -- Funding, Venture Studio, Catalyst, ...
  name        text not null,
  budget      text,                                  -- shown as written, e.g. "₹10.42 Cr"
  fy          text not null default 'FY 2026-27',
  status      text not null default 'active' check (status in ('active', 'locked')),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (fy, code)
);

create table project_members (
  project_id   uuid not null references projects(id) on delete cascade,
  employee_id  uuid not null references employees(id) on delete cascade,
  designation  text not null default 'Project Associate',
  created_at   timestamptz not null default now(),
  primary key (project_id, employee_id)
);
create index project_members_employee_idx on project_members (employee_id);

create table project_kras (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  title       text not null,
  sort_order  integer not null default 0
);
create index project_kras_project_idx on project_kras (project_id);

create table project_kpis (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  kra_id      uuid references project_kras(id) on delete set null,
  name        text not null,
  target      numeric not null default 0 check (target >= 0),
  unit        text not null default '',
  sort_order  integer not null default 0
);
create index project_kpis_project_idx on project_kpis (project_id);

-- One completion report per milestone: draft -> submitted -> approved, or returned for revision.
create table project_milestones (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,
  title          text not null,
  due            date,
  done           boolean not null default false,
  done_at        timestamptz,
  report_text    text,
  report_status  text check (report_status in ('draft', 'submitted', 'approved', 'returned')),
  report_by      uuid references employees(id) on delete set null,
  report_at      date,
  sort_order     integer not null default 0,
  check ((report_text is null) = (report_status is null))
);
create index project_milestones_project_idx on project_milestones (project_id);

-- A progress figure someone reports against a KPI. Only approved entries count towards the KPI.
create table project_entries (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  kpi_id        uuid not null references project_kpis(id) on delete cascade,
  employee_id   uuid not null references employees(id),
  value         numeric not null check (value >= 0),
  note          text,
  entry_date    date not null default current_date,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by    uuid references employees(id) on delete set null,
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index project_entries_project_idx on project_entries (project_id, status);
create index project_entries_kpi_idx on project_entries (kpi_id);
