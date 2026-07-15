import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useApp } from "../../context/AppContext";
import { CreditCard, Receipt, RefreshCcw, AlertTriangle } from "lucide-react";

export default function AdminPayments() {
  const { user, authLoading } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user?.isAdmin) {
      navigate("/login");
    }
  }, [authLoading, user, navigate]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
      <div className="mb-5">
        <h1 className="text-2xl font-bold mb-2 flex items-center gap-2" 
        style={{ fontFamily: "'Paperlogic'", fontWeight: 600 }}><CreditCard size={24} />결제 관리</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {[
          { title: "결제 내역", desc: "기간별 · 사용자별 결제 조회", icon: Receipt },
          { title: "환불 처리", desc: "환불 요청 및 이력 관리", icon: RefreshCcw },
          { title: "이상 거래 감지", desc: "비정상 결제 패턴 알림", icon: AlertTriangle },
        ].map((card) => (
          <div key={card.title} className="bg-card border border-border rounded-3xl p-6 flex gap-4 items-start hover:shadow-md transition-shadow opacity-60">
            <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--safe-bg)_50%,var(--sage-150)_100%)] flex items-center justify-center">
              <span style={{ color: "var(--warm-fg)" }}><card.icon size={24} /></span>
            </div>
            <div>
              <h3 className="font-bold text-foreground mb-1">{card.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{card.desc}</p>
              <span className="inline-block mt-2 text-xs font-medium text-muted-foreground">개발 예정</span>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-3xl p-10 flex flex-col items-center justify-center text-center hover:shadow-md transition-shadow">
        <div className="w-16 h-16 rounded-2xl bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--safe-bg)_50%,var(--sage-150)_100%)] flex items-center justify-center mb-4">
          <span style={{ color: "var(--warm-fg)" }}><CreditCard size={32} /></span>
        </div>
        <h3 className="font-bold text-foreground mb-2">결제 기능 준비 중</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">구독 · 인앱 결제 도입 시 활성화됩니다.</p>
      </div>
    </div>
  );
}
