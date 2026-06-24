import { useEffect } from "react";
import { useNavigate } from "react-router";
import { ChevronLeft } from "lucide-react";

export default function TermsOfService() {
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-5 py-6">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5"
      >
        <ChevronLeft size={16} />
        뒤로 가기
      </button>

      <h1 className="text-2xl font-bold mb-6">서비스 이용약관</h1>

      <div className="bg-card border border-border rounded-3xl p-6 space-y-6 text-sm text-foreground leading-relaxed">
        <section>
          <h2 className="font-bold text-base mb-2">제1조 (목적)</h2>
          <p className="text-muted-foreground">
            본 약관은 맘마케어(이하 "회사")가 제공하는 이유식 관리 서비스(이하 "서비스")의 이용과 관련하여
            회사와 이용자 간의 권리, 의무 및 책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.
          </p>
        </section>

        <section>
          <h2 className="font-bold text-base mb-2">제2조 (정의)</h2>
          <p className="text-muted-foreground">
            "서비스"란 회사가 제공하는 이유식 일정 관리, 영양 분석, 레시피 추천, 알레르기 관리 등
            아기의 건강한 성장을 위한 모든 서비스를 의미합니다.
          </p>
        </section>

        <section>
          <h2 className="font-bold text-base mb-2">제3조 (이용계약의 성립)</h2>
          <p className="text-muted-foreground">
            이용계약은 이용자가 약관의 내용에 동의하고 회원가입을 완료한 시점에 성립됩니다.
            만 14세 미만의 아동은 법정대리인의 동의 없이 서비스를 이용할 수 없습니다.
          </p>
        </section>

        <section>
          <h2 className="font-bold text-base mb-2">제4조 (서비스의 제공 및 변경)</h2>
          <p className="text-muted-foreground">
            회사는 이용자에게 아래와 같은 서비스를 제공합니다.
          </p>
          <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
            <li>이유식 일정 관리 서비스</li>
            <li>영양 분석 및 식단 추천 서비스</li>
            <li>레시피 제공 서비스</li>
            <li>알레르기 관리 서비스</li>
            <li>커뮤니티 서비스</li>
          </ul>
        </section>

        <section>
          <h2 className="font-bold text-base mb-2">제5조 (이용자의 의무)</h2>
          <p className="text-muted-foreground">
            이용자는 서비스 이용 시 타인의 개인정보를 무단으로 수집·이용하거나, 허위 정보를 등록하거나,
            서비스의 정상적인 운영을 방해하는 행위를 하여서는 안 됩니다.
          </p>
        </section>

        <section>
          <h2 className="font-bold text-base mb-2">제6조 (면책조항)</h2>
          <p className="text-muted-foreground">
            본 서비스에서 제공하는 영양 정보 및 이유식 가이드는 참고용이며, 의료적 조언을 대체하지 않습니다.
            아기의 건강 상태에 따라 전문 의료인과 상담하시기 바랍니다.
          </p>
        </section>

        <p className="text-xs text-muted-foreground pt-2 border-t border-border">
          시행일: 2026년 6월 23일
        </p>
      </div>
    </div>
  );
}
