import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from '../drizzle/migrations';
import i18n from '../src/i18n';
import { db } from '../src/db/client';
import { seedDemoIfEmpty, seedIfEmpty } from '../src/db/seed';
import { initNotificationHandler } from '../src/services/notify';
import { colors } from '../src/ui/tokens';

initNotificationHandler();

export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations);
  const [seeded, setSeeded] = useState(false);
  const [seedError, setSeedError] = useState<Error | null>(null);

  useEffect(() => {
    if (success) {
      // Demo seed must run first: it triggers on "no baby row yet", and
      // seedIfEmpty creates that row.
      (process.env.EXPO_PUBLIC_DEMO === '1' ? seedDemoIfEmpty(new Date()) : Promise.resolve())
        .then(() => seedIfEmpty())
        .then(() => setSeeded(true))
        .catch((e) => setSeedError(e instanceof Error ? e : new Error(String(e))));
    }
  }, [success]);

  if (error || seedError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: colors.red }}>{i18n.t('errors.dbInit', { message: (error ?? seedError)!.message })}</Text>
      </View>
    );
  }
  if (!success || !seeded) return null;
  return <AppStack />;
}

function AppStack() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.paper },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="foods" />
      <Stack.Screen name="food/[id]" />
      <Stack.Screen name="calendar" />
      <Stack.Screen name="log-reaction" options={{ presentation: 'modal' }} />
      <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
