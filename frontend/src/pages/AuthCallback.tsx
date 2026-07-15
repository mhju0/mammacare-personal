import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useApp } from "../context/AppContext";
import Login from "./Login";

export default function AuthCallback() {
  const { loginWithToken } = useApp();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const socialError = search.get("social_error");
    if (socialError) {
      navigate(`/login?social_error=${socialError}`, { replace: true });
      return;
    }

    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const token = params.get("access_token") ?? params.get("token");

    if (hash) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }

    if (!token) {
      setError("로그인에 실패했습니다.");
      return;
    }

    loginWithToken(token).then(({ success, babyCount }) => {
      if (!success) {
        setError("로그인에 실패했습니다.");
        return;
      }
      if (babyCount === 0) {
        navigate("/profile", { replace: true });        // 첫 로그인 — 프로필 등록
      } else if (babyCount >= 2) {
        navigate("/profile-select", { replace: true }); // 아기 2명 이상 — 프로필 선택
      } else {
        navigate("/", { replace: true });               // 아기 1명 — 홈
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative">
      {/* 뒤 배경: 로그인 화면 그대로 노출 */}
      <Login />

      {/* 처리 중 / 실패 팝업 오버레이 */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 pt-16 pointer-events-none">
        {error ? (
          <div className="pointer-events-auto w-full max-w-xs rounded-3xl border border-border bg-card px-6 py-7 text-center shadow-2xl">
            <p className="text-sm text-destructive">{error}</p>
            <button
              onClick={() => navigate("/login", { replace: true })}
              className="mt-4 w-full rounded-xl py-2.5 text-sm font-bold text-warm-fg
                bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--sage-100)_100%)]
                hover:bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--sage-200)_100%)]
                shadow-sm transition-all duration-300"
            >
              로그인 페이지로 이동
            </button>
          </div>
        ) : (
          <div className="pointer-events-auto flex w-auto items-center gap-3 rounded-full border border-gray-200 bg-card px-6 py-4 shadow-lg">
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sage-100 animate-bounce [animation-delay:-0.3s]" />
              <span className="w-2.5 h-2.5 rounded-full bg-sage-100 animate-bounce [animation-delay:-0.15s]" />
              <span className="w-2.5 h-2.5 rounded-full bg-sage-100 animate-bounce" />
            </div>
            <span className="text-lg font-medium text-primary-foreground">로그인 처리 중입니다</span>
          </div>
        )}
      </div>
    </div>
  );
}
