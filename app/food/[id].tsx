import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBaby, useFoodsWithStatus, useReactions } from '../../src/data/queries';
import { cancelTrial, confirmSafe, startTrial } from '../../src/data/mutations';
import { ensurePermission } from '../../src/services/notify';
import { foodLabel } from '../../src/i18n';
import { isWindowElapsed, MS_PER_DAY } from '../../src/domain/status';
import { Button } from '../../src/ui/Button';
import { colors, statusIcon } from '../../src/ui/tokens';

const eyebrowStyle = { fontSize: 10, fontWeight: '700' as const, letterSpacing: 2.2, color: colors.muted, paddingBottom: 12 };

export default function FoodDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const baby = useBaby();
  const foods = useFoodsWithStatus();
  const reactions = useReactions();
  const starting = useRef(false);
  const [, setTick] = useState(0);
  useFocusEffect(useCallback(() => setTick((x) => x + 1), []));

  const entry = foods.find((f) => f.food.id === id);
  if (!entry || !baby) return null;

  const { food, trials, status, latest } = entry;
  const now = new Date();
  const windowDays = baby.defaultWindowDays;
  const activeHere = latest && latest.outcome === null ? latest : undefined;
  const fg = colors.status[status].fg;

  const onStart = async () => {
    if (starting.current) return;
    starting.current = true;
    try {
      await ensurePermission(); // contextual ask; denial degrades gracefully
      const res = await startTrial(food.id, foodLabel(food), windowDays, new Date());
      if (!res.ok) Alert.alert(t('food.trialBlocked'));
    } catch {
      Alert.alert(t('errors.generic'));
    } finally {
      starting.current = false;
    }
  };

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
          <Button label={t('food.cancelTrial')} variant="danger"
            onPress={() => cancelTrial(activeHere.id, new Date())} />
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
        <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1.5, color: colors.muted, marginBottom: 6 }}>
          {t('food.history')}
        </Text>
        {trials.length === 0 && (
          <Text style={{ fontSize: 14, color: colors.muted }}>{t('food.noHistory')}</Text>
        )}
        {trials.length > 0 && (
          <View style={{ borderLeftWidth: 2, borderColor: colors.hairline, marginLeft: 5, paddingLeft: 14, gap: 16, marginTop: 6 }}>
            {[...trials].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).map((tr) => {
              const dotColor = tr.outcome === 'reacted' ? colors.red
                : tr.outcome === 'safe' ? colors.green
                  : tr.outcome === 'cancelled' ? colors.muted
                    : colors.amber;
              return (
                <View key={tr.id} style={{ position: 'relative' }}>
                  <View
                    style={{
                      position: 'absolute', left: -19, top: 4, width: 9, height: 9,
                      borderRadius: 999, backgroundColor: dotColor,
                    }}
                  />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>
                    {tr.outcome ? t(`food.outcome.${tr.outcome}`) : t('status.testing')}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                    {t('food.startedOn', { date: tr.startedAt.toLocaleDateString('ko-KR') })}
                  </Text>
                  {reactions.filter((r) => r.trialId === tr.id).map((r) => (
                    <Text key={r.id} style={{ fontSize: 12, color: colors.red, marginTop: 2 }}>
                      {t(`reaction.severityLevel.${r.severity}`)} · {r.symptoms.map((s) => t(`reaction.symptom.${s}`)).join(', ')}
                      {r.note ? ` — ${r.note}` : ''}
                    </Text>
                  ))}
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
