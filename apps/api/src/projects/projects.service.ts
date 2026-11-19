import { Injectable } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { AuthUser, hasRole } from '../common/auth.types';
import { todayIst } from '../common/dates';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { Db, Queryable } from '../db/db.service';
import { DESIGNATIONS, GROUPS, PROGRAMME } from './programme';
import { PersonRow, matchPerson } from './project-people';

/** Project admins (PMO) approve figures and reports, map people and create projects. */
export const isProjectAdmin = (u: AuthUser) => hasRole(u, 'hr_admin', 'super_admin');
/** The MD can read every project but changes nothing. */
const canSeeAll = (u: AuthUser) => isProjectAdmin(u) || hasRole(u, 'md');

const pct = (total: number, target: number) => (target > 0 ? Math.min(100, Math.round((total / target) * 100)) : 0);
const num = (v: unknown) => Number(v ?? 0);

interface ProjectRow {
  id: string; code: string; grp: string; name: string; budget: string | null; fy: string; status: 'active' | 'locked';
}
interface MilestoneRow {
  id: string; project_id: string; done: boolean; report_text: string | null; report_status: string | null; report_by: string | null;
}

const project = (r: ProjectRow) => ({ id: r.id, code: r.code, group: r.grp, name: r.name, budget: r.budget, fy: r.fy, status: r.status });

@Injectable()
export class ProjectsService {
  constructor(private readonly db: Db, private readonly audit: AuditService) {}

  // ------------------------------------------------------------------ reading

  /** The projects this person sees: everything for admins and the MD, otherwise the ones they are mapped to. */
  async list(user: AuthUser) {
    const rows = await this.db.rows<ProjectRow>(
      `select p.* from projects p
        where $1 or exists (select 1 from project_members m where m.project_id = p.id and m.employee_id = $2)
        order by p.sort_order, p.code`, [canSeeAll(user), user.id]);
    return this.summaries(rows);
  }

  /** Projects whose milestones are all done, with their approved figures and milestone reports. Visible to everyone signed in. */
  async completed() {
    const rows = await this.db.rows<ProjectRow>(
      `select p.* from projects p
        where exists (select 1 from project_milestones m where m.project_id = p.id)
          and not exists (select 1 from project_milestones m where m.project_id = p.id and not m.done)
        order by p.sort_order, p.code`);
    const out = [];
    for (const p of rows) {
      const d = await this.body(p, false, null);
      out.push({ ...d.project, members: d.members, kpis: d.kpis.map(({ entries: _e, ...k }) => k), milestones: d.milestones });
    }
    return out;
  }

  async detail(user: AuthUser, id: string) {
    const p = await this.load(id);
    const admin = isProjectAdmin(user);
    const member = await this.isMember(id, user.id);
    if (!canSeeAll(user) && !member && !(await this.isCompleted(id))) {
      throw forbidden('FORBIDDEN', 'You are not mapped to this project');
    }
    const body = await this.body(p, canSeeAll(user), user.id);
    return {
      ...body,
      me: { isAdmin: admin, isMember: member, canEnter: p.status !== 'locked' && (admin || member) },
      pending: body.pending,
    };
  }

  /** Who is on which project, by project and by person. Everyone can read it; only admins change it. */
  async mapping() {
    const projects = await this.db.rows<ProjectRow>('select * from projects order by sort_order, code');
    const members = await this.db.rows(
      `select m.project_id, m.employee_id, m.designation, e.full_name, e.emp_code
         from project_members m join employees e on e.id = m.employee_id
        order by case m.designation when 'AVP' then 1 when 'Hub AVP' then 2 when 'Project Lead' then 3 else 4 end, e.full_name`);
    const people = await this.db.rows(
      `select id, full_name, emp_code, designation from employees where status = 'active' order by full_name`);
    const byProject = new Map<string, typeof members>();
    for (const m of members) byProject.set(m.project_id, [...(byProject.get(m.project_id) ?? []), m]);
    const mine = (employeeId: string) => projects
      .filter((p) => (byProject.get(p.id) ?? []).some((m) => m.employee_id === employeeId))
      .map((p) => ({ ...project(p), designation: byProject.get(p.id)!.find((m) => m.employee_id === employeeId)!.designation as string }));
    return {
      designations: DESIGNATIONS,
      projects: projects.map((p) => ({
        ...project(p),
        members: (byProject.get(p.id) ?? []).map((m) => ({ employeeId: m.employee_id as string, fullName: m.full_name as string, empCode: m.emp_code as string, designation: m.designation as string })),
      })),
      people: people.map((e) => ({ id: e.id as string, fullName: e.full_name as string, empCode: e.emp_code as string, designation: e.designation as string | null, projects: mine(e.id) })),
    };
  }

  // ------------------------------------------------------------------ projects and team (admin)

  async create(user: AuthUser, input: { code: string; group: string; name: string; fy: string; budget?: string }) {
    requireAdmin(user);
    if (!GROUPS.includes(input.group)) throw badRequest('BAD_GROUP', `Group must be one of: ${GROUPS.join(', ')}`);
    return this.db.tx(async (q) => {
      const dup = await q.query('select 1 from projects where fy = $1 and lower(code) = lower($2)', [input.fy, input.code]);
      if (dup.rowCount) throw conflict('DUPLICATE_CODE', `A project with code ${input.code} already exists in ${input.fy}`);
      const order = (await q.query('select coalesce(max(sort_order), 0) + 1 as n from projects')).rows[0].n;
      const row = (await q.query(
        `insert into projects (code, grp, name, budget, fy, sort_order) values ($1, $2, $3, $4, $5, $6) returning *`,
        [input.code, input.group, input.name, input.budget ?? '—', input.fy, order])).rows[0] as ProjectRow;
      await q.query(`insert into project_kras (project_id, title) values ($1, 'FY Targets')`, [row.id]);
      await this.audit.record({ actorId: user.id, action: 'project.create', entityType: 'project', entityId: row.id, after: project(row) }, q);
      return project(row);
    });
  }

  async update(user: AuthUser, id: string, patch: { status?: 'active' | 'locked'; name?: string; budget?: string }) {
    requireAdmin(user);
    const p = await this.load(id);
    // Name and budget are frozen while locked; lock and unlock themselves always work.
    if (p.status === 'locked' && (patch.name !== undefined || patch.budget !== undefined) && patch.status !== 'active') {
      throw conflict('PROJECT_LOCKED', 'This project is locked. Unlock it first');
    }
    const next = { status: patch.status ?? p.status, name: patch.name ?? p.name, budget: patch.budget ?? p.budget };
    await this.db.tx(async (q) => {
      await q.query('update projects set status = $2, name = $3, budget = $4, updated_at = now() where id = $1', [id, next.status, next.name, next.budget]);
      await this.audit.record({
        actorId: user.id, entityType: 'project', entityId: id, before: project(p), after: { ...project(p), ...next },
        action: next.status !== p.status ? (next.status === 'locked' ? 'project.lock' : 'project.unlock') : 'project.update',
      }, q);
    });
    return project((await this.load(id)));
  }

  async setMember(user: AuthUser, id: string, employeeId: string, designation: string) {
    requireAdmin(user);
    await this.open(id);
    if (!DESIGNATIONS.includes(designation)) throw badRequest('BAD_DESIGNATION', `Designation must be one of: ${DESIGNATIONS.join(', ')}`);
    const emp = await this.db.one(`select id from employees where id = $1 and status = 'active'`, [employeeId]);
    if (!emp) throw notFound('NOT_FOUND', 'That employee was not found, or is no longer active');
    await this.db.tx(async (q) => {
      await q.query(
        `insert into project_members (project_id, employee_id, designation) values ($1, $2, $3)
         on conflict (project_id, employee_id) do update set designation = excluded.designation`, [id, employeeId, designation]);
      await this.audit.record({ actorId: user.id, action: 'project.member_set', entityType: 'project', entityId: id, after: { employeeId, designation } }, q);
    });
  }

  async removeMember(user: AuthUser, id: string, employeeId: string) {
    requireAdmin(user);
    await this.open(id);
    await this.db.tx(async (q) => {
      const r = await q.query('delete from project_members where project_id = $1 and employee_id = $2', [id, employeeId]);
      if (r.rowCount) await this.audit.record({ actorId: user.id, action: 'project.member_remove', entityType: 'project', entityId: id, before: { employeeId } }, q);
    });
  }

  async addKpi(user: AuthUser, id: string, input: { name: string; target: number; unit: string; kraId?: string }) {
    requireAdmin(user);
    await this.open(id);
    let kraId = input.kraId ?? null;
    if (kraId) {
      if (!(await this.db.one('select 1 from project_kras where id = $1 and project_id = $2', [kraId, id]))) throw badRequest('BAD_KRA', 'That KRA is not part of this project');
    } else {
      kraId = (await this.db.one('select id from project_kras where project_id = $1 order by sort_order, title limit 1', [id]))?.id ?? null;
    }
    const order = (await this.db.one('select coalesce(max(sort_order), 0) + 1 as n from project_kpis where project_id = $1', [id]))!.n;
    const row = await this.db.one(
      `insert into project_kpis (project_id, kra_id, name, target, unit, sort_order) values ($1, $2, $3, $4, $5, $6) returning id`,
      [id, kraId, input.name, input.target, input.unit, order]);
    await this.audit.record({ actorId: user.id, action: 'project.kpi_add', entityType: 'project', entityId: id, after: input });
    return { id: row!.id as string };
  }

  async addMilestone(user: AuthUser, id: string, input: { title: string; due: string }) {
    requireAdmin(user);
    await this.open(id);
    const order = (await this.db.one('select coalesce(max(sort_order), 0) + 1 as n from project_milestones where project_id = $1', [id]))!.n;
    const row = await this.db.one(
      `insert into project_milestones (project_id, title, due, sort_order) values ($1, $2, $3, $4) returning id`, [id, input.title, input.due, order]);
    await this.audit.record({ actorId: user.id, action: 'project.milestone_add', entityType: 'project', entityId: id, after: input });
    return { id: row!.id as string };
  }

  // ------------------------------------------------------------------ KPI entries

  async addEntry(user: AuthUser, id: string, input: { kpiId: string; value: number; note?: string }) {
    await this.open(id);
    if (!isProjectAdmin(user) && !(await this.isMember(id, user.id))) throw forbidden('NOT_ON_PROJECT', 'You are not mapped to this project');
    if (!(await this.db.one('select 1 from project_kpis where id = $1 and project_id = $2', [input.kpiId, id]))) throw badRequest('BAD_KPI', 'That KPI is not part of this project');
    const row = await this.db.one(
      `insert into project_entries (project_id, kpi_id, employee_id, value, note, entry_date) values ($1, $2, $3, $4, $5, $6) returning id`,
      [id, input.kpiId, user.id, input.value, input.note?.trim() || null, todayIst()]);
    return { id: row!.id as string };
  }

  async editEntry(user: AuthUser, entryId: string, input: { value?: number; note?: string }) {
    const e = await this.ownEditableEntry(user, entryId);
    await this.db.query('update project_entries set value = $2, note = $3 where id = $1',
      [entryId, input.value ?? e.value, input.note === undefined ? e.note : input.note.trim() || null]);
  }

  async deleteEntry(user: AuthUser, entryId: string) {
    await this.ownEditableEntry(user, entryId);
    await this.db.query('delete from project_entries where id = $1', [entryId]);
  }

  /** Admin: approve or reject a figure waiting for review, or send a decided one back to review. */
  async decideEntry(user: AuthUser, entryId: string, action: 'approve' | 'reject' | 'reopen') {
    requireAdmin(user);
    const e = await this.db.one('select * from project_entries where id = $1', [entryId]);
    if (!e) throw notFound('NOT_FOUND', 'That entry was not found');
    await this.open(e.project_id);
    if (action === 'reopen' ? e.status === 'pending' : e.status !== 'pending') {
      throw conflict('WRONG_STATE', action === 'reopen' ? 'This entry is already waiting for review' : 'This entry has already been decided');
    }
    const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'pending';
    await this.db.tx(async (q) => {
      await q.query('update project_entries set status = $2, decided_by = $3, decided_at = $4 where id = $1',
        [entryId, status, status === 'pending' ? null : user.id, status === 'pending' ? null : new Date()]);
      await this.audit.record({ actorId: user.id, action: `project.entry_${action}`, entityType: 'project', entityId: e.project_id, before: { entryId, status: e.status }, after: { entryId, status, value: num(e.value) } }, q);
    });
  }

  // ------------------------------------------------------------------ milestones and their completion reports

  /** A team member writes (or rewrites) the completion report. It stays a draft until submitted. */
  async saveReport(user: AuthUser, milestoneId: string, text: string) {
    const m = await this.milestone(milestoneId);
    await this.open(m.project_id);
    await this.requireMember(user, m.project_id);
    if (m.done) throw conflict('MILESTONE_DONE', 'This milestone is already complete');
    if (m.report_status && !(['draft', 'returned'].includes(m.report_status) && m.report_by === user.id)) {
      throw conflict('REPORT_LOCKED', 'This report is submitted, or belongs to someone else');
    }
    await this.db.query(
      `update project_milestones set report_text = $2, report_by = $3, report_at = $4, report_status = $5 where id = $1`,
      [milestoneId, text, user.id, todayIst(), m.report_status === 'returned' ? 'returned' : 'draft']);
  }

  async submitReport(user: AuthUser, milestoneId: string) {
    const m = await this.milestone(milestoneId);
    await this.open(m.project_id);
    await this.requireMember(user, m.project_id);
    if (m.done || !m.report_status || !['draft', 'returned'].includes(m.report_status) || m.report_by !== user.id) {
      throw conflict('WRONG_STATE', 'There is no draft of yours to submit');
    }
    await this.db.query(`update project_milestones set report_status = 'submitted', report_at = $2 where id = $1`, [milestoneId, todayIst()]);
    await this.audit.record({ actorId: user.id, action: 'project.report_submit', entityType: 'project', entityId: m.project_id, after: { milestoneId } });
  }

  async decideMilestone(user: AuthUser, milestoneId: string, action: 'approve' | 'return' | 'complete' | 'reopen') {
    requireAdmin(user);
    const m = await this.milestone(milestoneId);
    await this.open(m.project_id);
    if ((action === 'approve' || action === 'return') && m.report_status !== 'submitted') {
      throw conflict('WRONG_STATE', 'There is no submitted report to decide on');
    }
    await this.db.tx(async (q) => {
      if (action === 'approve') await q.query(`update project_milestones set done = true, done_at = now(), report_status = 'approved' where id = $1`, [milestoneId]);
      else if (action === 'return') await q.query(`update project_milestones set report_status = 'returned' where id = $1`, [milestoneId]);
      else if (action === 'complete') {
        await q.query(`update project_milestones set done = true, done_at = now(), report_status = case when report_status is null then null else 'approved' end where id = $1`, [milestoneId]);
      } else await q.query('update project_milestones set done = false, done_at = null where id = $1', [milestoneId]);
      await this.audit.record({ actorId: user.id, action: `project.milestone_${action}`, entityType: 'project', entityId: m.project_id, after: { milestoneId } }, q);
    });
  }

  async deleteMilestone(user: AuthUser, milestoneId: string) {
    requireAdmin(user);
    const m = await this.milestone(milestoneId);
    await this.open(m.project_id);
    await this.db.tx(async (q) => {
      await q.query('delete from project_milestones where id = $1', [milestoneId]);
      await this.audit.record({ actorId: user.id, action: 'project.milestone_delete', entityType: 'project', entityId: m.project_id, before: { milestoneId } }, q);
    });
  }

  // ------------------------------------------------------------------ the FY 2026-27 programme

  /**
   * Loads the annual work programme (42 projects with KPI targets, milestones and the mapped team). Safe to run again:
   * a project that already exists is left exactly as it is, including its team. People are matched to employees by name;
   * the ones that cannot be matched are returned so they can be mapped by hand.
   */
  async loadProgramme(user: AuthUser) {
    requireAdmin(user);
    return this.db.tx(async (q) => {
      const people: PersonRow[] = (await q.query(
        `select id, full_name as "fullName", official_email as email from employees where status = 'active'`)).rows;
      let created = 0;
      let skipped = 0;
      let mapped = 0;
      const unmatched = new Set<string>();
      let order = num((await q.query('select coalesce(max(sort_order), 0) as n from projects')).rows[0].n);
      for (const p of PROGRAMME.projects) {
        const row = (await q.query(
          `insert into projects (code, grp, name, budget, fy, sort_order) values ($1, $2, $3, $4, $5, $6)
           on conflict (fy, code) do nothing returning id`, [p.code, p.group, p.name, p.budget, PROGRAMME.fy, ++order])).rows[0];
        if (!row) { skipped++; continue; }
        created++;
        const kra = (await q.query(`insert into project_kras (project_id, title) values ($1, $2) returning id`, [row.id, `${PROGRAMME.fy} Targets`])).rows[0];
        let i = 0;
        for (const k of p.kpis) {
          await q.query(`insert into project_kpis (project_id, kra_id, name, target, unit, sort_order) values ($1, $2, $3, $4, $5, $6)`, [row.id, kra.id, k.name, k.target, k.unit, ++i]);
        }
        i = 0;
        for (const m of p.milestones) {
          await q.query(`insert into project_milestones (project_id, title, due, sort_order) values ($1, $2, $3, $4)`, [row.id, m.title, m.due, ++i]);
        }
        for (const t of p.team) {
          const employeeId = matchPerson(t.person, people);
          if (!employeeId) { unmatched.add(t.person); continue; }
          await q.query(`insert into project_members (project_id, employee_id, designation) values ($1, $2, $3) on conflict do nothing`, [row.id, employeeId, t.designation]);
          mapped++;
        }
      }
      await this.audit.record({ actorId: user.id, action: 'project.programme_load', entityType: 'project', after: { created, skipped, mapped, unmatched: [...unmatched] } }, q);
      return { fy: PROGRAMME.fy, created, skipped, mapped, unmatched: [...unmatched].sort() };
    });
  }

  // ------------------------------------------------------------------ internals

  private async load(id: string): Promise<ProjectRow> {
    const p = await this.db.one<ProjectRow>('select * from projects where id = $1', [id]);
    if (!p) throw notFound('NOT_FOUND', 'That project was not found');
    return p;
  }

  /** The project, which must not be locked. */
  private async open(id: string): Promise<ProjectRow> {
    const p = await this.load(id);
    if (p.status === 'locked') throw conflict('PROJECT_LOCKED', 'This project is locked. Ask an admin to unlock it');
    return p;
  }

  private async isMember(projectId: string, employeeId: string) {
    return !!(await this.db.one('select 1 from project_members where project_id = $1 and employee_id = $2', [projectId, employeeId]));
  }

  private async requireMember(user: AuthUser, projectId: string) {
    if (!(await this.isMember(projectId, user.id))) throw forbidden('NOT_ON_PROJECT', 'You are not mapped to this project');
  }

  private async isCompleted(projectId: string) {
    const r = await this.db.one(
      `select count(*)::int as total, count(*) filter (where done)::int as done from project_milestones where project_id = $1`, [projectId]);
    return r!.total > 0 && r!.total === r!.done;
  }

  private async milestone(id: string): Promise<MilestoneRow> {
    const m = await this.db.one<MilestoneRow>('select * from project_milestones where id = $1', [id]);
    if (!m) throw notFound('NOT_FOUND', 'That milestone was not found');
    return m;
  }

  private async ownEditableEntry(user: AuthUser, entryId: string) {
    const e = await this.db.one('select * from project_entries where id = $1', [entryId]);
    if (!e) throw notFound('NOT_FOUND', 'That entry was not found');
    await this.open(e.project_id);
    if (e.employee_id !== user.id && !isProjectAdmin(user)) throw forbidden('FORBIDDEN', 'That entry is not yours');
    if (e.status !== 'pending') throw conflict('WRONG_STATE', 'Only an entry that is still waiting for review can be changed');
    return e;
  }

  /** Counts and KPI progress for a list of projects, in four queries rather than four per project. */
  private async summaries(rows: ProjectRow[]) {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [kpis, sums, ms, pend, mem] = await Promise.all([
      this.db.rows('select id, project_id, target from project_kpis where project_id = any($1)', [ids]),
      this.db.rows(`select kpi_id, sum(value) as total from project_entries where project_id = any($1) and status = 'approved' group by kpi_id`, [ids]),
      this.db.rows(
        `select project_id, count(*)::int as total, count(*) filter (where done)::int as done,
                count(*) filter (where report_status = 'submitted')::int as submitted
           from project_milestones where project_id = any($1) group by project_id`, [ids]),
      this.db.rows(`select project_id, count(*)::int as n from project_entries where project_id = any($1) and status = 'pending' group by project_id`, [ids]),
      this.db.rows('select project_id, count(*)::int as n from project_members where project_id = any($1) group by project_id', [ids]),
    ]);
    const approved = new Map(sums.map((s) => [s.kpi_id as string, num(s.total)]));
    return rows.map((p) => {
      const mine = kpis.filter((k) => k.project_id === p.id);
      const m = ms.find((x) => x.project_id === p.id);
      const kpiPct = mine.length ? Math.round(mine.reduce((s, k) => s + pct(approved.get(k.id) ?? 0, num(k.target)), 0) / mine.length) : null;
      return {
        ...project(p),
        kpiCount: mine.length,
        kpiPct,
        milestones: { done: m?.done ?? 0, total: m?.total ?? 0 },
        members: mem.find((x) => x.project_id === p.id)?.n ?? 0,
        pending: (pend.find((x) => x.project_id === p.id)?.n ?? 0) + (m?.submitted ?? 0),
        completed: (m?.total ?? 0) > 0 && m!.done === m!.total,
      };
    });
  }

  /** Everything on a project's page. `seeAllEntries` shows every person's figures; otherwise just the viewer's own. */
  private async body(p: ProjectRow, seeAllEntries: boolean, viewerId: string | null, q: Queryable = this.db) {
    const [members, kras, kpis, milestones, entries] = await Promise.all([
      q.query(`select m.employee_id, m.designation, e.full_name, e.emp_code from project_members m join employees e on e.id = m.employee_id
                where m.project_id = $1 order by case m.designation when 'AVP' then 1 when 'Hub AVP' then 2 when 'Project Lead' then 3 else 4 end, e.full_name`, [p.id]),
      q.query('select id, title from project_kras where project_id = $1 order by sort_order, title', [p.id]),
      q.query('select * from project_kpis where project_id = $1 order by sort_order, name', [p.id]),
      q.query(`select m.*, u.full_name as report_by_name from project_milestones m left join employees u on u.id = m.report_by
                where m.project_id = $1 order by m.sort_order, m.due`, [p.id]),
      q.query(`select x.*, u.full_name from project_entries x join employees u on u.id = x.employee_id
                where x.project_id = $1 order by x.created_at`, [p.id]),
    ]);
    const approved = new Map<string, number>();
    for (const e of entries.rows) if (e.status === 'approved') approved.set(e.kpi_id, (approved.get(e.kpi_id) ?? 0) + num(e.value));
    const visible = entries.rows.filter((e) => seeAllEntries || e.employee_id === viewerId);
    const kpiViews = kpis.rows.map((k) => {
      const total = approved.get(k.id) ?? 0;
      return {
        id: k.id as string, kraId: k.kra_id as string | null, name: k.name as string, target: num(k.target), unit: k.unit as string,
        approved: total, pct: pct(total, num(k.target)),
        entries: visible.filter((e) => e.kpi_id === k.id).map((e) => ({
          id: e.id as string, employeeId: e.employee_id as string, employeeName: e.full_name as string,
          value: num(e.value), note: e.note as string | null, date: e.entry_date as string, status: e.status as string,
        })),
      };
    });
    const milestoneViews = milestones.rows.map((m) => ({
      id: m.id as string, title: m.title as string, due: m.due as string | null, done: m.done as boolean,
      report: m.report_status ? { text: m.report_text as string, status: m.report_status as string, by: m.report_by as string | null, byName: m.report_by_name as string | null, at: m.report_at as string | null } : null,
    }));
    return {
      project: project(p),
      members: members.rows.map((m) => ({ employeeId: m.employee_id as string, fullName: m.full_name as string, empCode: m.emp_code as string, designation: m.designation as string })),
      kras: kras.rows.map((k) => ({ id: k.id as string, title: k.title as string })),
      kpis: kpiViews,
      milestones: milestoneViews,
      completed: milestoneViews.length > 0 && milestoneViews.every((m) => m.done),
      pending: entries.rows.filter((e) => e.status === 'pending').length + milestoneViews.filter((m) => m.report?.status === 'submitted').length,
    };
  }
}

function requireAdmin(user: AuthUser) {
  if (!isProjectAdmin(user)) throw forbidden('FORBIDDEN', 'Only a project admin can do this');
}
