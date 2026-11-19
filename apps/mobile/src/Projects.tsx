import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, errorText } from './api';
import { Button, Card, Err, Field, Heading, Page, niceDate, useLoad } from './kit';
import { Sheet, colors, s } from './ui';

interface Summary {
  id: string; code: string; group: string; name: string; status: 'active' | 'locked';
  kpiCount: number; kpiPct: number | null; milestones: { done: number; total: number }; pending: number; completed: boolean;
}
interface Entry { id: string; employeeName: string; value: number; note: string | null; date: string; status: 'pending' | 'approved' | 'rejected' }
interface Kpi { id: string; name: string; target: number; unit: string; approved: number; pct: number; entries: Entry[] }
interface Milestone {
  id: string; title: string; due: string | null; done: boolean;
  report: { text: string; status: 'draft' | 'submitted' | 'approved' | 'returned'; byName: string | null } | null;
}
interface Detail {
  project: { id: string; code: string; name: string; status: 'active' | 'locked' };
  kpis: Kpi[]; milestones: Milestone[]; pending: number;
  me: { isAdmin: boolean; isMember: boolean; canEnter: boolean };
}

const REPORT: Record<string, string> = { draft: 'Report in draft', submitted: 'Submitted, waiting for an admin', approved: 'Report approved', returned: 'Returned for changes' };
const pct = (n: number | null) => (n === null ? 'no figures yet' : `${Math.round(n)}%`);

export function Projects() {
  const list = useLoad<Summary[]>('/projects');
  const [openId, setOpenId] = useState<string | null>(null);
  if (openId) return <ProjectView id={openId} onBack={() => { setOpenId(null); void list.reload(); }} />;
  return (
    <Page title="Projects" onRefresh={() => void list.reload()} refreshing={list.loading}>
      <Err text={list.error} />
      {list.data && !list.data.length ? <Text style={s.muted}>You are not mapped to any project yet. Ask HR to add you.</Text> : null}
      {(list.data ?? []).map((p) => (
        <Pressable key={p.id} onPress={() => setOpenId(p.id)}>
          <Card>
            <Text style={s.muted}>{p.code} · {p.group}{p.status === 'locked' ? ' · locked' : ''}</Text>
            <Text style={[s.body, { fontWeight: '700' }]}>{p.name}</Text>
            <Text style={s.muted}>KPI progress: {pct(p.kpiPct)} · Milestones {p.milestones.done}/{p.milestones.total}{p.pending ? ` · ${p.pending} waiting for review` : ''}</Text>
          </Card>
        </Pressable>
      ))}
    </Page>
  );
}

function ProjectView({ id, onBack }: { id: string; onBack: () => void }) {
  const d = useLoad<Detail>(`/projects/${id}`);
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [ms, setMs] = useState<Milestone | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(fn: () => Promise<unknown>, done?: () => void) {
    setBusy(true);
    setError('');
    try {
      await fn();
      done?.();
      await d.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const saveEntry = () => {
    const n = Number(value);
    if (!kpi || value.trim() === '' || Number.isNaN(n) || n < 0) return setError('Enter a number, zero or more.');
    void run(() => api(`/projects/${id}/entries`, { body: { kpiId: kpi.id, value: n, note: note.trim() || undefined } }), () => { setKpi(null); setValue(''); setNote(''); });
  };
  const saveReport = (submit: boolean) => {
    if (!ms) return;
    if (!text.trim()) return setError('Write a few lines about what was done.');
    void run(async () => {
      await api(`/projects/milestones/${ms.id}/report`, { method: 'PUT', body: { text: text.trim() } });
      if (submit) await api(`/projects/milestones/${ms.id}/submit`, { method: 'POST' });
    }, () => { setMs(null); setText(''); });
  };
  const decideEntry = (eid: string, action: 'approve' | 'reject') => void run(() => api(`/projects/entries/${eid}/decision`, { body: { action } }));
  const decideMs = (mid: string, action: 'approve' | 'return') => void run(() => api(`/projects/milestones/${mid}/decision`, { body: { action } }));

  const data = d.data;
  const me = data?.me;
  const locked = data?.project.status === 'locked';
  const pendingEntries = (data?.kpis ?? []).flatMap((k) => k.entries.filter((e) => e.status === 'pending').map((e) => ({ ...e, kpi: k })));
  const submitted = (data?.milestones ?? []).filter((m) => m.report?.status === 'submitted');

  return (
    <Page title={data?.project.name ?? 'Project'} onRefresh={() => void d.reload()} refreshing={d.loading}>
      <Button title="Back to projects" kind="quiet" onPress={onBack} />
      <Err text={d.error || error} />
      {locked ? <Text style={s.muted}>This project is locked. Nothing can be changed.</Text> : null}

      {me?.isAdmin && (pendingEntries.length || submitted.length) ? (
        <>
          <Heading>Waiting for your review</Heading>
          {pendingEntries.map((e) => (
            <Card key={e.id}>
              <Text style={s.body}>{e.employeeName}: {e.value} {e.kpi.unit} on {e.kpi.name}</Text>
              <Text style={s.muted}>{niceDate(e.date)}{e.note ? ` · ${e.note}` : ''}</Text>
              <Button title="Approve" onPress={() => decideEntry(e.id, 'approve')} busy={busy} disabled={locked} />
              <Button title="Decline" kind="quiet" onPress={() => decideEntry(e.id, 'reject')} disabled={busy || locked} />
            </Card>
          ))}
          {submitted.map((m) => (
            <Card key={m.id}>
              <Text style={[s.body, { fontWeight: '700' }]}>{m.title}</Text>
              <Text style={s.muted}>Report from {m.report?.byName ?? 'a team member'}</Text>
              <Text style={[s.body, { marginVertical: 6 }]}>{m.report?.text}</Text>
              <Button title="Approve and complete" onPress={() => decideMs(m.id, 'approve')} busy={busy} disabled={locked} />
              <Button title="Return for changes" kind="quiet" onPress={() => decideMs(m.id, 'return')} disabled={busy || locked} />
            </Card>
          ))}
        </>
      ) : null}

      <Heading>KPIs</Heading>
      {data && !data.kpis.length ? <Text style={s.muted}>No KPIs on this project.</Text> : null}
      {(data?.kpis ?? []).map((k) => {
        const mine = k.entries.filter((e) => e.status === 'pending').length;
        return (
          <Card key={k.id}>
            <Text style={[s.body, { fontWeight: '700' }]}>{k.name}</Text>
            <Text style={s.muted}>{k.approved} of {k.target} {k.unit} approved ({Math.round(k.pct)}%){mine ? ` · ${mine} waiting` : ''}</Text>
            <View style={{ height: 8, backgroundColor: colors.soft, borderRadius: 4, marginVertical: 8, overflow: 'hidden' }}>
              <View style={{ height: 8, width: `${Math.min(100, Math.round(k.pct))}%`, backgroundColor: colors.peacock }} />
            </View>
            {me?.canEnter && !locked ? <Button title="Add a figure" kind="quiet" onPress={() => { setError(''); setKpi(k); }} /> : null}
          </Card>
        );
      })}

      <Heading>Milestones</Heading>
      {data && !data.milestones.length ? <Text style={s.muted}>No milestones on this project.</Text> : null}
      {(data?.milestones ?? []).map((m) => {
        const st = m.report?.status;
        const canWrite = me?.canEnter && !locked && !m.done && st !== 'submitted';
        return (
          <Card key={m.id}>
            <Text style={[s.body, { fontWeight: '700' }]}>{m.done ? '✓ ' : ''}{m.title}</Text>
            <Text style={s.muted}>{m.due ? `Due ${niceDate(m.due)}` : 'No due date'}{st ? ` · ${REPORT[st]}` : ''}</Text>
            {m.report?.text ? <Text style={[s.body, { marginTop: 6 }]}>{m.report.text}</Text> : null}
            {canWrite ? <Button title={m.report ? 'Edit report' : 'Write report'} kind="quiet" onPress={() => { setError(''); setText(m.report?.text ?? ''); setMs(m); }} /> : null}
          </Card>
        );
      })}

      <Sheet open={!!kpi} title={`Add a figure: ${kpi?.name ?? ''}`}>
        <Field label={`Value (${kpi?.unit ?? ''})`} value={value} onChange={setValue} keyboard="numeric" />
        <Field label="Note (optional)" value={note} onChange={setNote} multiline />
        <Err text={error} />
        <Text style={s.muted}>It counts toward progress once an admin approves it.</Text>
        <Button title="Send for approval" onPress={saveEntry} busy={busy} />
        <Button title="Cancel" kind="quiet" onPress={() => { setKpi(null); setValue(''); setNote(''); setError(''); }} />
      </Sheet>
      <Sheet open={!!ms} title={ms?.title ?? 'Report'}>
        <Field label="What was done" value={text} onChange={setText} multiline />
        <Err text={error} />
        <Button title="Submit for approval" onPress={() => saveReport(true)} busy={busy} />
        <Button title="Save draft" kind="quiet" onPress={() => saveReport(false)} disabled={busy} />
        <Button title="Cancel" kind="quiet" onPress={() => { setMs(null); setText(''); setError(''); }} />
      </Sheet>
    </Page>
  );
}
