import type { ReactNode } from "react";
import { useApp } from "../context/AppContext";
import { useNavigate } from "react-router";

interface Props {
  children: ReactNode;
}

export default function ProtectedPage({ children }: Props) {
  const { user, authLoading } = useApp();
  const navigate = useNavigate();

  if (authLoading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center text-sm text-muted-foreground">
        로그인 상태 확인 중
      </div>
    );
  }

  if (user) return <>{children}</>;

  return (
    <div className="relative min-h-[70vh] overflow-hidden">
      {/* 내용 블러처리 */}
      <div
        className="pointer-events-none select-none"
        style={{ filter: "blur(7px)", opacity: 0.7 }}
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Overlay with login prompt */}
      <div className="fixed inset-0 z-40 flex items-start justify-center pt-56 bg-background/40 pointer-events-none">
        <div className="pointer-events-auto text-center bg-card rounded-3xl px-8 py-10 shadow-xl border border-border max-w-xs w-full mx-4">
          <div className="text-5xl mb-4">🔒</div>
          <h3
            className="font-bold text-xl mb-1 text-foreground"
          >
            로그인이 필요한 서비스예요
          </h3>
          <p className="text-base text-muted-foreground mb-4 leading-relaxed">
            회원가입 후 이용하실 수 있어요
          </p>
          <button
            onClick={() => navigate("/signup")}
            className="w-full py-3 font-bold rounded-3xl text-sm mb-2 text-warm-fg
                bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--sage-100)_100%)]
                hover:bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--sage-200)_100%)]
                shadow-sm transition-all duration-300"
          >
            회원가입하고 이용하기
          </button>
          <button
            onClick={() => navigate("/login")}
            className="w-full py-2.5 text-base text-muted-foreground hover:text-foreground transition-colors"
          >
            이미 계정이 있으신가요? 로그인하기
          </button>
        </div>
      </div>
    </div>
  );
}
