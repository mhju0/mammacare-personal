import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router";
import { Clock, Edit3, Trash2, Check, X, Plus, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useApp } from "../../context/AppContext";
import { apiFetch } from "../../api/client";
import { IngredientIcon } from "../../components/IngredientIcon";
import { RecipeScheduleModal, type SharedRecipeDetail } from "../../components/RecipeScheduleModal";
import type { MealEntry, ApiRecipe, ApiIngredient, Ingredient, ScheduleCreateOut } from "./types";
import { formatMealAt, toIngredients } from "./types";
import { isCrossReactiveSuspect, getSuspectedIngredientsPrioritized } from "../../data/crossReactivity";
import { TimeDropdown } from "./TimeDropdown";
import {
  AllergyAlertModal,
  AllergyTestingStartedModal,
  AllergyTestConfirmModal,
  MultipleNewIngredientsModal,
  ActiveTestingConflictModal,
  TestingDateConflictModal,
  PreviousTestingCheckModal,
  AllergyWarningModal,
} from "./Modals";

function getLeadingIngredient(recipe: ApiRecipe) {
  const inTitle = recipe.ingredients
    .filter((ri) => recipe.title.includes(ri.ingredient.name))
    .sort((a, b) => recipe.title.indexOf(a.ingredient.name) - recipe.title.indexOf(b.ingredient.name));
  return inTitle[0] ?? recipe.ingredients[0];
}

interface MealDetailPanelProps {
  year: number;
  month: number;
  day: number;
  daysInMonth: number;
  meals: MealEntry[];
  onSave: (meals: MealEntry[]) => void;
  onClose: () => void;
  onPrevDay?: () => void;
  onNextDay?: () => void;
  allergies: string[];
  babyAgeMonths: number;
}

// 백엔드 확진 알레르기 차단(409) 메시지에서 재료명 추출.
// 예: "확진 알레르기 재료(달걀, 우유)는 식단에 등록할 수 없습니다." → ["달걀", "우유"]
function extractConfirmedAllergenNames(message: string): string[] {
  const m = message.match(/확진 알레르기 재료\(([^)]+)\)/);
  return m ? m[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
}

export function MealDetailPanel({ year, month, day, daysInMonth, meals, onSave, onClose, onPrevDay, onNextDay, allergies, babyAgeMonths }: MealDetailPanelProps) {
  const isApp = Capacitor.isNativePlatform();
  const { activeBaby, token, refreshTestings, ingredientTestings, confirmedAllergyNames } = useApp();
  const navigate = useNavigate();

  const reactionIngredientNames = useMemo(
    () =>
      ingredientTestings
        .filter((t) => t.test_status === "completed_reaction")
        .map((t) => t.ingredient_name),
    [ingredientTestings],
  );

  const suspectedIngredientNames = useMemo(
    () => getSuspectedIngredientsPrioritized(confirmedAllergyNames, reactionIngredientNames).map((s) => s.suspectedName),
    [confirmedAllergyNames, reactionIngredientNames],
  );

  type PendingAllergyCheck =
    | { type: "reaction"; ingredientNames: string[] }
    | { type: "confirmed"; ingredientNames: string[] }
    | { type: "suspected"; ingredientNames: string[] }
    | { type: "mixed"; reactionNames: string[]; suspectedNames: string[] };

  type PendingSaveAction =
    | { mode: "create"; snapshot: MealEntry }
    | { mode: "update"; index: number; snapshot: MealEntry };

  type PendingAllergyFlow = {
    warning: PendingAllergyCheck;
    action: PendingSaveAction;
  };

  const [pendingAllergyFlow, setPendingAllergyFlow] = useState<PendingAllergyFlow | null>(null);

  // 편집 시작 시점의 재료 ID 집합 (재료 변경 여부 판단용)
  const [originalIngredientIds, setOriginalIngredientIds] = useState<Set<number>>(new Set());

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);  // 추가 폼 인라인 에러 (확진 알레르기 외)
  const [entries, setEntries] = useState<MealEntry[]>(meals);

  const editingRef = useRef(false);
  useEffect(() => { editingRef.current = editingIndex !== null || isAdding; }, [editingIndex, isAdding]);

  // 부모 meals prop이 업데이트되면 편집 중이 아닐 때 동기화 (API 응답이 늦게 올 때 대비)
  useEffect(() => {
    if (!editingRef.current) setEntries(meals);
  }, [meals]);
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);
  const [selectedMealRecipe, setSelectedMealRecipe] = useState<ApiRecipe | null>(null);
  const [newTestingIngredients, setNewTestingIngredients] = useState<{ name: string; emoji: string | null }[]>([]);
  const [newTestingMealDate, setNewTestingMealDate] = useState<Date | null>(null);
  const [pendingMealId, setPendingMealId] = useState<string | undefined>(undefined);
  const [showMultipleIngredientsModal, setShowMultipleIngredientsModal] = useState(false);
  const [showPreviousTestingModal, setShowPreviousTestingModal] = useState(false);
  const [allergyTestConfirmData, setAllergyTestConfirmData] = useState<{
    newIngredients: { id?: number; name: string; emoji: string }[];
    existingIngredientNames: string[];
    mealAt: string;
    savedId?: string;
    updateAction?: { index: number; snapshot: MealEntry };
  } | null>(null);
  const [conflictInfo, setConflictInfo] = useState<{
    ingredientName: string;
    endDate: string;
  } | null>(null);
  const [showDateConflict, setShowDateConflict] = useState(false);

  const [recipeSuggestions, setRecipeSuggestions] = useState<ApiRecipe[]>([]);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [editSuggestions, setEditSuggestions] = useState<{ index: number; recipes: ApiRecipe[] } | null>(null);
  const editSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const extractTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [currentEntry, setCurrentEntry] = useState<MealEntry>({
    name: "",
    hour: 10,
    minute: 0,
    ingredients: [],
    memo: "",
    recipe_id: null,
  });

  const [ingredientEditingTarget, setIngredientEditingTarget] = useState<"add" | number | null>(null);
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [ingredientSuggestions, setIngredientSuggestions] = useState<ApiIngredient[]>([]);
  const ingredientSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleAddNameChange = (name: string) => {
    setCurrentEntry((prev) => ({ ...prev, name, recipe_id: null }));
    setRecipeSuggestions([]);
    if (!name.trim() || !token) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await apiFetch<ApiRecipe[]>(
          `/recipes?q=${encodeURIComponent(name)}&age_months=${babyAgeMonths}`,
          {},
          token,
        );
        setRecipeSuggestions(results);
      } catch {
        // 검색 실패 시 드롭다운 비움
      }
    }, 300);
  };

  const handleSelectRecipe = (recipe: ApiRecipe) => {
    setRecipeSuggestions([]);
    setCurrentEntry((prev) => ({
      ...prev,
      name: recipe.title,
      recipe_id: recipe.id,
      ingredients: toIngredients(recipe, allergies),
    }));
  };

  const handleEntryNameChange = (index: number, name: string) => {
    setEntries(entries.map((e, i) => (i !== index ? e : { ...e, name, recipe_id: null })));
    setEditSuggestions(null);
    if (!name.trim() || !token) return;
    if (editSearchTimerRef.current) clearTimeout(editSearchTimerRef.current);
    editSearchTimerRef.current = setTimeout(async () => {
      try {
        const results = await apiFetch<ApiRecipe[]>(
          `/recipes?q=${encodeURIComponent(name)}&age_months=${babyAgeMonths}`,
          {},
          token,
        );
        if (results.length > 0) setEditSuggestions({ index, recipes: results });
      } catch {
        // 검색 실패 무시
      }
    }, 300);
  };

  // ── 식단 이름 타이핑 시 재료 자동 추출 (레시피 미선택 상태일 때만) ────────────
  useEffect(() => {
    const name = currentEntry.name.trim();
    // recipe_id가 있으면 레시피에서 재료가 이미 채워지므로 skip
    if (currentEntry.recipe_id || name.length < 2) return;

    if (extractTimerRef.current) clearTimeout(extractTimerRef.current);
    extractTimerRef.current = setTimeout(async () => {
      if (!token) return;
      try {
        const data = await apiFetch<{ ingredients: Array<{ id: number; name: string; emoji: string | null }> }>(
          "/ai/extract-ingredients",
          { method: "POST", body: JSON.stringify({ name }) },
          token,
        );
        if (data.ingredients.length > 0) {
          // 타임아웃 실행 시점에 recipe_id가 생기면 덮어쓰지 않도록 함수형 업데이트 사용
          setCurrentEntry((prev) => {
            if (prev.recipe_id || prev.name.trim() !== name) return prev;
            return {
              ...prev,
              ingredients: data.ingredients.map((i) => ({
                id: i.id,
                emoji: i.emoji ?? "",
                name: i.name,
                hasAllergy: allergies.includes(i.name),
              })),
            };
          });
        }
      } catch {
        // 추출 실패 시 무시 (재료 없는 상태로 진행)
      }
    }, 600);

    return () => {
      if (extractTimerRef.current) clearTimeout(extractTimerRef.current);
    };
  }, [currentEntry.name, currentEntry.recipe_id]);

  const handleSelectEditRecipe = (index: number, recipe: ApiRecipe) => {
    setEditSuggestions(null);
    setEntries(entries.map((e, i) =>
      i !== index
        ? e
        : { ...e, name: recipe.title, recipe_id: recipe.id, ingredients: toIngredients(recipe, allergies) },
    ));
  };

  const handleIngredientSearchChange = (value: string) => {
    setIngredientSearch(value);
    setIngredientSuggestions([]);
    if (!value.trim() || !token) return;
    if (ingredientSearchTimerRef.current) clearTimeout(ingredientSearchTimerRef.current);
    ingredientSearchTimerRef.current = setTimeout(async () => {
      try {
        const results = await apiFetch<ApiIngredient[]>(
          `/ingredients?search=${encodeURIComponent(value)}`,
          {},
          token,
        );
        setIngredientSuggestions(results.slice(0, 8));
      } catch { /* ignore */ }
    }, 200);
  };

  const handleSelectIngredient = (ing: ApiIngredient) => {
    const newIng: Ingredient = { id: ing.id, emoji: ing.emoji ?? "", name: ing.name, hasAllergy: allergies.includes(ing.name) };
    if (isAdding) {
      setCurrentEntry((prev) => ({ ...prev, ingredients: [...prev.ingredients, newIng] }));
    } else if (typeof ingredientEditingTarget === "number") {
      setEntries((prev) => prev.map((e, i) =>
        i !== ingredientEditingTarget ? e : { ...e, ingredients: [...e.ingredients, newIng] }
      ));
    }
    setIngredientSearch("");
    setIngredientSuggestions([]);
  };

  const handleRemoveIngredientFromCurrent = (i: number) => {
    setCurrentEntry((prev) => ({ ...prev, ingredients: prev.ingredients.filter((_, idx) => idx !== i) }));
  };

  const handleRemoveIngredientFromEdit = (entryIndex: number, i: number) => {
    setEntries((prev) => prev.map((e, idx) =>
      idx !== entryIndex ? e : { ...e, ingredients: e.ingredients.filter((_, j) => j !== i) }
    ));
  };

  const openIngredientEditor = (target: "add" | number) => {
    setIngredientEditingTarget(target);
    setIngredientSearch("");
    setIngredientSuggestions([]);
  };

  const closeIngredientEditor = () => {
    setIngredientEditingTarget(null);
    setIngredientSearch("");
    setIngredientSuggestions([]);
  };

  const handleMealNameClick = async (entry: MealEntry) => {
    if (!token) return;
    if (entry.recipe_id) {
      try {
        const recipe = await apiFetch<ApiRecipe>(`/recipes/${entry.recipe_id}`, {}, token);
        setSelectedMealRecipe(recipe);
      } catch {
        // 레시피 없으면 팝업 미표시
      }
    } else if (entry.recipe_description) {
      // AI 생성 레시피 — recipe_description과 재료를 모달로 표시
      setSelectedMealRecipe({
        id: "",
        title: entry.name,
        description: entry.recipe_description,
        ingredients: entry.ingredients.map((ing, i) => ({
          id: String(ing.id ?? i),
          amount: ing.amount ?? 0,
          ingredient: {
            id: ing.id ?? 0,
            name: ing.name,
            emoji: ing.emoji || null,
            recommended_month: null,
          },
        })),
      });
    }
  };

  // 알레르기 경고 통과 후 실제 수정 저장
  const proceedToUpdate = async (
    index: number,
    snapshot: MealEntry,
    testStatusByName?: Record<string, "testing" | "completed_safe">,
    pastStatusConfirmed = false,
  ) => {
    if (!activeBaby || !token || !snapshot.id) return;

    const mealAt = formatMealAt(year, month, day, snapshot.hour, snapshot.minute);

    const isPastDate = new Date(mealAt).getTime() <= Date.now();

    // 재료가 실제로 변경됐는지 ID 집합 비교
    const currentIds = new Set(snapshot.ingredients.map((i) => i.id).filter((id): id is number => id !== undefined));
    const ingredientsChanged =
      currentIds.size !== originalIngredientIds.size ||
      [...currentIds].some((id) => !originalIngredientIds.has(id));

    const completedOrReactionNames = new Set(
      ingredientTestings
        .filter((t) => t.test_status === "completed_safe" || t.test_status === "completed_reaction")
        .map((t) => t.ingredient_name),
    );
    confirmedAllergyNames.forEach((name) => completedOrReactionNames.add(name));
    const addedIngredients = snapshot.ingredients.filter(
      (ing) => ing.id !== undefined && !originalIngredientIds.has(ing.id),
    );
    const confirmationTargets = addedIngredients.filter(
      (ing) => !completedOrReactionNames.has(ing.name),
    );

    if (isPastDate && confirmationTargets.length > 0 && !pastStatusConfirmed) {
      setAllergyTestConfirmData({
        newIngredients: confirmationTargets.map((ing) => ({
          id: ing.id,
          name: ing.name,
          emoji: ing.emoji,
        })),
        existingIngredientNames: [],
        mealAt,
        updateAction: { index, snapshot },
      });
      return;
    }

    // 신규 재료 2개 이상 (미래 날짜만)
    if (!isPastDate && ingredientsChanged) {
      const existingNames = new Set(ingredientTestings.map((t) => t.ingredient_name));
      const newIngredients = snapshot.ingredients.filter((ing) => !existingNames.has(ing.name));

      if (newIngredients.length > 1) {
        setShowMultipleIngredientsModal(true);
        return;
      }

      if (newIngredients.length === 1) {
        const activeTesting = ingredientTestings.find((t) => t.test_status === "testing");
        if (activeTesting) {
          const endDate = activeTesting.test_end_date ? new Date(activeTesting.test_end_date) : null;
          if (!endDate || endDate >= new Date(mealAt)) {
            setConflictInfo({ ingredientName: activeTesting.ingredient_name, endDate: activeTesting.test_end_date ?? mealAt });
            return;
          }
        }
      }
    }

    try {
      const ingredientIds = ingredientsChanged
        ? snapshot.ingredients.map((i) => i.id).filter((id): id is number => id !== undefined)
        : undefined;

      await apiFetch(
        `/schedules/${snapshot.id}?baby_id=${activeBaby.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            meal_at: mealAt,
            name: snapshot.name.trim() || null,
            recipe_id: snapshot.recipe_id ?? null,
            memo: snapshot.memo || null,
            ...(ingredientIds !== undefined ? { ingredient_ids: ingredientIds } : {}),
            ...(testStatusByName ? { test_status_by_name: testStatusByName } : {}),
          }),
        },
        token,
      );
    } catch (err) {
      const status = (err as { status?: number }).status;
      const msg = err instanceof Error ? err.message : "알 수 없는 오류";
      // 확진 알레르기 차단(409)은 사전체크와 동일한 확진 경고 모달로 표시
      const confirmedNames = status === 409 ? extractConfirmedAllergenNames(msg) : [];
      if (confirmedNames.length > 0) {
        setPendingAllergyFlow({
          warning: { type: "confirmed", ingredientNames: confirmedNames },
          action: { mode: "update", index, snapshot },
        });
      } else {
        alert(`저장에 실패했습니다: ${msg}`);
      }
      return;
    }

    setEditingIndex(null);
    // 서버가 recipe_id·AI 메타 등을 수정했을 수 있으므로 부모의 fetchMonthlySchedules 트리거
    window.dispatchEvent(new Event("global-stt-schedule-saved"));
  };

  const handleSaveEntry = async (index: number) => {
    const snapshot = entries[index];

    if (!snapshot.name.trim() && snapshot.ingredients.length === 0) {
      alert("식단 이름 또는 재료를 입력해 주세요.");
      return;
    }

    // 기존 재료는 메모·시간 수정이 가능하도록 새로 추가된 재료만 검사한다.
    const addedIngredients = snapshot.ingredients.filter(
      (ing) => ing.id !== undefined && !originalIngredientIds.has(ing.id),
    );
    if (addedIngredients.length > 0) {
      const names = addedIngredients.map((ing) => ing.name);
      const confirmedHits = names.filter((n) => allergies.includes(n));
      const reactionHits = names.filter((n) => reactionIngredientNames.includes(n));
      const suspectedHits = names.filter((n) => suspectedIngredientNames.includes(n));

      const action: PendingSaveAction = { mode: "update", index, snapshot };
      if (confirmedHits.length > 0) {
        setPendingAllergyFlow({ warning: { type: "confirmed", ingredientNames: confirmedHits }, action });
        return;
      }
      if (reactionHits.length > 0 && suspectedHits.length > 0) {
        setPendingAllergyFlow({ warning: { type: "mixed", reactionNames: reactionHits, suspectedNames: suspectedHits }, action });
        return;
      }
      if (reactionHits.length > 0) {
        setPendingAllergyFlow({ warning: { type: "reaction", ingredientNames: reactionHits }, action });
        return;
      }
      if (suspectedHits.length > 0) {
        setPendingAllergyFlow({ warning: { type: "suspected", ingredientNames: suspectedHits }, action });
        return;
      }
    }

    await proceedToUpdate(index, snapshot);
  };

  const proceedToAdding = () => {
    setShowPreviousTestingModal(false);
    setEditingIndex(null);
    setIsAdding(true);
    setCurrentEntry({ name: "", hour: 10, minute: 0, ingredients: [], memo: "", recipe_id: null });
    setRecipeSuggestions([]);
    closeIngredientEditor();
  };

  const handleStartAdding = () => {
    const isFirstTimeUser =
      ingredientTestings.length === 0 && confirmedAllergyNames.length === 0;
    if (isFirstTimeUser) {
      setShowPreviousTestingModal(true);
      return;
    }
    proceedToAdding();
  };

  const triggerAutoCreate = async (
    names: string[],
    mealAt: string,
    scheduleId?: string,
    statusByName?: Record<string, "testing" | "completed_safe">,
    emojiByName?: Record<string, string | null>,
  ) => {
    if (!activeBaby || !token || names.length === 0) return false;
    try {
      const res = await apiFetch<{ data: { new_ingredient_names: string[] } }>(
        "/allergy/tests/auto-create",
        {
          method: "POST",
          body: JSON.stringify({
            baby_id: activeBaby.id,
            ingredient_names: names,
            meal_at: mealAt,
            status_by_name: statusByName,
          }),
        },
        token,
      );
      if (res.data?.new_ingredient_names?.length > 0) {
        setNewTestingIngredients(
          res.data.new_ingredient_names.map((n) => ({ name: n, emoji: emojiByName?.[n] ?? null })),
        );
        setNewTestingMealDate(new Date(mealAt));
      }
      refreshTestings();
      return true;
    } catch (err) {
      const errStatus = (err as { status?: number }).status;
      if (errStatus === 409 && scheduleId) {
        setAllergyTestConfirmData(null);
        setPendingMealId(scheduleId);
        setShowDateConflict(true);
        return false;
      }
      const message = err instanceof Error ? err.message : "알레르기 테스트 저장에 실패했습니다.";
      alert(message);
      return false;
    }
  };

  const handleReEnterMeal = async () => {
    if (pendingMealId && activeBaby && token) {
      try {
        await apiFetch(`/schedules/${pendingMealId}?baby_id=${activeBaby.id}`, { method: "DELETE" }, token);
      } catch {
        // ignore
      }
      const updated = entries.filter((e) => e.id !== pendingMealId);
      setEntries(updated);
      onSave(updated);
    }
    setPendingMealId(undefined);
    setShowDateConflict(false);
    setIsAdding(true);
    refreshTestings();
  };

  const handleCancelConflict = () => {
    setShowMultipleIngredientsModal(false);
    setConflictInfo(null);
  };

  // 알레르기 체크 통과 후 실제 저장 로직
  const proceedToSave = async (entrySnapshot: typeof currentEntry) => {
    setAddError(null);
    const mealAt = formatMealAt(year, month, day, entrySnapshot.hour, entrySnapshot.minute);

    const isPastDate = new Date(mealAt).getTime() <= Date.now();

    // ── 1단계: DB 저장 전 새 재료 충돌 사전 검사 (미래/오늘 날짜만) ────
    if (!isPastDate && entrySnapshot.ingredients.length > 0 && activeBaby && token) {
      const existingNames = new Set(ingredientTestings.map((t) => t.ingredient_name));
      const newIngredients = entrySnapshot.ingredients.filter((ing) => !existingNames.has(ing.name));

      if (newIngredients.length > 1) {
        setShowMultipleIngredientsModal(true);
        return;
      }

      if (newIngredients.length === 1) {
        const activeTesting = ingredientTestings.find((t) => t.test_status === "testing");
        const mealDate = new Date(mealAt);

        if (activeTesting) {
          const endDate = activeTesting.test_end_date ? new Date(activeTesting.test_end_date) : null;
          const isOverlap = !endDate || endDate >= mealDate;

          if (isOverlap) {
            setConflictInfo({
              ingredientName: activeTesting.ingredient_name,
              endDate: activeTesting.test_end_date ?? mealAt,
            });
            return;
          }
        }
      }
    }

    // ── 2단계: DB 저장 ────────────────────────────────────────────────
    let savedId: string | undefined;
    let savedRecipeId: string | null | undefined;
    if (activeBaby && token) {
      try {
        // 선택한 레시피 재료와 현재 재료가 같은지는 백엔드가 최종 검증한다.
        const ingredientIds = entrySnapshot.ingredients
          .map(i => i.id)
          .filter((id): id is number => id !== undefined);
        const created = await apiFetch<ScheduleCreateOut>(
          `/schedules?baby_id=${activeBaby.id}`,
          {
            method: "POST",
            body: JSON.stringify({
              meal_at: mealAt,
              name: entrySnapshot.name.trim() || null,
              recipe_id: entrySnapshot.recipe_id ?? null,
              ingredient_ids: ingredientIds.length > 0 ? ingredientIds : undefined,
              memo: entrySnapshot.memo || null,
              status: "planned",
            }),
          },
          token,
        );
        savedId = created.id;
        savedRecipeId = created.recipe_id;
      } catch (err) {
        const status = (err as { status?: number }).status;
        const message = err instanceof Error ? err.message : "식단 저장에 실패했습니다.";
        // 확진 알레르기 차단(409)은 기존 확진 경고 모달로 표시(사전체크와 동일 UI), 그 외는 인라인 에러
        const confirmedNames = status === 409 ? extractConfirmedAllergenNames(message) : [];
        if (confirmedNames.length > 0) {
          setPendingAllergyFlow({
            warning: { type: "confirmed", ingredientNames: confirmedNames },
            action: { mode: "create", snapshot: entrySnapshot },
          });
        } else {
          console.error("[식단 저장 실패]", `HTTP ${status}`, err);
          setAddError(message);
        }
        return;
      }
    }

    const newEntry = { ...entrySnapshot, id: savedId, recipe_id: savedRecipeId ?? entrySnapshot.recipe_id };
    const updatedEntries = [...entries, newEntry];
    setEntries(updatedEntries);
    onSave(updatedEntries);
    setCurrentEntry({ name: "", hour: 10, minute: 0, ingredients: [], memo: "", recipe_id: null });
    setRecipeSuggestions([]);
    setIngredientSearch("");
    setIngredientSuggestions([]);
    setIsAdding(false);

    // ── 3단계: 새 재료 알레르기 처리 ───────────────────────────────────
    if (entrySnapshot.ingredients.length > 0 && activeBaby && token) {
      const existingNames = new Set(ingredientTestings.map((t) => t.ingredient_name));
      const completedOrReactionNames = new Set(
        ingredientTestings
          .filter((t) => t.test_status === "completed_safe" || t.test_status === "completed_reaction")
          .map((t) => t.ingredient_name),
      );
      confirmedAllergyNames.forEach((name) => completedOrReactionNames.add(name));
      const newIngredients = entrySnapshot.ingredients.filter((ing) => !existingNames.has(ing.name));
      const confirmTargetIngredients = entrySnapshot.ingredients.filter(
        (ing) => !completedOrReactionNames.has(ing.name),
      );
      const existingIngredientNames = entrySnapshot.ingredients
        .filter((ing) => existingNames.has(ing.name))
        .map((ing) => ing.name);

      if (isPastDate) {
        if (confirmTargetIngredients.length > 0) {
          // 과거 날짜 + 새 재료: 테스트 완료 여부 팝업 (기존 재료도 함께 전달해 start_date 업데이트 처리)
          setAllergyTestConfirmData({
            newIngredients: confirmTargetIngredients.map((ing) => ({
              id: ing.id,
              name: ing.name,
              emoji: ing.emoji,
            })),
            existingIngredientNames: entrySnapshot.ingredients
              .filter((ing) => completedOrReactionNames.has(ing.name))
              .map((ing) => ing.name),
            mealAt,
            savedId,
          });
        } else if (existingIngredientNames.length > 0) {
          // 과거 날짜 + 기존 재료만: 더 이른 날짜면 test_start_date 업데이트
          await triggerAutoCreate(existingIngredientNames, mealAt, savedId);
        }
      } else if (newIngredients.length === 1) {
        await triggerAutoCreate(
          [newIngredients[0].name],
          mealAt,
          savedId,
          undefined,
          { [newIngredients[0].name]: newIngredients[0].emoji ?? null },
        );
      }
    }
  };

  // 알레르기 테스트 완료 확인 팝업 응답 처리
  const handleAllergyTestConfirm = async (
    safeIngredients: { id?: number; name: string }[],
    testingNames: string[],
  ) => {
    if (!allergyTestConfirmData || !activeBaby || !token) return;
    const { mealAt, savedId, existingIngredientNames, updateAction } = allergyTestConfirmData;
    const statusByName: Record<string, "testing" | "completed_safe"> = {};
    safeIngredients.forEach((ing) => {
      statusByName[ing.name] = "completed_safe";
    });
    testingNames.forEach((name) => {
      statusByName[name] = "testing";
    });

    if (updateAction) {
      setAllergyTestConfirmData(null);
      await proceedToUpdate(
        updateAction.index,
        updateAction.snapshot,
        statusByName,
        true,
      );
      return;
    }

    // Persist explicit statuses from the past-date confirmation modal.
    const namesToProcess = [...safeIngredients.map((ing) => ing.name), ...testingNames, ...existingIngredientNames];
    if (namesToProcess.length > 0) {
      const saved = await triggerAutoCreate(namesToProcess, mealAt, savedId, statusByName);
      if (saved) setAllergyTestConfirmData(null);
    } else {
      setAllergyTestConfirmData(null);
      refreshTestings();
    }
  };

  const handleFinishAdding = async () => {
    setAddError(null);
    if (!currentEntry.name.trim() && currentEntry.ingredients.length === 0) {
      alert("식단 이름 또는 재료를 입력해 주세요.");
      return;
    }

    // ── 0단계: 알레르기 재료 체크 ────────────────────────────────────────
    if (currentEntry.ingredients.length > 0) {
      const names = currentEntry.ingredients.map((ing) => ing.name);

      const confirmedHits = names.filter((n) => allergies.includes(n));
      const reactionHits = names.filter((n) => reactionIngredientNames.includes(n));
      const suspectedHits = names.filter((n) => suspectedIngredientNames.includes(n));

      const hasConfirmed = confirmedHits.length > 0;
      const hasReaction = reactionHits.length > 0;
      const hasSuspected = suspectedHits.length > 0;

      const action: PendingSaveAction = { mode: "create", snapshot: currentEntry };
      if (hasConfirmed) {
        setPendingAllergyFlow({ warning: { type: "confirmed", ingredientNames: confirmedHits }, action });
        return;
      }
      if (hasReaction && hasSuspected) {
        setPendingAllergyFlow({ warning: { type: "mixed", reactionNames: reactionHits, suspectedNames: suspectedHits }, action });
        return;
      }
      if (hasReaction) {
        setPendingAllergyFlow({ warning: { type: "reaction", ingredientNames: reactionHits }, action });
        return;
      }
      if (hasSuspected) {
        setPendingAllergyFlow({ warning: { type: "suspected", ingredientNames: suspectedHits }, action });
        return;
      }
    }

    await proceedToSave(currentEntry);
  };

  const handleDeleteEntry = async (index: number) => {
    const entry = entries[index];
    if (entry.id && activeBaby && token) {
      try {
        await apiFetch(`/schedules/${entry.id}?baby_id=${activeBaby.id}`, { method: "DELETE" }, token);
      } catch {
        return;
      }
    }
    const updated = entries.filter((_, i) => i !== index);
    setEntries(updated);
    onSave(updated);
    setEditingIndex(null);
  };

  const handleIngredientClick = (ingredient: Ingredient) => {
    setSelectedIngredient({ ...ingredient, hasAllergy: allergies.includes(ingredient.name) });
  };

  const allergyWarning = currentEntry.ingredients.some((ing) => ing.hasAllergy);

  return (
    <>
    <style>{`
      .recipe-dropdown::-webkit-scrollbar { width: 8px !important; }
      .recipe-dropdown::-webkit-scrollbar-track { background: white !important; border-radius: 9999px !important; margin: 8px 0 !important; }
      .recipe-dropdown::-webkit-scrollbar-thumb { background: #D9F0FF !important; border-radius: 9999px !important; }
      .recipe-dropdown { scrollbar-width: thin; scrollbar-color: #D9F0FF white; }
    `}</style>
    <div className="bg-[#EBF7FF]/70 border border-border rounded-3xl p-5 lg:p-6 flex-1 scrollbar-hide w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        {isApp ? (
          <div className="flex items-center gap-1">
            <button
              onClick={onPrevDay}
              disabled={day <= 1}
              className="p-1 rounded-full hover:bg-[#CFE9FA] transition-colors disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            </button>
            <h2 className="font-bold text-lg">{month + 1}월 {day}일 식단</h2>
            <button
              onClick={onNextDay}
              disabled={day >= daysInMonth}
              className="p-1 rounded-full hover:bg-[#CFE9FA] transition-colors disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            </button>
          </div>
        ) : (
          <h2 className="font-bold text-lg">{month + 1}월 {day}일 식단</h2>
        )}
        <div className="flex items-center gap-2">
          {isAdding ? (
            <button onClick={handleFinishAdding} className="text-[#3D3C38] flex items-center gap-1.5 px-2.5 py-2 text-primary-foreground text-sm font-semibold rounded-full transition-colors
                bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#C7E9FF_100%)]
                hover:bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#B8E2FF_100%)]">
              <Check size={12} /> 추가 완료
            </button>
          ) : (
            <button disabled={editingIndex !== null} onClick={handleStartAdding} className="text-[#3D3C38] flex items-center gap-1.5 px-2.5 py-2 text-sm font-bold rounded-full transition-opacity
                bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#C7E9FF_100%)]
                hover:bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#B8E2FF_100%)]
                shadow-sm transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed">
              <Plus size={12} /> 식단 추가
            </button>
          )}
          <button onClick={onClose} className="p-2 rounded-full hover:bg-[#CFE9FA] transition-colors">
            <X className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
          </button>
        </div>
      </div>

      {/* 추가 폼 */}
      {isAdding && (
        <div className="mb-5 p-4 bg-[#FAFAFA] rounded-3xl space-y-3">
          {addError && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertTriangle size={14} /> {addError}
            </p>
          )}
          <div>
            <label className="text-sm font-semibold text-muted-foreground mb-2 block">식단 이름</label>
            <div className="relative">
              <input
                type="text"
                value={currentEntry.name}
                onChange={(e) => handleAddNameChange(e.target.value)}
                placeholder="재료명을 입력하면 레시피를 추천해드려요"
                className="w-full px-3 py-2 rounded-xl border border-[#C5E5FA] bg-[#FAFAFA]/80 focus:outline-none focus:ring-2 focus:ring-[#EBF7FF] text-base font-semibold"
                autoFocus
                onBlur={() => setTimeout(() => setRecipeSuggestions([]), 150)}
              />
              {recipeSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-[#EBF7FF] border border-[#C5E5FA] rounded-3xl shadow-lg overflow-hidden">
                  <div className="max-h-[240px] overflow-y-auto recipe-dropdown">
                  {recipeSuggestions.map((r) => (
                    <button
                      key={r.id}
                      onMouseDown={(e) => { e.preventDefault(); handleSelectRecipe(r); }}
                      className="w-full px-3 py-2.5 text-base text-left hover:bg-[#FAFAFA]/70 flex items-center gap-2"
                    >
                      <IngredientIcon
                        name={getLeadingIngredient(r)?.ingredient.name ?? ''}
                        emoji={getLeadingIngredient(r)?.ingredient.emoji}
                        className="w-4 h-4 sm:w-5 sm:h-5"
                      />
                      <span className="flex-1 font-medium">{r.title}</span>
                      {r.ingredients.length > 0 && (
                        <span className="text-sm text-muted-foreground">
                          재료 {r.ingredients.length}개
                        </span>
                      )}
                    </button>
                  ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-3 mb-2">
              <label className="text-sm font-semibold text-muted-foreground">재료</label>
              <button
                type="button"
                onClick={() =>
                  ingredientEditingTarget === "add" ? closeIngredientEditor() : openIngredientEditor("add")
                }
                className="text-[#3D3C38] flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full transition-opacity
                  bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#D9F0FF_100%)]
                  hover:bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#C5E5FA_100%)]
                  shadow-sm transition-all duration-300"
              >
                <Edit3 size={12} />
                {ingredientEditingTarget === "add" ? "완료" : "재료 변경"}
              </button>
            </div>
            {ingredientEditingTarget === "add" && (
              <div className="relative mb-2">
                <input
                  type="text"
                  value={ingredientSearch}
                  onChange={(e) => handleIngredientSearchChange(e.target.value)}
                  placeholder="재료 검색 후 선택..."
                  className="w-full px-2 py-1.5 rounded-lg border border-[#C5E5FA] bg-[#FAFAFA]/80 focus:outline-none focus:ring-2 focus:ring-[#EBF7FF] text-sm font-semibold"
                  onBlur={() => setTimeout(() => setIngredientSuggestions([]), 150)}
                />
                {ingredientSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-[#EBF7FF] border border-[#C5E5FA] rounded-3xl shadow-lg overflow-hidden">
                    {ingredientSuggestions.map((ing) => (
                      <button
                        key={ing.id}
                        onMouseDown={(e) => { e.preventDefault(); handleSelectIngredient(ing); }}
                        className="w-full px-3 py-2.5 text-sm text-left hover:bg-[#FAFAFA]/70 flex items-center gap-2"
                      >
                        <IngredientIcon name={ing.name} emoji={ing.emoji} className="w-[18px] h-[18px] sm:w-[22px] sm:h-[22px]" />
                        <span className="flex-1">{ing.name}</span>
                        {allergies.includes(ing.name) && <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-destructive" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {currentEntry.ingredients.length > 0 && (
              <>
                <div className="flex flex-wrap gap-2 mb-2">
                  {currentEntry.ingredients.map((ing, i) => {
                    const crossInfo = isCrossReactiveSuspect(ing.name, reactionIngredientNames);
                    return (
                      <span
                        key={i}
                        className={`px-3 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1.5 ${
                          ing.hasAllergy
                            ? "bg-red-500/10 text-[#AB2B2B] dark:text-red-300"
                            : crossInfo.isSuspect
                              ? "bg-amber-100 text-amber-800"
                              : "bg-[#EBF7FF] text-foreground"
                        }`}
                      >
                        <IngredientIcon name={ing.name} emoji={ing.emoji} className="w-4 h-4 sm:w-5 sm:h-5" />
                        <span>{ing.name}</span>
                        {ing.hasAllergy}
                        {!ing.hasAllergy && crossInfo.isSuspect && (
                          <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveIngredientFromCurrent(i)}
                          className="ml-0.5 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    );
                  })}
                </div>
                {allergyWarning && (
                  <p className="mt-1.5 text-sm text-destructive flex items-center gap-1">
                    <AlertTriangle size={12} /> 알레르기 반응이 있는 재료가 포함되어 있어요
                  </p>
                )}
                {!allergyWarning && currentEntry.ingredients.some((ing) =>
                  isCrossReactiveSuspect(ing.name, reactionIngredientNames).isSuspect,
                ) && (
                  <p className="mt-1.5 text-sm text-amber-700 flex items-center gap-1">
                    <AlertTriangle size={12} /> 알레르기 반응 재료와 단백질 구조가 유사한 재료가 포함되어 있어요
                  </p>
                )}
              </>
            )}
          </div>

          <div>
            <label className="text-sm font-semibold text-muted-foreground mb-2 block">식사 시간</label>
            <div className="flex items-center gap-2">
              <TimeDropdown
                value={currentEntry.hour}
                onChange={(v) => setCurrentEntry({ ...currentEntry, hour: v })}
                length={24}
                suffix="시"
              />
              <TimeDropdown
                value={currentEntry.minute}
                onChange={(v) => setCurrentEntry({ ...currentEntry, minute: v })}
                length={6}
                step={10}
                suffix="분"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-muted-foreground mb-2 block">메모</label>
            <textarea
              value={currentEntry.memo}
              onChange={(e) => setCurrentEntry({ ...currentEntry, memo: e.target.value })}
              placeholder="메모를 입력하세요..."
              className="w-full px-3 py-2 rounded-lg border border-[#C5E5FA] bg-[#FAFAFA]/80 focus:outline-none focus:ring-2 focus:ring-[#EBF7FF] text-base font-semibold resize-none"
              rows={2}
            />
          </div>
        </div>
      )}

      {/* 저장된 식단 목록 */}
      <div className="space-y-4">
        {entries.map((entry, index) => (
        <div key={index} className="bg-[#fafafa]/80 p-4 rounded-3xl">
          {editingIndex === index ? (
            <>
              <div className="flex items-start justify-between mb-3">
                <span className="gap-2 mt-1 flex items-center text-base font-semibold text-[#3D3C38]/40">
                <Edit3 size={14} />수정 중...</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDeleteEntry(index)}
                    className="text-[#3D3C38] flex items-center gap-1.5 px-3 py-1 text-sm font-bold rounded-full transition-opacity
                      bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#D9F0FF_100%)]
                      hover:bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#C5E5FA_100%)]
                      shadow-sm transition-all duration-300"
                  >
                    <Trash2 size={14} /> 삭제
                  </button>
                  <button
                    onClick={() => handleSaveEntry(index)}
                    className="text-[#3D3C38] flex items-center gap-1.5 px-3 py-1 text-sm font-bold rounded-full transition-opacity
                      bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#D9F0FF_100%)]
                      hover:bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#C5E5FA_100%)]
                      shadow-sm transition-all duration-300"
                  >
                    <Check size={14} /> 저장
                  </button>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-muted-foreground mb-2 block">식단 이름</label>
                <div className="relative">
                  <input
                    type="text"
                    value={entry.name}
                    onChange={(e) => handleEntryNameChange(index, e.target.value)}
                    placeholder="이유식 이름"
                    className="w-full px-2 py-1.5 rounded-lg border border-[#C5E5FA]
                    bg-[#FAFAFA]/80 focus:outline-none focus:ring-2 focus:ring-[#EBF7FF]
                    text-base font-semibold resize-none"
                  />
                  {editSuggestions?.index === index && editSuggestions.recipes.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-[#EBF7FF] border border-[#C5E5FA] rounded-3xl shadow-lg overflow-hidden">
                      <div className="max-h-[240px] overflow-y-auto recipe-dropdown" >
                      {editSuggestions.recipes.map((r) => (
                        <button
                          key={r.id}
                          onMouseDown={(e) => { e.preventDefault(); handleSelectEditRecipe(index, r); }}
                          className="w-full px-3 py-2.5 text-base text-left hover:bg-[#FAFAFA]/70 flex items-center gap-2"
                        >
                          <IngredientIcon name={getLeadingIngredient(r)?.ingredient.name ?? ""} emoji={getLeadingIngredient(r)?.ingredient.emoji ?? null} className="w-[18px] h-[18px] sm:w-[22px] sm:h-[22px]" />
                          <span>{r.title}</span>
                        </button>
                      ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-3 mb-1 mt-1 py-3">
                  <label className="text-sm font-semibold text-muted-foreground">재료</label>
                  <button
                    type="button"
                    onClick={() =>
                      ingredientEditingTarget === index ? closeIngredientEditor() : openIngredientEditor(index)
                    }
                    className="text-[#3D3C38] flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full transition-opacity
                      bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#D9F0FF_100%)]
                      hover:bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#C5E5FA_100%)]
                      shadow-sm transition-all duration-300"
                  >
                    <Edit3 size={12} />
                    {ingredientEditingTarget === index ? "완료" : "재료 변경"}
                  </button>
                </div>
                {entry.ingredients.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {entry.ingredients.map((ing, i) => (
                      <span
                        key={i}
                        className={`px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-1 ${
                          ing.hasAllergy ? "bg-red-500/10 text-[#AB2B2B] dark:text-red-300" : "bg-[#EBF7FF] text-foreground"
                        }`}
                      >
                        <IngredientIcon name={ing.name} emoji={ing.emoji} size={18} /> {ing.name}
                        {ingredientEditingTarget === index && (
                          <button
                            type="button"
                            onClick={() => handleRemoveIngredientFromEdit(index, i)}
                            className="ml-0.5 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
                          >
                            <X size={10} />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">재료 없음</p>
                )}
                {ingredientEditingTarget === index && (
                  <div className="relative mt-1.5">
                    <input
                      type="text"
                      value={ingredientSearch}
                      onChange={(e) => handleIngredientSearchChange(e.target.value)}
                      placeholder="재료 검색 후 선택..."
                      className="w-full px-2 py-1.5 rounded-lg border border-[#C5E5FA] bg-[#FAFAFA]/80 focus:outline-none focus:ring-2 focus:ring-[#EBF7FF] text-sm font-semibold resize-none"
                      onBlur={() => setTimeout(() => setIngredientSuggestions([]), 150)}
                    />
                    {ingredientSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-[#EBF7FF] border border-[#C5E5FA] rounded-3xl shadow-lg overflow-hidden">
                        {ingredientSuggestions.map((ing) => (
                          <button
                            key={ing.id}
                            onMouseDown={(e) => { e.preventDefault(); handleSelectIngredient(ing); }}
                            className="w-full px-3 py-2.5 text-sm text-left hover:bg-[#FAFAFA]/70 flex items-center gap-2"
                          >
                            <IngredientIcon name={ing.name} emoji={ing.emoji} className="w-[18px] h-[18px] sm:w-[22px] sm:h-[22px]" />
                            <span className="flex-1">{ing.name}</span>
                            {allergies.includes(ing.name) && <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-destructive" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-semibold text-muted-foreground mt-1 py-2 block">식사 시간</label>
                <div className="flex items-center gap-2">
                  <TimeDropdown
                    value={entry.hour}
                    onChange={(v) => { const u = [...entries]; u[index] = { ...u[index], hour: v }; setEntries(u); }}
                    length={24}
                    suffix="시"
                  />
                  <TimeDropdown
                    value={entry.minute}
                    onChange={(v) => { const u = [...entries]; u[index] = { ...u[index], minute: v }; setEntries(u); }}
                    length={6}
                    step={10}
                    suffix="분"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-muted-foreground mt-1 py-2 block">메모</label>
                <textarea
                  value={entry.memo}
                  onChange={(e) => { const u = [...entries]; u[index] = { ...u[index], memo: e.target.value }; setEntries(u); }}
                  placeholder="메모를 입력하세요..."
                  className="w-full px-2 py-1.5 rounded-lg border border-[#C5E5FA] bg-[#FAFAFA]/80 focus:outline-none focus:ring-2 focus:ring-[#EBF7FF] text-sm font-semibold resize-none"
                  rows={2}
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <button
                    onClick={() => handleMealNameClick(entry)}
                    className={`font-bold text-base mb-1 text-left transition-colors ${
                      entry.recipe_id || entry.recipe_description ? "hover:text-[#6BABFF] cursor-pointer" : "cursor-default"
                    }`}
                  >
                    {entry.name}
                  </button>
                  <div className="flex items-center gap-2 text-[1rem] text-muted-foreground">
                    <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span>{String(entry.hour).padStart(2, "0")}:{String(entry.minute).padStart(2, "0")}</span>
                  </div>
                </div>
                <button
                  disabled={editingIndex !== null || isAdding}
                  onClick={() => {
                    setOriginalIngredientIds(new Set(entry.ingredients.map((i) => i.id).filter((id): id is number => id !== undefined)));
                    setEditingIndex(index);
                  }}
                  className="text-[#3D3C38] flex items-center gap-1.5 px-3 py-1 text-sm font-bold rounded-full transition-opacity
                    bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#D9F0FF_100%)]
                    hover:bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#C5E5FA_100%)]
                    shadow-sm transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Edit3 size={14} /> 수정
                </button>
              </div>

              {entry.ingredients.length > 0 && (
                <div className="mb-3">
                  <span className="text-sm font-semibold text-muted-foreground mb-2 block">재료</span>
                  <div className="flex flex-wrap gap-2">
                    {entry.ingredients.map((ing, i) => (
                      <button
                        key={i}
                        onClick={() => handleIngredientClick(ing)}
                        className={`px-3 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1.5 transition-all ${
                          ing.hasAllergy
                            ? "bg-red-500/10 text-[#AB2B2B] dark:text-red-300"
                            : "bg-[#EBF7FF] text-foreground"
                        }`}
                      >
                        <IngredientIcon name={ing.name} emoji={ing.emoji} size={18} />
                        <span>{ing.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {entry.memo && (
                <div className="mt-3 p-3 bg-[#EBF7FF] rounded-xl">
                  <div className="text-xs font-semibold text-muted-foreground mb-1">메모</div>
                  <div className="text-sm text-foreground">{entry.memo}</div>
                </div>
              )}
            </>
          )}
        </div>
      ))}
      </div>

      {selectedIngredient && (
        <AllergyAlertModal
          ingredient={selectedIngredient}
          hasAllergy={selectedIngredient.hasAllergy || false}
          isTesting={ingredientTestings.some((t) => t.test_status === "testing" && t.ingredient_name === selectedIngredient.name)}
          onClose={() => setSelectedIngredient(null)}
        />
      )}

      {selectedMealRecipe && (
        <RecipeScheduleModal
          recipe={{ recipe_id: selectedMealRecipe.id, title: selectedMealRecipe.title }}
          initialDetail={selectedMealRecipe as SharedRecipeDetail}
          onClose={() => setSelectedMealRecipe(null)}
          showScheduleAddButton={false}
        />
      )}

      {newTestingIngredients.length > 0 && (
        <AllergyTestingStartedModal
          newIngredients={newTestingIngredients}
          mealDate={newTestingMealDate ?? undefined}
          onClose={() => { setNewTestingIngredients([]); setNewTestingMealDate(null); }}
          onGoToAllergy={() => navigate("/allergy")}
        />
      )}

      {conflictInfo && (
        <ActiveTestingConflictModal
          conflictingIngredientName={conflictInfo.ingredientName}
          conflictEndDate={conflictInfo.endDate}
          onReEnter={handleCancelConflict}
        />
      )}

      {showDateConflict && (
        <TestingDateConflictModal onConfirm={handleReEnterMeal} />
      )}

      {showMultipleIngredientsModal && (
        <MultipleNewIngredientsModal onConfirm={handleCancelConflict} />
      )}

      {showPreviousTestingModal && (
        <PreviousTestingCheckModal
          onHasTested={() => {
            setShowPreviousTestingModal(false);
            navigate("/allergy");
          }}
          onNoTested={proceedToAdding}
        />
      )}

      {allergyTestConfirmData && (
        <AllergyTestConfirmModal
          newIngredients={allergyTestConfirmData.newIngredients}
          testingAllowed={
            new Date(allergyTestConfirmData.mealAt).getTime() <= Date.now()
            && Date.now() < new Date(allergyTestConfirmData.mealAt).getTime() + 72 * 60 * 60 * 1000
          }
          onConfirm={handleAllergyTestConfirm}
          onClose={() => setAllergyTestConfirmData(null)}
        />
      )}

      {pendingAllergyFlow && (
        <AllergyWarningModal
          variant={pendingAllergyFlow.warning.type}
          ingredientNames={
            pendingAllergyFlow.warning.type !== "mixed"
              ? pendingAllergyFlow.warning.ingredientNames
              : []
          }
          reactionNames={
            pendingAllergyFlow.warning.type === "mixed"
              ? pendingAllergyFlow.warning.reactionNames
              : []
          }
          suspectedNames={
            pendingAllergyFlow.warning.type === "mixed"
              ? pendingAllergyFlow.warning.suspectedNames
              : []
          }
          onPrimary={() => {
            const flow = pendingAllergyFlow;
            setPendingAllergyFlow(null);
            if (flow.warning.type === "confirmed") {
              // 확인 알레르기 → 저장 안 함
            } else if (flow.action.mode === "create") {
              proceedToSave(flow.action.snapshot);
            } else {
              proceedToUpdate(flow.action.index, flow.action.snapshot);
            }
          }}
          onSecondary={
            pendingAllergyFlow.warning.type !== "confirmed"
              ? () => setPendingAllergyFlow(null)
              : undefined
          }
        />
      )}
    </div>
    </>
  );
}
