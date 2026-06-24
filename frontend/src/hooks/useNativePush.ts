import { useEffect } from "react";
import { PushNotifications } from "@capacitor/push-notifications";
import { apiFetch } from "../api/client";
import { useApp } from "../context/AppContext";
import { emitNotificationsChanged } from "../api/notifications";

const TOKEN_KEY_PREFIX = "mammacare_native_push_token";

export function useNativePush(): void {
  const { user, token } = useApp();

  useEffect(() => {
    if (!user || !token) return;

    let cancelled = false;

    async function register() {
      try {
        await PushNotifications.createChannel({
          id: "default",
          name: "맘마케어 알림",
          importance: 5,
          vibration: true,
          sound: "default",
        });

        const perm = await PushNotifications.requestPermissions();
        if (perm.receive !== "granted" || cancelled) return;

        await PushNotifications.removeAllListeners();

        await PushNotifications.addListener("registration", async (data) => {
          if (cancelled) return;
          const fcmToken = data.value;
          const storageKey = `${TOKEN_KEY_PREFIX}:${user!.id}`;
          try {
            await apiFetch<{ status: string }>(
              "/parents/fcm-token",
              { method: "PUT", body: JSON.stringify({ fcm_token: fcmToken }) },
              token!,
            );
            localStorage.setItem(storageKey, fcmToken);
          } catch (error) {
            console.warn("FCM 토큰 서버 등록 실패:", error);
          }
        });

        await PushNotifications.addListener("registrationError", (err) => {
          console.warn("푸시 등록 실패:", err);
        });

        await PushNotifications.addListener("pushNotificationReceived", () => {
          emitNotificationsChanged();
        });

        await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          emitNotificationsChanged();
          const route = action.notification.data?.target_route as string | undefined;
          if (route?.startsWith("/")) window.location.hash = route;
        });

        await PushNotifications.register();
      } catch (e) {
        console.warn("네이티브 푸시 초기화 실패:", e);
      }
    }

    register();

    return () => {
      cancelled = true;
      PushNotifications.removeAllListeners();
    };
  }, [user?.id, token]);
}
