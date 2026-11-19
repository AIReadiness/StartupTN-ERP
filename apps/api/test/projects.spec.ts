import { TestEnv, createTestEnv } from './helpers';

/** Project tracking inside the ERP: who sees what, the entry and report workflows, locking, and the programme load. */
describe('projects', () => {
  let env: TestEnv;
  let projectId: string;
  let kpiId: string;

  const get = async (who: string, path: string) => (await env.as(who)).get(`/api${path}`);
  const send = async (who: string, method: 'post' | 'put' | 'patch' | 'delete', path: string, body?: object) => {
    const a = await env.as(who);
    return body === undefined ? a[method](`/api${path}`) : a[method](`/api${path}`).send(body);
  };

  beforeAll(async () => { env = await createTestEnv(); });
  beforeEach(async () => {
    await env.reset();
    // A small project with one KPI (target 20) and one milestone; Priya is mapped to it, Ravi is not.
    const made = await send('hema', 'post', '/projects', { code: 'T1', group: 'Catalyst', name: 'Test Project' });
    expect(made.status).toBe(201);
    projectId = made.body.id;
    kpiId = (await send('hema', 'post', `/projects/${projectId}/kpis`, { name: 'Startups supported', target: 20, unit: 'startups' })).body.id;
    await send('hema', 'post', `/projects/${projectId}/milestones`, { title: 'Final report', due: '2027-03-31' });
    expect((await send('hema', 'put', `/projects/${projectId}/members/${env.ids.priya}`, { designation: 'Project Lead' })).status).toBe(204);
  });
  afterAll(() => env.close());

  const milestoneId = async () => (await get('hema', `/projects/${projectId}`)).body.milestones[0].id as string;

  it('needs a sign-in', async () => {
    expect((await env.anon().get('/api/projects')).status).toBe(401);
  });

  describe('who sees what', () => {
    it('shows people only the projects they are mapped to, and admins and the MD everything', async () => {
      expect((await get('priya', '/projects')).body.map((p: any) => p.code)).toEqual(['T1']);
      expect((await get('ravi', '/projects')).body).toEqual([]);
      expect((await get('hema', '/projects')).body).toHaveLength(1);
      expect((await get('meena', '/projects')).body).toHaveLength(1);
    });

    it('keeps a project closed to someone not on it, until all its milestones are done', async () => {
      expect((await get('ravi', `/projects/${projectId}`)).status).toBe(403);
      await send('hema', 'post', `/projects/milestones/${await milestoneId()}/decision`, { action: 'complete' });
      expect((await get('ravi', `/projects/${projectId}`)).status).toBe(200);
      const done = (await get('ravi', '/projects/completed')).body;
      expect(done.map((p: any) => p.code)).toEqual(['T1']);
      expect(done[0].kpis[0]).not.toHaveProperty('entries'); // the public report carries figures, not each person's entries
    });

    it('lets only admins change anything about a project', async () => {
      expect((await send('priya', 'post', '/projects', { code: 'X', group: 'Catalyst', name: 'X' })).status).toBe(403);
      expect((await send('meena', 'post', '/projects', { code: 'X', group: 'Catalyst', name: 'X' })).status).toBe(403);
      expect((await send('priya', 'patch', `/projects/${projectId}`, { status: 'locked' })).status).toBe(403);
      expect((await send('priya', 'put', `/projects/${projectId}/members/${env.ids.ravi}`, { designation: 'Project Associate' })).status).toBe(403);
      expect((await send('sathya', 'patch', `/projects/${projectId}`, { name: 'Renamed' })).status).toBe(200);
    });

    it('rejects a duplicate code and an unknown group', async () => {
      expect((await send('hema', 'post', '/projects', { code: 't1', group: 'Catalyst', name: 'Again' })).body.code).toBe('DUPLICATE_CODE');
      expect((await send('hema', 'post', '/projects', { code: 'Z', group: 'Nonsense', name: 'Z' })).body.code).toBe('BAD_GROUP');
    });
  });

  describe('KPI entries', () => {
    const enter = (who: string, value: number, note?: string) => send(who, 'post', `/projects/${projectId}/entries`, { kpiId, value, note });
    const kpi = async (who: string) => (await get(who, `/projects/${projectId}`)).body.kpis[0];

    it('counts only approved entries towards the KPI', async () => {
      const first = await enter('priya', 5);
      expect(first.status).toBe(201);
      expect((await kpi('hema')).approved).toBe(0);
      await send('hema', 'post', `/projects/entries/${first.body.id}/decision`, { action: 'approve' });
      await enter('priya', 3);
      const k = await kpi('hema');
      expect(k).toMatchObject({ approved: 5, pct: 25, target: 20 });
      expect(k.entries.map((e: any) => e.status)).toEqual(['approved', 'pending']);
    });

    it('caps the percentage at 100 and the overall figure is the average of the KPIs', async () => {
      await send('hema', 'post', `/projects/${projectId}/kpis`, { name: 'Events', target: 10, unit: 'events' });
      const big = await enter('priya', 50);
      await send('hema', 'post', `/projects/entries/${big.body.id}/decision`, { action: 'approve' });
      const row = (await get('hema', '/projects')).body[0];
      expect(row.kpiPct).toBe(50); // (100 + 0) / 2
      expect(row.pending).toBe(0);
    });

    it('shows a member only their own entries, and an admin everyone\'s', async () => {
      await send('hema', 'put', `/projects/${projectId}/members/${env.ids.ravi}`, { designation: 'Project Associate' });
      await enter('priya', 2);
      await enter('ravi', 4);
      expect((await kpi('priya')).entries.map((e: any) => e.value)).toEqual([2]);
      expect((await kpi('ravi')).entries.map((e: any) => e.value)).toEqual([4]);
      expect((await kpi('hema')).entries).toHaveLength(2);
      // The progress bar still uses everyone's approved figures.
    });

    it('lets people on the project, and admins, enter figures — nobody else', async () => {
      expect((await enter('ravi', 1)).body.code).toBe('NOT_ON_PROJECT');
      expect((await enter('hema', 1)).status).toBe(201);
      expect((await send('priya', 'post', `/projects/${projectId}/entries`, { kpiId: env.ids.priya, value: 1 })).status).toBe(400);
    });

    it('allows editing or deleting only while the entry is waiting, and only by its owner or an admin', async () => {
      const e = (await enter('priya', 5)).body.id;
      await send('hema', 'put', `/projects/${projectId}/members/${env.ids.ravi}`, { designation: 'Project Associate' });
      expect((await send('ravi', 'patch', `/projects/entries/${e}`, { value: 9 })).status).toBe(403);
      expect((await send('priya', 'patch', `/projects/entries/${e}`, { value: 6, note: 'corrected' })).status).toBe(204);
      expect((await kpi('priya')).entries[0]).toMatchObject({ value: 6, note: 'corrected' });
      await send('hema', 'post', `/projects/entries/${e}/decision`, { action: 'approve' });
      expect((await send('priya', 'patch', `/projects/entries/${e}`, { value: 7 })).body.code).toBe('WRONG_STATE');
      expect((await send('priya', 'delete', `/projects/entries/${e}`)).body.code).toBe('WRONG_STATE');
      await send('hema', 'post', `/projects/entries/${e}/decision`, { action: 'reopen' });
      expect((await send('priya', 'delete', `/projects/entries/${e}`)).status).toBe(204);
    });

    it('lets only admins decide, and only once', async () => {
      const e = (await enter('priya', 5)).body.id;
      expect((await send('priya', 'post', `/projects/entries/${e}/decision`, { action: 'approve' })).status).toBe(403);
      expect((await send('hema', 'post', `/projects/entries/${e}/decision`, { action: 'reject' })).status).toBe(204);
      expect((await send('hema', 'post', `/projects/entries/${e}/decision`, { action: 'approve' })).body.code).toBe('WRONG_STATE');
      expect((await kpi('hema')).approved).toBe(0);
    });

    it('records decisions in the audit log', async () => {
      const e = (await enter('priya', 5)).body.id;
      await send('hema', 'post', `/projects/entries/${e}/decision`, { action: 'approve' });
      const actions = (await env.db.rows(`select action from audit_log where entity_type = 'project' order by id`)).map((r) => r.action);
      expect(actions).toEqual(expect.arrayContaining(['project.create', 'project.member_set', 'project.entry_approve']));
    });
  });

  describe('milestone reports', () => {
    const report = async () => (await get('hema', `/projects/${projectId}`)).body.milestones[0];

    it('runs draft, submit, approve; approving completes the milestone', async () => {
      const m = await milestoneId();
      expect((await send('priya', 'put', `/projects/milestones/${m}/report`, { text: 'All done' })).status).toBe(204);
      expect((await report()).report).toMatchObject({ status: 'draft', text: 'All done', byName: 'Priya Raman' });
      expect((await send('hema', 'post', `/projects/milestones/${m}/decision`, { action: 'approve' })).body.code).toBe('WRONG_STATE');
      expect((await send('priya', 'post', `/projects/milestones/${m}/submit`)).status).toBe(204);
      expect((await send('priya', 'put', `/projects/milestones/${m}/report`, { text: 'Sneaky edit' })).body.code).toBe('REPORT_LOCKED');
      expect((await get('hema', '/projects')).body[0].pending).toBe(1);
      expect((await send('hema', 'post', `/projects/milestones/${m}/decision`, { action: 'approve' })).status).toBe(204);
      expect(await report()).toMatchObject({ done: true, report: { status: 'approved' } });
      expect((await get('hema', '/projects')).body[0]).toMatchObject({ completed: true, pending: 0 });
    });

    it('returns a report for revision and lets its author fix and resubmit it', async () => {
      const m = await milestoneId();
      await send('priya', 'put', `/projects/milestones/${m}/report`, { text: 'First try' });
      await send('priya', 'post', `/projects/milestones/${m}/submit`);
      await send('hema', 'post', `/projects/milestones/${m}/decision`, { action: 'return' });
      expect((await report()).report.status).toBe('returned');
      await send('priya', 'put', `/projects/milestones/${m}/report`, { text: 'Second try' });
      expect((await report()).report).toMatchObject({ status: 'returned', text: 'Second try' });
      expect((await send('priya', 'post', `/projects/milestones/${m}/submit`)).status).toBe(204);
      expect((await report()).report.status).toBe('submitted');
    });

    it('lets only mapped people write reports, and only the author continue a draft', async () => {
      const m = await milestoneId();
      expect((await send('ravi', 'put', `/projects/milestones/${m}/report`, { text: 'Not mine' })).body.code).toBe('NOT_ON_PROJECT');
      await send('hema', 'put', `/projects/${projectId}/members/${env.ids.ravi}`, { designation: 'Project Associate' });
      await send('priya', 'put', `/projects/milestones/${m}/report`, { text: 'Priya draft' });
      expect((await send('ravi', 'put', `/projects/milestones/${m}/report`, { text: 'Ravi takes over' })).body.code).toBe('REPORT_LOCKED');
      expect((await send('ravi', 'post', `/projects/milestones/${m}/submit`)).body.code).toBe('WRONG_STATE');
    });

    it('lets an admin mark a milestone done without a report, reopen it, or delete it', async () => {
      const m = await milestoneId();
      await send('hema', 'post', `/projects/milestones/${m}/decision`, { action: 'complete' });
      expect(await report()).toMatchObject({ done: true, report: null });
      await send('hema', 'post', `/projects/milestones/${m}/decision`, { action: 'reopen' });
      expect((await report()).done).toBe(false);
      expect((await send('priya', 'delete', `/projects/milestones/${m}`)).status).toBe(403);
      expect((await send('hema', 'delete', `/projects/milestones/${m}`)).status).toBe(204);
      expect((await get('hema', `/projects/${projectId}`)).body.milestones).toEqual([]);
    });
  });

  describe('locking', () => {
    it('stops everyone, admins included, changing a locked project until it is unlocked', async () => {
      expect((await send('hema', 'patch', `/projects/${projectId}`, { status: 'locked' })).status).toBe(200);
      const e = await send('priya', 'post', `/projects/${projectId}/entries`, { kpiId, value: 1 });
      expect(e.body.code).toBe('PROJECT_LOCKED');
      expect((await send('hema', 'post', `/projects/${projectId}/milestones`, { title: 'More', due: '2027-01-01' })).body.code).toBe('PROJECT_LOCKED');
      expect((await send('hema', 'put', `/projects/${projectId}/members/${env.ids.ravi}`, { designation: 'Project Associate' })).body.code).toBe('PROJECT_LOCKED');
      expect((await get('priya', `/projects/${projectId}`)).body.me.canEnter).toBe(false);
      expect((await send('hema', 'patch', `/projects/${projectId}`, { status: 'active' })).status).toBe(200);
      expect((await send('priya', 'post', `/projects/${projectId}/entries`, { kpiId, value: 1 })).status).toBe(201);
    });
  });

  describe('team mapping', () => {
    it('maps, re-designates and removes people, and shows the result by project and by person', async () => {
      await send('hema', 'put', `/projects/${projectId}/members/${env.ids.ravi}`, { designation: 'Project Associate' });
      await send('hema', 'put', `/projects/${projectId}/members/${env.ids.ravi}`, { designation: 'Project Lead' });
      const m = (await get('priya', '/projects/mapping')).body; // everyone can read it
      expect(m.projects[0].members.map((x: any) => [x.fullName, x.designation])).toEqual([['Priya Raman', 'Project Lead'], ['Ravi Kumar', 'Project Lead']]);
      expect(m.people.find((p: any) => p.fullName === 'Ravi Kumar').projects[0]).toMatchObject({ code: 'T1', designation: 'Project Lead' });
      expect(m.people.find((p: any) => p.fullName === 'Divya Mohan').projects).toEqual([]);
      await send('hema', 'delete', `/projects/${projectId}/members/${env.ids.ravi}`);
      expect((await get('ravi', '/projects')).body).toEqual([]);
    });

    it('refuses an unknown designation and an inactive employee', async () => {
      expect((await send('hema', 'put', `/projects/${projectId}/members/${env.ids.ravi}`, { designation: 'Boss' })).body.code).toBe('BAD_DESIGNATION');
      await env.db.query(`update employees set status = 'inactive' where id = $1`, [env.ids.ravi]);
      expect((await send('hema', 'put', `/projects/${projectId}/members/${env.ids.ravi}`, { designation: 'Project Lead' })).status).toBe(404);
    });
  });

  describe('the FY 2026-27 programme', () => {
    it('loads every project once, maps the people it can match, and reports the rest', async () => {
      const first = (await send('hema', 'post', '/projects/programme')).body;
      expect(first.created).toBe(42);
      expect(first.skipped).toBe(0);
      // Only one demo employee shares a first name with the programme's people (Hari Prasad, for "Hari"); the rest are reported.
      expect(first.mapped).toBe(1);
      expect(first.unmatched).toEqual(expect.arrayContaining(['dhivya', 'nikunj']));
      expect(first.unmatched).not.toContain('hari');
      expect((await get('hema', '/projects')).body).toHaveLength(43); // plus the test project
      const second = (await send('hema', 'post', '/projects/programme')).body;
      expect(second).toMatchObject({ created: 0, skipped: 42, mapped: 0, unmatched: [] }); // a second run touches nothing, teams included
      expect((await send('priya', 'post', '/projects/programme')).status).toBe(403);
    });

    it('carries the KPIs, targets and milestones across, and maps a person whose email matches', async () => {
      await env.db.query(`update employees set official_email = 'nikunj@startuptn.in' where id = $1`, [env.ids.ravi]);
      const r = (await send('hema', 'post', '/projects/programme')).body;
      expect(r.mapped).toBeGreaterThan(0);
      expect(r.unmatched).not.toContain('nikunj');
      const list = (await get('hema', '/projects')).body;
      const f1 = list.find((p: any) => p.code === 'F1');
      expect(f1).toMatchObject({ name: 'Start Smart Seed Fund', group: 'Funding', budget: '₹10.42 Cr', kpiCount: 3, members: 1 });
      const c2 = (await get('hema', `/projects/${list.find((p: any) => p.code === 'C2').id}`)).body;
      expect(c2.milestones.map((m: any) => m.title)).toEqual(['State-level Incubation Capability Report published']);
      expect(c2.kpis.find((k: any) => k.name.startsWith('Incubators enrolled'))).toMatchObject({ target: 75, unit: 'incubators' });
      expect((await get('nikunj', '/projects')).body.map((p: any) => p.code)).toContain('F1');
    });
  });
});
