import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Capacitor } from "@capacitor/core";

/* ────────────────────────────────────────────────────────────────────────
 *  TutorialModal — 재사용 가능한 튜토리얼 슬라이더
 * ──────────────────────────────────────────────────────────────────────── */

/* ===========================  주석(오버레이) 타입  ===========================
 *  좌표는 전부 이미지 기준 %(0~100). (0,0)=좌상단, (100,100)=우하단.
 *
 *  - box     : 특정 영역을 테두리로 강조. {x,y,w,h}  (선택: pulse 깜빡임)
 *  - callout : 말풍선 텍스트 + 가리키는 선(끝에 원형 점).
 *              x,y = 말풍선 위치 / tx,ty = 선이 가리키는 지점
 *  - label   : 선 없는 단순 텍스트 말풍선. {x,y,text}
 * ========================================================================== */
export type Annotation =
  | { type: "box"; x: number; y: number; w: number; h: number; pulse?: boolean }
  | {
      type: "callout";
      x: number;
      y: number;
      tx: number;
      ty: number;
      text: string;
      /** 말풍선 텍스트 앞에 표시할 lucide 아이콘 (예: Mic, Sparkles) */
      icon?: LucideIcon;
    }
  | {
      type: "label";
      x: number;
      y: number;
      text: string;
      icon?: LucideIcon;
    };

export type Slide = {
  /** 스크린샷 이미지 (visual 을 쓰면 생략 가능) */
  image?: string;
  /** image 대신 아이콘/텍스트 등으로 직접 구성한 화면 */
  visual?: ReactNode;
  /** 이미지/카드 아래 항상 보이는 메인 설명 */
  caption: string;
  annotations?: Annotation[];
};

/* ==============================  주석 렌더링  ============================== */
function AnnotationLayer({ items }: { items?: Annotation[] }) {
  if (!items?.length) return null;

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* 선(SVG)은 한 레이어에 모아서 그림.
          ※ preserveAspectRatio="none" 이라 좌표계가 비균일하게 늘어남 →
            끝점 원은 SVG 안에 그리면 타원이 되므로 아래 HTML div 로 따로 그림 */}
      <svg
        className="absolute inset-0 h-full w-full overflow-visible"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {items.map((a, i) =>
          a.type === "callout" ? (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={a.tx}
              y2={a.ty}
              stroke="var(--warm-fg)"
              strokeWidth={3}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : null
        )}
      </svg>

      {/* 끝점 원형 점 — SVG 밖 HTML div 라서 비율 왜곡 없이 항상 정원 */}
      {items.map((a, i) =>
        a.type === "callout" ? (
          <div
            key={`dot-${i}`}
            className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-warm-fg"
            style={{ left: `${a.tx}%`, top: `${a.ty}%` }}
          />
        ) : null
      )}

      {/* 강조 박스 + 말풍선 텍스트 */}
      {items.map((a, i) => {
        if (a.type === "box") {
          return (
            <div
              key={i}
              className={
                "absolute rounded-3xl border-4 border-orange-400 " +
                "shadow-[0_0_0_4px_rgba(249,115,22,0.15)] " +
                (a.pulse ? "tut-pulse" : "")
              }
              style={{
                left: `${a.x}%`,
                top: `${a.y}%`,
                width: `${a.w}%`,
                height: `${a.h}%`,
              }}
            />
          );
        }
        // callout / label 의 텍스트 말풍선
        const text = a.text;
        const Icon = "icon" in a ? a.icon : undefined;
        return (
          <div
            key={i}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 
            whitespace-nowrap rounded-full bg-warm-fg px-4 py-1.5 text-base font-medium text-white shadow-lg"
            style={{ left: `${a.x}%`, top: `${a.y}%` }}
          >
            {Icon && <Icon className="h-[1.1em] w-[1.1em] shrink-0" />}
            {text}
          </div>
        );
      })}
    </div>
  );
}

/* ==============================  메인 컴포넌트  ============================== */
export default function TutorialModal({
  open,
  onClose,
  slides,
  title = "사용법",
  /** true 면 caption 의 2번째 줄부터를 작고 흐린(text-muted-foreground) 스타일로 표시.
      기본 false → 기존과 동일하게 윗줄과 같은 스타일 유지 */
  mutedSubCaption = false,
}: {
  open: boolean;
  onClose: () => void;
  slides: Slide[];
  title?: string;
  mutedSubCaption?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const last = slides.length - 1;

  const next = useCallback(
    () => setIndex((i) => Math.min(i + 1, last)),
    [last]
  );
  const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  // 열릴 때 첫 슬라이드로 리셋
  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // 키보드: ← → 이동, ESC 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, prev, onClose]);

  if (!open || slides.length === 0) return null;

  const isApp = Capacitor.isNativePlatform();
  const slide = slides[index];
  const isFirst = index === 0;
  const isLast = index === last;

  return (
    <div
      className={`fixed inset-0 z-[400] flex items-center ${isApp ? "pt-16" : "pt-22"} justify-center bg-black/50 p-4`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* 모달 카드 — 바깥(배경) 클릭은 닫힘, 카드 클릭은 전파 차단 */}
      <div
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-warm-bg shadow-2xl ring-1 ring-black/5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-primary-foreground">{title}</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium tabular-nums text-muted-foreground">
              {index + 1} / {slides.length}
            </span>
            <button
              onClick={onClose}
              aria-label="닫기"
              className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-muted/50 hover:text-muted-foreground"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* 이미지 + 주석 영역 */}
        <div className="flex-1 overflow-y-auto px-6 [scrollbar-gutter:stable]">
          {/* 고정 높이 무대: 비율이 다른 이미지가 와도 모달 높이가 안 들썩임 */}
          <div className={`flex ${isApp ? "h-[32vh]" : "h-[46vh]"} items-center justify-center`}>
            {/* key={index} 로 매 슬라이드마다 페이드 애니메이션이 다시 재생됨.
                inline-block wrapper 가 이미지에 딱 맞게 줄어들어 주석 %좌표가 정확히 붙음 */}
            <div key={index} className="tut-fade relative inline-block">
              {slide.visual ? (
                slide.visual
              ) : (
                <img
                  src={slide.image}
                  alt={slide.caption}
                  className={`block ${isApp ? "max-h-[30vh]" : "max-h-[44vh]"} h-auto w-auto max-w-full sm:max-w-[80vh] rounded-3xl bg-white`}
                  draggable={false}
                />
              )}
              <AnnotationLayer items={slide.annotations} />
            </div>
          </div>

          {/* 메인 설명 — 첫 줄(제목)은 기본 크기, 그 아래 설명은 작게 */}
          <div className="mt-2 flex min-h-[3.25rem] flex-col items-center justify-start">
            {(() => {
              const [head, ...rest] = slide.caption.split("\n");
              return (
                <div key={index} className="tut-fade max-w-xl text-center">
                  <p className="text-lg font-semibold leading-relaxed text-primary-foreground">
                    {head}
                  </p>
                  {rest.length > 0 && (
                    <p
                      className={
                        mutedSubCaption
                          ? "mt-1 whitespace-pre-line text-base leading-relaxed text-muted-foreground"
                          : "mt-1 whitespace-pre-line text-lg font-semibold leading-relaxed text-primary-foreground"
                      }
                    >
                      {rest.join("\n")}
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* 푸터: 인디케이터 + 이동 버튼 */}
        <div className="flex items-center justify-between gap-2 sm:gap-4 px-3 sm:px-6 py-4">
          <button
            onClick={prev}
            disabled={isFirst}
            className="w-16 sm:w-20 shrink-0 whitespace-nowrap rounded-full px-2 sm:px-4 py-2 
            text-center text-xs font-semibold text-muted-foreground transition 
            enabled:bg-muted/70 enabled:hover:bg-muted/50 disabled:opacity-0"
          >
            이전
          </button>

          {/* 슬라이드 인디케이터 — 큰 타원 트랙 안에서 작은 타원(노브)이 현재 페이지로 슬라이딩 */}
          <div className="relative flex items-center rounded-full border-2 border-muted p-1">
            {/* 현재 페이지를 가리키는 작은 타원 — 토글 노브처럼 이동 */}
            <div
              className="pointer-events-none absolute left-1.5 top-1/2 h-2.5 w-4 rounded-full bg-muted transition-transform duration-300 ease-out"
              style={{ transform: `translateY(-50%) translateX(${index * 1.5}rem)` }}
            />
            {/* 각 슬라이드 클릭 영역 (노브 한 칸 = w-8) */}
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                aria-label={`${i + 1}번째 슬라이드로 이동`}
                className="relative z-10 h-3 w-6"
              />
            ))}
          </div>

          {isLast ? (
            <button
              onClick={onClose}
              className="w-20 rounded-full bg-muted/70 px-4 py-2 text-center text-xs font-bold text-muted-foreground transition hover:bg-muted/50"
            >
              시작
            </button>
          ) : (
            <button
              onClick={next}
              className="w-20 rounded-full bg-muted/70 px-4 py-2 text-center text-xs font-bold text-muted-foreground transition hover:bg-muted/50"
            >
              다음
            </button>
          )}
        </div>
      </div>

      {/* 애니메이션 정의 (Tailwind 기본에 없어서 직접 정의) */}
      <style>{`
        @keyframes tutPulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(249,115,22,0.15); }
          50%      { box-shadow: 0 0 0 8px rgba(249,115,22,0.05); }
        }
        .tut-pulse { animation: tutPulse 1.6s ease-in-out infinite; }

        @keyframes tutFade {
          from { opacity: 0; transform: scale(0.985); }
          to   { opacity: 1; transform: scale(1); }
        }
        .tut-fade { animation: tutFade 0.45s cubic-bezier(0.22, 1, 0.36, 1); }

        @media (prefers-reduced-motion: reduce) {
          .tut-pulse, .tut-fade { animation: none; }
        }
      `}</style>
    </div>
  );
}
