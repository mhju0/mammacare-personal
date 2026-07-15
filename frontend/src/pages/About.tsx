import { useState } from "react";
import { useNavigate } from "react-router";
import { CalendarDays, ShieldAlert, Salad, Users, Star, Heart, Baby, Quote, Milestone } from "lucide-react";
import { useApp } from "../context/AppContext";
import { Capacitor } from "@capacitor/core";
import TutorialModal from "../components/TutorialModal";
import { tutorialSlides } from "../components/tutorialSlides";
import homeImage8 from "../asset/home_image_8.webp";
import mamma1 from "../asset/meal_1.png";
import mamma2 from "../asset/meal_2.png";
import mamma3 from "../asset/meal_3.png";
import mamma4 from "../asset/meal_4.png";

const isApp = Capacitor.isNativePlatform();

const features = [
  {
    icon: <CalendarDays className="w-5 h-5 sm:w-7 sm:h-7" />,
    bgClass: "bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--safe-bg)_50%,var(--sage-150)_100%)]",
    title: "이유식 일정 관리",
    desc: isApp
      ? <>개월 수에 맞는 이유식 일정을 자동으로 생성하고, <br />매일 먹은 식품을 기록해 성장 단계별 맞춤 식단을<br />관리하세요.</>
      : "개월 수에 맞는 이유식 일정을 자동으로 생성하고, 매일 먹은 식품을 기록해 성장 단계별 맞춤 식단을 관리하세요.",
  },
  {
    icon: <ShieldAlert className="w-5 h-5 sm:w-7 sm:h-7" />,
    bgClass: "bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--safe-bg)_50%,var(--sage-150)_100%)]",
    title: "알레르기 추적",
    desc: isApp
      ? <>새로운 식재료를 처음 먹일 때 알레르기 반응을 기록하고 추적하세요. 위험 성분을 미리 파악해 안전한 이유식을 만들어 드립니다.</>
      : "새로운 식재료를 처음 먹일 때 알레르기 반응을 기록하고 추적하세요. 위험 성분을 미리 파악해 안전한 이유식을 만들어 드립니다.",
  },
  {
    icon: <Salad className="w-5 h-5 sm:w-7 sm:h-7" />,
    bgClass: "bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--safe-bg)_50%,var(--sage-150)_100%)]",
    title: "영양 정보 & 레시피",
    desc: isApp
      ? <>아이의 연령과 발달 단계에 맞는<br />영양 균형 정보를 제공하고, <br />재료별 맞춤 이유식 레시피를 추천해 드립니다.</>
      : "아이의 연령과 발달 단계에 맞는 영양 균형 정보를 제공하고, 재료별 맞춤 이유식 레시피를 추천해 드립니다.",
  },
  {
    icon: <Users className="w-5 h-5 sm:w-7 sm:h-7" />,
    bgClass: "bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--safe-bg)_50%,var(--sage-150)_100%)]",
    title: "육아 커뮤니티",
    desc: isApp
      ? <>또래 아이를 키우는 부모들과 이유식 노하우를<br />공유하고, 궁금한 점을 함께 해결해 보세요.</>
      : "또래 아이를 키우는 부모들과 이유식 노하우를 공유하고, 궁금한 점을 함께 해결해 보세요.",
  },
];

const steps = [
  {
    num: "01",
    title: "아기 프로필 등록",
    desc: isApp
      ? <>아이의 생년월일, 성별, 이유식 시작일을 입력하면<br />개월 수에 맞는 맞춤 서비스가 시작됩니다.</>
      : "아이의 생년월일, 성별, 이유식 시작일을 입력하면 개월 수에 맞는 맞춤 서비스가 시작됩니다.",
  },
  {
    num: "02",
    title: "이유식 일정 시작",
    desc: isApp
      ? <>오늘 먹은 식재료를 기록하고, <br />처음 먹는 식품은 알레르기 관찰 모드로 3일간 추적합니다.</>
      : "오늘 먹은 식재료를 기록하고, 처음 먹는 식품은 알레르기 관찰 모드로 3일간 추적합니다.",
  },
  {
    num: "03",
    title: "영양 & 알레르기 확인",
    desc: isApp
      ? <>누적 기록을 바탕으로 영양 균형을 점검하고,<br />알레르기 위험 성분을 한눈에 파악하세요.</>
      : "누적 기록을 바탕으로 영양 균형을 점검하고, 알레르기 위험 성분을 한눈에 파악하세요.",
  },
];

export default function About() {
  const navigate = useNavigate();
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const { token } = useApp();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden h-[700px]">
        <img
          src={homeImage8}
          alt="맘마케어 소개 이미지"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(255, 250, 240, 0.80) 30%, rgba(255, 250, 240, 0.90) 50%, rgba(255, 250, 240, 0.95) 75%, rgba(255, 250, 240, 1) 100%)",
          }}
        />
        <div className="relative h-full flex flex-col justify-center px-4 sm:px-10 lg:px-20">
          <div className="max-w-3xl mx-auto space-y-9 text-center">

            {/* 우리 아이 '첫' 이유식 파트너: 웹 text-3xl → 앱 text-xl */}
            <div
              className={`inline-flex items-center gap-2 font-semibold ${isApp ? "text-xl" : "text-3xl"}`}
              style={{ fontFamily: "'SeoulNamsan'", letterSpacing: "-0.02em" }}
            >
              우리 아이 '첫' 이유식 파트너
            </div>

            {/* 맘마케어,: 웹 text-5xl → 앱 text-3xl */}
            <h1
              className={`text-foreground ${isApp ? "text-3xl" : "text-4xl"}`}
              style={{
                fontFamily: "'Paperlogic'",
                fontWeight: 500,
                lineHeight: 1.3,
                letterSpacing: "0.08em",
              }}
            >
              맘마케어,
              <br />
              {/* 더 안전한 이유식: 웹 text-6xl → 앱 text-4xl */}
              <span
                className={`inline-flex items-center gap-1 ${isApp ? "text-4xl" : "text-4xl sm:text-5xl"}`}
                style={{ fontFamily: "'Paperlogic'", fontWeight: 500, color: "var(--warm-fg)" }}
              >
                <span style={{ position: "relative", display: "inline-block" }}>
                  <span style={{ position: "relative", top: "3px" , zIndex: 1, letterSpacing: "0.00em" }}>더 안전한 이유식</span>
                </span>
              </span>
              {isApp ? (
                <span style={{ position: "relative", top: "6px" }}>을<br />시작하는 방법</span>
              ) : (
                <span style={{ position: "relative", top: "6px" }}>을 시작하는 방법</span>
              )}
            </h1>

            {/* 인용 문구: 웹 text-2xl → 앱 text-base */}
            <div style={{ position: "relative", display: "inline-block", padding: "0 2.5rem" }}>
              <Quote
                fill="currentColor"
                strokeWidth={0}
                className="w-7 h-7 sm:w-10 sm:h-10"
                style={{
                  transform: "rotate(180deg)",
                  position: "absolute",
                  left: "-0.5rem",
                  top: "1.5rem",
                  opacity: 0.25,
                  color: "var(--warm-fg)",
                  pointerEvents: "none",
                }}
              />
              <p
                className={`leading-relaxed font-semibold ${isApp ? "text-base" : "text-xl"}`}
                style={{ fontFamily: "'SeoulNamsan'", position: "relative", zIndex: 1, letterSpacing: "-0.02em" }}
              >
                개월별 맞춤 식단부터 알레르기 추적까지,<br />
                맘마케어는 처음 이유식을 시작하는 부모님 곁에서<br />
                안전하고 즐거운 이유식 여정을 함께합니다.
              </p>
              <Quote
                fill="currentColor"
                strokeWidth={0}
                className="w-7 h-7 sm:w-10 sm:h-10"
                style={{
                  position: "absolute",
                  right: "-0.5rem",
                  bottom: "1.5rem",
                  opacity: 0.25,
                  color: "var(--warm-fg)",
                  pointerEvents: "none",
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* 수치 요약 */}
      <section className="bg-card border-y border-border">
        <div className="max-w-4xl mx-auto px-5 py-8 grid grid-cols-3 gap-4 text-center">
          {[
            { icon: <Star className="mx-auto mb-1 w-6 h-6 sm:w-[30px] sm:h-[30px]" />, value: "300+", label: "이유식 레시피" },
            { icon: <Heart className="mx-auto mb-1 w-6 h-6 sm:w-[30px] sm:h-[30px]" />, value: "72시간", label: "알레르기 테스트 기능" },
            { icon: <Baby className="mx-auto mb-1 w-6 h-6 sm:w-[30px] sm:h-[30px]" />, value: "4단계", label: "개월별 맞춤 식단" },
          ].map((item) => (
            <div key={item.label} className="space-y-0.5">
              <div className="text-sage-200">{item.icon}</div>
              {/* 웹 text-2xl → 앱 text-base */}
              <p className={`font-bold text-foreground ${isApp ? "text-base" : "text-2xl"}`}>{item.value}</p>
              {/* 웹 text-lg → 앱 text-xs */}
              <p className={`text-muted-foreground ${isApp ? "text-sm" : "text-lg"}`}>{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 주요 기능 */}
      <section className="max-w-4xl mx-auto px-5 py-12">
        {/* 웹 text-3xl → 앱 text-xl */}
        <h2 className={`font-bold text-foreground text-center mb-2 ${isApp ? "text-xl" : "text-3xl"}`}>
          주요 기능
        </h2>
        {/* 웹 text-lg → 앱 text-sm */}
        <p className={`text-center text-muted-foreground mb-8 ${isApp ? "text-sm" : "text-lg"}`}>
          맘마케어가 제공하는 핵심 서비스를 만나보세요
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {features.map((f) => (
            <div
              key={f.title}
              className={`bg-card border border-border rounded-3xl flex gap-4 items-start hover:shadow-md transition-shadow ${isApp ? "p-4" : "p-6"}`}
            >
              <div className={`flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center ${f.bgClass}`}>
                <span style={{ color: "var(--warm-fg)" }}>{f.icon}</span>
              </div>
              <div>
                {/* 웹 text-base → 앱 text-sm */}
                <h3 className={`font-bold text-foreground mb-1 ${isApp ? "text-sm" : "text-base"}`}>
                  {f.title}
                </h3>
                {/* 웹 text-sm → 앱 text-xs (최소값) */}
                <p className={`text-muted-foreground leading-relaxed ${isApp ? "text-xs" : "text-sm"}`}>
                  {f.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 사용 방법 */}
      <section>
        <div className="max-w-4xl mx-auto px-5 py-12">
          {/* 웹 text-3xl → 앱 text-xl */}
          <h2 className={`font-bold text-foreground text-center mb-2 ${isApp ? "text-xl" : "text-3xl"}`}>
            이렇게 시작해요
          </h2>
          {/* 웹 text-lg → 앱 text-sm */}
          <p className={`text-center text-muted-foreground mb-10 ${isApp ? "text-sm" : "text-lg"}`}>
            3단계로 간편하게 이유식 관리를 시작하세요
          </p>
          <div className="flex flex-col md:flex-row gap-6">
            {steps.map((s, i) => (
              <div key={s.num} className="flex-1 relative">
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-6 left-full w-6 h-0.5 z-10" />
                )}
                <div className={`bg-card border border-border rounded-3xl h-full ${isApp ? "p-4 space-y-2" : "p-6 space-y-3"}`}>
                  {isApp ? (
                    <div className="flex items-center gap-2">
                      <span className="font-black text-xl flex-shrink-0" style={{ color: "var(--sage-200)" }}>
                        {s.num}
                      </span>
                      <h3 className="font-bold text-foreground text-sm">
                        {s.title}
                      </h3>
                    </div>
                  ) : (
                    <>
                      <span className="font-black text-3xl" style={{ color: "var(--sage-200)" }}>
                        {s.num}
                      </span>
                      <h3 className="font-bold text-foreground text-base">
                        {s.title}
                      </h3>
                    </>
                  )}
                  {/* 웹 text-sm → 앱 text-xs (최소값) */}
                  <p className={`text-muted-foreground leading-relaxed ${isApp ? "text-xs" : "text-sm"}`}>
                    {s.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 이미지 갤러리 */}
      <section className="max-w-4xl mx-auto px-5 py-12">
        {/* 웹 text-3xl → 앱 text-xl */}
        <h2 className={`font-bold text-foreground text-center mb-8 ${isApp ? "text-xl" : "text-3xl"}`}>
          맘마케어와 함께하는 이유식 여정
        </h2>
        <div className="grid grid-cols-4 gap-3">
          {[mamma1, mamma2, mamma3, mamma4].map((src, i) => (
            <img
              key={i}
              src={src}
              alt={`맘마케어 이미지 ${i + 1}`}
              className="w-full h-32 md:h-44 object-cover"
            />
          ))}
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="max-w-4xl mx-auto px-5 py-12 text-center space-y-5">
          {/* 웹 text-3xl → 앱 text-xl */}
          <h2 className={`font-bold text-foreground ${isApp ? "text-xl" : "text-3xl"}`}>
            지금 바로 맘마케어를 시작해보세요
          </h2>
          {/* 웹 text-lg → 앱 text-sm */}
          <p className={`text-muted-foreground ${isApp ? "text-sm" : "text-lg"}`}>
            회원가입 후 아기 프로필만 등록하면 바로 사용할 수 있어요.
            <br />
            무료로 모든 기능을 이용하실 수 있습니다.
          </p>
          <div className="flex flex-col items-center gap-3">
            {/* 웹 !text-base → 앱 !text-xs */}
            <button
              onClick={() => setTutorialOpen(true)}
              className={`
                btn-primary !px-5 !py-3.5
                ${isApp ? "!text-xs" : "!text-base"}
                font-semibold
                !bg-[radial-gradient(ellipse_at_center,var(--warm-surface)_0%,var(--warm-surface)_100%)]
                hover:!bg-[radial-gradient(ellipse_at_center,var(--warm-surface)_0%,var(--warm-surface-soft)_100%)]
                !text-warm-fg
                transition-all duration-300 shadow-md
                flex items-center gap-2
              `}
            >
              <Milestone size={18} />
              맘마케어 시작 가이드
            </button>
            {!token && (
              <button
                onClick={() => navigate("/signup")}
                className={`
                  btn-primary !px-9.5 !py-3.5
                  ${isApp ? "!text-xs" : "!text-base"}
                  font-semibold
                  !bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--sage-100)_100%)]
                  hover:!bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--sage-200)_100%)]
                  !text-warm-fg
                  transition-all duration-300 shadow-md
                `}
              >
                → 무료로 시작하기
              </button>
            )}
          </div>
        </div>
      </section>

      <TutorialModal
        open={tutorialOpen}
        onClose={() => setTutorialOpen(false)}
        slides={tutorialSlides}
        title="맘마케어 시작 가이드"
      />
    </div>
  );
}
