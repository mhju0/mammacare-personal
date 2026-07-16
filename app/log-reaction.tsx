import { useState, useRef } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFoodsWithStatus } from '../src/data/queries';
import { logReaction } from '../src/data/mutations';
import { foodLabel } from '../src/i18n';
import { Button } from '../src/ui/Button';
import { colors } from '../src/ui/tokens';

const SYMPTOMS = ['hives', 'rash', 'vomiting', 'diarrhea', 'swelling', 'breathing', 'other'] as const;
const SEVERITIES = ['mild', 'moderate', 'severe'] as const;

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
  const showEmergency = severity === 'severe' || symptoms.includes('breathing');

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
    } finally {
      saving.current = false;
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>{foodLabel(entry.food)}</Text>

      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{t('reaction.symptoms')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {SYMPTOMS.map((s) => {
          const on = symptoms.includes(s);
          return (
            <Pressable key={s} onPress={() => toggle(s)}
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1,
                borderColor: on ? colors.accent : colors.border,
                backgroundColor: on ? colors.accent : colors.bg }}>
              <Text style={{ color: on ? colors.bg : colors.text, fontSize: 13 }}>
                {t(`reaction.symptom.${s}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{t('reaction.severity')}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {SEVERITIES.map((s) => {
          const on = severity === s;
          return (
            <Pressable key={s} onPress={() => setSeverity(s)}
              style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1,
                borderColor: on ? colors.accent : colors.border,
                backgroundColor: on ? colors.accent : colors.bg }}>
              <Text style={{ color: on ? colors.bg : colors.text, fontSize: 14 }}>
                {t(`reaction.severityLevel.${s}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {showEmergency && (
        <View style={{ backgroundColor: colors.status.reacted.bg, borderRadius: 10, padding: 12 }}>
          <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>
            {t('reaction.emergency')}
          </Text>
        </View>
      )}

      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{t('reaction.when')}</Text>
      <DateTimePicker
        locale="ko-KR"
        value={occurredAt}
        mode="datetime"
        maximumDate={new Date()}
        onChange={(_, d) => d && setOccurredAt(d)}
      />

      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{t('reaction.note')}</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        multiline
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12,
          minHeight: 70, fontSize: 15 }}
      />

      <Button label={t('reaction.save')} disabled={symptoms.length === 0} onPress={save} />
    </ScrollView>
  );
}
