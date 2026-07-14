import { Outlet, Link, useNavigate, useLocation } from "react-router";
import { useApp } from "../context/AppContext";
import { Bell, User, Settings, LogOut, Home, BarChart3, Leaf } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useRef, useState } from "react";
import PushToast from "./PushToast";
import { listNotificationsApi, NOTIFICATION_REFRESH_EVENT, emitPushToast, getNotificationTarget } from "../api/notifications";
import { dedupeRequest, readSessionCache, writeSessionCache } from "../utils/sessionCache";
import forkImage from "../asset/fork_4.webp";
import logoImage from "../asset/mamma_9.webp";

const isApp = Capacitor.isNativePlatform();

// 알레르기 안전 도구로 좁힌 IA(hybrid mock 기준). 일정/영양/레시피/커뮤니티는 detab —
// 라우트는 유지되지만 탭에서 제거(삭제는 P5 데드코드 퍼지에서 결정).
const navItems = [
  { label: "재료", path: "/ingredients", color: "#A9C6B0" },
  { label: "관찰", path: "/observe", color: "#A9C6B0" },
  { label: "알레르기 관리", path: "/allergy", color: "#A9C6B0" },
  { label: "리포트", path: "/reports", color: "#A9C6B0" },
];

const adminNavItems = [
  { label: "대시보드", path: "/admin/dashboard", color: "#FFEFAB" },
  { label: "회원 관리", path: "/admin/users", color: "#FFEFAB" },
  { label: "콘텐츠 관리", path: "/admin/content", color: "#FFEFAB" },
  { label: "커뮤니티 & 문의", path: "/admin/notice", color: "#FFEFAB" },
  { label: "보안 & 권한", path: "/admin/security", color: "#FFEFAB" },
  { label: "결제 관리", path: "/admin/payments", color: "#FFEFAB" },
];

// 4탭 IA(concept): 홈/재료/리포트/설정. 관찰은 홈·재료의 진행중 테스트 카드에서 진입(라우트 유지),
// 프로필은 헤더 아이콘 + 설정 화면에서 진입.
const appTabItems = [
  { label: "홈", path: "/", icon: Home },
  { label: "재료", path: "/ingredients", icon: Leaf },
  { label: "리포트", path: "/reports", icon: BarChart3 },
  { label: "설정", path: "/settings", icon: Settings },
];

const UNREAD_COUNT_CACHE_TTL_MS = 30 * 1000;
const NOTIFICATION_POLL_INTERVAL_MS = 10 * 1000;

function unreadCountCacheKey(userId: string): string {
  return `mammacare:notifications:unread:${userId}`;
}

export default function Layout() {
  const { user, token, logout } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const navRef = useRef<HTMLElement>(null);
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const notifInitializedRef = useRef(false);

  useEffect(() => {
    seenNotificationIdsRef.current = new Set();
    notifInitializedRef.current = false;
  }, [user?.id]);

  const refreshUnreadCount = useCallback(async (force = false) => {
    if (!user || !token || user.isAdmin) {
      setUnreadCount(0);
      return;
    }
    const cacheKey = unreadCountCacheKey(user.id);
    const needsInit = !notifInitializedRef.current;

    const cached = readSessionCache<number>(cacheKey);
    if (!force && !needsInit && cached !== null) {
      setUnreadCount(cached);
      return;
    }
    try {
      const data = await dedupeRequest(cacheKey, () => listNotificationsApi(token));
      setUnreadCount(data.unread_count);
      writeSessionCache(cacheKey, data.unread_count, UNREAD_COUNT_CACHE_TTL_MS);

      for (const n of data.notifications) {
        if (!needsInit && !n.is_read && !seenNotificationIdsRef.current.has(n.id)) {
          emitPushToast({
            title: n.title,
            body: n.body ?? undefined,
            type: n.type,
            targetRoute: getNotificationTarget(n),
          });
        }
        seenNotificationIdsRef.current.add(n.id);
      }
      notifInitializedRef.current = true;
    } catch {
      setUnreadCount(0);
    }
  }, [token, user]);

  useEffect(() => {
    if (isApp) {
      const mainEl = document.querySelector(".app-main");
      mainEl?.scrollTo({ top: 0 });
    } else {
      window.scrollTo({ top: 0 });
    }
  }, [location.pathname]);

  useEffect(() => {
    refreshUnreadCount();
  }, [refreshUnreadCount, location.pathname]);

  useEffect(() => {
    const handleNotificationChanged = () => refreshUnreadCount(true);
    const handleFocus = () => refreshUnreadCount();
    window.addEventListener(NOTIFICATION_REFRESH_EVENT, handleNotificationChanged);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener(NOTIFICATION_REFRESH_EVENT, handleNotificationChanged);
      window.removeEventListener("focus", handleFocus);
    };
  }, [refreshUnreadCount]);

  useEffect(() => {
    const interval = setInterval(() => refreshUnreadCount(true), NOTIFICATION_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshUnreadCount]);

  const handleDockMove = (e: React.PointerEvent) => {
    if (!navRef.current) return;
    Array.from(navRef.current.children).forEach((el) => {
      const r = el.getBoundingClientRect();
      const t = Math.max(0, 1 - Math.abs(e.clientX - r.x - r.width / 2) / 100);
      (el as HTMLElement).style.scale = String(1 + t * 0.1);
    });
  };

  const handleDockLeave = () => {
    if (!navRef.current) return;
    Array.from(navRef.current.children).forEach((el) => {
      (el as HTMLElement).style.scale = "1";
    });
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  // ── 앱 레이아웃 ───────────────────────────────────────────
  if (isApp && !user?.isAdmin) {
    return (
      <div className="app-shell h-screen w-full flex flex-col bg-background overflow-hidden">
        {/* 상단 헤더 */}
        <header className="app-header w-full shrink-0 z-[9999] bg-card border-b border-border shadow-sm">
          <div className="px-4 h-[var(--app-header-content-height)] flex items-center justify-between">
            <Link to="/">
              <img src={logoImage} alt="맘마케어 로고" className="h-5 w-auto object-contain" />
            </Link>
            {user ? (
              <div className="flex items-center gap-0">
                <Link to="/notifications">
                  <button title="알림" className="p-[11px] rounded-full hover:bg-[#F6E26B]/30 transition-colors text-foreground relative">
                    <Bell className="w-5 h-5 sm:w-[22px] sm:h-[22px]" />
                    {unreadCount > 0 && (
                      <span className="absolute top-1.5 right-1.5 min-w-[16px] h-[16px] px-1 bg-[#FFB7A5] rounded-full text-[9px] leading-[16px] text-[#3D3C38] font-bold text-center">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </button>
                </Link>
                <Link to="/profile">
                  <button title="프로필" className="p-[11px] rounded-full hover:bg-[#F6E26B]/30 transition-colors text-foreground">
                    <User className="w-5 h-5 sm:w-[22px] sm:h-[22px]" />
                  </button>
                </Link>
              </div>
            ) : (
              <Link to="/login">
                <button className="text-[#3D3C38] px-4 py-1.5 text-sm rounded-full font-semibold shadow-md
                  bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)]">
                  로그인
                </button>
              </Link>
            )}
          </div>
        </header>

        {/* 메인 콘텐츠 — 독립 스크롤 영역 */}
        <main className="app-main flex-1 overflow-y-auto overflow-x-hidden">
          <Outlet />
        </main>

        {/* 하단 탭바 */}
        <nav className="app-bottom-nav fixed bottom-0 left-0 right-0 w-full z-[9999] bg-card border-t border-border grid grid-cols-4 h-20">
          {appTabItems.map((item) => {
            const isActive = item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center justify-center gap-1 w-full h-full transition-colors ${
                  isActive ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                <item.icon size={24} />
                <span className="text-xs font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <PushToast />
      </div>
    );
  }

  // ── 웹 레이아웃 (기존) ────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-[9999] bg-card border-b border-border shadow-sm">
        <div className="w-full px-4 sm:px-6 lg:px-10 h-16 flex items-center justify-between gap-4 relative">
          <Link to={user?.isAdmin ? "/admin" : "/"} className="shrink-0">
            <img src={logoImage} alt="맘마케어 로고" className="h-9 w-auto object-contain" />
          </Link>

          <nav ref={navRef} onPointerMove={handleDockMove} onPointerLeave={handleDockLeave} className="hidden lg:flex items-center gap-7 absolute left-1/2 -translate-x-1/2">
            {user?.isAdmin ? (
              adminNavItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`relative flex flex-col items-center gap-0.5 text-[1.17rem] font-medium transition-all whitespace-nowrap ${
                    location.pathname === item.path
                      ? "text-foreground -translate-y-1"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  style={{ fontFamily: "'Paperlogic'", fontWeight: 600, letterSpacing: "0.02em" }}
                >
                  {location.pathname === item.path && (
                    <>
                      <img src={forkImage} alt="" className="absolute top-[27px] h-[16px] w-auto" />
                      <span
                        className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[30px] rounded-full -z-10"
                        style={{
                          width: "calc(100% + 24px)",
                          background: `radial-gradient(ellipse at center, ${item.color} 0%, ${item.color} 20%, transparent 75%)`,
                          opacity: 0.3,
                        }}
                      />
                    </>
                  )}
                  {item.label}
                </Link>
              ))
            ) : (
              navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`relative flex flex-col items-center gap-0.5 text-[1.17rem] font-medium transition-all whitespace-nowrap ${
                    location.pathname === item.path
                      ? "text-foreground -translate-y-1"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  style={{ fontFamily: "'Paperlogic'", fontWeight: 600, letterSpacing: "0.03em" }}
                >
                  {location.pathname === item.path && (
                    <>
                      <img src={forkImage} alt="" className="absolute top-[27px] h-[16px] w-auto" />
                      <span
                        className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[32px] rounded-full -z-10"
                        style={{
                          width: "calc(100% + 24px)",
                          background: `radial-gradient(ellipse at center, ${item.color} 0%, ${item.color} 20%, transparent 75%)`,
                          opacity: 0.3,
                        }}
                      />
                    </>
                  )}
                  {item.label}
                </Link>
              ))
            )}
          </nav>

          <div className="flex items-center gap-1.5 shrink-0">
            {user ? (
              <>
                {!user.isAdmin && (
                  <>
                    <Link to="/profile">
                      <button title="프로필" className="p-2.5 rounded-full hover:bg-[#F6E26B]/30 transition-colors text-foreground">
                        <User size={22} />
                      </button>
                    </Link>
                    <Link to="/notifications">
                      <button title="알림" className="p-2.5 rounded-full hover:bg-[#F6E26B]/30 transition-colors text-foreground relative">
                        <Bell size={22} />
                        {unreadCount > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-[#FFB7A5] rounded-full text-[10px] leading-[18px] text-[#3D3C38] font-bold text-center">
                            {unreadCount > 9 ? "9+" : unreadCount}
                          </span>
                        )}
                      </button>
                    </Link>
                    <Link to="/settings">
                      <button title="설정" className="p-2.5 rounded-full hover:bg-[#F6E26B]/30 transition-colors text-foreground">
                        <Settings size={22} />
                      </button>
                    </Link>
                  </>
                )}
                {/* 소/중형: 아이콘만 */}
                <button
                  onClick={handleLogout}
                  title="로그아웃"
                  className="lg:hidden p-2.5 rounded-full hover:bg-[#F6E26B]/30 transition-colors text-foreground ml-1"
                >
                  <LogOut size={18} />
                </button>
                {/* 대형: 텍스트 포함 */}
                <button
                  onClick={handleLogout}
                  title="로그아웃"
                  className="hidden lg:flex items-center gap-1.5 px-4 py-2 text-sm rounded-full border border-border hover:bg-[#F6E26B]/20 transition-colors ml-1"
                >
                  <LogOut size={16} />
                  로그아웃
                </button>
              </>
            ) : (
              <Link to="/login">
                <button className="text-[#3D3C38] px-5 py-2 text-sm rounded-full font-semibold transition-opacity shadow-md whitespace-nowrap
                  bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)]
                  hover:bg-[radial-gradient(ellipse_at_center,#FEF5CC_0%,#FFEFAB_100%)]">
                  로그인 / 회원가입
                </button>
              </Link>
            )}

          </div>
        </div>

        {/* 소/중형 화면 네비게이션 바 (lg 미만에서 항상 표시) */}
        <div className="lg:hidden border-t border-border/50 bg-card">
          <nav className="flex items-center justify-center px-2 py-1 gap-0.5 overflow-x-auto scrollbar-hide">
            {user?.isAdmin ? (
              adminNavItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`text-sm sm:text-base font-semibold px-3 sm:px-4 py-1.5 rounded-full whitespace-nowrap transition-colors ${
                    location.pathname === item.path
                      ? "bg-[#F6E26B]/40 text-foreground"
                      : "text-muted-foreground hover:bg-[#F6E26B]/20"
                  }`}
                >
                  {item.label}
                </Link>
              ))
            ) : (
              navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`text-sm sm:text-base font-semibold px-3 sm:px-4 py-1 rounded-full whitespace-nowrap transition-colors ${
                    location.pathname.startsWith(item.path)
                      ? "bg-[#F6E26B]/40 text-foreground"
                      : "text-muted-foreground hover:bg-[#F6E26B]/20"
                  }`}
                >
                  {item.label}
                </Link>
              ))
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <PushToast />

      <footer className="bg-card py-2">
        <div className="w-full px-4 flex items-center justify-center">
          <p className="text-xs text-muted-foreground text-center">
            아기의 건강한 성장을 위한 모든 순간,{" "}
            <span
              className="font-medium opacity-80"
              style={{ fontFamily: "'Paperlogic', sans-serif" }}
            >
              MammaCare
            </span>
            가 함께합니다.
            <br />© 2025 MammaCare. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
