import { useEffect } from "react";
import { useNavigate } from "react-router";
import { ChevronLeft } from "lucide-react";

export default function PrivacyPolicy() {
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

      <h1 className="text-2xl font-bold mb-6">개인정보 처리방침</h1>

      <div className="bg-card border border-border rounded-3xl p-6 space-y-6 text-sm text-foreground leading-relaxed">
        <section>
          <h2 className="font-bold text-base mb-2">1. 수집하는 개인정보 항목</h2>
          <p className="text-muted-foreground mb-2">회사는 서비스 제공을 위해 다음의 개인정보를 수집합니다.</p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li>필수: 이름, 이메일 주소, 아이디, 비밀번호</li>
            <li>선택: 전화번호, 주소</li>
            <li>아기 프로필: 이름, 생년월일, 성별, 신장, 체중, 이유식 정보</li>
          </ul>
        </section>

        <section>
          <h2 className="font-bold text-base mb-2">2. 개인정보 수집 및 이용 목적</h2>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li>회원 가입 및 관리</li>
            <li>이유식 일정 및 영양 정보 맞춤 제공</li>
            <li>서비스 이용 통계 분석 및 개선</li>
            <li>고객 문의 및 불만 처리</li>
          </ul>
        </section>

        <section>
          <h2 className="font-bold text-base mb-2">3. 개인정보 보유 및 이용 기간</h2>
          <p className="text-muted-foreground">
            회원 탈퇴 시까지 보유·이용합니다. 단, 관련 법령에 따라 일정 기간 보존이 필요한 경우
            해당 기간 동안 보관합니다.
          </p>
        </section>

        <section>
          <h2 className="font-bold text-base mb-2">4. 개인정보의 제3자 제공</h2>
          <p className="text-muted-foreground">
            회사는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다.
            다만, 이용자의 동의가 있거나 법령의 규정에 의한 경우는 예외로 합니다.
          </p>
        </section>

        <section>
          <h2 className="font-bold text-base mb-2">5. 개인정보 보호책임자</h2>
          <p className="text-muted-foreground">
            이용자의 개인정보 관련 문의, 불만 처리 등을 위해 개인정보 보호책임자를 지정하고 있습니다.
          </p>
          <div className="mt-2 p-3 bg-muted rounded-xl text-muted-foreground">
            <p>담당자: 맘마케어 개인정보 보호팀</p>
            <p>이메일: privacy@mammacare.com</p>
          </div>
        </section>

        <section>
          <h2 className="font-bold text-base mb-2">6. 이용자의 권리</h2>
          <p className="text-muted-foreground">
            이용자는 언제든지 자신의 개인정보를 조회, 수정, 삭제 요청할 수 있으며,
            개인정보 처리에 대한 동의를 철회할 수 있습니다.
          </p>
        </section>

        <p className="text-xs text-muted-foreground pt-2 border-t border-border">
          시행일: 2026년 6월 23일
        </p>
      </div>
    </div>
  );
}
