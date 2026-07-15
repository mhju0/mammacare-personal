import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Bell, Check, CheckSquare, Square, Trash2, X } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useApp } from "../context/AppContext";
import {
  deleteAllNotificationsApi,
  deleteNotificationApi,
  emitNotificationsChanged,
  getNotificationIcon,
  getNotificationTarget,
  listNotificationsApi,
  markAllNotificationsReadApi,
  markNotificationReadApi,
  type NotificationItem,
} from "../api/notifications";

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;
  return date.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default function Notifications() {
  const isApp = Capacitor.isNativePlatform();
  const { user, token } = useApp();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deleteMode, setDeleteMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.is_read).length,
    [notifications],
  );

  const loadNotifications = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const data = await listNotificationsApi(token);
      setNotifications(data.notifications);
    } catch {
      setError("알림을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const markAllRead = async () => {
    if (!token) return;
    try {
      await markAllNotificationsReadApi(token);
      setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true, read_at: item.read_at ?? new Date().toISOString() })));
      emitNotificationsChanged();
    } catch {
      setError("전체 읽음 처리에 실패했습니다.");
    }
  };

  const deleteSelected = async () => {
    if (!token || selected.size === 0) return;
    const ids = Array.from(selected);
    try {
      await Promise.all(ids.map((id) => deleteNotificationApi(id, token)));
      setNotifications((prev) => prev.filter((item) => !selected.has(item.id)));
      setSelected(new Set());
      setDeleteMode(false);
      emitNotificationsChanged();
    } catch {
      setError("선택한 알림 삭제에 실패했습니다.");
    }
  };

  const deleteAll = async () => {
    if (!token) return;
    try {
      await deleteAllNotificationsApi(token);
      setNotifications([]);
      setDeleteMode(false);
      setSelected(new Set());
      emitNotificationsChanged();
    } catch {
      setError("알림 삭제에 실패했습니다.");
    }
  };

  const exitDeleteMode = () => {
    setDeleteMode(false);
    setSelected(new Set());
  };

  const handleNotificationClick = async (notification: NotificationItem) => {
    if (deleteMode) {
      toggleSelect(notification.id);
      return;
    }

    if (token && !notification.is_read) {
      try {
        const updated = await markNotificationReadApi(notification.id, token);
        setNotifications((prev) => prev.map((item) => (item.id === notification.id ? updated : item)));
        emitNotificationsChanged();
      } catch {
        setNotifications((prev) =>
          prev.map((item) =>
            item.id === notification.id
              ? { ...item, is_read: true, read_at: item.read_at ?? new Date().toISOString() }
              : item,
          ),
        );
      }
    }

    navigate(getNotificationTarget(notification));
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center pt-16 min-h-[50vh] px-4 gap-5">
        <div className="text-6xl">🔒</div>
        <p className="text-base text-muted-foreground text-center">로그인 후 이용하실 수 있어요</p>
        <button
          onClick={() => navigate("/login")}
          className="px-6 py-3 bg-primary text-primary-foreground font-bold rounded-full"
        >
          로그인하기
        </button>
      </div>
    );
  }

  return (
    <div
  className={`max-w-5xl mx-auto ${
    isApp ? "px-3 py-4" : "px-4 sm:px-6 lg:px-8 py-5"
  }`}
>
      <div className={`flex items-center justify-between gap-3 ${isApp ? "mb-4" : "mb-6"}`}>
        <div>
          <h1 className={`${isApp ? "text-xl" : "text-2xl"} font-bold flex items-center gap-2`} style={{ fontFamily: "'Paperlogic'", fontWeight: 600 }}>
            <Bell className={isApp ? "w-4 h-4" : "w-5 h-5 sm:w-6 sm:h-6"} /> 알림
          </h1>
          {unreadCount > 0 && (
            <p className="text-sm text-muted-foreground mt-1">읽지 않은 알림 {unreadCount}개</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!deleteMode && unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-3 py-2 rounded-full border border-border hover:bg-primary/10 transition-colors"
            >
              <Check size={14} /> 모두 읽음
            </button>
          )}

          {deleteMode ? (
            <>
              {selected.size > 0 && (
                <button
                  onClick={deleteSelected}
                  className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-full bg-destructive text-destructive-foreground hover:opacity-80 transition-opacity"
                >
                  <Trash2 size={14} /> 삭제 ({selected.size})
                </button>
              )}
              <button
                onClick={deleteAll}
                className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-full border border-destructive text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 size={14} /> 모두 삭제
              </button>
              <button
                onClick={exitDeleteMode}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-3 py-2 rounded-full border border-border hover:bg-muted transition-colors"
              >
                <X size={14} /> 취소
              </button>
            </>
          ) : (
            notifications.length > 0 && (
              <button
                onClick={() => setDeleteMode(true)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-3 py-2 rounded-full border border-border hover:bg-muted transition-colors"
              >
                <Trash2 size={14} /> 삭제하기
              </button>
            )
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <div className="flex shrink-0 items-center pt-24 gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sage-100 animate-bounce [animation-delay:-0.3s]" />
            <span className="w-2.5 h-2.5 rounded-full bg-sage-100 animate-bounce [animation-delay:-0.15s]" />
            <span className="w-2.5 h-2.5 rounded-full bg-sage-100 animate-bounce" />
          </div>
          <span className="text-lg font-medium text-primary-foreground">알림을 불러오는 중이에요</span>
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-6xl mb-4">🔔</div>
          <p className="text-base text-muted-foreground">알림이 없어요</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => {
            const isSelected = selected.has(notification.id);
            return (
              <button
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={`w-full flex items-start gap-4 ${isApp ? "px-5 py-2.5" : "p-5"} rounded-2xl border transition-all text-left ${
                  isSelected
                    ? "bg-destructive/10 border-destructive/40"
                    : notification.is_read
                      ? "bg-card border-border hover:shadow-sm"
                      : "bg-primary/10 border-primary/30 hover:shadow-sm"
                }`}
              >
                {deleteMode && (
                  <div className="shrink-0 mt-0.5">
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 sm:w-5 sm:h-5 text-destructive" />
                    ) : (
                      <Square className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
                    )}
                  </div>
                )}

                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-xl shrink-0 ${
                    notification.is_read ? "bg-muted" : "bg-primary/30"
                  }`}
                >
                  {getNotificationIcon(notification.type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <span className={`font-semibold leading-snug ${notification.is_read ? "text-foreground/80" : "text-foreground"}`}>
                      {notification.title}
                    </span>
                    {!notification.is_read && !deleteMode && (
                      <span className="w-2.5 h-2.5 rounded-full bg-accent shrink-0 mt-1.5" />
                    )}
                  </div>
                  {notification.body && (
                    <p className={`${isApp ? "text-xs" : "text-sm"} text-muted-foreground mt-1 leading-relaxed`}>{notification.body}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1.5">{formatRelativeTime(notification.created_at)}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
