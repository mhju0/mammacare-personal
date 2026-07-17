import type { Baby, Checkin, Food, Reaction, Trial } from './schema';

// Demo fixture: ~45 days of realistic weaning history so the app looks
// lived-in for portfolio demos. Inserted only when EXPO_PUBLIC_DEMO=1 and
// the DB has no baby row (see seed.ts). Deterministic 'demo-' ids.
//
// Realism rules mirrored from the app's own flows:
// - safe trials end exactly when the window elapses (confirm at 09:00),
//   so a back-to-back next trial may start at the same instant (autoclose).
// - reacted trials end at the reaction moment.
// - one active trial at the end (tofu, day 2 of 3) so Home shows the
//   dashboard with the 이상 없음 button live.

type Spec = {
  foodId: string;
  start: number; // days ago, trial starts 09:00
  outcome: Trial['outcome']; // null = active
  checkins?: number[]; // days ago, 19:00
  reaction?: {
    daysAgo: number; // occurs 14:30
    symptoms: string[];
    severity: Reaction['severity'];
    note: string | null;
  };
};

const WINDOW = 3;

const PLAN: Spec[] = [
  { foodId: 'rice', start: 45, outcome: 'safe' },
  { foodId: 'sweetpotato', start: 42, outcome: 'safe', checkins: [41, 40] },
  { foodId: 'pumpkin', start: 39, outcome: 'safe', checkins: [38] },
  { foodId: 'potato', start: 35, outcome: 'safe', checkins: [34, 33] },
  { foodId: 'carrot', start: 32, outcome: 'safe', checkins: [31] },
  { foodId: 'zucchini', start: 29, outcome: 'safe', checkins: [28, 27] },
  { foodId: 'broccoli', start: 26, outcome: 'safe', checkins: [25] },
  { foodId: 'apple', start: 22, outcome: 'safe', checkins: [21, 20] },
  { foodId: 'pear', start: 19, outcome: 'safe', checkins: [18] },
  { foodId: 'banana', start: 16, outcome: 'safe', checkins: [15, 14] },
  {
    foodId: 'wheat', start: 13, outcome: 'reacted',
    reaction: { daysAgo: 12, symptoms: ['diarrhea'], severity: 'mild', note: '묽은 변 두 번, 이틀 뒤 회복' },
  },
  { foodId: 'beef', start: 11, outcome: 'safe', checkins: [10, 9] },
  {
    foodId: 'egg', start: 8, outcome: 'reacted', checkins: [8],
    reaction: { daysAgo: 7, symptoms: ['hives', 'swelling'], severity: 'moderate', note: '볼과 목에 두드러기, 1시간 후 가라앉음' },
  },
  { foodId: 'whitefish', start: 6, outcome: 'cancelled' },
  { foodId: 'chicken', start: 5, outcome: 'safe', checkins: [4, 3] },
  { foodId: 'tofu', start: 1, outcome: null, checkins: [1] },
];

export function buildDemoHistory(now: Date): {
  babyRow: Baby;
  foods: Food[];
  trials: Trial[];
  reactions: Reaction[];
  checkins: Checkin[];
} {
  const at = (daysAgo: number, hour: number, minute = 0): Date => {
    const d = new Date(now.getTime() - daysAgo * 86_400_000);
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  const trials: Trial[] = [];
  const reactions: Reaction[] = [];
  const checkins: Checkin[] = [];

  PLAN.forEach((s, i) => {
    const id = `demo-t${i + 1}`;
    let endedAt: Date | null = null;
    if (s.outcome === 'safe') endedAt = at(s.start - WINDOW, 9);
    if (s.outcome === 'cancelled') endedAt = at(s.start, 17);
    if (s.reaction) {
      const occurredAt = at(s.reaction.daysAgo, 14, 30);
      endedAt = occurredAt;
      reactions.push({
        id: `demo-r${i + 1}`, trialId: id, occurredAt,
        symptoms: s.reaction.symptoms, severity: s.reaction.severity, note: s.reaction.note,
      });
    }
    trials.push({ id, foodId: s.foodId, startedAt: at(s.start, 9), windowDays: WINDOW, outcome: s.outcome, endedAt });
    (s.checkins ?? []).forEach((d, j) =>
      checkins.push({ id: `demo-c${i + 1}-${j}`, trialId: id, occurredAt: at(d, 19), note: null }),
    );
  });

  return {
    babyRow: { id: 'demo-baby', name: '하율', birthdate: at(240, 0), defaultWindowDays: WINDOW },
    foods: [{ id: 'demo-food-quinoa', name: '퀴노아', isCustom: true, allergenGroup: null }],
    trials, reactions, checkins,
  };
}
