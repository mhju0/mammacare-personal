import { useState, useEffect, useCallback } from "react";
import { Baby, ChevronDown, Milestone, Smartphone, Download } from "lucide-react";
import { useNavigate, useLocation } from "react-router";
import { Capacitor } from "@capacitor/core";
import { QRCodeSVG } from "qrcode.react";
import TutorialModal from "../components/TutorialModal";
import { tutorialSlides } from "../components/tutorialSlides";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import homeImage1 from "../asset/home_image_1.webp";
import homeImage2 from "../asset/home_image_2.webp";
import homeImage3 from "../asset/home_image_3.webp";
import homeImage4 from "../asset/home_image_7.webp";
import About from "./About";

const APK_URL = "https://mammacare.eastus2.cloudapp.azure.com/downloads/mammacare.apk";

// Layout.tsx와 동일하게 모듈 레벨에서 판별
const isApp = Capacitor.isNativePlatform();

const slides = [
  {
    src: homeImage3,
    alt: "맘마케어 슬라이드 꾸밈 1",
    style: { objectPosition: "50% 50%", transform: "translateX(0%)" },
  },
  {
    src: homeImage2,
    alt: "맘마케어 슬라이드 꾸밈 2",
    style: { objectPosition: "50% 50%", transform: "translateX(0%)" },
  },
  {
    src: homeImage4,
    alt: "맘마케어 슬라이드 꾸밈 3",
    style: { objectPosition: "50% 50%", transform: "translateX(0%)" },
  },
  {
    src: homeImage1,
    alt: "맘마케어 슬라이드 꾸밈 4",
    style: { objectPosition: "50% 50%", transform: "translateX(0%)" },
  },
];

// 끝에 첫 슬라이드 복사본 추가 → 4→1 전환 시 우측에서 자연스럽게 넘어오게
const extendedSlides = [...slides, slides[0]];

export default function Home() {
  const [current, setCurrent] = useState(0);
  const [animated, setAnimated] = useState(true);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("showTutorial") === "true") {
      setTutorialOpen(true);
      navigate("/", { replace: true });
    }
  }, [location.search, navigate]);

  const next = useCallback(() => {
    setAnimated(true);
    setCurrent((c) => c + 1);
  }, []);

  // 클론(인덱스 4) 도착 후 애니메이션 없이 진짜 인덱스 0으로 순간이동
  useEffect(() => {
    if (current === slides.length) {
      const t = setTimeout(() => {
        setAnimated(false);
        setCurrent(0);
      }, 500);
      return () => clearTimeout(t);
    }
  }, [current]);

  // 순간이동 직후 다시 애니메이션 활성화
  useEffect(() => {
    if (!animated) {
      const t = setTimeout(() => setAnimated(true), 20);
      return () => clearTimeout(t);
    }
  }, [animated]);

  useEffect(() => {
    const timer = setInterval(next, 4000);
    return () => clearInterval(timer);
  }, [next]);

  const dotIndex = current % slides.length;

  return (
    <>
      {/* 앱: 헤더(48px) + 탭바(80px) = 128px 제외한 높이로 화면을 정확히 채움 */}
      <div
        className="hero"
        style={{ height: isApp ? "calc(100vh - 128px)" : "calc(100vh - 100px)" }}
      >
        {/* Sliding images */}
        <div
          className="flex h-full"
          style={{
            transform: `translateX(-${current * 100}%)`,
            transition: animated ? "transform 500ms ease-in-out" : "none",
          }}
        >
          {extendedSlides.map((slide, i) => (
            <img
              key={i}
              src={slide.src}
              alt={slide.alt}
              className="hero-img"
              style={slide.style}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
            />
          ))}
        </div>

        {/* 그라데이션 오버레이 */}
        <div className="hero-overlay" />

        {/* 소개 텍스트 */}
        <div className="hero-content">
          {/* 웹 text-5xl → 앱 text-3xl */}
          <h1
            className={`hero-head ${isApp ? "!text-3xl" : "!text-5xl !leading-[1.4]"}`}
            style={{ fontFamily: "'Paperlogic'", fontWeight: 500 }}
          >
            우리 아이 첫 이유식,
            <br />
            더 안전하게 시작하세요
          </h1>

          {/* 웹 text-2xl → 앱 text-base */}
          <p className={`hero-sub ${isApp ? "!text-base" : "!text-2xl !leading-[1.6]"}`}>
            개월별 맞춤 식단부터 알레르기 관리까지
            <br />
            맘마케어가 함께합니다
          </p>

          {/* 웹에서만 버튼 표시 — 앱에서는 숨김 */}
          {!isApp && (
            <div className="hero-btns flex-col items-start">
              <div className="flex gap-3">
                <button
                  onClick={() => navigate("/about")}
                  className="
                    btn-primary !px-4 !py-2
                    !text-base font-semibold whitespace-nowrap
                    !bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFFAF0_100%)]
                    hover:!bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_100%)]
                    !text-[#3D3C38]
                    transition-all duration-300 shadow-lg
                    flex items-center gap-2
                  "
                >
                  <Baby size={18} />
                  맘마케어란?
                </button>
                <button
                  onClick={() => setTutorialOpen(true)}
                  className="
                    btn-primary !px-4 !py-2
                    !text-base font-semibold whitespace-nowrap
                    !bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFFAF0_100%)]
                    hover:!bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_100%)]
                    !text-[#3D3C38]
                    transition-all duration-300 shadow-lg
                    flex items-center gap-2
                  "
                >
                  <Milestone size={18}/>
                  맘마케어 시작 가이드
                </button>
              </div>
              <button
                onClick={() => setDownloadOpen(true)}
                className="
                  btn-primary !px-4 !py-2
                  !text-base font-semibold whitespace-nowrap
                  !bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFFAF0_100%)]
                  hover:!bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_100%)]
                  !text-[#3D3C38]
                  transition-all duration-300 shadow-lg
                  flex items-center gap-2
                "
              >
                <Smartphone size={18} />
                안드로이드 앱 다운로드
              </button>
            </div>
          )}
        </div>

        <TutorialModal
          open={tutorialOpen}
          onClose={() => setTutorialOpen(false)}
          slides={tutorialSlides}
          title="맘마케어 시작 가이드"
          mutedSubCaption
        />

        <Dialog open={downloadOpen} onOpenChange={setDownloadOpen}>
          <DialogContent className="max-w-sm text-center sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-center">안드로이드 앱 다운로드</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-2">
              <p className="text-sm text-muted-foreground">QR 코드를 스캔하거나 직접 다운로드하세요</p>
              <QRCodeSVG value={APK_URL} size={180} />
              <a
                href={APK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="
                  btn-primary !px-5 !py-2.5
                  !text-base font-semibold
                  !bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFFAF0_100%)]
                  hover:!bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_100%)]
                  !text-[#3D3C38]
                  transition-all duration-300 shadow-lg
                  flex items-center gap-2
                "
              >
                <Download size={18} />
                직접 다운로드
              </a>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dots - 웹에서만 표시 */}
        {!isApp && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2 z-20">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  setAnimated(true);
                  setCurrent(i);
                }}
                className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                  i === dotIndex ? "bg-white scale-125" : "bg-white/50"
                }`}
              />
            ))}
          </div>
        )}
        {/* 앱에서만: 아래로 스크롤하면 About 콘텐츠가 있음을 알리는 반투명 화살표 */}
        {isApp && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 animate-bounce">
            <ChevronDown className="w-6 h-6 sm:w-8 sm:h-8 text-white/60" />
          </div>
        )}
      </div>

      {/* 앱에서만: 히어로 바로 아래 About 콘텐츠 연결 */}
      {isApp && <About />}
    </>
  );
}


export function SiteIntroButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-muted/70 px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-muted/50"
      >
        맘마케어 시작 가이드
      </button>

      <TutorialModal
        open={open}
        onClose={() => setOpen(false)}
        slides={tutorialSlides}
        title="맘마케어 시작 가이드"
        mutedSubCaption
      />
    </>
  );
}
