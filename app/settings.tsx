import { useRef } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { db } from '../src/db/client';
import { baby as babyTable, food, reaction, trial } from '../src/db/schema';
import { useBaby, useFoodsWithStatus, useReactions } from '../src/data/queries';
import { updateBabySettings } from '../src/data/mutations';
import { foodLabel } from '../src/i18n';
import { Button } from '../src/ui/Button';
import { colors } from '../src/ui/tokens';
import { buildBackup, buildReportHtml } from '../src/services/export';

export default function Settings() {
  const { t } = useTranslation();
  const baby = useBaby();
  const foods = useFoodsWithStatus();
  const reactions = useReactions();
  const exporting = useRef(false);
  if (!baby) return null;

  const exportPdf = async () => {
    if (exporting.current) return;
    exporting.current = true;
    try {
      const tried = foods.filter((f) => f.trials.some((tr) => tr.outcome !== 'cancelled'));
      const html = buildReportHtml({
        title: t('report.title'),
        babyLine: t('report.babyLine', { name: baby.name, birthdate: baby.birthdate.toLocaleDateString('ko-KR') }),
        generatedLine: t('report.generated', { date: new Date().toLocaleDateString('ko-KR') }),
        foodsHeading: t('report.foodsTried'),
        reactionsHeading: t('report.reactionsSection'),
        noneLabel: t('report.none'),
        cols: { food: t('report.colFood'), status: t('report.colStatus'), lastTried: t('report.colLastTried') },
        rows: tried.map((f) => ({
          food: foodLabel(f.food),
          status: t(`status.${f.status}`),
          lastTried: f.latest?.startedAt.toLocaleDateString('ko-KR') ?? '',
        })),
        reactionRows: reactions.map((r) => {
          const tr = foods.flatMap((f) => f.trials.map((x) => ({ f, x }))).find((p) => p.x.id === r.trialId);
          return {
            food: tr ? foodLabel(tr.f.food) : '',
            date: r.occurredAt.toLocaleDateString('ko-KR'),
            severity: t(`reaction.severityLevel.${r.severity}`),
            symptoms: r.symptoms.map((s) => t(`reaction.symptom.${s}`)).join(', '),
            note: r.note ?? '',
          };
        }),
      });
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    } finally {
      exporting.current = false;
    }
  };

  const exportJson = async () => {
    if (exporting.current) return;
    exporting.current = true;
    try {
      const [b, f, tr, re] = await Promise.all([
        db.select().from(babyTable), db.select().from(food),
        db.select().from(trial), db.select().from(reaction),
      ]);
      const json = buildBackup({ baby: b, foods: f, trials: tr, reactions: re }, new Date());
      const path = `${FileSystem.cacheDirectory}allergy-tracker-backup.json`;
      await FileSystem.writeAsStringAsync(path, json);
      await Sharing.shareAsync(path, { mimeType: 'application/json' });
    } finally {
      exporting.current = false;
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{t('settings.babySection')}</Text>
      <TextInput
        defaultValue={baby.name}
        onEndEditing={(e) => {
          const name = e.nativeEvent.text.trim();
          if (name) updateBabySettings({ name });
        }}
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 16 }}
      />

      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{t('setup.birthdate')}</Text>
      <DateTimePicker
        locale="ko-KR"
        value={baby.birthdate}
        mode="date"
        maximumDate={new Date()}
        onChange={(_, d) => d && updateBabySettings({ birthdate: d })}
      />

      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{t('settings.window')}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[2, 3, 4, 5, 6, 7].map((d) => {
          const on = baby.defaultWindowDays === d;
          return (
            <Pressable key={d} onPress={() => updateBabySettings({ defaultWindowDays: d })}
              style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1,
                borderColor: on ? colors.accent : colors.border,
                backgroundColor: on ? colors.accent : colors.bg }}>
              <Text style={{ color: on ? colors.bg : colors.text }}>{d}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{t('settings.exportSection')}</Text>
      <Button label={t('settings.exportPdf')} onPress={exportPdf} />
      <Button label={t('settings.exportJson')} variant="secondary" onPress={exportJson} />

      <Text style={{ fontSize: 12, color: colors.textMuted }}>{t('settings.privacy')}</Text>
      <Text style={{ fontSize: 12, color: colors.textMuted }}>{t('settings.disclaimer')}</Text>
    </ScrollView>
  );
}
