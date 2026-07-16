import { useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useFoodsWithStatus, type FoodWithStatus } from '../src/data/queries';
import { addCustomFood } from '../src/data/mutations';
import { foodLabel } from '../src/i18n';
import type { FoodStatus } from '../src/domain/status';
import { StatusChip } from '../src/ui/StatusChip';
import { colors } from '../src/ui/tokens';

const ORDER: Record<FoodStatus, number> = { testing: 0, untried: 1, safe: 2, reacted: 3 };

export default function Foods() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const foods = useFoodsWithStatus();
  const [query, setQuery] = useState('');
  const [newName, setNewName] = useState('');
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
      router.push({ pathname: '/food/[id]', params: { id } });
    } finally {
      submitting.current = false;
    }
  };

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <TextInput
        placeholder={t('foods.search')}
        value={query}
        onChangeText={setQuery}
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, fontSize: 15 }}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          placeholder={t('foods.addPlaceholder')}
          value={newName}
          onChangeText={setNewName}
          onSubmitEditing={submitNew}
          style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, fontSize: 15 }}
        />
        <Pressable onPress={submitNew} style={{ justifyContent: 'center', paddingHorizontal: 14,
          backgroundColor: colors.accent, borderRadius: 10 }}>
          <Text style={{ color: colors.bg, fontWeight: '600' }}>{t('foods.add')}</Text>
        </Pressable>
      </View>
      <FlatList
        data={visible}
        keyExtractor={(f) => f.food.id}
        renderItem={({ item }) => <FoodRow item={item} />}
      />
    </View>
  );
}

function FoodRow({ item }: { item: FoodWithStatus }) {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/food/[id]', params: { id: item.food.id } })}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: colors.border, gap: 8 }}
    >
      <Text style={{ flex: 1, fontSize: 16, color: colors.text }}>{foodLabel(item.food)}</Text>
      {item.food.allergenGroup && (
        <Text style={{ fontSize: 11, color: colors.danger, fontWeight: '600' }}>
          ⚠ {t('foods.highRisk')}
        </Text>
      )}
      <StatusChip status={item.status} />
    </Pressable>
  );
}
