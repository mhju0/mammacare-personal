import { useEffect } from "react";
import { apiFetch } from "../api/client";
import { getFirebaseMessagingToken, onForegroundMessage } from "../firebase";
import { useApp } from "../context/AppContext";
import { emitNotificationsChanged } from "../api/notifications";

const WEB_PUSH_TOKEN_STORAGE_PREFIX = "mammacare_web_push_token";

function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

export function useWebPush(): void {
  const { user, token } = useApp();

  useEffect(() => {
    if (!user || !token || !isNotificationSupported()) return;

    let cancelled = false;
    let unsubscribeForeground: (() => void) | undefined;
    const userId = user.id;

    async function registerWebPush() {
      try {
        let permission = Notification.permission;
        if (permission === "default") {
          permission = await Notification.requestPermission();
        }
        if (permission !== "granted" || cancelled) return;

        const fcmToken = await getFirebaseMessagingToken();
        if (!fcmToken || cancelled) return;

        const storageKey = `${WEB_PUSH_TOKEN_STORAGE_PREFIX}:${userId}`;
        if (localStorage.getItem(storageKey) !== fcmToken) {
          await apiFetch<{ status: string }>(
            "/parents/fcm-token",
            {
              method: "PUT",
              body: JSON.stringify({ fcm_token: fcmToken }),
            },
            token,
          );
          localStorage.setItem(storageKey, fcmToken);
        }

        unsubscribeForeground = await onForegroundMessage(() => {
          emitNotificationsChanged();
        });
      } catch (error) {
        console.warn("웹 푸시 초기화 실패:", error);
      }
    }

    registerWebPush();

    return () => {
      cancelled = true;
      unsubscribeForeground?.();
    };
  }, [token, user]);
}
