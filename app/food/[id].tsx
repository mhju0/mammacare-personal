import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBaby, useCheckins, useFoodsWithStatus, useReactions } from '../../src/data/queries';
import { cancelTrial, confirmSafe } from '../../src/data/mutations';
import { useStartTrialFlow } from '../../src/data/useStartTrialFlow';
import { foodLabel } from '../../src/i18n';
import { isWindowElapsed, MS_PER_DAY } from '../../src/domain/status';
import { Button } from '../../src/ui/Button';
import { CheckinPill } from '../../src/ui/CheckinPill';
import { colors, layout, statusIcon } from '../../src/ui/tokens';

const eyebrowStyle = { fontSize: 10, fontWeight: '700' as const, letterSpacing: 2.2, color: colors.muted, paddingBottom: 12 };

export default function FoodDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const baby = useBaby();
  const foods = useFoodsWithStatus();
  const reactions = useReactions();
  const checkins = useCheckins();
  const [, setTick] = useState(0);
  useFocusEffect(useCallback(() => setTick((x) => x + 1), []));

  const entry = foods.find((f) => f.food.id === id);
  const startFlow = useStartTrialFlow(foods, baby?.defaultWindowDays ?? 3);
  if (!entry || !baby) return null;

  const { food, trials, status, latest } = entry;
  const now = new Date();
  const windowDays = baby.defaultWindowDays;
  const activeHere = latest && latest.outcome === null ? latest : undefined;
  const fg = colors.status[status].fg;

  const onStart = () => startFlow(food);

  const testingElapsed = latest && status === 'testing' ? isWindowElapsed(latest, now) : false;
  const testingDay = latest && status === 'testing'
    ? Math.min(latest.windowDays, Math.floor((now.getTime() - latest.startedAt.getTime()) / MS_PER_DAY) + 1)
    : 0;
  const fraction = status === 'testing' && latest ? Math.min(1, testingDay / latest.windowDays) : 1;

  const latestReaction = latest ? reactions.find((r) => r.trialId === latest.id) : undefined;
  const subline =
    status === 'reacted' && latestReaction
      ? `${statusIcon.reacted} ${t('status.reacted')} · ${t(`reaction.severityLevel.${latestReaction.severity}`)} · ${latestReaction.symptoms.map((s) => t(`reaction.symptom.${s}`)).join(', ')}`
      : status === 'testing' && latest
        ? `${statusIcon.testing} ${t('status.testing')} · ${t('home.dayOf', { day: testingDay, total: latest.windowDays })}`
        : `${statusIcon[status]} ${t(`status.${status}`)}`;

  // Flat, newest-first history — every record (trial start, check-in, reaction,
  // outcome) is its own big bullet, mirroring the calendar's day-detail model.
  // A reacted trial's end is skipped: the reaction row already marks that moment.
  const trialIds = new Set(trials.map((tr) => tr.id));
  const historyRows: { key: string; at: Date; color: string; outline: boolean; label: string; detail?: string }[] = [];
  for (const tr of trials) {
    historyRows.push({ key: `start-${tr.id}`, at: tr.startedAt, color: colors.amber, outline: false, label: t('calendar.trialStart') });
    if (tr.outcome === 'safe' && tr.endedAt) {
      historyRows.push({ key: `end-${tr.id}`, at: tr.endedAt, color: colors.green, outline: false, label: t('food.outcome.safe') });
    } else if (tr.outcome === 'cancelled' && tr.endedAt) {
      historyRows.push({ key: `end-${tr.id}`, at: tr.endedAt, color: colors.muted, outline: true, label: t('food.outcome.cancelled') });
    }
  }
  for (const r of reactions) {
    if (!trialIds.has(r.trialId)) continue;
    historyRows.push({
      key: `reaction-${r.id}`, at: r.occurredAt, color: colors.red, outline: false, label: t('food.outcome.reacted'),
      detail: `${t(`reaction.severityLevel.${r.severity}`)} · ${r.symptoms.map((s) => t(`reaction.symptom.${s}`)).join(', ')}${r.note ? ` — ${r.note}` : ''}`,
    });
  }
  for (const c of checkins) {
    if (!trialIds.has(c.trialId)) continue;
    historyRows.push({ key: `checkin-${c.id}`, at: c.occurredAt, color: colors.green, outline: false, label: t('food.checkinClear') });
  }
  historyRows.sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <ScrollView contentContainerStyle={{ padding: 22, paddingTop: insets.top + 4, gap: 20, backgroundColor: colors.paper }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text style={eyebrowStyle}>
          <Text style={{ color: colors.muted }}>‹ </Text>
          {t('foods.title')}
        </Text>
      </Pressable>

      <View>
        <Text style={{ fontSize: 52, fontWeight: '900', color: colors.ink, letterSpacing: -1, lineHeight: 54 }}>
          {foodLabel(food)}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: fg, flexShrink: 1 }}>{subline}</Text>
          {food.allergenGroup && (
            <Text
              style={{
                fontSize: 10, fontWeight: '800', color: colors.red, borderWidth: 1,
                borderColor: colors.red, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1,
              }}
            >
              {t('foods.highRisk')}
            </Text>
          )}
        </View>
        <View style={{ height: 3, backgroundColor: colors.hairline, borderRadius: 2, marginTop: 13, overflow: 'hidden' }}>
          <View style={{ height: 3, width: `${fraction * 100}%`, backgroundColor: fg }} />
        </View>
      </View>

      {activeHere ? (
        <View style={{ gap: 10 }}>
          {isWindowElapsed(activeHere, now) && (
            <Button label={t('home.markSafe')} onPress={() => confirmSafe(activeHere.id, new Date())} />
          )}
          <Button
            label={t('home.logReaction')}
            variant="secondary"
            onPress={() => router.push({ pathname: '/log-reaction', params: { foodId: food.id } })}
          />
          <CheckinPill foodId={food.id} trialId={activeHere.id} />
          <Button label={t('food.cancelTrial')} variant="danger"
            onPress={() => Alert.alert(
              t('food.cancelConfirmTitle', { food: foodLabel(food) }),
              t('food.cancelConfirmBody'),
              [
                { text: t('food.cancelTrial'), style: 'destructive', onPress: () => cancelTrial(activeHere.id, new Date()) },
                { text: t('food.close'), style: 'cancel' },
              ],
            )} />
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Button
            label={status === 'untried'
              ? t('food.startTrial', { days: windowDays })
              : t('food.retest', { days: windowDays })}
            onPress={onStart}
          />
          {status !== 'untried' && (
            <Button
              label={t('home.logReaction')}
              variant="secondary"
              onPress={() => router.push({ pathname: '/log-reaction', params: { foodId: food.id } })}
            />
          )}
        </View>
      )}

      <View>
        <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1.5, color: colors.muted, marginBottom: 4, paddingLeft: layout.rowInset }}>
          {t('food.history')}
        </Text>
        {historyRows.length === 0 ? (
          <Text style={{ fontSize: 14, color: colors.muted, paddingLeft: layout.rowInset }}>{t('food.noHistory')}</Text>
        ) : (
          historyRows.map((ev) => (
            <View
              key={ev.key}
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 11, paddingHorizontal: layout.rowInset, borderBottomWidth: 1, borderColor: colors.hairline }}
            >
              <View
                style={
                  ev.outline
                    ? { width: 9, height: 9, borderRadius: 999, borderWidth: 1.5, borderColor: colors.muted, marginTop: 4 }
                    : { width: 9, height: 9, borderRadius: 999, backgroundColor: ev.color, marginTop: 4 }
                }
              />
              <View style={{ flexShrink: 1 }}>
                <Text style={{ fontSize: 11.5, color: colors.muted }}>
                  {ev.at.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })} · {ev.at.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}
                </Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: ev.color, marginTop: 2 }}>{ev.label}</Text>
                {ev.detail && <Text style={{ fontSize: 12.5, color: colors.red, marginTop: 2 }}>{ev.detail}</Text>}
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
