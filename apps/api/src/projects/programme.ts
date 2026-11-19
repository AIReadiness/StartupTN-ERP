import seed from '../db/project-seed.json';

export interface ProgrammeProject {
  code: string;
  group: string;
  name: string;
  budget: string;
  kpis: { name: string; target: number; unit: string }[];
  milestones: { title: string; due: string }[];
  team: { person: string; designation: string }[];
}

/** The FY 2026-27 annual work programme: projects, KPI targets, milestones and who is mapped to what (from the Project Mastersheet). */
export const PROGRAMME = seed as { fy: string; groups: string[]; designations: string[]; projects: ProgrammeProject[] };
export const GROUPS = PROGRAMME.groups;
export const DESIGNATIONS = PROGRAMME.designations;
