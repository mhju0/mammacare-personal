import { initializeApp, getApp, getApps } from "firebase/app";
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type MessagePayload,
  type Messaging,
} from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

async function getSupportedMessaging(): Promise<Messaging | null> {
  if (!(await isSupported())) return null;
  return getMessaging(firebaseApp);
}

export async function getFirebaseMessagingToken(): Promise<string | null> {
  if (!vapidKey) {
    console.warn("VITE_FIREBASE_VAPID_KEY 가 없어 웹 푸시 토큰을 발급할 수 없습니다.");
    return null;
  }

  const messaging = await getSupportedMessaging();
  if (!messaging) return null;

  return getToken(messaging, { vapidKey });
}

export async function onForegroundMessage(
  handler: (payload: MessagePayload) => void,
): Promise<() => void> {
  const messaging = await getSupportedMessaging();
  if (!messaging) return () => {};

  return onMessage(messaging, handler);
}
