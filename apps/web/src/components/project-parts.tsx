'use client';

import { Badge, cx } from '@/components/ui';
import { pctTone } from '@/lib/projects';

/** A thin progress bar for a KPI or a project, 0 to 100. */
export function Bar({ pct, label }: { pct: number; label: string }) {
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="h-2 overflow-hidden rounded-full bg-wash">
      <div className={cx('h-full rounded-full', pct >= 50 ? 'bg-peacock' : 'bg-marigold')} style={{ width: `${pct}%` }} />
    </div>
  );
}

export const PctBadge = ({ pct }: { pct: number }) => <Badge tone={pctTone(pct)}>{pct}%</Badge>;

export function StatusChip({ status }: { status: string }) {
  if (status === 'approved') return <Badge tone="peacock">Approved</Badge>;
  if (status === 'rejected') return <Badge tone="kumkum">Declined</Badge>;
  return <Badge tone="marigold">Waiting for review</Badge>;
}

/** "3 AVP · Project Lead" style chip for a person's role on a project. */
export const RoleChip = ({ children }: { children: React.ReactNode }) => <Badge tone="indigo">{children}</Badge>;
