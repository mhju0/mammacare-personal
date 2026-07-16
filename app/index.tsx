import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useBaby, useFoodsWithStatus } from '../src/data/queries';
import { confirmSafe, saveBaby } from '../src/data/mutations';
import { foodLabel } from '../src/i18n';
import { isWindowElapsed, MS_PER_DAY, type FoodStatus } from '../src/domain/status';
import { Button } from '../src/ui/Button';
import { StatusChip } from '../src/ui/StatusChip';
import { colors } from '../src/ui/tokens';

export default function Home() {
  const baby = useBaby();
  if (!baby) return <SetupCard />;
  return <Dashboard />;
}

function SetupCard() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [birthdate, setBirthdate] = useState(new Date());
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
      <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>{t('setup.title')}</Text>
      <Text style={{ fontSize: 15, color: colors.textMuted }}>{t('setup.intro')}</Text>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{t('setup.babyName')}</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 16 }}
      />
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{t('setup.birthdate')}</Text>
      <DateTimePicker
        locale="ko-KR"
        value={birthdate}
        mode="date"
        maximumDate={new Date()}
        onChange={(_, d) => d && setBirthdate(d)}
      />
      <Button
        label={t('setup.start')}
        disabled={name.trim().length === 0}
        onPress={() => saveBaby({ name: name.trim(), birthdate })}
      />
      <Text style={{ fontSize: 12, color: colors.textMuted }}>{t('setup.disclaimer')}</Text>
    </ScrollView>
  );
}

function Dashboard() {
  const { t } = useTranslation();
  const router = useRouter();
  const foods = useFoodsWithStatus();
  const now = new Date();

  const active = foods.find((f) => f.status === 'testing');
  const counts: Record<FoodStatus, number> = { safe: 0, testing: 0, reacted: 0, untried: 0 };
  for (const f of foods) counts[f.status]++;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
      {active && active.latest ? (
        <View style={{ backgroundColor: colors.status.testing.bg, borderRadius: 16, padding: 16, gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.status.testing.fg }}>
            {t('home.activeTrial')}
          </Text>
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>
            {foodLabel(active.food)}
          </Text>
          {isWindowElapsed(active.latest, now) ? (
            <>
              <Text style={{ fontSize: 14, color: colors.text }}>{t('home.readyToConfirm')}</Text>
              <Button label={t('home.markSafe')} onPress={() => confirmSafe(active.latest!.id, new Date())} />
              <Button
                label={t('home.logReaction')}
                variant="secondary"
                onPress={() => router.push({ pathname: '/log-reaction', params: { foodId: active.food.id } })}
              />
            </>
          ) : (
            <Text style={{ fontSize: 14, color: colors.status.testing.fg }}>
              {t('home.dayOf', {
                day: Math.min(active.latest.windowDays,
                  Math.floor((now.getTime() - active.latest.startedAt.getTime()) / MS_PER_DAY) + 1),
                total: active.latest.windowDays,
              })}
            </Text>
          )}
        </View>
      ) : (
        <Text style={{ fontSize: 14, color: colors.textMuted }}>{t('home.empty')}</Text>
      )}

      <Button label={t('home.tryNewFood')} onPress={() => router.push('/foods')} />

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['safe', 'testing', 'reacted', 'untried'] as const).map((s) => (
          <View key={s} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 12,
            padding: 10, alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{counts[s]}</Text>
            <StatusChip status={s} />
          </View>
        ))}
      </View>

      <Link href="/settings" style={{ fontSize: 14, color: colors.textMuted }}>
        {t('settings.title')} →
      </Link>
    </ScrollView>
  );
}
