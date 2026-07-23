import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCheckins, useFoodsWithStatus, useReactions } from '../src/data/queries';
import { dayMark, monthMatrix, sameLocalDay, sortDayEvents } from '../src/domain/calendar';
import { foodLabel } from '../src/i18n';
import type { Food } from '../src/db/schema';
import { colors, layout } from '../src/ui/tokens';

const eyebrowStyle = { fontSize: 10, fontWeight: '700' as const, letterSpacing: 2.2, color: colors.muted, paddingBottom: 12 };
// alignItems flex-end right-hugs the ‹ › glyphs so the next control lands on the
// grid's right edge (the tap targets stay 44pt; only the glyph shifts within).
const navBtnStyle = { minWidth: 44, minHeight: 44, alignItems: 'flex-end' as const, justifyContent: 'center' as const };
const weekdayKeys = ['w0', 'w1', 'w2', 'w3', 'w4', 'w5', 'w6'] as const;

type EventRow = { key: string; at: Date; color: string; text: string };

export default function Calendar() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const foods = useFoodsWithStatus();
  const reactions = useReactions();
  const checkins = useCheckins();

  const [display, setDisplay] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month0: d.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const goPrevMonth = () =>
    setDisplay(({ year, month0 }) => (month0 === 0 ? { year: year - 1, month0: 11 } : { year, month0: month0 - 1 }));
  const goNextMonth = () =>
    setDisplay(({ year, month0 }) => (month0 === 11 ? { year: year + 1, month0: 0 } : { year, month0: month0 + 1 }));

  const cells = useMemo(() => monthMatrix(display.year, display.month0), [display.year, display.month0]);
  const weeks = useMemo(() => {
    const w = [];
    for (let i = 0; i < cells.length; i += 7) w.push(cells.slice(i, i + 7));
    return w;
  }, [cells]);

  const allTrials = useMemo(() => foods.flatMap((f) => f.trials), [foods]);
  // Cancelled trials are invisible on the calendar (owner decision 2026-07-23):
  // no rows, no dots. Their full history stays on the food detail page.
  const cancelledIds = useMemo(
    () => new Set(allTrials.filter((tr) => tr.outcome === 'cancelled').map((tr) => tr.id)),
    [allTrials],
  );
  const reactionDays = useMemo(() => reactions.map((r) => r.occurredAt), [reactions]);
  const checkinDays = useMemo(
    () => checkins.filter((c) => !cancelledIds.has(c.trialId)).map((c) => c.occurredAt),
    [checkins, cancelledIds],
  );
  const foodByTrialId = useMemo(() => {
    const m = new Map<string, Food>();
    for (const { food, trials } of foods) for (const tr of trials) m.set(tr.id, food);
    return m;
  }, [foods]);

  const events = useMemo(() => {
    const rows: EventRow[] = [];
    for (const { food, trials } of foods) {
      const label = foodLabel(food);
      for (const tr of trials) {
        if (tr.outcome === 'cancelled') continue;
        if (sameLocalDay(tr.startedAt, selectedDate)) {
          rows.push({ key: `start-${tr.id}`, at: tr.startedAt, color: colors.amber, text: `${label} — ${t('calendar.trialStart')}` });
        }
        // outcome 'reacted' is skipped here — the matching reaction row below already covers that moment.
        if (tr.outcome === 'safe' && tr.endedAt && sameLocalDay(tr.endedAt, selectedDate)) {
          rows.push({ key: `end-${tr.id}`, at: tr.endedAt, color: colors.green, text: `${label} — ${t('food.outcome.safe')}` });
        }
      }
    }
    for (const r of reactions) {
      if (!sameLocalDay(r.occurredAt, selectedDate)) continue;
      const label = foodByTrialId.has(r.trialId) ? foodLabel(foodByTrialId.get(r.trialId)!) : '';
      const symptoms = r.symptoms.map((s) => t(`reaction.symptom.${s}`)).join(', ');
      rows.push({
        key: `reaction-${r.id}`, at: r.occurredAt, color: colors.red,
        text: `${label} — ${t(`reaction.severityLevel.${r.severity}`)} · ${symptoms}`,
      });
    }
    for (const c of checkins) {
      if (cancelledIds.has(c.trialId) || !sameLocalDay(c.occurredAt, selectedDate)) continue;
      const label = foodByTrialId.has(c.trialId) ? foodLabel(foodByTrialId.get(c.trialId)!) : '';
      rows.push({ key: `checkin-${c.id}`, at: c.occurredAt, color: colors.green, text: `${label} — ${t('food.checkinClear')}` });
    }
    return sortDayEvents(rows);
  }, [foods, reactions, checkins, foodByTrialId, cancelledIds, selectedDate, t]);

  return (
    <ScrollView contentContainerStyle={{ padding: 22, paddingTop: insets.top + 4, backgroundColor: colors.paper }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text style={eyebrowStyle}>
          <Text style={{ color: colors.muted }}>‹ </Text>
          {t('calendar.title')}
        </Text>
      </Pressable>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <Text style={{ fontSize: 30, fontWeight: '900', color: colors.ink, letterSpacing: -0.3, paddingLeft: layout.rowInset }}>
          {t('calendar.monthTitle', { year: display.year, month: display.month0 + 1 })}
        </Text>
        <View style={{ flexDirection: 'row' }}>
          <Pressable accessibilityRole="button" onPress={goPrevMonth} style={navBtnStyle}>
            <Text style={{ fontSize: 18, color: colors.muted }}>‹</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={goNextMonth} style={navBtnStyle}>
            <Text style={{ fontSize: 18, color: colors.muted }}>›</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderColor: colors.hairline }}>
        {weekdayKeys.map((wk, i) => (
          <Text
            key={wk}
            style={{ flex: 1, textAlign: 'center', fontSize: 10.5, fontWeight: '800', color: i === 0 ? colors.red : colors.muted }}
          >
            {t(`calendar.weekday.${wk}`)}
          </Text>
        ))}
      </View>

      <View style={{ paddingTop: 6 }}>
        {weeks.map((week, wi) => (
          <View key={wi} style={{ flexDirection: 'row' }}>
            {week.map((cell) => {
              const mark = dayMark(cell.date, allTrials, reactionDays, checkinDays);
              const isSelected = sameLocalDay(cell.date, selectedDate);
              const bg = mark.tint === 'amber' ? colors.amberTint : mark.tint === 'red' ? colors.redTint : 'transparent';
              const fg = !cell.inMonth ? colors.dayOutMonth : mark.tint === 'amber' ? colors.amber : mark.tint === 'red' ? colors.red : colors.ink;
              return (
                <Pressable
                  key={cell.date.toISOString()}
                  accessibilityRole="button"
                  onPress={() => setSelectedDate(cell.date)}
                  style={{
                    flex: 1, aspectRatio: 1, margin: 1.5, borderRadius: 9,
                    backgroundColor: bg, alignItems: 'center', justifyContent: 'center',
                    borderWidth: isSelected ? 2 : 0, borderColor: colors.ink,
                  }}
                >
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: fg }}>{cell.date.getDate()}</Text>
                  {mark.dot && (
                    <View
                      style={{
                        // Dot sits in the lower gap, centered between the digit's
                        // bottom and the cell floor. Positioned as a share of cell
                        // height (cells are aspectRatio 1) so it holds at any size.
                        position: 'absolute', bottom: '18%', width: 4, height: 4, borderRadius: 999,
                        backgroundColor: mark.dot === 'red' ? colors.red : colors.green,
                      }}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10, paddingLeft: layout.rowInset }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: colors.amberTint }} />
          <Text style={{ fontSize: 11, color: colors.muted }}>{t('calendar.legendWindow')}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: colors.redTint }} />
          <Text style={{ fontSize: 11, color: colors.muted }}>{t('calendar.legendReaction')}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 5, height: 5, borderRadius: 999, backgroundColor: colors.green }} />
          <Text style={{ fontSize: 11, color: colors.muted }}>{t('calendar.legendRecord')}</Text>
        </View>
      </View>

      <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1.5, color: colors.muted, marginTop: 18, marginBottom: 4, paddingLeft: layout.rowInset }}>
        {selectedDate.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}
      </Text>
      {events.length === 0 ? (
        <Text style={{ fontSize: 14, color: colors.muted, paddingVertical: 12, paddingLeft: layout.rowInset }}>{t('calendar.noEvents')}</Text>
      ) : (
        events.map((ev) => (
          <View
            key={ev.key}
            style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingVertical: 9, paddingHorizontal: layout.rowInset, borderBottomWidth: 1, borderColor: colors.hairline }}
          >
            <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: ev.color }} />
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: ev.color, flexShrink: 1 }}>{ev.text}</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginLeft: 'auto' }}>
              {ev.at.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}
