import { apiFetch } from "./client";

export const NOTIFICATION_REFRESH_EVENT = "mammacare:notifications-changed";
export const PUSH_TOAST_EVENT = "mammacare:push-toast";

export interface PushToastPayload {
  title: string;
  body?: string;
  type?: string;
  targetRoute?: string;
}

export function emitPushToast(payload: PushToastPayload): void {
  window.dispatchEvent(new CustomEvent(PUSH_TOAST_EVENT, { detail: payload }));
}

export interface NotificationItem {
  id: string;
  parent_id: string;
  baby_id: string | null;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  scheduled_at: string | null;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
  is_read: boolean;
}

export interface NotificationListResponse {
  notifications: NotificationItem[];
  unread_count: number;
}

export function emitNotificationsChanged(): void {
  window.dispatchEvent(new CustomEvent(NOTIFICATION_REFRESH_EVENT));
}

export function getNotificationTarget(notification: Pick<NotificationItem, "type" | "data">): string {
  const data = notification.data ?? {};
  const targetRoute = data.target_route;
  if (typeof targetRoute === "string" && targetRoute.startsWith("/")) return targetRoute;

  if (notification.type === "meal_reminder") return "/schedule";
  if (notification.type === "allergy_check") return "/allergy";
  if (notification.type === "community_comment" || notification.type === "community_like") {
    const postId = data.post_id;
    return typeof postId === "string" ? `/community/posts/${postId}` : "/community";
  }
  return "/notifications";
}

export function getNotificationIcon(type: string): string {
  if (type === "meal_reminder") return "🥄";
  if (type === "allergy_check") return "🔍";
  if (type === "community_comment") return "💬";
  if (type === "community_like") return "🧡";
  return "🔔";
}

export const listNotificationsApi = (token: string) =>
  apiFetch<NotificationListResponse>("/notifications", {}, token);

export const markNotificationReadApi = (notificationId: string, token: string) =>
  apiFetch<NotificationItem>(`/notifications/${notificationId}/read`, { method: "PATCH" }, token);

export const markAllNotificationsReadApi = (token: string) =>
  apiFetch<{ updated: number }>("/notifications/read-all", { method: "PATCH" }, token);

export const deleteNotificationApi = (notificationId: string, token: string) =>
  apiFetch<void>(`/notifications/${notificationId}`, { method: "DELETE" }, token);

export const deleteAllNotificationsApi = (token: string) =>
  apiFetch<{ deleted: number }>("/notifications", { method: "DELETE" }, token);
