import { readFileSync } from 'fs';
import { join } from 'path';
import { readStaffList } from '../src/db/employee-import';
import { PROGRAMME } from '../src/projects/programme';
import { matchPerson } from '../src/projects/project-people';

const people = [
  { id: '1', fullName: 'Nikunj Panchal', email: 'nikunj@startuptn.in' },
  { id: '2', fullName: 'Premkumar C N', email: 'prem@startuptn.in' },
  { id: '3', fullName: 'Senthamil Arasan A', email: 'senthamil@startuptn.in' },
  { id: '4', fullName: 'Manoj Kumar S M', email: 'manoj@startuptn.in' },
  { id: '5', fullName: 'Ravi Kumar', email: 'ravi.k@startuptn.in' },
  { id: '6', fullName: 'Ravi Shankar', email: 'ravi.s@startuptn.in' },
];

describe('matching the old tool\'s names to employees', () => {
  it('matches by email, then first name, then the known old spellings', () => {
    expect(matchPerson('Nikunj', people)).toBe('1');
    expect(matchPerson('prem', people)).toBe('2');
    expect(matchPerson('Sentamil', people)).toBe('3');
    expect(matchPerson('Manoj', people)).toBe('4');
  });

  it('does not guess when a name is ambiguous, partial or unknown', () => {
    expect(matchPerson('Ravi', people)).toBeNull(); // two Ravis
    expect(matchPerson('Manojkumar', people)).toBeNull(); // not the same person as "manoj"
    expect(matchPerson('Nobody', people)).toBeNull();
    expect(matchPerson('', people)).toBeNull();
  });

  it('maps most of the programme\'s team against the real staff list, with no wrong matches', () => {
    const text = readFileSync(join(__dirname, '../../../staff.txt'), 'utf8');
    const staff = readStaffList(text, { domain: 'startuptn.in', withPhones: false, today: '2026-11-18' }).people
      .map((p, i) => ({ id: String(i), fullName: p.fullName, email: p.email }));
    const names = [...new Set(PROGRAMME.projects.flatMap((p) => p.team.map((t) => t.person)))];
    const hit = names.filter((n) => matchPerson(n, staff) !== null);
    expect(hit.length / names.length).toBeGreaterThan(0.75);
    // Every match must be the right person: the name is the start of the matched person's name or email.
    for (const n of hit) {
      const s = staff.find((x) => x.id === matchPerson(n, staff))!;
      const probe = (n === 'ezhlil' ? 'ezhilarasan' : n === 'saktivel' ? 'sakthivel' : n === 'sentamil' ? 'senthamil' : n === 'prashanti' ? 'prashanthi' : n === 'karuppannan' ? 'karuppanan' : n).slice(0, 5);
      expect(`${s.fullName} ${s.email}`.toLowerCase()).toContain(probe);
    }
  });
});
