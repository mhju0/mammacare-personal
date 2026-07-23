import { useRef } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { cancelTrial, startTrial } from './mutations';
import type { FoodWithStatus } from './queries';
import { ensurePermission } from '../services/notify';
import { foodLabel } from '../i18n';
import type { Food } from '../db/schema';

// The one shared way to start a trial from UI: contextual notification ask,
// then startTrial; on the one-active-trial conflict, offer cancel-and-start.
// onStarted fires only when a trial actually began (used by the picker to
// bounce back to home; the detail page just stays put).
export function useStartTrialFlow(foods: FoodWithStatus[], windowDays: number) {
  const { t } = useTranslation();
  const starting = useRef(false);

  return async (food: Food, onStarted?: () => void) => {
    if (starting.current) return;
    starting.current = true;
    try {
      await ensurePermission(); // contextual ask; denial degrades gracefully
      const res = await startTrial(food.id, foodLabel(food), windowDays, new Date());
      if (res.ok) {
        onStarted?.();
        return;
      }
      const active = foods.find((f) => f.status === 'testing');
      const activeTrialId = active?.latest?.id;
      if (!active || !activeTrialId) {
        Alert.alert(t('food.trialBlocked'));
        return;
      }
      const activeName = foodLabel(active.food);
      Alert.alert(t('food.blockedTitle', { food: activeName }), t('food.blockedBody'), [
        {
          text: t('food.blockedCancelStart', { food: activeName }),
          style: 'destructive',
          onPress: async () => {
            if (starting.current) return;
            starting.current = true;
            try {
              // The window may have elapsed while the alert sat open — try starting
              // first so implicit-safe autoclose wins over cancelling a clean trial.
              const first = await startTrial(food.id, foodLabel(food), windowDays, new Date());
              if (first.ok) {
                onStarted?.();
                return;
              }
              await cancelTrial(activeTrialId, new Date());
              const retry = await startTrial(food.id, foodLabel(food), windowDays, new Date());
              if (retry.ok) onStarted?.();
              else Alert.alert(t('food.trialBlocked'));
            } catch {
              Alert.alert(t('errors.generic'));
            } finally {
              starting.current = false;
            }
          },
        },
        { text: t('food.close'), style: 'cancel' },
      ]);
    } catch {
      Alert.alert(t('errors.generic'));
    } finally {
      starting.current = false;
    }
  };
}
