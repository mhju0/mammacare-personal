import { useState } from "react";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { createPortal } from "react-dom";
import { AlertTriangle, ChevronLeft, Sparkles, X, Loader2, RefreshCw, Check } from "lucide-react";
import { IngredientIcon } from "../../components/IngredientIcon";
import { apiFetch, ApiError } from "../../api/client";
import { useApp } from "../../context/AppContext";
import { TimeDropdown } from "./TimeDropdown";
import type {
  Ingredient,
  SttMatchedRecipe,
  SttParseResult,
  ScheduleCreateOut,
} from "./types";

// ─── Allergy Alert Modal ──────────────────────────────────────────────────────

interface AllergyAlertProps {
  ingredient: Ingredient;
  hasAllergy: boolean;
  isTesting?: boolean;
  onClose: () => void;
}

export function AllergyAlertModal({ ingredient, hasAllergy, isTesting, onClose }: AllergyAlertProps) {
  useBodyScrollLock();
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center pt-16 justify-center px-4" onClick={onClose}>
      <div className="bg-card rounded-3xl w-full max-w-sm shadow-2xl border border-border p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-base">알레르기 반응</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted">
            <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
        <div className="flex flex-col items-center gap-4 py-4">
          <IngredientIcon name={ingredient.name} emoji={ingredient.emoji} className="w-14 h-14 sm:w-20 sm:h-20" />
          <div className="text-center">
            <div className="font-bold text-xl mb-2">{ingredient.name}</div>
            {isTesting ? (
              <div className="text-muted-foreground">테스트 중이에요</div>
            ) : hasAllergy ? (
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                <span className="font-semibold">알레르기 반응이 있어요!</span>
              </div>
            ) : (
              <div className="text-muted-foreground">알레르기 반응이 없어요</div>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-full py-3 rounded-3xl text-primary-foreground font-bold
          bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#C7E9FF_100%)]
          hover:bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#B8E2FF_100%)]
          shadow-sm transition-all duration-300"
        >
          확인
        </button>
      </div>
    </div>
  );
}

// ─── AI Meal Planning Modal ───────────────────────────────────────────────────

interface AIMealItem {
  date: string;
  meal_time: string;
  recipe_name: string;
  ingredients: { name: string; amount: string }[];
  description: string;
}

interface TestIngredientInfo {
  ingredient_id: number;
  ingredient_name: string;
  test_dates: string[];
}

interface AIMealPlanResponse {
  period: string;
  start_date: string;
  meals: AIMealItem[];
  cautions: string[];
  test_ingredients: TestIngredientInfo[];
  notice?: string;
}

interface ApplyMealPlanResponse {
  created_count: number;
  conflict_dates?: string[];
  protected_dates?: string[];
}

const PERIOD_OPTIONS = [
  { id: "today" as const, label: "하루 식단" },
  { id: "3days" as const, label: "3일치 식단" },
  { id: "week" as const, label: "일주일치 식단" },
] as const;

const KO_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function formatKoreanDate(dateStr: string): string {
  // dateStr은 "YYYY-MM-DD" 형식
  const d = new Date(dateStr + "T00:00:00");
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const dow = KO_WEEKDAYS[d.getDay()];
  return `${month}월 ${day}일 (${dow})`;
}

function toDateInputValue(d: Date): string {
  // 로컬 시간 기준 "YYYY-MM-DD"
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function AIMealPlanningModal({ onClose, onApplied }: { onClose: () => void; onApplied?: () => void }) {
  useBodyScrollLock();
  const { token, activeBaby } = useApp();

  // ── 1단계: 식단 구성 화면 상태
  const todayStr = toDateInputValue(new Date());
  const FIXED_YEAR = new Date().getFullYear();
  const [startDate, setStartDate] = useState(todayStr);
  const [selectedPeriod, setSelectedPeriod] = useState<"today" | "3days" | "week">("today");
  const [pickerStep, setPickerStep] = useState<"month" | "day" | null>(null);
  const [pickerSelMonth, setPickerSelMonth] = useState(new Date().getMonth() + 1);
  const dateParts = startDate.split("-").map(Number);
  const handlePickerUpdate = (y: number, m: number, d: number) => {
    const maxDay = new Date(y, m, 0).getDate();
    setStartDate(`${y}-${String(m).padStart(2, "0")}-${String(Math.min(d, maxDay)).padStart(2, "0")}`);
    setPickerStep(null);
  };
  const [customIngredients, setCustomIngredients] = useState("");

  // ── 공통 상태
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── 2단계: 미리보기 화면 상태
  const [plan, setPlan] = useState<AIMealPlanResponse | null>(null);

  // ── 충돌 날짜 다이얼로그 상태
  const [conflictDates, setConflictDates] = useState<string[] | null>(null);
  const [protectedDates, setProtectedDates] = useState<string[] | null>(null);

  // ─────────────────────────────────────────────────────────
  // AI 식단 생성 요청
  // ─────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!token || !activeBaby) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<AIMealPlanResponse>(
        "/ai/meal-plan",
        {
          method: "POST",
          body: JSON.stringify({
            baby_id: activeBaby.id,
            period: selectedPeriod,
            custom_ingredients: customIngredients.trim(),
            start_date: startDate,
          }),
        },
        token,
      );
      setPlan(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(err.message);
      } else {
        setError("AI 식단 생성에 실패했습니다. 다시 시도해주세요.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────
  // 이대로 만들기 — DB에 저장
  // ─────────────────────────────────────────────────────────
  const handleApply = async () => {
    if (!token || !activeBaby || !plan) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<ApplyMealPlanResponse>(
        "/ai/apply-meal-plan",
        {
          method: "POST",
          body: JSON.stringify({
            baby_id: activeBaby.id,
            meals: plan.meals,
            test_ingredients: plan.test_ingredients,
          }),
        },
        token,
      );
      if (result.conflict_dates && result.conflict_dates.length > 0) {
        setConflictDates(result.conflict_dates);
        setLoading(false);
        return;
      }
      if (result.created_count === 0) {
        setError("저장된 식단이 없습니다. 다시 생성해주세요.");
        setLoading(false);
        return;
      }
      onApplied?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "식단 저장에 실패했습니다. 다시 시도해주세요.");
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────
  // 스킵 or 덮어쓰기 선택 후 재요청
  // ─────────────────────────────────────────────────────────
  const handleApplyWithAction = async (action: "skip" | "overwrite") => {
    if (!token || !activeBaby || !plan) return;
    setConflictDates(null);
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<ApplyMealPlanResponse>(
        "/ai/apply-meal-plan",
        {
          method: "POST",
          body: JSON.stringify({
            baby_id: activeBaby.id,
            meals: plan.meals,
            test_ingredients: plan.test_ingredients,
            conflict_action: action,
          }),
        },
        token,
      );
      if (result.created_count === 0) {
        setError("저장된 식단이 없습니다. 다시 생성해주세요.");
        setLoading(false);
        return;
      }
      onApplied?.();
      if (result.protected_dates && result.protected_dates.length > 0) {
        setProtectedDates(result.protected_dates);
        setLoading(false);
        return;
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "식단 저장에 실패했습니다. 다시 시도해주세요.");
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────
  // 다시 만들기 — 구성 화면으로 되돌아가기 (선택값 유지)
  // ─────────────────────────────────────────────────────────
  const handleRegenerate = () => {
    setPlan(null);
    setError(null);
  };

  // ─────────────────────────────────────────────────────────
  // 미리보기 화면 — 날짜별로 그룹핑
  // ─────────────────────────────────────────────────────────
  if (plan) {
    const grouped = plan.meals.reduce<Record<string, AIMealItem[]>>((acc, meal) => {
      (acc[meal.date] ??= []).push(meal);
      return acc;
    }, {});
    const sortedDates = Object.keys(grouped).sort();

    return (<>
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4 py-6 pt-22">
        <div className="bg-card rounded-3xl w-full max-w-xl px-3 shadow-2xl border border-border
          overflow-hidden flex flex-col max-h-[78dvh]">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
              AI 식단 미리보기
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#FEF5CC] text-[#3D3C38]">
                {plan.period}
              </span>
            </h2>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted"><X className="w-4 h-4 sm:w-[18px] sm:h-[18px]" /></button>
          </div>

          {/* 식단 목록 (스크롤) */}
          <div className="flex-1 overflow-y-auto px-4 py-3 -mt-3 space-y-3
            [&::-webkit-scrollbar]:w-4
            [&::-webkit-scrollbar-track]:my-4
            [&::-webkit-scrollbar-thumb]:border-4
            [&::-webkit-scrollbar-thumb]:border-transparent
            [&::-webkit-scrollbar-thumb]:bg-clip-padding">
            <div className="bg-[#FFF8E7] border border-[#FFD966] rounded-2xl p-2">
              <p className="text-sm text-[#3D3C38] leading-snug">
                <span className="text-sm font-bold text-[#B07D00]">💡안내</span>
                <br/>반응 시 원활한 병원 방문을 위해 새로운 재료는 월, 화, 수, 목에 도입하는 것을 권장합니다.
              </p>
            </div>
            {plan.notice && (
              <div className="bg-[#EBF7FF] border border-[#B3DAF5] rounded-2xl p-3">
                <p className="text-sm font-bold text-[#5BB6E8] mb-1">안내 💡 </p>
                {plan.notice.split(".").filter(s => s.trim()).map((s, i) => (
                  <p key={i} className="text-sm text-[#3D3C38] leading-snug">
                    {s.trim()}.
                  </p>
                ))}
              </div>
            )}
            {sortedDates.map((dateStr) => (
              <div key={dateStr}>
                <p className="text-sm font-bold text-muted-foreground mb-2 px-1">
                  {formatKoreanDate(dateStr)}
                </p>
                <div className="space-y-2">
                  {grouped[dateStr].map((meal, idx) => (
                    <div key={idx} className="bg-background border border-border rounded-2xl p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold text-muted-foreground">{meal.meal_time}</span>
                            <span className="font-bold text-sm truncate">{meal.recipe_name}</span>
                          </div>
                          <p className="text-sm text-muted-foreground leading-snug">{meal.description}</p>
                          {meal.ingredients.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {meal.ingredients.map((ing) => (
                                <span key={ing.name} className="text-xs px-2 py-0.5 bg-muted rounded-full">{ing.name}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* 주의사항 */}
            {plan.cautions.length > 0 && (
              <div className="bg-[#F8AC95]/10 border border-[#F8AC95]/50 rounded-2xl p-3">
                <p className="flex items-center text-sm font-bold text-[#F58462] mb-1 gap-1">
                  <AlertTriangle className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> 주의사항</p>
                {plan.cautions.map((c, i) => (
                  <p key={i} className="text-sm text-[#3D3C38] leading-snug">· {c}</p>
                ))}
              </div>
            )}

            {error && (
              <p className="text-lg font-semibold text-destructive text-center px-2">{error}</p>
            )} 
          </div>

          {/* 하단 버튼 */}
          <div className="flex gap-3 px-4 py-3 border-t border-border flex-shrink-0">
            <button
              onClick={handleRegenerate}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className="w-3 h-3 sm:w-[15px] sm:h-[15px]" />
              다시 만들기
            </button>
            <button
              onClick={handleApply}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)] text-[#3D3C38] text-sm font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin w-3 h-3 sm:w-[15px] sm:h-[15px]" /> : <Check className="w-3 h-3 sm:w-[15px] sm:h-[15px]" />}
              이대로 만들기
            </button>
          </div>
        </div>
      </div>

      {/* 날짜 충돌 다이얼로그 */}
      {conflictDates && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center px-4">
          <div className="bg-card rounded-2xl w-full max-w-sm shadow-2xl border border-border p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-[#FFFAF0] border border-[#F8AC95] rounded-full">
                <AlertTriangle className="w-5 h-5 sm:w-[22px] sm:h-[22px] text-[#F58462]" />
              </div>
            </div>
            <h3 className="font-bold text-base text-center mb-2">이미 식단이 있는 날짜예요</h3>
            <div className="flex flex-wrap justify-center gap-1.5 mb-3">
              {conflictDates!.map((d) => (
                <span key={d} className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#FEF5CC] border border-[#FFD966] text-[#3D3C38]">
                  {formatKoreanDate(d)}
                </span>
              ))}
            </div>
            <p className="text-center text-sm text-muted-foreground mb-5 leading-relaxed">
              해당 날짜의 기존 식단을 유지하고 새 식단을 건너뛸지,<br />덮어쓸지 선택해주세요.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleApplyWithAction("skip")}
                disabled={loading}
                className="flex-1 py-2.5 rounded-3xl border border-border text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-50"
              >
                스킵
              </button>
              <button
                onClick={() => handleApplyWithAction("overwrite")}
                disabled={loading}
                className="flex-1 py-2.5 rounded-3xl bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)] text-[#3D3C38] text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin mx-auto w-3 h-3 sm:w-3.5 sm:h-3.5" /> : "덮어쓰기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 테스트 진행 중 보호 날짜 안내 */}
      {protectedDates && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center px-4">
          <div className="bg-card rounded-2xl w-full max-w-sm shadow-2xl border border-border p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-[#FFFAF0] border border-[#F8AC95] rounded-full">
                <AlertTriangle className="w-5 h-5 sm:w-[22px] sm:h-[22px] text-[#F58462]" />
              </div>
            </div>
            <h3 className="font-bold text-base text-center mb-2">일부 날짜는 변경할 수 없어요</h3>
            <div className="flex flex-wrap justify-center gap-1.5 mb-3">
              {protectedDates!.map((d) => (
                <span key={d} className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#FFEEE8] border border-[#F8AC95] text-[#F58462]">
                  {formatKoreanDate(d)}
                </span>
              ))}
            </div>
            <p className="text-center text-sm text-muted-foreground mb-5 leading-relaxed">
              알레르기 테스트가 진행 중인 날짜예요.<br />테스트 기간의 식단은 변경할 수 없어요.
            </p>
            <button
              onClick={() => { setProtectedDates(null); onClose(); }}
              className="w-full py-2.5 rounded-3xl bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)] text-[#3D3C38] text-sm font-bold hover:opacity-90 transition-opacity"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </>);
  }

  // ─────────────────────────────────────────────────────────
  // 1단계: 식단 구성 화면
  // ─────────────────────────────────────────────────────────
  return (<>
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center pt-16 justify-center px-4" onClick={onClose}>
      <div className="bg-card rounded-3xl w-full max-w-md shadow-2xl border border-border overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 -mb-1">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
            AI 식단 구성
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted"><X className="w-4 h-4 sm:w-[18px] sm:h-[18px]" /></button>
        </div>
        <div className="px-6 py-4 space-y-5">
          <div>
            <label className="text-base font-bold text-foreground mb-2 block">식단 적용</label>
            <div className="inline-flex items-center rounded-xl border border-[#C5E5FA] bg-[#FAFAFA]/80 overflow-hidden mr-1">
              <span className="px-3 py-1 text-base font-semibold text-foreground">
                {dateParts[0]}년
              </span>
              <span className="w-px self-stretch bg-[#C5E5FA]" />
              <button
                type="button"
                onClick={() => { setPickerSelMonth(dateParts[1]); setPickerStep("month"); }}
                className="px-3 py-1 text-base font-semibold hover:bg-[#EBF7FF] transition-colors"
              >
                {dateParts[1]}월
              </button>
              <span className="w-px self-stretch bg-[#C5E5FA]" />
              <button
                type="button"
                onClick={() => { setPickerSelMonth(dateParts[1]); setPickerStep("day"); }}
                className="px-3 py-1 text-base font-semibold hover:bg-[#EBF7FF] transition-colors"
              >
                {dateParts[2]}일
              </button>
            </div>
            <label className="text-base font-medium text-foreground shrink-0">부터 적용됩니다</label>
          </div>

          <div>
            <label className="text-base font-bold text-foreground mb-2 block">식단 기간</label>
            <div className="grid grid-cols-3 gap-2">
              {PERIOD_OPTIONS.map((period) => (
                <button
                  key={period.id}
                  onClick={() => setSelectedPeriod(period.id)}
                  className={`py-2 px-4 rounded-3xl text-base font-semibold transition-all ${
                    selectedPeriod === period.id
                      ? "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)] text-[#3D3C38] shadow-md"
                      : "bg-muted text-muted-foreground hover:bg-[#FEF5CC]/60"
                  }`}
                >
                  {period.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-base font-bold text-foreground mb-2 block">이 재료를 추가하고 싶어요</label>
            <textarea
              value={customIngredients}
              onChange={(e) => setCustomIngredients(e.target.value)}
              placeholder="예: 브로콜리, 당근, 고구마"
              className="w-full px-4 py-3 rounded-2xl border border-border bg-background 
              focus:outline-none focus:ring-2 focus:ring-[#FEF5CC] text-sm resize-none"
              rows={3}
            />
            <p className="ml-1 text-xs text-muted-foreground">쉼표( , )로 구분하여 입력해주세요</p>
          </div>

          {error && (
            <p className="text-lg font-semibold text-destructive text-center">{error}</p>
          )}

          <button
            onClick={handleGenerate}
            disabled={loading || !activeBaby}
            className="w-full py-3 rounded-3xl text-[#3D3C38] font-bold transition-opacity flex items-center justify-center gap-2 disabled:opacity-50
            bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#C7E9FF_100%)]
            hover:bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#B8E2FF_100%)]
            shadow-sm transition-all duration-300"
          >
            {loading ? (
              <><Loader2 className="animate-spin w-4 h-4 sm:w-[18px] sm:h-[18px]" /> 식단 생성 중...</>
            ) : (
              <><Sparkles className="w-4 h-4 sm:w-[18px] sm:h-[18px]" /> AI 식단 생성하기</>
            )}
          </button>
        </div>
      </div>
    </div>
    {pickerStep && createPortal(
      <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center px-4">
        <div className="bg-card rounded-3xl p-5 w-72 shadow-xl border border-border">
          {pickerStep === "month" && (() => {
            const nowMonth = new Date().getMonth() + 1;
            return (
              <>
                <div className="text-sm font-bold mb-4 text-center text-foreground">시작 날짜 선택</div>
                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                    const isPast = m < nowMonth;
                    return (
                      <button
                        key={m}
                        type="button"
                        disabled={isPast}
                        onClick={() => { setPickerSelMonth(m); setPickerStep("day"); }}
                        className={`py-2 rounded-xl text-sm font-semibold transition-colors ${isPast ? "text-muted-foreground/40 cursor-not-allowed" : m === dateParts[1] ? "bg-[#C5E5FA] text-primary-foreground" : "hover:bg-[#C5E5FA]/20 text-foreground"}`}
                      >
                        {m}월
                      </button>
                    );
                  })}
                </div>
              </>
            );
          })()}
          {pickerStep === "day" && (() => {
            const now = new Date();
            const todayMonth = now.getMonth() + 1;
            const todayDay = now.getDate();
            return (
              <>
                <div className="relative flex items-center mb-4">
                  <button
                    type="button"
                    onClick={() => setPickerStep("month")}
                    className="absolute left-0 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <ChevronLeft size={13} /> 월
                  </button>
                  <span className="w-full text-center text-sm font-bold text-foreground">
                    {FIXED_YEAR}년 {pickerSelMonth}월
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: new Date(FIXED_YEAR, pickerSelMonth, 0).getDate() }, (_, i) => i + 1).map((d) => {
                    const isPast = pickerSelMonth === todayMonth ? d < todayDay : pickerSelMonth < todayMonth;
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={isPast}
                        onClick={() => handlePickerUpdate(FIXED_YEAR, pickerSelMonth, d)}
                        className={`aspect-square text-xs rounded-lg transition-colors flex items-center justify-center ${isPast ? "text-muted-foreground/40 cursor-not-allowed" : d === dateParts[2] && pickerSelMonth === dateParts[1] ? "bg-[#C5E5FA] text-primary-foreground font-bold" : "hover:bg-[#C5E5FA]/20 text-foreground"}`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </>
            );
          })()}
          <button
            type="button"
            onClick={() => setPickerStep(null)}
            className="w-full mt-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            취소
          </button>
        </div>
      </div>,
      document.body
    )}
  </>);
}

// ─── Allergy Testing Started Modal ───────────────────────────────────────────

export function AllergyTestingStartedModal({
  newIngredients,
  mealDate,
  onClose,
  onGoToAllergy,
}: {
  newIngredients: { name: string; emoji: string | null }[];
  mealDate?: Date;
  onClose: () => void;
  onGoToAllergy: () => void;
}) {
  useBodyScrollLock();
  const isFuture = mealDate != null && (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(mealDate);
    d.setHours(0, 0, 0, 0);
    return d > today;
  })();

  return (
    <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center" onClick={onClose}>
      <div className="bg-card rounded-2xl w-full max-w-md shadow-2xl border border-borde p-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            <h3 className="font-bold text-lg">알레르기 테스트 시작</h3>
          </div>
        </div>
        <p className="text-center text-base text-[#3D3C38] mb-3">
          {isFuture && mealDate ? (
            <>처음 등록된 재료가 입력하신 날짜 <br/>
            <span className="font-bold text-foreground">{mealDate.getMonth() + 1}월 {mealDate.getDate()}일</span>에 테스트 시작합니다.</>
          ) : (
            <>처음 등록된 재료가  <br/>
            <span className="font-bold text-foreground">'알레르기 테스트 진행 중'</span>으로 추가되었습니다.</>
          )}
        </p>
        <div className="flex flex-wrap gap-2 mb-3 justify-center">
          {newIngredients.map((ing) => (
            <span key={ing.name} className="flex items-center gap-3 px-4 py-1 bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFE8E0_100%)]
            border border-[#FF8763]/70 rounded-full text-primary-foreground text-lg font-semibold">
              <IngredientIcon name={ing.name} emoji={ing.emoji} className="w-4 h-4 sm:w-5 sm:h-5" />
              {ing.name}
            </span>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-full border border-border text-base 
              font-semibold hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#DBF2FF_100%)] transition-colors">
            나중에 확인
          </button>
          <button onClick={onGoToAllergy} className="flex-1 py-3 rounded-full text-primary-foreground text-base font-bold 
                bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#DBF2FF_50%,#D1EDFF_100%)] 
                hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#DBF2FF_100%)] transition-opacity disabled:opacity-40">
            알레르기 관리 보기
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Recipe Detail Modal ──────────────────────────────────────────────────────

interface SttConfirmModalProps {
  result: SttParseResult;
  onClose: () => void;
  onSuccess: () => void;
}

export function SttConfirmModal({ result, onClose, onSuccess }: SttConfirmModalProps) {
  useBodyScrollLock();
  const { token, activeBaby } = useApp();
  const [selected, setSelected] = useState<SttMatchedRecipe | null>(
    result.matched.length === 1 ? result.matched[0] : null,
  );
  const [hour, setHour] = useState<number>(() =>
    result.meal_time ? parseInt(result.meal_time.split(":")[0], 10) : 8,
  );
  const [minute, setMinute] = useState<number>(() =>
    result.meal_time ? parseInt(result.meal_time.split(":")[1], 10) : 0,
  );
  const [saving, setSaving] = useState(false);

  if (result.unmatched || result.matched.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4" onClick={onClose}>
        <div className="bg-card rounded-2xl w-fit min-w-[16rem] max-w-[calc(100vw-2rem)] shadow-2xl border border-border px-6 py-4" 
          onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-base">음성 입력 결과</h3>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted">
              <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>
          {result.message && (
            <p className="text-base text-muted-foreground text-center mb-4 break-words">{result.message}</p>
          )}
          <button onClick={onClose} className="w-full py-3 rounded-3xl font-bold text-[#3D3C38]
                bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#C7E9FF_100%)]
                hover:bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#B8E2FF_100%)]
                shadow-sm transition-all duration-300">
            확인
          </button>
        </div>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4" onClick={onClose}>
        <div className="bg-card rounded-2xl w-full max-w-sm shadow-2xl border border-border p-6" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-base">레시피를 선택해주세요</h3>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted"><X className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></button>
          </div>
          <div className="space-y-2 mb-4">
            {result.matched.map((recipe) => (
              <button
                key={recipe.recipe_id}
                onClick={() => setSelected(recipe)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-3xl border-2 border-border hover:border-[#FFF5D4] hover:bg-[#FEF5CC] text-sm font-semibold text-left transition-all"
              >
                <span className="flex-1">{recipe.title}</span>
                <span className="text-xs text-muted-foreground">{recipe.ingredients.length}가지 재료</span>
              </button>
            ))}
          </div>
          <button onClick={onClose} className="w-full py-2.5 rounded-3xl text-sm font-semibold
                bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#C7E9FF_100%)]
                hover:bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#B8E2FF_100%)]
                shadow-sm transition-all duration-300">
            취소
          </button>
        </div>
      </div>
    );
  }

  const handleConfirm = async () => {
    if (!token || !activeBaby) return;
    setSaving(true);
    try {
      const timeStr = result.meal_time
        ?? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      const meal_at = `${result.meal_date}T${timeStr}:00+09:00`;
      await apiFetch<ScheduleCreateOut>(
        `/schedules?baby_id=${activeBaby.id}`,
        {
          method: "POST",
          body: JSON.stringify({
            meal_at,
            name: selected.title,
            recipe_id: selected.recipe_id,
            status: "planned",
          }),
        },
        token,
      );
      onSuccess();
    } catch (err) {
      alert(err instanceof Error ? err.message : "식단 등록에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="bg-card rounded-3xl w-full max-w-md shadow-2xl border border-border overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-bold text-lg">식단 등록 확인</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted"><X className="w-4 h-4 sm:w-[18px] sm:h-[18px]" /></button>
        </div>
        <div className="p-6 space-y-4">
          {result.matched.length > 1 && (
            <button onClick={() => setSelected(null)} className="text-xs text-primary underline underline-offset-2">
              다른 레시피 선택
            </button>
          )}
          <div className="p-4 bg-muted/30 rounded-2xl">
            <div className="font-bold text-lg mb-2">{selected.title}</div>
            {selected.ingredients.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selected.ingredients.map((ing) => (
                  <span key={ing.ingredient_id} className="px-3 py-1 bg-[#EBF7FF] rounded-full text-sm font-semibold">
                    {ing.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-muted-foreground w-10">날짜</span>
            <span className="font-semibold">{result.meal_date}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-muted-foreground w-10">시간</span>
            {result.meal_time ? (
              <span className="font-semibold">{result.meal_time}</span>
            ) : (
              <div className="flex items-center gap-2">
                <TimeDropdown value={hour} onChange={setHour} length={24} suffix="시" />
                <TimeDropdown value={minute} onChange={setMinute} length={60} suffix="분" />
              </div>
            )}
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-3xl border border-border font-bold text-sm hover:bg-muted transition-colors">
            취소
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="flex-1 py-3 rounded-3xl text-[#3D3C38] font-bold text-sm disabled:opacity-50
            bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#C7E9FF_100%)]
            hover:bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#B8E2FF_100%)]
            shadow-sm transition-all duration-300"
          >
            {saving ? "등록 중..." : "등록하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Select Testing Modal ─────────────────────────────────────────────────────

interface SelectTestingModalProps {
  ingredients: Ingredient[];
  onSelect: (ingredient: Ingredient) => void;
  onSkip: () => void;
}

export function SelectTestingModal({ ingredients, onSelect, onSkip }: SelectTestingModalProps) {
  useBodyScrollLock();
  return (
    <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center px-4" onClick={onSkip}>
      <div className="bg-card rounded-2xl w-full max-w-sm shadow-2xl border border-border p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-primary/10 rounded-full">
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          </div>
          <h3 className="font-bold text-base">테스트할 재료를 선택해주세요</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          처음 등록되는 재료가 {ingredients.length}개입니다.<br />
          한 번에 1개만 테스트할 수 있어요.
        </p>
        <div className="space-y-2 mb-5">
          {ingredients.map((ing) => (
            <button
              key={ing.name}
              onClick={() => onSelect(ing)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/10 text-sm font-semibold text-left transition-all"
            >
              <IngredientIcon name={ing.name} emoji={ing.emoji} className="w-5 h-5 sm:w-6 sm:h-6" />
              <span>{ing.name}</span>
            </button>
          ))}
        </div>
        <button
          onClick={onSkip}
          className="w-full py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors"
        >
          다시 입력하기
        </button>
      </div>
    </div>
  );
}

// ─── Active Testing Conflict Modal ───────────────────────────────────────────

interface ActiveTestingConflictModalProps {
  conflictingIngredientName: string;
  conflictEndDate: string;
  onReEnter: () => void;
}

export function ActiveTestingConflictModal({
  conflictingIngredientName,
  conflictEndDate,
  onReEnter,
}: ActiveTestingConflictModalProps) {
  useBodyScrollLock();
  const formatted = new Date(conflictEndDate).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center px-4">
      <div className="bg-card rounded-2xl w-full max-w-sm shadow-2xl border border-border p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-[#FFFAF0] border border-[#F8AC95] rounded-full">
            <AlertTriangle className="w-5 h-5 sm:w-[22px] sm:h-[22px] text-[#F58462]" />
          </div>
        </div>
        <h3 className="font-bold text-base text-center mb-2">현재 진행중인 테스트가 있습니다</h3>
        <p className="text-center text-sm text-muted-foreground mb-1 leading-relaxed">
          <span className="font-semibold text-foreground">{conflictingIngredientName}</span> 테스트가
        </p>
        <p className="text-center text-sm text-muted-foreground mb-4 leading-relaxed">
          <span className="font-semibold text-foreground">{formatted}</span>까지 진행 중이에요.
        </p>
        <p className="text-center text-xs text-muted-foreground mb-6 leading-relaxed">
          테스트가 끝난 후 새로운 재료를 포함하는 식단을 등록해주세요.
        </p>
        <button
          onClick={onReEnter}
          className="w-full py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors"
        >
          식단 다시 만들기
        </button>
      </div>
    </div>
  );
}

// ─── Previous Testing Check Modal ────────────────────────────────────────────

interface PreviousTestingCheckModalProps {
  onHasTested: () => void;
  onNoTested: () => void;
}

export function PreviousTestingCheckModal({ onHasTested, onNoTested }: PreviousTestingCheckModalProps) {
  useBodyScrollLock();
  return (
    <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center px-4">
      <div className="bg-card rounded-2xl w-full max-w-sm shadow-2xl border border-border p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center mb-3">
          <div className="p-3 bg-[#EBF7FF] border border-[#B3DAF5] rounded-full">
            <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-[#5BB6E8]" />
          </div>
        </div>
        <h3 className="font-bold text-lg text-center mb-2">이전에 테스트한 재료가 있나요?</h3>
        <p className="text-center text-base text-muted-foreground mb-4 leading-relaxed">
          알레르기 테스트 기록이 있다면 먼저<br />알레르기 관리 페이지에서 등록해주세요.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onHasTested}
            className="flex-1 py-2.5 rounded-3xl bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)]
            text-[#3D3C38] text-sm font-bold hover:bg-[radial-gradient(ellipse_at_center,#FEF5CC_0%,#FFEFAB_100%)] transition-opacity"
          >
            있어요
          </button>
          <button
            onClick={onNoTested}
            className="flex-1 py-2.5 rounded-3xl border border-border text-sm font-semibold hover:bg-muted transition-colors"
          >
            없어요
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Testing Date Conflict Modal ─────────────────────────────────────────────

export function TestingDateConflictModal({ onConfirm }: { onConfirm: () => void }) {
  useBodyScrollLock();
  return (
    <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center px-4">
      <div className="bg-card rounded-2xl w-full max-w-sm shadow-2xl border border-border p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-[#FFFAF0] border border-[#F8AC95] rounded-full">
            <AlertTriangle className="w-5 h-5 sm:w-[22px] sm:h-[22px] text-[#F58462]" />
          </div>
        </div>
        <h3 className="font-bold text-lg text-center mb-2">테스트 날짜가 겹칩니다</h3>
        <p className="text-center text-base text-muted-foreground mb-6 leading-relaxed">
          식단을 다시 만들어주세요
        </p>
        <button
          onClick={onConfirm}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity"
        >
          확인
        </button>
      </div>
    </div>
  );
}

// ─── Allergy Warning Modal ────────────────────────────────────────────────────

type AllergyWarningVariant = "reaction" | "confirmed" | "suspected" | "mixed";

interface AllergyWarningModalProps {
  variant: AllergyWarningVariant;
  ingredientNames?: string[];        // reaction / confirmed / suspected 케이스
  reactionNames?: string[];          // mixed 케이스
  suspectedNames?: string[];         // mixed 케이스
  onPrimary: () => void;             // 예/등록하기/확인
  onSecondary?: () => void;          // 아니오/수정하기 (confirmed에는 없음)
}

const VARIANT_CONFIG: Record<
  AllergyWarningVariant,
  {
    iconBg: string;
    iconColor: string;
    title: string;
    primaryLabel: string;
    secondaryLabel?: string;
    primaryStyle: string;
  }
> = {
  reaction: {
    iconBg: "bg-[#FFFAF0] border-[#F8AC95]",
    iconColor: "text-[#F58462]",
    title: "알레르기 반응이 있던 재료입니다.\n식단에 추가할까요?",
    primaryLabel: "추가하기",
    secondaryLabel: "취소하기",
    primaryStyle:
      "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)] text-[#3D3C38]",
  },
  confirmed: {
    iconBg: "bg-red-50 border-red-300",
    iconColor: "text-destructive",
    title: "알레르기 확진 재료입니다.\n식단 재구성 또는 재료를 수정해주세요.",
    primaryLabel: "확인",
    primaryStyle: 
      "bg-[radial-gradient(ellipse_at_center,#FFD9C9_0%,#FFC2B0_100%)] text-primary-foreground text-sm font-bold",
  },
  suspected: {
    iconBg: "bg-amber-50 border-amber-300",
    iconColor: "text-amber-600",
    title: "알레르기 반응이 있을 수 있어요.\n좀 더 주의하여 관찰해주세요.",
    primaryLabel: "등록하기",
    secondaryLabel: "수정하기",
    primaryStyle:
      "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)] text-[#3D3C38]",
  },
  mixed: {
    iconBg: "bg-[#FFFAF0] border-[#F8AC95]",
    iconColor: "text-[#F58462]",
    title: "알레르기 반응이 있던 재료와\nAI 의심 재료가 포함되어 있습니다.\n식단에 추가할까요?",
    primaryLabel: "추가하기",
    secondaryLabel: "취소하기",
    primaryStyle:
      "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)] text-[#3D3C38]",
  },
};

export function AllergyWarningModal({
  variant,
  ingredientNames = [],
  reactionNames = [],
  suspectedNames = [],
  onPrimary,
  onSecondary,
}: AllergyWarningModalProps) {
  useBodyScrollLock();
  const cfg = VARIANT_CONFIG[variant];

  return (
    <div className="fixed inset-0 bg-black/50 z-[90] flex items-center justify-center px-4">
      <div
        className="bg-card rounded-2xl w-full max-w-sm shadow-2xl border border-border p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center mb-4">
          <div className={`p-3 border rounded-full ${cfg.iconBg}`}>
            <AlertTriangle className={`w-5 h-5 sm:w-[22px] sm:h-[22px] ${cfg.iconColor}`} />
          </div>
        </div>

        <h3 className="font-bold text-base text-center mb-3 whitespace-pre-line leading-snug">
          {cfg.title}
        </h3>

        {/* 재료 뱃지 */}
        {variant !== "mixed" && ingredientNames.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5 mb-4">
            {ingredientNames.map((name) => (
              <span
                key={name}
                className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                  variant === "confirmed"
                    ? "bg-destructive/15 border-destructive/40 text-destructive"
                    : variant === "suspected"
                      ? "bg-amber-100 border-amber-300 text-amber-800"
                      : "bg-[#FFEEE8] border-[#FF8763]/40 text-[#FF8763]"
                }`}
              >
                {name}
              </span>
            ))}
          </div>
        )}

        {/* mixed 전용: 반응/의심 분리 표시 */}
        {variant === "mixed" && (
          <div className="space-y-2 mb-4">
            {reactionNames.length > 0 && (
              <div className="flex flex-wrap gap-1.5 justify-center">
                <span className="text-xs text-muted-foreground w-full text-center mb-0.5">반응 재료</span>
                {reactionNames.map((name) => (
                  <span
                    key={name}
                    className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#FFEEE8] border border-[#FF8763]/40 text-[#FF8763]"
                  >
                    {name}
                  </span>
                ))}
              </div>
            )}
            {suspectedNames.length > 0 && (
              <div className="flex flex-wrap gap-1.5 justify-center">
                <span className="text-xs text-muted-foreground w-full text-center mb-0.5">AI 의심 재료</span>
                {suspectedNames.map((name) => (
                  <span
                    key={name}
                    className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 border border-amber-300 text-amber-800"
                  >
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className={`flex gap-3 ${!cfg.secondaryLabel ? "" : ""}`}>
          {cfg.secondaryLabel && onSecondary && (
            <button
              onClick={onSecondary}
              className="flex-1 py-2.5 rounded-3xl border border-border text-sm font-semibold hover:bg-muted transition-colors"
            >
              {cfg.secondaryLabel}
            </button>
          )}
          <button
            onClick={onPrimary}
            className={`flex-1 py-2.5 rounded-3xl text-sm font-bold hover:opacity-90 transition-opacity ${cfg.primaryStyle}`}
          >
            {cfg.primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Allergy Test Confirm Modal (과거 날짜 식단 등록 시) ─────────────────────

export function AllergyTestConfirmModal({
  newIngredients,
  testingAllowed,
  onConfirm,
  onClose,
}: {
  newIngredients: { id?: number; name: string; emoji: string }[];
  testingAllowed: boolean;
  onConfirm: (safeIngredients: { id?: number; name: string }[], testingNames: string[]) => void;
  onClose: () => void;
}) {
  useBodyScrollLock();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const allConfirmed = checked.size === newIngredients.length;

  const toggle = (name: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleConfirm = () => {
    if (!testingAllowed && !allConfirmed) return;
    const safe = newIngredients.filter((i) => checked.has(i.name));
    const testingNames = testingAllowed
      ? newIngredients.filter((i) => !checked.has(i.name)).map((i) => i.name)
      : [];
    onConfirm(safe, testingNames);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[90] flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-3xl p-6 w-[400px] shadow-2xl border border-border flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center">
          <div className="p-3 bg-[#EBF7FF] border border-[#B3DAF5] rounded-full">
            <Check className="w-5 h-5 sm:w-[22px] sm:h-[22px] text-[#5BB6E8]" />
          </div>
        </div>
        <h3 className="font-bold text-base text-center">알레르기 테스트를 완료했나요?</h3>
        <p className="text-base text-muted-foreground text-center leading-snug">
          {testingAllowed ? (
            <>처음 등록된 재료예요.<br />이미 테스트를 완료한 재료를 체크해주세요.</>
          ) : (
            <>72시간이 지난 식단이에요.<br />실제로 먹고 반응이 없었던 재료를 모두 체크해주세요.</>
          )}
        </p>
        <div className="flex flex-col gap-2">
          {newIngredients.map((ing) => (
            <label
              key={ing.name}
              className="flex items-center gap-3 px-4 py-2.5 rounded-2xl border border-border cursor-pointer hover:bg-muted/30 transition-colors"
            >
              <input
                type="checkbox"
                checked={checked.has(ing.name)}
                onChange={() => toggle(ing.name)}
                className="w-4 h-4 accent-primary rounded"
              />
              <IngredientIcon name={ing.name} emoji={ing.emoji || null} className="w-[18px] h-[18px] sm:w-[22px] sm:h-[22px]" />
              <span className="font-semibold text-base flex-1">{ing.name}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-full border border-border text-sm font-semibold hover:bg-muted transition-colors"
          >
            나중에
          </button>
          <button
            onClick={handleConfirm}
            disabled={!testingAllowed && !allConfirmed}
            className="flex-1 py-2.5 rounded-full bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#DBF2FF_50%,#D1EDFF_100%)] text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Multiple New Ingredients Modal ──────────────────────────────────────────

interface MultipleNewIngredientsModalProps {
  onConfirm: () => void;
}

export function MultipleNewIngredientsModal({ onConfirm }: MultipleNewIngredientsModalProps) {
  useBodyScrollLock();
  return (
    <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center px-4">
      <div className="bg-card rounded-2xl w-full max-w-sm shadow-2xl border border-border p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-[#FFFAF0] border border-[#F8AC95] rounded-full">
            <AlertTriangle className="w-5 h-5 sm:w-[22px] sm:h-[22px] text-[#F58462]" />
          </div>
        </div>
        <h3 className="font-bold text-base text-center mb-2">새로운 재료가 2개 이상입니다</h3>
        <p className="text-center text-sm text-muted-foreground mb-6 leading-relaxed">
          테스트는 한 번에 1개 진행을 권장합니다.
        </p>
        <button
          onClick={onConfirm}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity"
        >
          확인
        </button>
      </div>
    </div>
  );
}
