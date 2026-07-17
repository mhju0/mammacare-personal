import { useRef } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
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

const labelStyle = { fontSize: 11, fontWeight: '800' as const, letterSpacing: 1.5, color: colors.muted, marginTop: 18, marginBottom: 4 };
const rowStyle = {
  flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const,
  paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.hairline,
};
const rowLabelText = { fontSize: 15, fontWeight: '600' as const, color: colors.ink };

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
    } catch {
      Alert.alert(t('errors.generic'));
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
    } catch {
      Alert.alert(t('errors.generic'));
    } finally {
      exporting.current = false;
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 22, paddingTop: 12, backgroundColor: colors.paper }}>
      <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 2.2, color: colors.muted, textAlign: 'center', paddingBottom: 12 }}>
        {t('settings.title')}
      </Text>

      <Text style={[labelStyle, { marginTop: 6 }]}>{t('settings.babySection')}</Text>
      <View style={rowStyle}>
        <Text style={rowLabelText}>{t('setup.babyName')}</Text>
        <TextInput
          defaultValue={baby.name}
          onEndEditing={(e) => {
            const name = e.nativeEvent.text.trim();
            if (name) updateBabySettings({ name });
          }}
          style={{ fontSize: 15, color: colors.muted, textAlign: 'right', flex: 1, marginLeft: 12 }}
        />
      </View>
      <View style={rowStyle}>
        <Text style={rowLabelText}>{t('setup.birthdate')}</Text>
        <DateTimePicker
          locale="ko-KR"
          value={baby.birthdate}
          mode="date"
          maximumDate={new Date()}
          onChange={(_, d) => d && updateBabySettings({ birthdate: d })}
        />
      </View>

      <Text style={labelStyle}>{t('settings.exportSection')}</Text>
      <View style={{ gap: 10, marginTop: 10 }}>
        <Button label={t('settings.exportPdf')} onPress={exportPdf} />
        <Button label={t('settings.exportJson')} variant="secondary" onPress={exportJson} />
      </View>

      <Text style={{ fontSize: 11.5, color: colors.muted, lineHeight: 17, marginTop: 18 }}>
        {t('settings.privacy')}{'\n'}{t('settings.disclaimer')}
      </Text>
    </ScrollView>
  );
}
