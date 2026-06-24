import { useState, useEffect, useCallback, useRef } from "react";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from "recharts";
import { X, RefreshCw, Apple, ShoppingCart } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import ProtectedPage from "../components/ProtectedPage";
import { useApp } from "../context/AppContext";
import { apiFetch } from "../api/client";
import { IngredientIcon } from "../components/IngredientIcon";
import TutorialModal from "../components/TutorialModal";
import { nutritionSlides } from "./nutritionSlides";

// ─── Local Types ──────────────────────────────────────────────────────────────

interface Ingredient {
  id: number;
  emoji: string;
  name: string;
  hasAllergy?: boolean;
}

// ─── API Response Types ───────────────────────────────────────────────────────

interface NutrientDetailApi {
  name: string;
  score: number;
  status: string;
  ratio?: number | null;
}

interface WeeklySummaryApi {
  baby_id?: string | null;
  week_start: string;
  week_end: string;
  period_days?: number;
  total_meals: number;
  meal_count?: number | null;
  distinct_days?: number;
  age_months?: number | null;
  confidence?: number | null;
  mode?: string | null;
  message?: string | null;
  max_score: number;
  nutrients: NutrientDetailApi[];
}

interface IngredientSimpleApi {
  id: number;
  name: string;
  emoji: string | null;
}



interface RecommendedIngredientsApi {
  age_months: number;
  ingredients: IngredientSimpleApi[];
}

interface ShoppingProduct {
  name: string;
  price: number;
  image_url: string;
  product_url: string;
}

interface ShoppingResponse {
  ingredient_name: string;
  coupang_url: string;
  kurly_url: string;
  products: ShoppingProduct[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calculateBabyAgeMonths(birthYear: number, birthMonth: number, birthDay: number): number {
  const birthDate = new Date(birthYear, birthMonth - 1, birthDay);
  const now = new Date();
  const diffMs = now.getTime() - birthDate.getTime();
  const months = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44));
  return Math.max(months, 5);
}

function getBabyFeedingStage(ageMonths: number): string {
  if (ageMonths <= 6) return "초기";
  if (ageMonths <= 9) return "중기";
  return "후기";
}

// ─── Shopping Popup ───────────────────────────────────────────────────────────

interface ShoppingPopupProps {
  ingredient: Ingredient;
  token: string | null;
  onClose: () => void;
}

function ShoppingPopup({ ingredient, token, onClose }: ShoppingPopupProps) {
  useBodyScrollLock();
  const isApp = Capacitor.isNativePlatform();
  const [shopping, setShopping] = useState<ShoppingResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<ShoppingResponse>(`/ingredients/${ingredient.id}/shopping`, {}, token)
      .then(setShopping)
      .catch(() => setShopping(null))
      .finally(() => setLoading(false));
  }, [ingredient.id]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card rounded-3xl border border-border shadow-2xl overflow-hidden max-h-[80vh] overflow-y-auto w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 -mb-5 border-border">
          <h2 className={`flex items-center text-muted-foreground font-medium ${isApp ? "text-sm" : "text-lg"} gap-2`}>
            <IngredientIcon name={ingredient.name} emoji={ingredient.emoji} className="w-7 h-7 sm:w-8 sm:h-8" />
            <span className="font-bold text-primary-foreground">'{ingredient.name}'</span>구매하기
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className={`text-center py-8 text-muted-foreground ${isApp ? "text-xs" : "text-sm"}`}>불러오는 중...</div>
          ) : !shopping ? (
            <div className={`text-center py-8 text-muted-foreground ${isApp ? "text-xs" : "text-sm"}`}>쇼핑 정보를 불러올 수 없습니다.</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <a
                  href={shopping.coupang_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-2 p-4 rounded-full border border-[#C5E5FA]
                  bg-[radial-gradient(ellipse_at_center,#F2FAFF_0%,#D1EDFF_100%)]
                  hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#D1EDFF_100%)] transition-colors"
                >
                <span className={`font-bold ${isApp ? "text-sm" : "text-lg"} text-foreground flex items-center gap-2`}>
                  <ShoppingCart size={isApp ? 16 : 20} className="text-muted-foreground" />
                  <span>쿠팡<span className={`font-medium ${isApp ? "text-xs" : "text-base"}`}>으로 연결</span></span>
                </span>
                </a>
                <a
                  href={shopping.kurly_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-2 p-4 rounded-full border border-[#C5E5FA]
                  bg-[radial-gradient(ellipse_at_center,#F2FAFF_0%,#D1EDFF_100%)]
                  hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#DBF2FF_100%)] transition-colorss"
                >
                <span className={`font-bold ${isApp ? "text-sm" : "text-lg"} text-foreground flex items-center gap-2`}>
                  <ShoppingCart size={isApp ? 16 : 20} className="text-muted-foreground" />
                  <span>마켓컬리<span className={`font-medium ${isApp ? "text-xs" : "text-base"}`}>로 연결</span></span>
                </span>
                </a>
              </div>

              {shopping.products.length > 0 && (
                <div className="space-y-3">
                  {shopping.products.map((product, i) => (
                    <a
                      key={i}
                      href={product.product_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all"
                    >
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold ${isApp ? "text-[10px]" : "text-sm"} line-clamp-2`}>{product.name}</p>
                        <p className={`text-primary font-bold ${isApp ? "text-[10px]" : "text-sm"} mt-1`}>{product.price.toLocaleString()}원</p>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Fit Name ─────────────────────────────────────────────────────────────────

function FitName({ name }: { name: string }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;

    const fit = () => {
      text.style.fontSize = "18px";
      while (text.scrollWidth > container.clientWidth && parseFloat(text.style.fontSize) > 14) {
        text.style.fontSize = `${parseFloat(text.style.fontSize) - 0.5}px`;
      }
    };

    fit();
    document.fonts?.ready.then(fit);
    const ro = new ResizeObserver(fit);
    ro.observe(container);
    return () => ro.disconnect();
  }, [name]);

  return (
    <span ref={containerRef} className="flex-1 min-w-0 overflow-hidden text-left">
      <span ref={textRef} className="inline-block font-semibold text-[#575550] whitespace-nowrap">
        {name}
      </span>
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

function NutritionInner() {
  const isApp = Capacitor.isNativePlatform();
  const { activeBaby, token } = useApp();
  const [shoppingIngredient, setShoppingIngredient] = useState<Ingredient | null>(null);
  const [weeklyData, setWeeklyData] = useState<WeeklySummaryApi | null>(null);
  const [recommendedData, setRecommendedData] = useState<RecommendedIngredientsApi | null>(null);
  const [loading, setLoading] = useState(false);
  const [recommendLoading, setRecommendLoading] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  const fetchRecommended = useCallback(async (lackingNutrients: string[] = []) => {
    if (!activeBaby || !token) return;
    setRecommendLoading(true);
    try {
      const params = new URLSearchParams({ baby_id: activeBaby.id });
      lackingNutrients.forEach((n) => params.append("lacking_nutrients", n));
      const data = await apiFetch<RecommendedIngredientsApi>(
        `/nutrition/recommended-ingredients?${params.toString()}`,
        {},
        token,
      );
      setRecommendedData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setRecommendLoading(false);
    }
  }, [activeBaby?.id, token]);

  useEffect(() => {
    if (!activeBaby || !token) return;
    setLoading(true);
    apiFetch<WeeklySummaryApi>(
      `/nutrition/weekly-summary?baby_id=${activeBaby.id}`,
      {},
      token,
    )
      .then((weekly) => {
        setWeeklyData(weekly);
        const lacking = weekly.nutrients
          .filter((n) => n.status === "보완")
          .map((n) => n.name);
        fetchRecommended(lacking);
      })
      .catch((e) => {
        console.error(e);
        fetchRecommended([]);
      })
      .finally(() => setLoading(false));
  }, [activeBaby?.id, token]);

  const handleRefresh = () => {
    const lacking = weeklyData?.nutrients.filter((n) => n.status === "보완").map((n) => n.name) ?? [];
    fetchRecommended(lacking);
  };

  const babyAge =
    recommendedData?.age_months ??
    (activeBaby
      ? calculateBabyAgeMonths(activeBaby.birthYear, activeBaby.birthMonth, activeBaby.birthDay)
      : 7);

  const feedingStage = getBabyFeedingStage(babyAge);

  const nutrients = weeklyData?.nutrients ?? [];
  const maxScore = weeklyData?.max_score ?? 1;

  const renderAngleTick = ({ x, y, cx, cy, payload, textAnchor }: any) => {
    const offset = 10; // 이 숫자를 키우면 간격이 더 넓어짐
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = x + (dx / dist) * offset;
    const ny = y + (dy / dist) * offset;
    return (
      <text
        x={nx}
        y={ny}
        textAnchor={textAnchor}
        dominantBaseline="central"
        fontSize={16}
        fontWeight={500}
        fill="#7A7A7A"
      >
        {payload.value}
      </text>
    );
  };

  const leftNutrients = nutrients.filter((n) => ["탄수화물", "단백질", "지방"].includes(n.name));
  const rightNutrients = nutrients.filter((n) => ["철분", "비타민", "무기질"].includes(n.name));

  const radarData = nutrients.map((n) => ({
    subject: n.name,
    value: Math.round((n.score / maxScore) * 100),
    fullMark: 100,
  }));

  const recommendedIngredients: Ingredient[] = (recommendedData?.ingredients ?? []).map((ing) => ({
    id: ing.id,
    name: ing.name,
    emoji: ing.emoji ?? "🥗",
  }));

  return (
    <div
  className={`max-w-5xl mx-auto ${
    isApp ? "px-3 py-4" : "px-4 sm:px-6 lg:px-8 py-5"
  }`}
>
  {isApp ? (
    <div className="flex items-center justify-between mb-4">
      <h1
        className="text-xl font-bold flex items-center gap-2"
        style={{ fontFamily: "'Paperlogic'", fontWeight: 600 }}>
        <Apple className="w-4 h-4" /> 영양 관리
      </h1>
      <button
        onClick={() => setShowTutorial(true)}
        className="text-sm px-3 py-1.5 rounded-full font-bold whitespace-nowrap
          bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#C7E9FF_100%)]
          hover:bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#B8E2FF_100%)]
          shadow-sm transition-all duration-300"
      >
        사용법
      </button>
    </div>
  ) : (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1
          className="text-2xl font-bold flex items-center gap-2"
          style={{ fontFamily: "'Paperlogic'", fontWeight: 600 }}>
          <Apple className="w-5 h-5 sm:w-6 sm:h-6" /> 영양 관리
        </h1>
        <p className="text-base text-muted-foreground mt-1">아기의 영양 섭취 현황을 분석해드려요</p>
      </div>
      <button
        onClick={() => setShowTutorial(true)}
        className="px-4 py-2 rounded-full font-bold whitespace-nowrap
          bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#C7E9FF_100%)]
          hover:bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#B8E2FF_100%)]
          shadow-sm transition-all duration-300"
      >
        사용법
      </button>
    </div>
  )}

      <div className="bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFFBE8_100%)] border border-border rounded-3xl py-3 px-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className={`font-bold ${isApp ? "text-base" : "text-lg"} flex items-center gap-1.5`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 5H3" /><path d="M16 12H3" /><path d="M16 19H3" /><path d="M21 5h.01" /><path d="M21 12h.01" /><path d="M21 19h.01" />
            </svg>
            '{activeBaby?.name || "아기"}'의 지난 7일 영양 상태
          </h2>

        </div>

        {loading ? (
          <div className={`text-center py-8 text-muted-foreground ${isApp ? "text-sm" : "text-lg"}`}>불러오는 중...</div>
        ) : nutrients.length === 0 ? (
          <div className={`text-center py-8 text-muted-foreground ${isApp ? "text-sm" : "text-lg"}`}>
            {weeklyData && weeklyData.total_meals > 0
              ? weeklyData.message ?? "최근 식단 기록이 아직 적어 영양 균형 분석을 표시하기 어렵습니다."
              : "지난 7일간 완료된 식단 기록이 없습니다"}
          </div>
        ) : (
          <div className={isApp ? "flex flex-col gap-3" : "grid md:grid-cols-2 gap-6"}>
            <div className="space-y-3">
              {leftNutrients.map((item) => {
                const percentage = Math.min((item.score / maxScore) * 100, 100);
                return (
                  <div key={item.name} className="flex items-center gap-3">
                    <span className={`font-semibold ${isApp ? "text-sm" : "text-lg"} text-[#575550] w-16`}>{item.name}</span>
                    <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${item.status === "적정"
                          ? "bg-[#A8D5BA]"
                          : item.status === "보통"
                            ? "bg-[#F6E26B]"
                            : "bg-destructive/40"
                          }`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span
                      className={`${isApp ? "text-sm" : "text-lg"} font-semibold w-10 flex-shrink-0 ${item.status === "적정"
                        ? "text-[#4D9468]"
                        : item.status === "보통"
                          ? "text-[#B0A14C]"
                          : "text-destructive"
                        }`}
                    >
                      {item.status}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="space-y-3">
              {rightNutrients.map((item) => {
                const percentage = Math.min((item.score / maxScore) * 100, 100);
                return (
                  <div key={item.name} className="flex items-center gap-3">
                    <span className={`font-semibold ${isApp ? "text-sm" : "text-lg"} text-[#575550] w-16`}>{item.name}</span>
                    <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${item.status === "적정"
                          ? "bg-[#A8D5BA]"
                          : item.status === "보통"
                            ? "bg-[#F6E26B]"
                            : "bg-destructive/40"
                          }`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span
                      className={`${isApp ? "text-sm" : "text-lg"} font-semibold w-10 flex-shrink-0 ${item.status === "적정"
                        ? "text-[#2D5F3F]"
                        : item.status === "보통"
                          ? "text-[#8B7500]"
                          : "text-destructive"
                        }`}
                    >
                      {item.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className={isApp ? "flex flex-col gap-6" : "grid lg:grid-cols-2 gap-6"}>
        <div className={`bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFFBE8_100%)] border border-border rounded-3xl py-3 px-5 ${isApp ? "" : "mb-6"}`}>
          <div className="flex items-center justify-between">
            <h2 className={`font-bold ${isApp ? "text-base" : "text-lg"} flex items-center gap-1.5`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16v5" /><path d="M16 14.639V21" /><path d="M20 10.656V21" /><path d="m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15" /><path d="M4 18.463V21" /><path d="M8 14.656V21" />
              </svg>
              영양 균형 분석
            </h2>
          </div>
          {radarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData} outerRadius="70%">
                <PolarGrid
                  key="radar-grid"
                  stroke="#F6E26B"
                  strokeOpacity={0.4}
                />
                <PolarAngleAxis
                  key="radar-axis"
                  dataKey="subject"
                  tick={renderAngleTick}
                />
                <Radar
                  key="radar-data"
                  name="현재"
                  dataKey="value"
                  stroke="#F6E26B"
                  fill="#F6E26B"
                  fillOpacity={0.5}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className={`flex items-center justify-center h-[280px] text-muted-foreground ${isApp ? "text-sm" : "text-lg"}`}>
              {loading ? "불러오는 중..." : "식단을 등록하면 그래프가 표시됩니다"}
            </div>
          )}
        </div>

        <div className={`bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFFBE8_100%)] border border-border rounded-3xl py-3 px-5 ${isApp ? "" : "mb-6"}`}>
          <div className="flex items-center justify-between">
            <h2 className={`font-bold ${isApp ? "text-base" : "text-lg"} flex items-center gap-1.5`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 22c1.25-.987 2.27-1.975 3.9-2.2a5.56 5.56 0 0 1 3.8 1.5 4 4 0 0 0 6.187-2.353 3.5 3.5 0 0 0 3.69-5.116A3.5 3.5 0 0 0 20.95 8 3.5 3.5 0 1 0 16 3.05a3.5 3.5 0 0 0-5.831 1.373 3.5 3.5 0 0 0-5.116 3.69 4 4 0 0 0-2.348 6.155C3.499 15.42 4.409 16.712 4.2 18.1 3.926 19.743 3.014 20.732 2 22" /><path d="M2 22 17 7" />
              </svg>
              {babyAge}개월 아기 맞춤 추천
            </h2>
            <button
              onClick={handleRefresh}
              disabled={recommendLoading}
              className="p-1.5 rounded-full hover:bg-muted transition-colors disabled:opacity-40"
              title="새로 고침"
            >
              <RefreshCw
                size={20}
                className={`text-muted-foreground ${recommendLoading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
          <p className={`${isApp ? "text-xs" : "text-base"} text-muted-foreground mb-8`}>
            '{feedingStage}' 이유식 추천 재료
            {weeklyData && weeklyData.nutrients.some((n) => n.status === "보완") && (
              <span className="ml-1 text-destructive font-semibold">- 보완 영양소 우선</span>
            )}
          </p>

          {recommendLoading ? (
            <div className={`flex items-center justify-center min-h-[210px] text-muted-foreground ${isApp ? "text-sm" : "text-lg"}`}>
              불러오는 중...
            </div>
          ) : recommendedIngredients.length === 0 ? (
            <div className={`flex items-center justify-center min-h-[210px] text-muted-foreground ${isApp ? "text-sm" : "text-lg"} text-center`}>
              이 개월 수에 맞는 추천 재료가 없습니다
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-1.5 sm:gap-2 lg:gap-3">
                {recommendedIngredients.map((ing, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-center gap-1 sm:gap-2 px-1.5 py-1.5 sm:px-2 sm:py-2
                    bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_100%)]
                    hover:bg-primary/10 border border-[#FFEFAB] rounded-2xl sm:rounded-3xl transition-all min-w-0"
                  >
                    <div className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0 cursor-default">
                      <IngredientIcon emoji={ing.emoji} name={ing.name} className="w-5 h-5 sm:w-6 sm:h-6" />
                      <FitName name={ing.name} />
                    </div>
                    <button
                      onClick={() => setShoppingIngredient(ing)}
                      className="p-1.5 rounded-full hover:bg-orange-100 transition-colors flex-shrink-0"
                      title={`${ing.name} 구매하기`}
                    >
                      <ShoppingCart size={15} className="text-muted-foreground" />
                    </button>
                  </div>
                ))}
              </div>

              {recommendedIngredients.length < 6 && (
                <div className={`mt-3 px-4 py-2.5 bg-muted/50 rounded-xl ${isApp ? "text-[10px]" : "text-sm"} text-muted-foreground text-center`}>
                  알레르기 또는 테스트 완료 재료가 제외되었습니다
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {shoppingIngredient && (
        <ShoppingPopup
          ingredient={shoppingIngredient}
          token={token}
          onClose={() => setShoppingIngredient(null)}
        />
      )}

      <TutorialModal open={showTutorial} onClose={() => setShowTutorial(false)}
        slides={nutritionSlides} title="영양 관리 사용법" />
    </div>
  );
}

export default function Nutrition() {
  return (
    <ProtectedPage>
      <NutritionInner />
    </ProtectedPage>
  );
}
