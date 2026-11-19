import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Card, Chips, Err, Heading, Page, addDays, istToday, niceDate, useLoad } from './kit';
import { Button, Notice, Text, colors, s } from './ui';

interface TeamRow { employeeId: string; fullName: string; designation: string | null; empCode: string; status: string | null; flags: string[]; firstIn: string | null; lastOut: string | null; workedMinutes: number }
interface LiveRow { employeeId: string; employeeName: string; empCode: string; minutesAgo: number | null; place: 'break' | 'duty' | 'inside' | 'outside' | 'unknown'; distanceM: number | null }
interface AwayRow { id: string; employeeName: string; empCode: string; leftAt: string; returnedAt: string | null; minutesAway: number; reasonKind: 'official' | 'break' | 'personal' | 'other' | null; reasonNote: string | null }
interface PresenceRow { id: string; employeeName: string; empCode: string; status: 'outside' | 'missed'; askedAt: string; distanceM: number | null; secondAsk: boolean }
interface Person { id: string; empCode: string; fullName: string; officialEmail: string; designation: string | null; departmentName: string | null; reportingManagerName: string | null; phone: string | null; employmentType: string; dateOfJoining: string | null; workLocationName: string | null; status: string; attendanceMethod: string }

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true });
const mins = (m: number) => (m <= 0 ? '—' : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`);
const label = (st: string) => st.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const REASON = { official: 'Official work', break: 'Break', personal: 'Personal', other: 'Other' } as const;
const PLACE = { inside: 'At the office', outside: 'Outside', break: 'On a break', duty: 'On duty', unknown: 'Unknown' } as const;

type View_ = 'today' | 'live' | 'away' | 'checks' | 'people';

export function Team({ isHr }: { isHr: boolean }) {
  const [view, setView] = useState<View_>('today');
  const options: { value: View_; label: string }[] = [
    { value: 'today', label: 'Team today' },
    ...(isHr ? [{ value: 'live' as const, label: 'Live now' }, { value: 'away' as const, label: 'Away alerts' }, { value: 'checks' as const, label: 'Location checks' }, { value: 'people' as const, label: 'Employees' }] : []),
  ];
  return (
    <Page title={isHr ? 'HR and team' : 'My team'}>
      {options.length > 1 ? <Chips options={options} value={view} onChange={setView} /> : null}
      {view === 'today' ? <Today /> : null}
      {view === 'live' ? <Live /> : null}
      {view === 'away' ? <Away /> : null}
      {view === 'checks' ? <Checks /> : null}
      {view === 'people' ? <People /> : null}
    </Page>
  );
}

function DayPicker({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6 }}>
      <View style={{ flex: 1 }}><Button title="‹ Earlier" kind="quiet" onPress={() => setDate(addDays(date, -1))} /></View>
      <Text style={[s.body, { fontWeight: '600' }]}>{date === istToday() ? 'Today' : niceDate(date)}</Text>
      <View style={{ flex: 1 }}><Button title="Later ›" kind="quiet" disabled={date >= istToday()} onPress={() => setDate(addDays(date, 1))} /></View>
    </View>
  );
}

function Pill({ text, tone }: { text: string; tone: 'blue' | 'amber' | 'grey' | 'red' }) {
  const t = { blue: [colors.peacockTint, colors.peacockDark], amber: [colors.marigoldTint, colors.marigoldInk], grey: [colors.wash, colors.muted], red: [colors.kumkumTint, colors.kumkum] }[tone];
  return <View style={{ backgroundColor: t[0], borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' }}><Text style={{ color: t[1], fontSize: 12, fontWeight: '600' }}>{text}</Text></View>;
}

function Today() {
  const [date, setDate] = useState(istToday());
  const rows = useLoad<TeamRow[]>(`/attendance/team/day?date=${date}`);
  const inCount = (rows.data ?? []).filter((r) => r.firstIn).length;
  return (
    <>
      <DayPicker date={date} setDate={setDate} />
      <Err text={rows.error} />
      {rows.data ? <Text style={s.muted}>{inCount} of {rows.data.length} have checked in</Text> : null}
      {rows.data && !rows.data.length ? <Text style={s.muted}>Nobody reports to you yet.</Text> : null}
      {(rows.data ?? []).map((r) => (
        <Card key={r.employeeId}>
          <Text style={[s.body, { fontWeight: '600' }]}>{r.fullName}</Text>
          <Text style={s.muted}>{r.designation ?? r.empCode}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {r.status ? <Pill text={label(r.status)} tone={r.status === 'absent' ? 'red' : r.status === 'present' ? 'blue' : 'grey'} /> : <Pill text={date === istToday() ? 'Not in yet' : 'No record'} tone="grey" />}
            {r.flags.includes('late') ? <Pill text="Late" tone="amber" /> : null}
          </View>
          <Text style={[s.muted, { marginTop: 6 }]}>In {r.firstIn ? clock(r.firstIn) : '—'}   Out {r.lastOut ? clock(r.lastOut) : '—'}   Worked {mins(r.workedMinutes)}</Text>
        </Card>
      ))}
    </>
  );
}

function Live() {
  const live = useLoad<LiveRow[]>('/admin/tracking/live');
  return (
    <>
      <Button title="Refresh" kind="quiet" onPress={() => void live.reload()} busy={live.loading} />
      <Err text={live.error} />
      {live.data && !live.data.length ? <Notice tone="ok" text="Nobody is checked in right now." /> : null}
      {(live.data ?? []).map((r) => (
        <Card key={r.employeeId}>
          <Text style={[s.body, { fontWeight: '600' }]}>{r.employeeName} <Text style={s.muted}>{r.empCode}</Text></Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <Pill text={r.place === 'outside' && r.distanceM !== null ? `Outside, ${(r.distanceM / 1000).toFixed(1)} km away` : PLACE[r.place]} tone={r.place === 'outside' ? 'amber' : r.place === 'inside' ? 'blue' : 'grey'} />
            <Text style={s.muted}>{r.minutesAgo === null ? 'No reading yet' : `Last reading ${r.minutesAgo} min ago`}</Text>
          </View>
        </Card>
      ))}
    </>
  );
}

function Away() {
  const [date, setDate] = useState(istToday());
  const alerts = useLoad<AwayRow[]>(`/admin/tracking/alerts?date=${date}`);
  return (
    <>
      <DayPicker date={date} setDate={setDate} />
      <Err text={alerts.error} />
      {alerts.data && !alerts.data.length ? <Notice tone="ok" text="Nobody left their work location without a reason." /> : null}
      {(alerts.data ?? []).map((r) => (
        <Card key={r.id}>
          <Text style={[s.body, { fontWeight: '600' }]}>{r.employeeName} <Text style={s.muted}>{r.empCode}</Text></Text>
          <Text style={s.muted}>Left {clock(r.leftAt)}{r.returnedAt ? `, back ${clock(r.returnedAt)}` : ', still away'}, {r.minutesAway} min</Text>
          <View style={{ marginTop: 6 }}>{r.reasonKind ? <Pill text={REASON[r.reasonKind]} tone="blue" /> : <Pill text="No reason given" tone="amber" />}</View>
          {r.reasonNote ? <Text style={[s.body, { marginTop: 4 }]}>{r.reasonNote}</Text> : null}
        </Card>
      ))}
    </>
  );
}

function Checks() {
  const [date, setDate] = useState(istToday());
  const rows = useLoad<PresenceRow[]>(`/attendance/presence/report?date=${date}`);
  return (
    <>
      <DayPicker date={date} setDate={setDate} />
      <Text style={s.muted}>Random location checks answered from outside the work location, or not answered. Only HR sees this.</Text>
      <Err text={rows.error} />
      {rows.data && !rows.data.length ? <Notice tone="ok" text="No missed or outside checks." /> : null}
      {(rows.data ?? []).map((r) => (
        <Card key={r.id}>
          <Text style={[s.body, { fontWeight: '600' }]}>{r.employeeName} <Text style={s.muted}>{r.empCode}</Text></Text>
          <Text style={s.muted}>Asked at {clock(r.askedAt)}{r.secondAsk ? ', second ask' : ''}</Text>
          <View style={{ marginTop: 6 }}><Pill text={r.status === 'missed' ? 'Not answered' : `Outside${r.distanceM !== null ? `, ${r.distanceM} m away` : ''}`} tone="amber" /></View>
        </Card>
      ))}
    </>
  );
}

function People() {
  const all = useLoad<Person[]>('/employees');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const term = q.trim().toLowerCase();
  const list = (all.data ?? []).filter((p) => !term || p.fullName.toLowerCase().includes(term) || p.empCode.toLowerCase().includes(term) || (p.designation ?? '').toLowerCase().includes(term));
  return (
    <>
      <TextInput style={[s.input, { marginVertical: 8 }]} value={q} onChangeText={setQ} placeholder="Search by name, code or role" placeholderTextColor={colors.muted} autoCapitalize="none" />
      <Err text={all.error} />
      {all.data ? <Text style={s.muted}>{list.length} of {all.data.length} people</Text> : null}
      {list.slice(0, 80).map((p) => (
        <Card key={p.id}>
          <Text onPress={() => setOpen(open === p.id ? null : p.id)} style={[s.body, { fontWeight: '600' }]}>{p.fullName} <Text style={s.muted}>{p.empCode}</Text></Text>
          <Text style={s.muted}>{[p.designation, p.departmentName].filter(Boolean).join(', ') || '—'}</Text>
          {p.status !== 'active' ? <View style={{ marginTop: 4 }}><Pill text={label(p.status)} tone="grey" /></View> : null}
          {open === p.id ? (
            <View style={{ marginTop: 8 }}>
              <Text style={s.body}>{p.officialEmail}</Text>
              {p.phone ? <Text style={s.body}>{p.phone}</Text> : null}
              <Text style={s.muted}>Reports to {p.reportingManagerName ?? '—'}</Text>
              <Text style={s.muted}>{label(p.employmentType)}{p.dateOfJoining ? `, joined ${niceDate(p.dateOfJoining)}` : ''}</Text>
              <Text style={s.muted}>Works at {p.workLocationName ?? 'no location set'}, attendance by {p.attendanceMethod === 'biometric' ? 'biometric machine' : 'selfie'}</Text>
            </View>
          ) : <Text style={[s.muted, { fontSize: 12, marginTop: 4 }]}>Tap the name for details</Text>}
        </Card>
      ))}
      <Heading>Set-up</Heading>
      <Text style={s.muted}>Adding or editing employees, leave rules, approval flows, working hours and tracking settings are done on the website (HR and admin menu). They need a large screen and carry more risk of a wrong tap.</Text>
    </>
  );
}
