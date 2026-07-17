import { useState, useRef } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFoodsWithStatus } from '../src/data/queries';
import { logReaction } from '../src/data/mutations';
import { foodLabel } from '../src/i18n';
import { Button } from '../src/ui/Button';
import { colors } from '../src/ui/tokens';

const SYMPTOMS = ['hives', 'rash', 'vomiting', 'diarrhea', 'swelling', 'cough', 'breathing', 'other'] as const;
const SEVERITIES = ['mild', 'moderate', 'severe'] as const;
const labelStyle = { fontSize: 11, fontWeight: '800' as const, letterSpacing: 1.5, color: colors.muted, marginTop: 18, marginBottom: 8 };
const underlineBorder = { borderBottomWidth: 2, borderColor: colors.hairline, paddingVertical: 10 };

export default function LogReaction() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { foodId } = useLocalSearchParams<{ foodId: string }>();
  const entry = useFoodsWithStatus().find((f) => f.food.id === foodId);

  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>('mild');
  const [occurredAt, setOccurredAt] = useState(new Date());
  const [note, setNote] = useState('');

  const saving = useRef(false);

  if (!entry) return null;
  const showEmergency = severity === 'severe' || symptoms.includes('breathing') || symptoms.includes('swelling');

  const toggle = (s: string) =>
    setSymptoms((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const save = async () => {
    if (saving.current) return;
    saving.current = true;
    try {
      await logReaction(
        entry.food.id,
        { symptoms, severity, occurredAt, note: note.trim() || null },
        new Date(),
      );
      if (navigation.isFocused()) router.back();
    } catch {
      Alert.alert(t('errors.generic'));
    } finally {
      saving.current = false;
    }
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 22, paddingTop: 12, backgroundColor: colors.paper }}>
      <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 2.2, color: colors.muted, textAlign: 'center', paddingBottom: 12 }}>
        {t('reaction.title')}
      </Text>
      <Text style={{ fontSize: 40, fontWeight: '900', color: colors.ink, letterSpacing: -0.5 }}>
        {foodLabel(entry.food)}
      </Text>

      <Text style={labelStyle}>{t('reaction.symptoms')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {SYMPTOMS.map((s) => {
          const on = symptoms.includes(s);
          return (
            <Pressable
              key={s}
              accessibilityRole="button"
              onPress={() => toggle(s)}
              style={{
                paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5,
                borderColor: on ? colors.ink : colors.hairline,
                backgroundColor: on ? colors.ink : 'transparent',
              }}
            >
              <Text style={{ color: on ? colors.paper : colors.ink, fontSize: 13, fontWeight: '600' }}>
                {t(`reaction.symptom.${s}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={labelStyle}>{t('reaction.severity')}</Text>
      <View style={{ flexDirection: 'row', borderWidth: 1.5, borderColor: colors.ink, borderRadius: 999, overflow: 'hidden' }}>
        {SEVERITIES.map((s) => {
          const on = severity === s;
          return (
            <Pressable
              key={s}
              accessibilityRole="button"
              onPress={() => setSeverity(s)}
              style={{
                flex: 1, alignItems: 'center', paddingVertical: 10,
                backgroundColor: on ? colors.ink : 'transparent',
              }}
            >
              <Text style={{ color: on ? colors.paper : colors.ink, fontSize: 13, fontWeight: '700' }}>
                {t(`reaction.severityLevel.${s}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {showEmergency && (
        <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.redTint, paddingVertical: 9, marginTop: 14 }}>
          <Text style={{ color: colors.red, fontSize: 12.5, fontWeight: '700' }}>{t('reaction.emergency')}</Text>
        </View>
      )}

      <Text style={labelStyle}>{t('reaction.when')}</Text>
      <View style={underlineBorder}>
        <DateTimePicker
          locale="ko-KR"
          value={occurredAt}
          mode="datetime"
          maximumDate={new Date()}
          onChange={(_, d) => d && setOccurredAt(d)}
        />
      </View>

      <Text style={labelStyle}>{t('reaction.note')}</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        multiline
        style={[underlineBorder, { fontSize: 15, color: colors.ink, minHeight: 60 }]}
      />

      <View style={{ marginTop: 'auto', paddingTop: 20 }}>
        <Button label={t('reaction.save')} disabled={symptoms.length === 0} onPress={save} />
      </View>
    </ScrollView>
  );
}
