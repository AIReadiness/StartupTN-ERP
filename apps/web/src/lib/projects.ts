import type { Tone } from '@/components/ui';

export interface ProjectSummary {
  id: string; code: string; group: string; name: string; budget: string | null; fy: string; status: 'active' | 'locked';
  kpiCount: number; kpiPct: number | null; milestones: { done: number; total: number }; members: number; pending: number; completed: boolean;
}

export interface ProjectEntry { id: string; employeeId: string; employeeName: string; value: number; note: string | null; date: string; status: 'pending' | 'approved' | 'rejected' }
export interface ProjectKpi { id: string; kraId: string | null; name: string; target: number; unit: string; approved: number; pct: number; entries: ProjectEntry[] }
export interface ProjectMilestone {
  id: string; title: string; due: string | null; done: boolean;
  report: { text: string; status: 'draft' | 'submitted' | 'approved' | 'returned'; by: string | null; byName: string | null; at: string | null } | null;
}
export interface ProjectMember { employeeId: string; fullName: string; empCode: string; designation: string }

export interface ProjectDetail {
  project: Pick<ProjectSummary, 'id' | 'code' | 'group' | 'name' | 'budget' | 'fy' | 'status'>;
  members: ProjectMember[]; kras: { id: string; title: string }[]; kpis: ProjectKpi[]; milestones: ProjectMilestone[];
  completed: boolean; pending: number;
  me: { isAdmin: boolean; isMember: boolean; canEnter: boolean };
}

export interface CompletedProject extends Pick<ProjectSummary, 'id' | 'code' | 'group' | 'name' | 'budget' | 'fy' | 'status'> {
  members: ProjectMember[];
  kpis: Omit<ProjectKpi, 'entries'>[];
  milestones: ProjectMilestone[];
}

export interface ProjectMapping {
  designations: string[];
  projects: (Pick<ProjectSummary, 'id' | 'code' | 'group' | 'name' | 'budget' | 'status'> & { members: ProjectMember[] })[];
  people: { id: string; fullName: string; empCode: string; designation: string | null; projects: { id: string; code: string; name: string; designation: string }[] }[];
}

export const GROUPS = ['Funding', 'Venture Studio', 'Catalyst', 'Artificial Intelligence', 'Enabling Horizontals'];

/** Projects in the order of the programme's groups, with anything in another group last. */
export function byGroup<T extends { group: string }>(items: T[]): { group: string; items: T[] }[] {
  const names = [...GROUPS, ...items.map((i) => i.group).filter((g) => !GROUPS.includes(g))];
  return [...new Set(names)].map((group) => ({ group, items: items.filter((i) => i.group === group) })).filter((g) => g.items.length > 0);
}

export const pctTone = (pct: number): Tone => (pct >= 50 ? 'peacock' : 'marigold');

export const REPORT_LABEL: Record<string, [Tone, string]> = {
  draft: ['marigold', 'Report in draft'],
  submitted: ['peacock', 'Submitted, waiting for an admin'],
  approved: ['peacock', 'Report approved'],
  returned: ['kumkum', 'Returned for changes'],
};
