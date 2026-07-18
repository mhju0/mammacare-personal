import { monthMatrix, sameLocalDay, dayMark, sortDayEvents, type DayCell } from './calendar';
import type { TrialLike } from './status';

const D = (s: string) => new Date(s);
let n = 0;
const mk = (over: Partial<TrialLike>): TrialLike => ({
  id: `t${n++}`, startedAt: D('2026-07-16T09:00:00'), windowDays: 3, outcome: null, ...over,
});

describe('monthMatrix', () => {
  test('2026-07 starts Wednesday: 3 leading out-month cells, 31 in-month days, total divisible by 7', () => {
    const cells = monthMatrix(2026, 6); // July = month0 6
    expect(cells.length % 7).toBe(0);
    const leading = cells.slice(0, 3);
    expect(leading.every((c) => c.inMonth === false)).toBe(true);
    expect(cells[3].inMonth).toBe(true);
    expect(cells[3].date.getDate()).toBe(1);
    expect(cells[3].date.getMonth()).toBe(6);
    const inMonthDays = cells.filter((c) => c.inMonth);
    expect(inMonthDays.length).toBe(31);
    expect(inMonthDays[30].date.getDate()).toBe(31);
  });

  test('2026-02 starts Sunday and has exactly 28 days: no leading/trailing padding, exactly 4 weeks', () => {
    const cells = monthMatrix(2026, 1); // Feb = month0 1
    expect(cells.length).toBe(28);
    expect(cells.every((c) => c.inMonth === true)).toBe(true);
    expect(cells[0].date.getDay()).toBe(0); // Sunday
    expect(cells[0].date.getDate()).toBe(1);
    expect(cells[27].date.getDate()).toBe(28);
  });

  test('weeks start Sunday — every 7th cell from index 0 is a Sunday', () => {
    const cells = monthMatrix(2026, 6);
    for (let i = 0; i < cells.length; i += 7) {
      expect(cells[i].date.getDay()).toBe(0);
    }
  });
});

describe('sameLocalDay', () => {
  test('23:59 vs 00:01 the next day → false', () => {
    expect(sameLocalDay(D('2026-07-16T23:59:00'), D('2026-07-17T00:01:00'))).toBe(false);
  });
  test('same calendar day, different times → true', () => {
    expect(sameLocalDay(D('2026-07-16T00:01:00'), D('2026-07-16T23:59:00'))).toBe(true);
  });
});

describe('dayMark', () => {
  const trial = mk({ startedAt: D('2026-07-16T09:00:00'), windowDays: 3, outcome: null }); // window 16-19 inclusive

  test('reaction on the day → red tint + red dot, even inside a trial window (red beats amber)', () => {
    const mark = dayMark(D('2026-07-16T12:00:00'), [trial], [D('2026-07-16T20:00:00')], []);
    expect(mark).toEqual({ tint: 'red', dot: 'red' });
  });

  test('day inside non-cancelled trial window, no reaction, no checkin → amber tint, no dot', () => {
    const mark = dayMark(D('2026-07-18T12:00:00'), [trial], [], []);
    expect(mark).toEqual({ tint: 'amber', dot: null });
  });

  test('day inside trial window with a checkin that day → amber tint, green dot', () => {
    const mark = dayMark(D('2026-07-17T12:00:00'), [trial], [], [D('2026-07-17T08:00:00')]);
    expect(mark).toEqual({ tint: 'amber', dot: 'green' });
  });

  test('trial end-of-window day (startedAt + windowDays) is included in the tinted range', () => {
    const mark = dayMark(D('2026-07-19T00:00:01'), [trial], [], []);
    expect(mark.tint).toBe('amber');
  });

  test('day outside any trial window, no reaction, no checkin → no tint, no dot', () => {
    const mark = dayMark(D('2026-07-25T12:00:00'), [trial], [], []);
    expect(mark).toEqual({ tint: null, dot: null });
  });

  test('cancelled trial does not tint its window', () => {
    const cancelled = mk({ startedAt: D('2026-07-16T09:00:00'), windowDays: 3, outcome: 'cancelled' });
    const mark = dayMark(D('2026-07-17T12:00:00'), [cancelled], [], []);
    expect(mark).toEqual({ tint: null, dot: null });
  });

  test('checkin day outside any window still surfaces a green dot with no tint', () => {
    const mark = dayMark(D('2026-08-01T12:00:00'), [trial], [], [D('2026-08-01T08:00:00')]);
    expect(mark).toEqual({ tint: null, dot: 'green' });
  });
});

describe('sortDayEvents', () => {
  test('same instant: a trial close (안전 확인) lists before the next trial start (테스트 시작), then later events follow', () => {
    const at9 = D('2026-07-10T09:00:00'); // 소고기 window closes safe, 달걀 trial starts — same morning
    const at19 = D('2026-07-10T19:00:00'); // 달걀 check-in that evening
    // Insertion order mirrors the component (start pushed before end when 달걀 precedes 소고기 in the food list).
    const rows = [
      { key: 'start-egg', at: at9 },
      { key: 'end-beef', at: at9 },
      { key: 'checkin-egg', at: at19 },
    ];
    expect(sortDayEvents(rows).map((r) => r.key)).toEqual(['end-beef', 'start-egg', 'checkin-egg']);
  });

  test('does not reorder events at distinct times', () => {
    const rows = [
      { key: 'checkin-egg', at: D('2026-07-10T19:00:00') },
      { key: 'start-egg', at: D('2026-07-10T09:00:00') },
    ];
    expect(sortDayEvents(rows).map((r) => r.key)).toEqual(['start-egg', 'checkin-egg']);
  });
});

// type-only sanity: DayCell shape used above
const _shapeCheck: DayCell = { date: new Date(), inMonth: true };
void _shapeCheck;
