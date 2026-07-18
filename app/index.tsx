import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBaby, useBabyLoaded, useFoodsWithStatus } from '../src/data/queries';
import { confirmSafe, saveBaby } from '../src/data/mutations';
import { foodLabel } from '../src/i18n';
import { isWindowElapsed, MS_PER_DAY, type FoodStatus } from '../src/domain/status';
import { Button } from '../src/ui/Button';
import { CheckinPill } from '../src/ui/CheckinPill';
import { colors, layout } from '../src/ui/tokens';

const eyebrowStyle = { fontSize: 10, fontWeight: '700' as const, letterSpacing: 2.2, color: colors.muted, paddingBottom: 12, paddingLeft: layout.rowInset };
const labelStyle = { fontSize: 11, fontWeight: '800' as const, letterSpacing: 1.5, color: colors.muted, marginTop: 18 };
const underlineInput = { borderBottomWidth: 2, borderColor: colors.ink, paddingVertical: 8, fontSize: 16, color: colors.ink };

export default function Home() {
  const loaded = useBabyLoaded();
  const baby = useBaby();
  if (!loaded) return null; // avoid a setup-card flash before the DB has reported "no baby" yet
  if (!baby) return <SetupCard />;
  return <Dashboard />;
}

function SetupCard() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [birthdate, setBirthdate] = useState(new Date());
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 22, paddingTop: insets.top + 4, gap: 14, backgroundColor: colors.paper }}>
      <Text style={eyebrowStyle}>{t('home.title')}</Text>
      <Text style={{ fontSize: 44, fontWeight: '900', color: colors.ink, letterSpacing: -0.5 }}>{t('setup.title')}</Text>
      <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 20 }}>{t('setup.intro')}</Text>

      <Text style={labelStyle}>{t('setup.babyName')}</Text>
      <TextInput value={name} onChangeText={setName} style={underlineInput} />

      <Text style={labelStyle}>{t('setup.birthdate')}</Text>
      <DateTimePicker
        locale="ko-KR"
        value={birthdate}
        mode="date"
        maximumDate={new Date()}
        onChange={(_, d) => d && setBirthdate(d)}
      />

      <View style={{ marginTop: 8 }}>
        <Button
          label={t('setup.start')}
          disabled={name.trim().length === 0}
          onPress={() => saveBaby({ name: name.trim(), birthdate })}
        />
      </View>

      <Text style={{ fontSize: 11.5, color: colors.muted, lineHeight: 17 }}>{t('setup.disclaimer')}</Text>
    </ScrollView>
  );
}

function Dashboard() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const foods = useFoodsWithStatus();
  const [, setTick] = useState(0);
  useFocusEffect(useCallback(() => setTick((x) => x + 1), []));
  const now = new Date();

  const active = foods.find((f) => f.status === 'testing');
  const latest = active?.latest;
  const counts: Record<FoodStatus, number> = { safe: 0, testing: 0, reacted: 0, untried: 0 };
  for (const f of foods) counts[f.status]++;
  const hasAnyTrial = foods.some((f) => f.trials.some((tr) => tr.outcome !== 'cancelled'));

  const elapsed = latest ? isWindowElapsed(latest, now) : false;
  const day = latest
    ? Math.min(latest.windowDays, Math.floor((now.getTime() - latest.startedAt.getTime()) / MS_PER_DAY) + 1)
    : 0;
  const fraction = latest ? Math.min(1, day / latest.windowDays) : 0;

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 22, paddingTop: insets.top + 4, backgroundColor: colors.paper }}>
      <Text style={eyebrowStyle}>{t('home.title')}</Text>

      {active && latest ? (
        <View>
          <Text style={{ fontSize: 58, fontWeight: '900', color: colors.ink, letterSpacing: -1, lineHeight: 60 }}>
            {foodLabel(active.food)}
          </Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.amber, marginTop: 9, paddingLeft: layout.rowInset }}>
            {elapsed ? t('home.readyToConfirm') : `${t('status.testing')} · ${t('home.dayOf', { day, total: latest.windowDays })}`}
          </Text>
          <View style={{ height: 3, backgroundColor: colors.hairline, borderRadius: 2, marginTop: 13, marginBottom: 20, overflow: 'hidden' }}>
            <View style={{ height: 3, width: `${fraction * 100}%`, backgroundColor: colors.amber }} />
          </View>
          {elapsed ? (
            <View style={{ gap: 10, marginBottom: 10 }}>
              <Button label={t('home.markSafe')} onPress={() => confirmSafe(latest.id, new Date())} />
              <Button
                label={t('home.logReaction')}
                variant="secondary"
                onPress={() => router.push({ pathname: '/log-reaction', params: { foodId: active.food.id } })}
              />
            </View>
          ) : (
            <View style={{ marginBottom: 10 }}>
              <CheckinPill foodId={active.food.id} trialId={latest.id} />
            </View>
          )}
        </View>
      ) : !hasAnyTrial ? (
        <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 20 }}>{t('home.empty')}</Text>
      ) : null}

      <Button label={t('home.tryNewFood')} onPress={() => router.push('/foods')} />

      <View style={{ borderTopWidth: 1, borderColor: colors.hairline, marginTop: 20 }}>
        {(['safe', 'testing', 'reacted', 'untried'] as const).map((s) => (
          <Pressable
            key={s}
            accessibilityRole="button"
            accessibilityLabel={`${t(`status.${s}`)} ${counts[s]}`}
            onPress={() => router.push({ pathname: '/foods', params: { focus: s } })}
            style={{
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
              paddingVertical: 12, paddingHorizontal: layout.rowInset,
              borderBottomWidth: 1, borderColor: colors.hairline,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.status[s].fg }}>{t(`status.${s}`)}</Text>
            <Text style={{ fontSize: 17, fontWeight: '900', color: colors.status[s].fg, fontVariant: ['tabular-nums'] }}>
              {counts[s]}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ marginTop: 'auto', paddingTop: 24, paddingBottom: insets.bottom > 0 ? insets.bottom : 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('home.calendar')}
          onPress={() => router.push('/calendar')}
          style={{
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            paddingVertical: 15, paddingHorizontal: layout.rowInset,
            borderTopWidth: 1, borderColor: colors.hairline,
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>{t('home.calendar')}</Text>
          <Text style={{ fontSize: 15, color: colors.muted }}>→</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.title')}
          onPress={() => router.push('/settings')}
          style={{
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            paddingVertical: 15, paddingHorizontal: layout.rowInset,
            borderTopWidth: 1, borderColor: colors.hairline,
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>{t('settings.title')}</Text>
          <Text style={{ fontSize: 15, color: colors.muted }}>→</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
