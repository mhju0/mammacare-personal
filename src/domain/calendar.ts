import { windowEnd, isSameLocalDay, type TrialLike } from './status';

export type DayCell = { date: Date; inMonth: boolean };

export function monthMatrix(year: number, month0: number): DayCell[] {
  const startWeekday = new Date(year, month0, 1).getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
  return Array.from({ length: totalCells }, (_, i) => {
    const dayOfMonth = i - startWeekday + 1;
    return { date: new Date(year, month0, dayOfMonth), inMonth: dayOfMonth >= 1 && dayOfMonth <= daysInMonth };
  });
}

export const sameLocalDay = isSameLocalDay;

function localDayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function isInTrialWindow(date: Date, t: TrialLike): boolean {
  const day = localDayStart(date);
  return day >= localDayStart(t.startedAt) && day <= localDayStart(windowEnd(t));
}

// Order a single day's calendar events chronologically. At the same instant a
// trial's start must list AFTER every other event, so the autoclose→next-start
// handoff reads close-then-open (e.g. 소고기 안전 확인 before 달걀 테스트 시작 at
// 09:00) instead of interleaving the two foods. Event keys are kind-prefixed.
export function sortDayEvents<T extends { at: Date; key: string }>(rows: T[]): T[] {
  const startsLast = (key: string) => (key.startsWith('start-') ? 1 : 0);
  return [...rows].sort((a, b) => a.at.getTime() - b.at.getTime() || startsLast(a.key) - startsLast(b.key));
}

export type DayMark = { tint: 'amber' | 'green' | 'red' | null; dot: 'red' | 'green' | null };

export function dayMark(date: Date, trials: TrialLike[], reactionDays: Date[], checkinDays: Date[]): DayMark {
  if (reactionDays.some((d) => sameLocalDay(d, date))) return { tint: 'red', dot: 'red' };

  const checkedIn = checkinDays.some((d) => sameLocalDay(d, date));
  const inWindow = trials.some((t) => t.outcome !== 'cancelled' && isInTrialWindow(date, t));
  if (inWindow) return { tint: 'amber', dot: checkedIn ? 'green' : null };
  return { tint: null, dot: checkedIn ? 'green' : null };
}
