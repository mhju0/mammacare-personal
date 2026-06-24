import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CalendarPlus, X } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useApp } from "../context/AppContext";
import { IngredientIcon } from "./IngredientIcon";
import { SelectTestingModal } from "../pages/Schedule/Modals";
import { TimeDropdown } from "../pages/Schedule/TimeDropdown";

const BASE = `${(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")}/api`;

type RecipeStage = "early" | "middle" | "late" | "complete" | "toddler" | "general" | null;

export interface SharedRecipeDetail {
  id: string;
  title: string;
  description: string | null;
  stage?: RecipeStage;
  ingredients: {
    id?: string;
    amount: number;
    ingredient: {
      id: number;
      name: string;
      emoji: string | null;
      recommended_month: number | null;
    };
  }[];
}

interface RecipeScheduleModalProps {
  recipe: { recipe_id: string; title: string };
  initialDetail?: SharedRecipeDetail | null;
  showScheduleAddButton?: boolean;
  onClose: () => void;
  onBack?: () => void;
  onAdded?: (date: string) => void;
}

function stageLabelFromDetail(detail: SharedRecipeDetail | null): string {
  if (!detail) return "";
  switch (detail.stage) {
    case "early": return "초기 (5~6개월)";
    case "middle": return "중기 (7~8개월)";
    case "late": return "후기 (9~11개월)";
    case "complete": return "완료기 (12~18개월)";
    case "toddler": return "유아식";
    case "general": return "일반";
    default: {
      const maxMonth = Math.max(0, ...detail.ingredients.map((ri) => ri.ingredient.recommended_month ?? 0));
      if (maxMonth <= 6) return "초기 (5~6개월)";
      if (maxMonth <= 8) return "중기 (7~8개월)";
      if (maxMonth <= 11) return "후기 (9~11개월)";
      if (maxMonth <= 18) return "완료기 (12~18개월)";
      return "유아식";
    }
  }
}

function splitDescription(description: string): string[] {
  const byLine = description.split("\n").map((line) => line.trim()).filter(Boolean);
  if (byLine.length > 1) return byLine;

  const normalized = description.replace(/\s+/g, " ").trim();
  const parts: string[] = [];
  const sentenceEndPattern = /(다|해|요)\./g;
  let start = 0;
  let match: RegExpExecArray | null;

  while ((match = sentenceEndPattern.exec(normalized)) !== null) {
    const end = match.index + match[0].length;
    const part = normalized.slice(start, end).replace(/\.$/, "").trim();
    if (part) parts.push(part);
    start = end;
    while (normalized[start] === " ") start += 1;
    sentenceEndPattern.lastIndex = start;
  }

  const remainder = normalized.slice(start).replace(/\.$/, "").trim();
  if (remainder) parts.push(remainder);
  return parts;
}

export function RecipeScheduleModal({
  recipe,
  initialDetail,
  showScheduleAddButton = true,
  onClose,
  onBack,
  onAdded,
}: RecipeScheduleModalProps) {
  const isApp = Capacitor.isNativePlatform();
  const { token, activeBaby, confirmedAllergyNames, ingredientTestings } = useApp();
  const [detail, setDetail] = useState<SharedRecipeDetail | null>(initialDetail ?? null);
  const [loadingDetail, setLoadingDetail] = useState(!initialDetail && !!recipe.recipe_id);
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [hour, setHour] = useState(10);
  const [minute, setMinute] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerStep, setDatePickerStep] = useState<"month" | "day" | null>(null);
  const [newIngredientsToSelect, setNewIngredientsToSelect] = useState<{ name: string; emoji: string }[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (initialDetail) {
      setDetail(initialDetail);
      setLoadingDetail(false);
      return;
    }
    if (!recipe.recipe_id) {
      setDetail(null);
      setLoadingDetail(false);
      return;
    }

    setLoadingDetail(true);
    fetch(`${BASE}/recipes/${recipe.recipe_id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: SharedRecipeDetail) => setDetail(data))
      .catch(() => setDetail(null))
      .finally(() => setLoadingDetail(false));
  }, [initialDetail, recipe.recipe_id]);

  const doSave = async (singleNewIngredientName: string | null) => {
    if (!token || !activeBaby || !showScheduleAddButton || !recipe.recipe_id) return;
    setSaving(true);
    setSaveError(null);
    try {
      const meal_at = `${selectedDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`;
      const res = await fetch(`${BASE}/schedules?baby_id=${activeBaby.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ meal_at, name: recipe.title, recipe_id: recipe.recipe_id, status: "planned" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body?.detail === "string" ? body.detail : "식단 등록에 실패했습니다.");
      }

      if (singleNewIngredientName) {
        await fetch(`${BASE}/allergy/tests/auto-create`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ baby_id: activeBaby.id, ingredient_names: [singleNewIngredientName], meal_at }),
        });
      }

      const [y, m] = selectedDate.split("-").map(Number);
      sessionStorage.removeItem(`mammacare_schedule_month:${activeBaby.id}:${y}-${m}`);
      window.dispatchEvent(new CustomEvent("global-stt-schedule-saved"));
      onAdded?.(selectedDate);
    } catch (e) {
      // 사전 차단(B)이 놓친 경우 백엔드 차단 메시지를 인라인으로 표시(A 백업)
      setSaveError(e instanceof Error && e.message ? e.message : "식단 등록에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!token || !activeBaby || !detail) return;
    const existingNames = new Set(ingredientTestings.map((t) => t.ingredient_name));
    const newIngredients = detail.ingredients
      .filter((ri) => !existingNames.has(ri.ingredient.name))
      .map((ri) => ({ name: ri.ingredient.name, emoji: ri.ingredient.emoji ?? "" }));

    if (newIngredients.length > 1) {
      setNewIngredientsToSelect(newIngredients);
      return;
    }
    await doSave(newIngredients[0]?.name ?? null);
  };

  const allergies = confirmedAllergyNames ?? [];
  const allergyIngredients = detail?.ingredients.filter((ri) => allergies.includes(ri.ingredient.name)) ?? [];
  const hasConfirmedAllergy = allergyIngredients.length > 0;
  const stageLabel = stageLabelFromDetail(detail);
  const dateParts = selectedDate.split("-").map(Number);
  const numDaysInMonth = new Date(dateParts[0], dateParts[1], 0).getDate();

  const mainPortal = newIngredientsToSelect.length === 0 && createPortal(
    <div className={`fixed inset-0 bg-black/60 z-[600] flex items-center justify-center ${isApp ? "py-20 px-4" : "px-4 pt-16"}`} onClick={onClose}>
      <div
        className={`bg-card shadow-2xl border border-border w-full max-w-2xl flex flex-col overflow-hidden rounded-3xl ${isApp ? "max-h-[calc(100vh-160px)]" : "max-h-[80vh]"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFFAE3_100%)] ${isApp ? "px-4 pt-3 pb-2" : "px-6 pt-4 pb-3"} border-b border-border shrink-0`}>
          <div className="flex items-start justify-between">
            <div className={`flex items-center min-w-0 ${isApp ? "gap-3" : "gap-4"}`}>
              <div className={`${isApp ? "text-4xl" : "text-5xl"} shrink-0`}>
                <IngredientIcon
                  emoji={detail?.ingredients[0]?.ingredient.emoji ?? null}
                  name={detail?.ingredients[0]?.ingredient.name ?? ""}
                  className={isApp ? "w-8 h-8 sm:w-10 sm:h-10" : "w-10 h-10 sm:w-12 sm:h-12"}
                />
              </div>
              <div className="min-w-0">
                {stageLabel && (
                  <div className={`inline-block px-3 py-1 bg-white/60 rounded-full ${isApp ? "text-xs" : "text-sm"} font-semibold mb-2 text-[#3D3C38]/70`}>
                    {stageLabel}
                  </div>
                )}
                <h2 className={`${isApp ? "text-lg" : "text-2xl"} font-bold break-keep`} style={{ fontFamily: "'SCDream', sans-serif" }}>
                  {recipe.title}
                </h2>
              </div>
            </div>
            <button type="button" onClick={onClose} className="p-2.5 rounded-full bg-white/60 hover:bg-white/80 transition-colors shrink-0">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 pb-1">
          {loadingDetail ? (
            <div className="flex items-center justify-center py-8">
              <svg className="animate-spin h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            </div>
          ) : detail ? (
            <>
              {allergyIngredients.length > 0 && (
                <div className="p-4 bg-red-500/10 border-b border-red-500/20">
                  <div className={`flex items-center gap-2 text-destructive ${isApp ? "text-sm" : "text-base"}`}>
                    <AlertTriangle size={18} />
                    <span className="font-bold">알레르기 주의!</span>
                  </div>
                  <div className={`mt-2 ${isApp ? "text-xs" : "text-sm"} text-destructive`}>
                    확진 알레르기 재료가 포함되어 있어 식단에 추가할 수 없어요:{" "}
                    <span className="font-semibold">{allergyIngredients.map((ri) => ri.ingredient.name).join(", ")}</span>
                  </div>
                </div>
              )}
              <div className={isApp ? "px-4 py-2" : "px-6 py-3"}>
                <h3 className={`font-bold ${isApp ? "text-sm" : "text-base"} mb-2`}>재료</h3>
                <div className={isApp ? "grid grid-cols-2 gap-2" : "grid grid-cols-4 gap-2"}>
                  {detail.ingredients.map((ri, i) => {
                    const isAllergy = allergies.includes(ri.ingredient.name);
                    return (
                      <div
                        key={ri.id ?? i}
                        className={`flex items-center gap-2 px-3 py-2 rounded-3xl border transition-all ${
                          isAllergy
                            ? "bg-red-500/10 border-red-500/30"
                            : "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_100%)] border-border text-[#3D3C38]"
                        }`}
                      >
                        <IngredientIcon emoji={ri.ingredient.emoji} name={ri.ingredient.name} className="w-6 h-6 sm:w-7 sm:h-7" />
                        <div className={`font-semibold ${isApp ? "text-sm" : "text-base"} flex items-center gap-2 min-w-0`}>
                          <span className="truncate">{ri.ingredient.name}</span>
                          {isAllergy && <AlertTriangle size={12} className="text-destructive flex-shrink-0" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {detail.description && (
                <div className={isApp ? "px-4 py-2 mb-1" : "px-6 py-3 mb-2"}>
                  <h3 className={`font-bold ${isApp ? "text-sm" : "text-base"} mb-3`}>조리법</h3>
                  <div className="space-y-2">
                    {splitDescription(detail.description).map((line, i) => (
                      <div key={i} className="flex gap-3 items-start">
                        <div className={`w-6 h-6 rounded-full bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#C7E9FF_100%)] text-primary-foreground flex items-center justify-center ${isApp ? "text-xs" : "text-sm"} font-bold flex-shrink-0`}>
                          {i + 1}
                        </div>
                        <p className={`${isApp ? "text-sm" : "text-base"} text-foreground leading-relaxed`}>{line}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className={`${isApp ? "text-[10px]" : "text-xs"} text-gray-400 py-4 text-center px-5`}>레시피 정보를 불러오지 못했어요.</p>
          )}
        </div>

        <div className="px-5 pb-5 shrink-0">
          {saveError && (
            <p className="mb-2 text-sm text-destructive flex items-center gap-1">
              <AlertTriangle size={14} /> {saveError}
            </p>
          )}
          <div className="flex gap-2">
            {onBack && (
              <button type="button" onClick={onBack}
                className={`flex-1 flex items-center justify-center py-3 rounded-full border border-border ${isApp ? "text-xs" : "text-sm"} font-semibold hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#DBF2FF_100%)] transition-opacity`}>
                뒤로가기
              </button>
            )}
            {showScheduleAddButton && (
              <button type="button" onClick={() => setShowDatePicker(true)} disabled={!detail || !recipe.recipe_id || !token || !activeBaby || hasConfirmedAllergy}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-full text-primary-foreground ${isApp ? "text-xs" : "text-sm"} font-bold bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#DBF2FF_50%,#D1EDFF_100%)] hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#DBF2FF_100%)] transition-opacity disabled:opacity-40`}>
                <CalendarPlus size={16} />
                {hasConfirmedAllergy ? "추가할 수 없어요" : "식단에 추가하기"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );

  const datepickerPortal = showDatePicker && newIngredientsToSelect.length === 0 && createPortal(
    <div className="fixed inset-0 z-[700] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => { setShowDatePicker(false); setDatePickerStep(null); }} />
      {datePickerStep === null && (
        <div className="relative bg-card rounded-3xl shadow-2xl border border-border p-6 flex flex-col gap-5">
          <h3 className="text-base font-bold">식단에 추가할 날짜</h3>
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="inline-flex items-center rounded-xl border border-[#C5E5FA] bg-[#FAFAFA]/80 overflow-hidden">
              <span className="px-2.5 py-1 text-sm font-semibold text-foreground">{dateParts[0]}년</span>
              <span className="w-px self-stretch bg-[#C5E5FA]" />
              <button type="button" onClick={() => setDatePickerStep("month")} className="px-2.5 py-1 text-sm font-semibold hover:bg-[#EBF7FF] transition-colors">{dateParts[1]}월</button>
              <span className="w-px self-stretch bg-[#C5E5FA]" />
              <button type="button" onClick={() => setDatePickerStep("day")} className="px-2.5 py-1 text-sm font-semibold hover:bg-[#EBF7FF] transition-colors">{dateParts[2]}일</button>
            </div>
            <TimeDropdown className="!text-sm !py-1 !pl-2 !pr-1 !w-[68px] !justify-between" value={hour} onChange={setHour} length={24} suffix="시" />
            <TimeDropdown className="!text-sm !py-1 !pl-2 !pr-1 !w-[68px] !justify-between" value={minute} onChange={setMinute} length={6} step={10} suffix="분" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowDatePicker(false)}
              className="flex-1 py-2.5 rounded-full border border-border text-sm font-semibold hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#DBF2FF_100%)] transition-colors">
              취소
            </button>
            <button type="button" onClick={() => { setShowDatePicker(false); handleAdd(); }} disabled={saving || !selectedDate}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full text-primary-foreground text-sm font-bold bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#DBF2FF_50%,#D1EDFF_100%)] hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#DBF2FF_100%)] transition-colors disabled:opacity-40">
              {saving ? "추가 중" : "추가하기"}
            </button>
          </div>
        </div>
      )}
      {datePickerStep === "month" && (
        <div className="relative bg-card rounded-3xl shadow-2xl border border-border w-72 p-5 flex flex-col gap-4">
          <div className="text-sm font-bold text-center">{dateParts[0]}년 월 선택</div>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <button key={m} type="button"
                onClick={() => {
                  const maxDay = new Date(dateParts[0], m, 0).getDate();
                  setSelectedDate(`${dateParts[0]}-${String(m).padStart(2, "0")}-${String(Math.min(dateParts[2], maxDay)).padStart(2, "0")}`);
                  setDatePickerStep("day");
                }}
                className={`py-2 rounded-xl text-sm font-semibold transition-colors ${m === dateParts[1] ? "bg-[#C5E5FA] text-primary-foreground" : "hover:bg-[#C5E5FA]/20 text-foreground"}`}>
                {m}월
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setDatePickerStep(null)} className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">취소</button>
        </div>
      )}
      {datePickerStep === "day" && (
        <div className="relative bg-card rounded-3xl shadow-2xl border border-border w-72 p-5 flex flex-col gap-4">
          <div className="relative flex items-center mb-1">
            <button type="button" onClick={() => setDatePickerStep("month")} className="absolute left-0 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">월 선택</button>
            <span className="w-full text-center text-sm font-bold">{dateParts[0]}년 {dateParts[1]}월</span>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: numDaysInMonth }, (_, i) => i + 1).map((d) => (
              <button key={d} type="button"
                onClick={() => { setSelectedDate(`${dateParts[0]}-${String(dateParts[1]).padStart(2, "0")}-${String(d).padStart(2, "0")}`); setDatePickerStep(null); }}
                className={`aspect-square text-xs rounded-lg transition-colors flex items-center justify-center ${d === dateParts[2] ? "bg-[#C5E5FA] text-primary-foreground font-bold" : "hover:bg-[#C5E5FA]/20 text-foreground"}`}>
                {d}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setDatePickerStep(null)} className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">취소</button>
        </div>
      )}
    </div>,
    document.body
  );

  const testingPickerPortal = newIngredientsToSelect.length > 1
    ? createPortal(
        <SelectTestingModal
          ingredients={newIngredientsToSelect}
          onSelect={(ing) => { setNewIngredientsToSelect([]); doSave(ing.name); }}
          onSkip={() => setNewIngredientsToSelect([])}
        />,
        document.body
      )
    : null;

  return <>{mainPortal}{datepickerPortal}{testingPickerPortal}</>;
}
