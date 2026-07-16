import { Alert, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useBaby, useFoodsWithStatus, useReactions } from '../../src/data/queries';
import { cancelTrial, confirmSafe, startTrial } from '../../src/data/mutations';
import { ensurePermission } from '../../src/services/notify';
import { foodLabel } from '../../src/i18n';
import { isWindowElapsed } from '../../src/domain/status';
import { Button } from '../../src/ui/Button';
import { StatusChip } from '../../src/ui/StatusChip';
import { colors } from '../../src/ui/tokens';

export default function FoodDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const baby = useBaby();
  const foods = useFoodsWithStatus();
  const reactions = useReactions();
  const starting = useRef(false);

  const entry = foods.find((f) => f.food.id === id);
  if (!entry || !baby) return null;

  const { food, trials, status, latest } = entry;
  const now = new Date();
  const windowDays = baby.defaultWindowDays;
  const activeHere = latest && latest.outcome === null ? latest : undefined;

  const onStart = async () => {
    if (starting.current) return;
    starting.current = true;
    try {
      await ensurePermission(); // contextual ask; denial degrades gracefully
      const res = await startTrial(food.id, foodLabel(food), windowDays, new Date());
      if (!res.ok) Alert.alert(t('food.trialBlocked'));
    } finally {
      starting.current = false;
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
      <Stack.Screen options={{ title: foodLabel(food) }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <StatusChip status={status} />
        {food.allergenGroup && (
          <Text style={{ fontSize: 12, color: colors.danger, fontWeight: '600' }}>
            ⚠ {t('foods.highRisk')}
          </Text>
        )}
      </View>

      {activeHere ? (
        <View style={{ gap: 8 }}>
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
        <View style={{ gap: 8 }}>
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

      <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{t('food.history')}</Text>
      {trials.length === 0 && (
        <Text style={{ fontSize: 14, color: colors.textMuted }}>{t('food.noHistory')}</Text>
      )}
      {[...trials].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).map((tr) => (
        <View key={tr.id} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 12, gap: 4 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
            {tr.outcome ? t(`food.outcome.${tr.outcome}`) : t('status.testing')}
          </Text>
          <Text style={{ fontSize: 12, color: colors.textMuted }}>
            {t('food.startedOn', { date: tr.startedAt.toLocaleDateString('ko-KR') })}
          </Text>
          {reactions.filter((r) => r.trialId === tr.id).map((r) => (
            <Text key={r.id} style={{ fontSize: 12, color: colors.danger }}>
              {t(`reaction.severityLevel.${r.severity}`)} · {r.symptoms.map((s) => t(`reaction.symptom.${s}`)).join(', ')}
              {r.note ? ` — ${r.note}` : ''}
            </Text>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}
