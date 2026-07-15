import { useNavigate } from "react-router";
import { useApp } from "../../context/AppContext";
import { Users, Bell, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { getAdminStats, listAdminUsers, type AdminStatsOut } from "../../api/admin";
import { apiFetch } from "../../api/client";

// ── 시간 포맷 ───────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

// ── 타입 ────────────────────────────────────────────────────

interface Activity {
  action: string;
  user: string;
  time: string;
  sortKey: number;
}

export default function AdminHome() {
  const { user, token, authLoading } = useApp();
  const navigate = useNavigate();
  const [stats, setStats] = useState<AdminStatsOut | null>(null);
  const [pendingReports, setPendingReports] = useState<number | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);

  useEffect(() => {
    if (!authLoading && !user?.isAdmin) navigate("/login");
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!token || !user?.isAdmin) return;

    // 기본 통계
    getAdminStats(token).then(setStats).catch(() => {});

    // 신고 대기 수
    apiFetch<{ reports: unknown[]; total: number }>(
      "/admin/community/reports?handled=false&limit=1",
      {},
      token,
    ).then((d) => setPendingReports(d.total)).catch(() => {});

    // 최근 활동: 신규 가입 + 신고 접수
    Promise.all([
      listAdminUsers(token, { skip: 0, limit: 5 }),
      apiFetch<{ reports: { reporter_nickname: string; created_at: string }[]; total: number }>(
        "/admin/community/reports?limit=5",
        {},
        token,
      ),
    ]).then(([users, reports]) => {
      const joined: Activity[] = users.users.map((u) => ({
        action: "새로운 회원 가입",
        user: u.name,
        time: timeAgo(u.created_at),
        sortKey: new Date(u.created_at).getTime(),
      }));
      const reported: Activity[] = reports.reports.map((r) => ({
        action: "게시글 신고 접수",
        user: r.reporter_nickname,
        time: timeAgo(r.created_at),
        sortKey: new Date(r.created_at).getTime(),
      }));
      const merged = [...joined, ...reported]
        .sort((a, b) => b.sortKey - a.sortKey)
        .slice(0, 6);
      setActivities(merged);
    }).catch(() => {});
  }, [token, user]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5">

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-card border border-border rounded-3xl p-6 flex gap-4 items-start hover:shadow-md transition-shadow">
          <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--safe-bg)_50%,var(--sage-150)_100%)] flex items-center justify-center">
            <span style={{ color: "var(--warm-fg)" }}><Users size={24} /></span>
          </div>
          <div>
            <h3 className="font-bold text-foreground mb-1">전체 회원</h3>
            <p className="text-2xl font-bold">{stats ? stats.total_users.toLocaleString() : "-"}</p>
            <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">아기 프로필 {stats ? stats.total_babies : "-"}개</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-3xl p-6 flex gap-4 items-start hover:shadow-md transition-shadow">
          <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--safe-bg)_50%,var(--sage-150)_100%)] flex items-center justify-center">
            <span style={{ color: "var(--warm-fg)" }}><Users size={24} /></span>
          </div>
          <div>
            <h3 className="font-bold text-foreground mb-1">활성 사용자</h3>
            <p className="text-2xl font-bold">{stats ? stats.active_users.toLocaleString() : "-"}</p>
            <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">정지 {stats ? stats.total_users - stats.active_users : "-"}명</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-3xl p-6 flex gap-4 items-start hover:shadow-md transition-shadow">
          <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--safe-bg)_50%,var(--sage-150)_100%)] flex items-center justify-center">
            <span style={{ color: "var(--warm-fg)" }}><Shield size={24} /></span>
          </div>
          <div>
            <h3 className="font-bold text-foreground mb-1">관리자</h3>
            <p className="text-2xl font-bold">{stats ? stats.admin_users : "-"}</p>
            <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">운영 중</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-3xl p-6 flex gap-4 items-start hover:shadow-md transition-shadow">
          <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--safe-bg)_50%,var(--sage-150)_100%)] flex items-center justify-center">
            <span style={{ color: "var(--warm-fg)" }}><Bell size={24} /></span>
          </div>
          <div>
            <h3 className="font-bold text-foreground mb-1">신고 대기</h3>
            <p className="text-2xl font-bold">{pendingReports === null ? "-" : pendingReports.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">처리 대기 중인 신고</p>
          </div>
        </div>
      </div>

      {/* Recent Activities */}
      <div className="mt-8 bg-card border border-border rounded-3xl p-6">
        <h3 className="text-lg font-bold mb-4">최근 활동</h3>
        {activities.length === 0 ? (
          <p className="text-base text-muted-foreground text-center py-4">최근 활동이 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {activities.map((activity, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex-1">
                  <span className="text-sm font-medium">{activity.action}</span>
                  <span className="text-sm text-muted-foreground ml-2">by {activity.user}</span>
                </div>
                <span className="text-xs text-muted-foreground">{activity.time}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
