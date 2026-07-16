import { useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFoodsWithStatus, type FoodWithStatus } from '../src/data/queries';
import { addCustomFood } from '../src/data/mutations';
import { foodLabel } from '../src/i18n';
import type { FoodStatus } from '../src/domain/status';
import { StatusChip } from '../src/ui/StatusChip';
import { colors } from '../src/ui/tokens';

const ORDER: Record<FoodStatus, number> = { testing: 0, untried: 1, safe: 2, reacted: 3 };
const eyebrowStyle = { fontSize: 10, fontWeight: '700' as const, letterSpacing: 2.2, color: colors.muted, paddingBottom: 12 };

export default function Foods() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const foods = useFoodsWithStatus();
  const [query, setQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const submitting = useRef(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return foods
      .filter((f) => foodLabel(f.food).toLowerCase().includes(q))
      .sort((a, b) =>
        ORDER[a.status] - ORDER[b.status] || foodLabel(a.food).localeCompare(foodLabel(b.food)));
  }, [foods, query, i18n.language]);

  const submitNew = async () => {
    const name = newName.trim();
    if (!name || submitting.current) return;
    submitting.current = true;
    try {
      setNewName('');
      const id = await addCustomFood(name);
      setAddOpen(false);
      router.push({ pathname: '/food/[id]', params: { id } });
    } catch {
      Alert.alert(t('errors.generic'));
    } finally {
      submitting.current = false;
    }
  };

  return (
    <View style={{ flex: 1, padding: 22, paddingTop: insets.top + 4, backgroundColor: colors.paper }}>
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

      <View
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          borderBottomWidth: 2, borderColor: colors.ink, paddingBottom: 8,
        }}
      >
        <TextInput
          placeholder={t('foods.search')}
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          style={{ flex: 1, fontSize: 15, color: colors.ink }}
        />
        <Pressable accessibilityRole="button" onPress={() => setAddOpen((v) => !v)}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }}>＋ {t('foods.customAdd')}</Text>
        </Pressable>
      </View>

      {addOpen && (
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10,
            borderBottomWidth: 1, borderColor: colors.hairline,
          }}
        >
          <TextInput
            autoFocus
            placeholder={t('foods.addPlaceholder')}
            placeholderTextColor={colors.muted}
            value={newName}
            onChangeText={setNewName}
            onSubmitEditing={submitNew}
            style={{ flex: 1, fontSize: 15, color: colors.ink }}
          />
          <Pressable accessibilityRole="button" onPress={submitNew}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.accent }}>{t('foods.add')}</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={visible}
        keyExtractor={(f) => f.food.id}
        renderItem={({ item }) => <FoodRow item={item} />}
        ListEmptyComponent={
          <Text style={{ color: colors.muted, fontSize: 14, textAlign: 'center', paddingVertical: 24 }}>
            {t('foods.empty')}
          </Text>
        }
      />
    </View>
  );
}

function FoodRow({ item }: { item: FoodWithStatus }) {
  const { t } = useTranslation();
  const router = useRouter();
  const bold = item.status === 'testing';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/food/[id]', params: { id: item.food.id } })}
      style={{
        flexDirection: 'row', alignItems: 'center', paddingVertical: 11.5,
        borderBottomWidth: 1, borderColor: colors.hairline, gap: 7,
      }}
    >
      <Text style={{ flex: 1, fontSize: 15, fontWeight: bold ? '800' : '600', color: colors.ink }}>
        {foodLabel(item.food)}
      </Text>
      {item.food.allergenGroup && (
        <Text
          style={{
            fontSize: 10, fontWeight: '800', color: colors.red, borderWidth: 1,
            borderColor: colors.red, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1,
          }}
        >
          {t('foods.highRisk')}
        </Text>
      )}
      <StatusChip status={item.status} />
    </Pressable>
  );
}
