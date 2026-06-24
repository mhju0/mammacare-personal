import { useState, useRef } from "react";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { createPortal } from "react-dom";
import { X, ChevronRight, Camera } from "lucide-react";
import { SelectTestingModal } from "../../pages/Schedule/Modals";
import { IngredientIcon } from "../IngredientIcon";
import type { GlobalSttResult, GlobalSttIntent } from "./types";

const STAGE_EN_TO_KO: Record<string, string> = {
  early: "초기",
  middle: "중기",
  late: "후기",
  complete: "완료기",
  toddler: "유아기",
  general: "일반",
};

export function renderEmphasis(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((seg, i) =>
    seg.startsWith("**") && seg.endsWith("**") ? (
      <span key={i} className="font-semibold">{seg.slice(2, -2)}</span>
    ) : (
      <span key={i}>{seg}</span>
    )
  );
}

export function SttLoadingOverlay() {
  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-[500] flex items-center pt-16 justify-center pointer-events-none">
      <div className="pointer-events-auto bg-card border border-gray-200 rounded-full shadow-lg px-6 py-4 flex items-center gap-3">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-[#C4E9FF] animate-bounce [animation-delay:-0.3s]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#C4E9FF] animate-bounce [animation-delay:-0.15s]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#C4E9FF] animate-bounce" />
        </div>
        <span className="text-lg font-medium text-primary-foreground">AI가 처리 중입니다</span>
      </div>
    </div>,
    document.body
  );
}

export function IngredientConfirmModal({
  sttResult,
  onConfirm,
  onBack,
}: {
  sttResult: GlobalSttResult;
  onConfirm: (selectedIds: number[]) => void;
  onBack: () => void;
}) {
  useBodyScrollLock();
  const suggested = sttResult.suggested_ingredients ?? [];
  const newIngredientIds = new Set(sttResult.new_ingredient_ids ?? []);
  const [showTestingPicker, setShowTestingPicker] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    new Set(suggested.map((i) => i.id))
  );

  const toggleIngredient = (id: number) => {
    setSelectedIds((prev) => {
      if (prev.has(id) && prev.size === 1) return prev;
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleConfirmClick = () => {
    const ids = [...selectedIds];
    const newIds = ids.filter((id) => newIngredientIds.has(id));
    if (newIds.length > 1) {
      setShowTestingPicker(true);
      return;
    }
    onConfirm(ids);
  };

  const handleTestingSelect = (ingredient: { id?: number; name: string }) => {
    if (ingredient.id == null) return;
    const filtered = [...selectedIds].filter(
      (id) => !newIngredientIds.has(id) || id === ingredient.id
    );
    setShowTestingPicker(false);
    onConfirm(filtered);
  };

  const dateLabel = sttResult.pending_date
    ? new Date(sttResult.pending_date + "T00:00:00").toLocaleDateString("ko-KR", { month: "long", day: "numeric" })
    : null;

  const newIngredientsForPicker = suggested
    .filter((ing) => newIngredientIds.has(ing.id) && selectedIds.has(ing.id))
    .map((ing) => ({ id: ing.id, name: ing.name, emoji: ing.emoji ?? "" }));

  const selectedNames = suggested.filter((i) => selectedIds.has(i.id)).map((i) => i.name);

  if (showTestingPicker) {
    return (
      <SelectTestingModal
        ingredients={newIngredientsForPicker}
        onSelect={handleTestingSelect}
        onSkip={() => setShowTestingPicker(false)}
      />
    );
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-[500] flex items-center pt-16 justify-center px-4">
      <div className="bg-card border border-border rounded-3xl shadow-2xl px-5 py-3 flex flex-col gap-5 w-sm">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base text-primary-foreground">이유식 일정 기록</h3>
          <button type="button" onClick={onBack} className="p-1.5 rounded-full hover:bg-muted">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        {suggested.length === 0 ? (
          <p className="text-base text-center text-muted-foreground py-1">
            재료를 찾지 못했습니다.<br />
            직접 재료를 등록해주세요.
          </p>
        ) : (
          <div className="flex items-center justify-center">
            <div className="flex flex-col gap-2">
              {suggested.map((ing) => {
                const isSelected = selectedIds.has(ing.id);
                return (
                  <button
                    key={ing.id}
                    type="button"
                    onClick={() => toggleIngredient(ing.id)}
                    className={`flex items-center gap-1 px-8 py-1 rounded-full text-lg font-medium border transition-all duration-150 ${
                      isSelected
                        ? "border-[#FF8763]/70 bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFE8E0_100%)]"
                        : "border-border bg-muted/40 opacity-40"
                    }`}
                  >
                    <IngredientIcon name={ing.name} emoji={ing.emoji} size={24} />
                    {ing.name}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col px-3">
              {dateLabel && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground shrink-0 flex items-center">
                    <ChevronRight size={13} />반응 날짜
                  </span>
                  <span className="text-sm font-semibold text-primary-foreground flex-1 leading-relaxed">
                    {dateLabel}{sttResult.pending_meal_time ? ` ${sttResult.pending_meal_time}` : ""}
                  </span>
                </div>
              )}
              <div className="flex items-start gap-2">
                <span className="text-sm font-medium text-muted-foreground shrink-0 flex items-center mt-0.5">
                  <ChevronRight size={13} />증상 종류
                </span>
                {sttResult.pending_has_reaction ? (
                  <div className="flex flex-wrap gap-1 flex-1">
                    {sttResult.pending_symptom
                      ? sttResult.pending_symptom.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (
                          <span
                            key={s}
                            className="px-2 py-0.5 bg-destructive/10 border border-destructive/20 rounded-full text-xs font-semibold text-destructive"
                          >
                            {s}
                          </span>
                        ))
                      : <span className="text-sm text-muted-foreground">반응 있음</span>
                    }
                  </div>
                ) : (
                  <span className="text-sm font-semibold text-primary-foreground flex-1 leading-relaxed">반응 없음</span>
                )}
              </div>
            </div>
          </div>
        )}

        {suggested.length > 0 && (
          <p className="text-base font-normal text-center mt-3 mb-3">
            <span className="font-bold">'{selectedNames.join(", ")}'</span> 기록을 등록하시겠어요?
          </p>
        )}

        {sttResult._errorMsg && (
          <p className="text-sm text-red-500 text-center -mt-1 mb-1 whitespace-pre-line">{sttResult._errorMsg}</p>
        )}

        {suggested.length > 0 && (
          <div className="flex gap-2 mt-1">
            <button
              type="button"
              onClick={onBack}
              className="flex-1 py-3 rounded-full border border-border text-sm font-semibold
                  hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#DBF2FF_100%)] transition-opacity"
            >
              취소하기
            </button>
            <button
              type="button"
              onClick={handleConfirmClick}
              className="flex-1 py-3 rounded-full text-primary-foreground text-sm font-bold
                  bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#DBF2FF_50%,#D1EDFF_100%)]
                  hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#DBF2FF_100%)] transition-opacity"
            >
              등록하기
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export function SttResultModal({
  result,
  onClose,
  onOpenChatbot,
  onGoRecipes,
  onGoMealPlan,
  onGoSchedule,
  onPhotoUpload,
  onRecipeClick,
}: {
  result: GlobalSttResult;
  onClose: () => void;
  onOpenChatbot: (text: string) => void;
  onGoRecipes: (query: string) => void;
  onGoMealPlan: () => void;
  onGoSchedule: (date?: string) => void;
  onPhotoUpload: (checkId: string, file: File) => Promise<void>;
  onRecipeClick: (recipe: { recipe_id: string; title: string }) => void;
}) {
  useBodyScrollLock();
  const { intent, message, schedule, allergy, recipes } = result;
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoState, setPhotoState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !allergy) return;
    const previewUrl = URL.createObjectURL(file);
    setPhotoState("uploading");
    try {
      await onPhotoUpload(allergy.check_id, file);
      setPhotoPreviewUrls((prev) => [...prev, previewUrl]);
      setPhotoState("done");
    } catch {
      URL.revokeObjectURL(previewUrl);
      setPhotoState("error");
    }
    e.target.value = "";
  };

  const intentLabel: Record<GlobalSttIntent, string> = {
    schedule_allergy: "식단 & 알레르기 반응 등록",
    schedule_delete: "식단 삭제",
    chatbot: "AI 챗봇",
    recipe_search: "레시피 검색",
    meal_plan: "AI 식단 구성",
    growth_record: "성장 기록",
    unknown: "알림",
  };

  const primaryBtn =
    "w-full py-3 rounded-full text-primary-foreground text-sm font-bold " +
    "bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#DBF2FF_50%,#D1EDFF_100%)] " +
    "hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#DBF2FF_100%)] transition-opacity";

  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-[500] flex items-center pt-16 justify-center px-4">
      <div className="bg-card border border-border rounded-3xl shadow-2xl px-6 py-5 flex flex-col gap-4 w-full max-w-sm mx-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base text-primary-foreground">{intentLabel[intent]}</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full hover:bg-muted">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        <p className="text-sm text-primary-foreground leading-relaxed whitespace-pre-line">{renderEmphasis(message)}</p>

        {(schedule || allergy || result.testing || result.growth) && (
          <div className="flex flex-col gap-2.5">
            {schedule && (
              <div className="flex items-baseline gap-3">
                <span className="text-sm font-medium text-muted-foreground w-28 shrink-0">
                  {schedule.action === "existing_used" ? "기존 식단" : "등록 식단"}
                </span>
                <span className="text-sm font-semibold text-primary-foreground flex-1 leading-relaxed">
                  {schedule.ingredient_names.join(", ")}{schedule.name !== schedule.ingredient_names[0] ? ` (${schedule.name})` : ""}
                </span>
              </div>
            )}
            {schedule && (
              <div className="flex items-baseline gap-3">
                <span className="text-sm font-medium text-muted-foreground w-28 shrink-0">등록 날짜</span>
                <span className="text-sm font-semibold text-primary-foreground flex-1 leading-relaxed">
                  {new Date(schedule.meal_at).toLocaleDateString("ko-KR")}
                </span>
              </div>
            )}
            {allergy && (
              <div className="flex items-baseline gap-3">
                <span className="text-sm font-medium text-muted-foreground w-28 shrink-0">알레르기 반응 재료</span>
                <span className="text-sm font-semibold text-[#D47D7F] flex-1 leading-relaxed">{allergy.ingredient_name}</span>
              </div>
            )}
            {result.testing && (
              <>
                <div className="flex items-baseline gap-3">
                  <span className="text-xs text-muted-foreground w-28 shrink-0">신규 재료 테스트</span>
                  <span className="text-sm font-semibold text-primary-foreground flex-1 leading-relaxed">
                    {result.testing.ingredient_name} · 72시간 관찰 시작
                  </span>
                </div>
                {result.testing.test_end_date && (
                  <div className="flex items-baseline gap-3">
                    <span className="text-xs text-muted-foreground w-28 shrink-0">관찰 종료</span>
                    <span className="text-sm font-semibold text-primary-foreground flex-1 leading-relaxed">
                      {new Date(result.testing.test_end_date).toLocaleDateString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                )}
              </>
            )}
            {result.growth && (
              <>
                <div className="flex items-baseline gap-3">
                  <span className="text-xs text-muted-foreground w-28 shrink-0">기록 날짜</span>
                  <span className="text-sm font-semibold text-primary-foreground flex-1 leading-relaxed">
                    {new Date(result.growth.log_date + "T00:00:00").toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}
                  </span>
                </div>
                {result.growth.height_cm != null && (
                  <div className="flex items-baseline gap-3">
                    <span className="text-xs text-muted-foreground w-28 shrink-0">키</span>
                    <span className="text-sm font-semibold text-primary-foreground flex-1 leading-relaxed">{result.growth.height_cm} cm</span>
                  </div>
                )}
                {result.growth.weight_kg != null && (
                  <div className="flex items-baseline gap-3">
                    <span className="text-xs text-muted-foreground w-28 shrink-0">몸무게</span>
                    <span className="text-sm font-semibold text-primary-foreground flex-1 leading-relaxed">{result.growth.weight_kg} kg</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {allergy && (
          <>
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            {photoState === "error" ? (
              <p className="text-sm text-center text-[#7A7A7A]/50 font-medium">사진 업로드에 실패했습니다. 다시 시도해주세요.</p>
            ) : photoPreviewUrls.length > 0 ? (
              <div className="flex items-center gap-2 flex-wrap">
                {photoPreviewUrls.map((url, idx) => (
                  <div key={url} className="relative shrink-0 w-14 h-14">
                    <img src={url} alt={`증상 사진 ${idx + 1}`} className="w-14 h-14 rounded-xl object-cover border border-[#D47D7F]/30" />
                    <button
                      type="button"
                      onClick={() => {
                        URL.revokeObjectURL(url);
                        setPhotoPreviewUrls((prev) => {
                          const next = prev.filter((u) => u !== url);
                          if (next.length === 0) setPhotoState("idle");
                          return next;
                        });
                      }}
                      className="absolute -top-1.5 -right-1 w-4 h-4 rounded-full bg-gray-700/80 flex items-center justify-center hover:bg-gray-900/90 transition-colors"
                    >
                      <X size={9} className="text-white" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={photoState === "uploading"}
                  className="w-14 h-14 rounded-xl border-2 border-dashed border-[#D47D7F]/40 flex items-center justify-center text-[#D47D7F]/60 hover:border-[#D47D7F]/70 hover:text-[#D47D7F] transition-colors disabled:opacity-50 shrink-0"
                >
                  <span className="text-xl leading-none">{photoState === "uploading" ? "" : "+"}</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={photoState === "uploading"}
                className="flex items-center gap-1.5 mx-auto text-sm font-semibold text-[#D47D7F]
                bg-[#D47D7F]/10 hover:bg-[#D47D7F]/20 border border-[#D47D7F]/30 px-3 py-0.5 rounded-full
                transition-colors disabled:opacity-50"
              >
                <Camera size={17} />
                {photoState === "uploading" ? "업로드 중" : "증상 사진 등록"}
              </button>
            )}
          </>
        )}

        {recipes && recipes.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground -mt-2">레시피를 눌러 상세 정보와 식단 추가를 확인하세요</p>
            {recipes.map((r) => (
              <button
                key={r.recipe_id}
                type="button"
                onClick={() => onRecipeClick({ recipe_id: r.recipe_id, title: r.title })}
                className="flex items-center justify-between bg-[#FAFAFA]/80 border border-[#C5E5FA]
                hover:bg-[#EBF7FF] rounded-3xl px-4 py-3 text-sm text-primary-foreground font-semibold
                transition-colors text-left"
              >
                <span>
                  {r.stage && <span className="mr-2 text-xs text-[#7FB5D4]">{STAGE_EN_TO_KO[r.stage] ?? r.stage}</span>}
                  {r.title}
                </span>
                <ChevronRight size={16} className="text-[#7FB5D4] shrink-0" />
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 mt-1">
          {intent === "schedule_allergy" && schedule && (
            <button type="button" onClick={() => { onGoSchedule(schedule.meal_at); onClose(); }} className={primaryBtn}>
              이유식 일정에서 확인하기
            </button>
          )}
          {intent === "chatbot" && result.query && (
            <button type="button" onClick={() => { onOpenChatbot(result.query!); onClose(); }} className={primaryBtn}>
              챗봇에서 확인하기
            </button>
          )}
          {intent === "recipe_search" && (
            <button type="button" onClick={() => { onGoRecipes((result.recipe_ingredients ?? []).join(", ") || result.query || ""); onClose(); }} className={primaryBtn}>
              레시피 페이지로 이동
            </button>
          )}
          {intent === "meal_plan" && (
            <button type="button" onClick={() => { onGoMealPlan(); onClose(); }} className={primaryBtn}>
              AI 식단 구성 시작
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-full border border-border text-sm font-semibold text-primary-foreground hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#DBF2FF_100%)] transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

