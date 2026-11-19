'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/icons';
import { Bar, PctBadge, RoleChip, StatusChip } from '@/components/project-parts';
import { Badge, Button, Dialog, Empty, ErrorNote, Field, FormActions, Input, Loading, Notice, PageHeader, Panel, Tabs, Textarea, useToast } from '@/components/ui';
import { ApiError, api, errorText, useApi } from '@/lib/api';
import { fmtDate } from '@/lib/dates';
import { REPORT_LABEL } from '@/lib/projects';
import type { ProjectDetail, ProjectEntry, ProjectKpi, ProjectMilestone } from '@/lib/projects';
import { useSession } from '@/lib/session';
import { useTab } from '@/lib/use-tab';

type TabId = 'kpis' | 'milestones' | 'team' | 'approvals';
type Modal =
  | { type: 'entry'; kpi: ProjectKpi; entry?: ProjectEntry }
  | { type: 'report'; milestone: ProjectMilestone }
  | { type: 'milestone' }
  | { type: 'kpi' }
  | { type: 'delete'; milestone: ProjectMilestone }
  | null;

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useSession();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<ProjectDetail>(`/projects/${id}`);
  const [tab, setTab] = useTab<TabId>(['kpis', 'milestones', 'team', 'approvals'], 'kpis');
  const [modal, setModal] = useState<Modal>(null);

  if (loading && !data) return <Loading />;
  if (error) {
    return error instanceof ApiError && error.status === 403
      ? <Empty title="This project is not yours to open">You are not mapped to it. <Link href="/projects" className="text-peacock underline">Back to projects</Link></Empty>
      : <ErrorNote error={error} retry={reload} />;
  }
  if (!data || !me) return null;

  const { project: p, me: access } = data;
  const admin = access.isAdmin;
  const locked = p.status === 'locked';

  async function act(fn: () => Promise<unknown>, done?: string) {
    try {
      await fn();
      await reload();
      if (done) toast(done);
    } catch (e) {
      toast(errorText(e), 'error');
    }
  }
  const post = (path: string, body?: unknown) => api(path, { method: 'POST', body: body ?? {} });
  const decideEntry = (entryId: string, action: 'approve' | 'reject' | 'reopen') => act(() => post(`/projects/entries/${entryId}/decision`, { action }));
  const decideMilestone = (mid: string, action: 'approve' | 'return' | 'complete' | 'reopen') => act(() => post(`/projects/milestones/${mid}/decision`, { action }));

  const waitingReports = data.milestones.filter((m) => m.report?.status === 'submitted');
  const waitingEntries = data.kpis.flatMap((k) => k.entries.filter((e) => e.status === 'pending').map((e) => ({ kpi: k, entry: e })));
  const tabs: { id: TabId; label: string }[] = [
    { id: 'kpis', label: 'KPIs' }, { id: 'milestones', label: 'Milestones' }, { id: 'team', label: 'Team' },
    ...(admin ? [{ id: 'approvals' as const, label: `Approvals${data.pending ? ` (${data.pending})` : ''}` }] : []),
  ];

  return (
    <div>
      <Link href="/projects" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-peacock hover:underline"><Icon name="left" className="size-4" />All projects</Link>
      <PageHeader title={`${p.code} · ${p.name}`}
        description={`${data.members.length} on the team · ${data.kpis.length} KPIs · ${data.milestones.length} milestones`}
        actions={admin && <Button variant={locked ? 'primary' : 'danger'} onClick={() => act(() => api(`/projects/${p.id}`, { method: 'PATCH', body: { status: locked ? 'active' : 'locked' } }), locked ? 'Project unlocked' : 'Project locked')}>{locked ? 'Unlock project' : 'Lock project'}</Button>} />
      <div className="-mt-3 mb-5 flex flex-wrap gap-2">
        <Badge tone="neutral">{p.group}</Badge><Badge tone="neutral">{p.fy}</Badge>
        {p.budget && p.budget !== '—' && <Badge tone="peacock">Budget {p.budget}</Badge>}
        {locked ? <Badge tone="kumkum">Locked</Badge> : data.completed ? <Badge tone="peacock">Completed</Badge> : <Badge tone="peacock">Active</Badge>}
      </div>
      {locked && <div className="mb-5"><Notice tone="kumkum">This project is locked. Nothing can be added or changed until an admin unlocks it.</Notice></div>}

      <Tabs value={tab} onChange={setTab} tabs={tabs} />

      {tab === 'kpis' && (
        <div className="space-y-3">
          {data.kpis.length === 0 && <Empty title="No KPIs yet">{admin ? 'Add the first one below.' : 'An admin will add them.'}</Empty>}
          {data.kpis.map((k) => (
            <Panel key={k.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{k.name}</p>
                  <p className="text-sm text-muted">Approved: <b className="text-ink">{k.approved}</b> / {k.target} {k.unit}</p>
                </div>
                <div className="flex items-center gap-2">
                  <PctBadge pct={k.pct} />
                  {access.canEnter && <Button size="sm" variant="secondary" onClick={() => setModal({ type: 'entry', kpi: k })}>Add entry</Button>}
                </div>
              </div>
              <div className="mt-3"><Bar pct={k.pct} label={k.name} /></div>
              {k.entries.length > 0 && (
                <ul className="mt-3 divide-y divide-line/70 text-sm">
                  {[...k.entries].reverse().map((e) => {
                    const editable = !locked && e.status === 'pending' && (e.employeeId === me.id || admin);
                    return (
                      <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span className="min-w-0 text-muted">
                          <b className="text-ink">{e.value}</b> {k.unit} · {fmtDate(e.date)}{admin && ` · ${e.employeeName}`}{e.note && ` · ${e.note}`}
                        </span>
                        <span className="flex items-center gap-2">
                          <StatusChip status={e.status} />
                          {editable && <>
                            <Button size="sm" variant="ghost" onClick={() => setModal({ type: 'entry', kpi: k, entry: e })}>Edit</Button>
                            <Button size="sm" variant="ghost" className="text-kumkum hover:bg-kumkum-tint" onClick={() => act(() => api(`/projects/entries/${e.id}`, { method: 'DELETE' }))}>Delete</Button>
                          </>}
                          {admin && !locked && e.status !== 'pending' && <Button size="sm" variant="ghost" onClick={() => decideEntry(e.id, 'reopen')}>Reopen</Button>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          ))}
          {admin && !locked && <Button variant="secondary" onClick={() => setModal({ type: 'kpi' })}>Add KPI</Button>}
        </div>
      )}

      {tab === 'milestones' && (
        <div className="space-y-3">
          {data.milestones.length === 0 && <Empty title="No milestones yet">{admin ? 'Add the delivery milestones for this project below.' : 'An admin will add them.'}</Empty>}
          {data.milestones.map((m) => {
            const r = m.report;
            const mine = r?.by === me.id;
            const canWrite = !locked && access.isMember && !m.done && (!r || (['draft', 'returned'].includes(r.status) && mine));
            return (
              <Panel key={m.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className={m.done ? 'font-medium line-through decoration-muted' : 'font-medium'}>{m.title}</p>
                    {m.due && <p className="text-sm text-muted">Due {fmtDate(m.due)}</p>}
                  </div>
                  {m.done ? <Badge tone="peacock">Completed</Badge> : r ? <Badge tone={REPORT_LABEL[r.status][0]}>{REPORT_LABEL[r.status][1]}</Badge> : <Badge tone="neutral">No report yet</Badge>}
                </div>
                {r && (
                  <div className="mt-3 rounded-lg bg-wash/70 p-3 text-sm">
                    <p className="whitespace-pre-line">{r.text}</p>
                    <p className="mt-1 text-xs text-muted">{r.byName ?? 'Unknown'}{r.at && `, ${fmtDate(r.at)}`}</p>
                  </div>
                )}
                {(canWrite || (admin && !locked)) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canWrite && <Button size="sm" variant="secondary" onClick={() => setModal({ type: 'report', milestone: m })}>{r ? 'Edit report' : 'Write completion report'}</Button>}
                    {canWrite && r && <Button size="sm" onClick={() => act(() => post(`/projects/milestones/${m.id}/submit`), 'Report submitted')}>Submit for approval</Button>}
                    {admin && !locked && r?.status === 'submitted' && <>
                      <Button size="sm" onClick={() => decideMilestone(m.id, 'approve')}>Approve and complete</Button>
                      <Button size="sm" variant="danger" onClick={() => decideMilestone(m.id, 'return')}>Return for changes</Button>
                    </>}
                    {admin && !locked && <Button size="sm" variant="ghost" onClick={() => decideMilestone(m.id, m.done ? 'reopen' : 'complete')}>{m.done ? 'Reopen milestone' : 'Mark done (admin)'}</Button>}
                    {admin && !locked && <Button size="sm" variant="ghost" className="text-kumkum hover:bg-kumkum-tint" onClick={() => setModal({ type: 'delete', milestone: m })}>Delete</Button>}
                  </div>
                )}
                {!m.done && r?.status === 'submitted' && mine && !admin && <p className="mt-2 text-xs text-muted">Submitted, so it is locked. An admin can approve it or return it for changes.</p>}
              </Panel>
            );
          })}
          {admin && !locked && <Button variant="secondary" onClick={() => setModal({ type: 'milestone' })}>Add milestone</Button>}
        </div>
      )}

      {tab === 'team' && (
        data.members.length === 0
          ? <Empty title="No one is mapped yet">Admins map people in <Link href="/projects?tab=resources" className="text-peacock underline">Resources</Link>.</Empty>
          : <Panel><ul className="divide-y divide-line">
              {data.members.map((m) => (
                <li key={m.employeeId} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span><Link href={`/people/${m.employeeId}`} className="font-medium hover:underline">{m.fullName}</Link> <span className="text-sm text-muted">{m.empCode}</span></span>
                  <RoleChip>{m.designation}</RoleChip>
                </li>
              ))}
            </ul></Panel>
      )}

      {tab === 'approvals' && admin && (
        <div className="space-y-3">
          {waitingReports.length + waitingEntries.length === 0 && <Empty title="Nothing is waiting">New figures and submitted reports show up here.</Empty>}
          {waitingReports.map((m) => (
            <Panel key={m.id} className="p-4">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2"><p className="font-medium">Milestone report: {m.title}</p><Badge tone="peacock">Submitted</Badge></div>
              <p className="whitespace-pre-line text-sm">{m.report!.text}</p>
              <p className="mb-3 mt-1 text-xs text-muted">{m.report!.byName ?? 'Unknown'}{m.report!.at && `, ${fmtDate(m.report!.at)}`}</p>
              <div className="flex gap-2"><Button size="sm" onClick={() => decideMilestone(m.id, 'approve')} disabled={locked}>Approve and complete</Button><Button size="sm" variant="danger" onClick={() => decideMilestone(m.id, 'return')} disabled={locked}>Return for changes</Button></div>
            </Panel>
          ))}
          {waitingEntries.map(({ kpi, entry: e }) => (
            <Panel key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">KPI entry: {kpi.name}, {e.value} {kpi.unit}</p>
                <p className="text-xs text-muted">{e.employeeName} · {fmtDate(e.date)}{e.note && ` · “${e.note}”`}</p>
              </div>
              <div className="flex gap-2"><Button size="sm" onClick={() => decideEntry(e.id, 'approve')} disabled={locked}>Approve</Button><Button size="sm" variant="danger" onClick={() => decideEntry(e.id, 'reject')} disabled={locked}>Decline</Button></div>
            </Panel>
          ))}
        </div>
      )}

      <EntryDialog modal={modal?.type === 'entry' ? modal : null} onClose={() => setModal(null)}
        onSave={(value, note) => act(async () => {
          const m = modal as Extract<Modal, { type: 'entry' }>;
          if (m.entry) await api(`/projects/entries/${m.entry.id}`, { method: 'PATCH', body: { value, note } });
          else await post(`/projects/${p.id}/entries`, { kpiId: m.kpi.id, value, note: note || undefined });
          setModal(null);
        }, 'Saved. It counts once an admin approves it')} />
      <TextDialog open={modal?.type === 'report'} title={modal?.type === 'report' ? `Completion report: ${modal.milestone.title}` : ''} onClose={() => setModal(null)}
        label="What was completed, and how?" initial={modal?.type === 'report' ? modal.milestone.report?.text ?? '' : ''}
        hint="Saving keeps it as a draft you can still edit. Submit it for approval when it is ready; after that it is locked."
        onSave={(text) => act(async () => { await api(`/projects/milestones/${(modal as { milestone: ProjectMilestone }).milestone.id}/report`, { method: 'PUT', body: { text } }); setModal(null); }, 'Draft saved')} />
      <MilestoneDialog open={modal?.type === 'milestone'} onClose={() => setModal(null)}
        onSave={(title, due) => act(async () => { await post(`/projects/${p.id}/milestones`, { title, due }); setModal(null); }, 'Milestone added')} />
      <KpiDialog open={modal?.type === 'kpi'} onClose={() => setModal(null)}
        onSave={(body) => act(async () => { await post(`/projects/${p.id}/kpis`, body); setModal(null); }, 'KPI added')} />
      <Dialog open={modal?.type === 'delete'} onClose={() => setModal(null)} title="Delete this milestone?">
        <p className="text-sm text-muted">“{modal?.type === 'delete' ? modal.milestone.title : ''}” and its report will be removed for good.</p>
        <FormActions>
          <Button variant="secondary" onClick={() => setModal(null)}>Keep it</Button>
          <Button variant="danger" onClick={() => act(async () => { await api(`/projects/milestones/${(modal as { milestone: ProjectMilestone }).milestone.id}`, { method: 'DELETE' }); setModal(null); }, 'Milestone deleted')}>Delete</Button>
        </FormActions>
      </Dialog>
    </div>
  );
}

// ------------------------------------------------------------------ dialogs

function EntryDialog({ modal, onClose, onSave }: { modal: { kpi: ProjectKpi; entry?: ProjectEntry } | null; onClose: () => void; onSave: (value: number, note: string) => Promise<void> }) {
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState<string | null>(null);
  const key = modal ? (modal.entry?.id ?? `new-${modal.kpi.id}`) : null;
  if (key && key !== seen) { setSeen(key); setValue(modal!.entry ? String(modal!.entry.value) : ''); setNote(modal!.entry?.note ?? ''); }
  if (!key && seen) setSeen(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try { await onSave(Number(value), note); } finally { setBusy(false); }
  }
  return (
    <Dialog open={!!modal} onClose={onClose} title={modal ? `${modal.entry ? 'Edit' : 'Add'} entry: ${modal.kpi.name}` : ''}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={`Value (${modal?.kpi.unit || 'number'})`} hint="The amount to add to this KPI. It counts once an admin approves it."><Input required type="number" min={0} step="any" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} /></Field>
        <Field label="Note" hint="Optional: what this covers."><Input maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <FormActions><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" busy={busy} disabled={value === ''}>Save</Button></FormActions>
      </form>
    </Dialog>
  );
}

function TextDialog({ open, title, label, hint, initial, onClose, onSave }: { open: boolean; title: string; label: string; hint: string; initial: string; onClose: () => void; onSave: (text: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState(false);
  if (open && !seen) { setSeen(true); setText(initial); }
  if (!open && seen) setSeen(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try { await onSave(text.trim()); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onClose={onClose} title={title} wide>
      <form onSubmit={submit} className="space-y-4">
        <Field label={label} hint={hint}><Textarea required rows={6} maxLength={5000} value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <FormActions><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" busy={busy} disabled={!text.trim()}>Save draft</Button></FormActions>
      </form>
    </Dialog>
  );
}

function MilestoneDialog({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (title: string, due: string) => Promise<void> }) {
  const [form, setForm] = useState({ title: '', due: '' });
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try { await onSave(form.title, form.due); setForm({ title: '', due: '' }); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Add a milestone">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Milestone"><Input required maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Due date"><Input required type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} /></Field>
        <FormActions><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" busy={busy}>Add</Button></FormActions>
      </form>
    </Dialog>
  );
}

function KpiDialog({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (body: { name: string; target: number; unit: string }) => Promise<void> }) {
  const [form, setForm] = useState({ name: '', target: '', unit: '' });
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try { await onSave({ name: form.name, target: Number(form.target), unit: form.unit }); setForm({ name: '', target: '', unit: '' }); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Add a KPI">
      <form onSubmit={submit} className="space-y-4">
        <Field label="KPI"><Input required maxLength={200} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target"><Input required type="number" min={0} step="any" inputMode="decimal" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} /></Field>
          <Field label="Unit" hint="For example startups, events, %."><Input maxLength={40} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></Field>
        </div>
        <FormActions><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" busy={busy}>Add KPI</Button></FormActions>
      </form>
    </Dialog>
  );
}
