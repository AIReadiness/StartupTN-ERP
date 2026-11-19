/**
 * The Project Tracking tool named people by first name ("Nikunj", "Dhivya"). The ERP knows them by employee record.
 * A name is matched to an employee by, in order: the part of the official email before the @, then the first word of
 * the full name, then a short list of spellings the old tool used. A name that matches nobody — or more than one
 * person — is left unmapped and reported, so HR can map it by hand in Resources; nothing is guessed.
 */
export interface PersonRow {
  id: string;
  fullName: string;
  email: string;
}

/** Spellings in the old tool that differ from the employee's official email or first name. */
export const NAME_ALIASES: Record<string, string> = {
  ezhlil: 'ezhilarasan',
  saktivel: 'sakthivel',
  sentamil: 'senthamil',
  prashanti: 'prashanthi',
  karuppannan: 'karuppanan',
};

const local = (email: string) => email.split('@')[0].trim().toLowerCase();
const first = (name: string) => name.trim().split(/\s+/)[0]?.toLowerCase() ?? '';

export function matchPerson(name: string, people: PersonRow[]): string | null {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  const keys = [key, NAME_ALIASES[key]].filter((k): k is string => !!k);
  for (const k of keys) {
    const byEmail = people.filter((p) => local(p.email) === k);
    if (byEmail.length === 1) return byEmail[0].id;
    if (byEmail.length > 1) return null;
    const byFirst = people.filter((p) => first(p.fullName) === k);
    if (byFirst.length === 1) return byFirst[0].id;
    if (byFirst.length > 1) return null;
  }
  return null;
}
