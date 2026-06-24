import { useState, useEffect, useCallback, useRef } from "react";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { useNavigate } from "react-router";
import { useApp } from "../../context/AppContext";
import {
  Package,
  X,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import {
  getAdminDataStats,
  getAdminRecipeData,
  createAdminRecipe,
  deleteAdminRecipes,
  getAdminIngredientData,
  createAdminIngredient,
  deleteAdminIngredients,
  uploadIngredientImage,
  type AdminDataStatsOut,
  type AdminRecipeDataOut,
  type AdminIngredientDataOut,
  type RecipeStage,
} from "../../api/admin";
import { listIngredients, type IngredientResponse } from "../../api/ingredients";

// ── 레시피 추가 모달 ──────────────────────────────────────

interface SelectedIngredient {
  id: number;
  name: string;
  emoji: string | null;
  amount: number;
}

interface NewRecipeModalProps {
  token: string;
  onClose: () => void;
  onCreated: (recipe: AdminRecipeDataOut) => void;
}

function NewRecipeModal({ token, onClose, onCreated }: NewRecipeModalProps) {
  useBodyScrollLock();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState("");
  const [stage, setStage] = useState<RecipeStage | "">("");
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [searchResults, setSearchResults] = useState<IngredientResponse[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedIngredient[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const term = ingredientSearch.trim();
    if (!term) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        const results = await listIngredients({ search: term });
        setSearchResults(results.filter((r) => !selected.some((s) => s.id === r.id)));
      } catch (e: unknown) {
        setSearchError(e instanceof Error ? e.message : "재료 검색에 실패했습니다.");
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [ingredientSearch, selected]);

  const addIngredient = (ing: IngredientResponse) => {
    setSelected((prev) => [...prev, { id: ing.id, name: ing.name, emoji: ing.emoji, amount: 50 }]);
    setIngredientSearch("");
  };

  const removeIngredient = (id: number) => {
    setSelected((prev) => prev.filter((s) => s.id !== id));
  };

  const updateAmount = (id: number, value: string) => {
    const n = parseFloat(value);
    if (isNaN(n) || n <= 0) return;
    setSelected((prev) => prev.map((s) => (s.id === id ? { ...s, amount: n } : s)));
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError("레시피 제목을 입력해주세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const recipe = await createAdminRecipe(token, {
        title: title.trim(),
        description: description.trim() || undefined,
        source: source.trim() || undefined,
        stage: stage || undefined,
        ingredients: selected.map((s) => ({ ingredient_id: s.id, amount: s.amount })),
      });
      onCreated(recipe);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "레시피 추가에 실패했습니다.");
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card border border-border rounded-3xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-bold">새 레시피 추가</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              레시피 제목 <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 단호박 미음"
              maxLength={100}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">레시피 내용</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="조리 방법, 주의사항 등을 입력하세요 (선택)"
              rows={3}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">출처 URL</label>
            <input
              type="url"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="https://example.com/recipe (선택)"
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">재료 선택</label>
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchRef}
                type="text"
                value={ingredientSearch}
                onChange={(e) => setIngredientSearch(e.target.value)}
                placeholder="재료 이름으로 검색"
                className="w-full pl-8 pr-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            {ingredientSearch.trim() && (
              <div className="border border-border rounded-xl overflow-hidden max-h-40 overflow-y-auto mb-3">
                {searchLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-3">검색 중</p>
                ) : searchError ? (
                  <p className="text-sm text-destructive text-center py-3">{searchError}</p>
                ) : searchResults.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-3">검색 결과가 없습니다.</p>
                ) : (
                  searchResults.slice(0, 20).map((ing) => (
                    <button
                      key={ing.id}
                      onClick={() => addIngredient(ing)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
                    >
                      <span className="w-6 text-center">{ing.emoji ?? "🌿"}</span>
                      <span className="flex-1">{ing.name}</span>
                      {ing.recommended_month && (
                        <span className="text-xs text-muted-foreground">{ing.recommended_month}개월+</span>
                      )}
                      <Plus size={14} className="text-muted-foreground" />
                    </button>
                  ))
                )}
              </div>
            )}

            {selected.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">선택된 재료 {selected.length}개</p>
                {selected.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded-xl">
                    <span className="w-6 text-center text-sm">{s.emoji ?? "🌿"}</span>
                    <span className="flex-1 text-sm font-medium">{s.name}</span>
                    <input
                      type="number"
                      value={s.amount}
                      onChange={(e) => updateAmount(s.id, e.target.value)}
                      min={1}
                      step={1}
                      className="w-16 px-2 py-1 rounded-lg border border-border bg-background text-sm text-right focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    <span className="text-xs text-muted-foreground">g</span>
                    <button
                      onClick={() => removeIngredient(s.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors ml-1"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">이유식 단계</label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { value: "early", label: "초기" },
                  { value: "middle", label: "중기" },
                  { value: "late", label: "후기" },
                  { value: "complete", label: "완료기" },
                  { value: "toddler", label: "유아" },
                  { value: "general", label: "일반" },
                ] as { value: RecipeStage; label: string }[]
              ).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStage(stage === value ? "" : value)}
                  className={`py-2 rounded-xl text-sm border transition-colors ${
                    stage === value
                      ? "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)] text-primary-foreground border-primary/50 shadow-sm"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2.5 rounded-xl text-sm border border-border hover:bg-muted transition-colors disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !title.trim()}
            className="px-4 py-2.5 rounded-3xl text-sm text-primary-foreground font-bold bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#C7E9FF_100%)] hover:bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#B8E2FF_100%)] shadow-sm transition-all duration-300 disabled:opacity-50"
          >
            {submitting ? "추가 중" : "추가하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 식재료 추가 모달 ──────────────────────────────────────

type NutrientLevel = "low" | "medium" | "high";
type NutrientKey = "carb" | "protein" | "fat" | "iron" | "vitamin" | "mineral";
type NutrientsState = Record<NutrientKey, NutrientLevel | null>;

const NUTRIENTS: Array<{ key: NutrientKey; label: string }> = [
  { key: "carb", label: "탄수화물" },
  { key: "protein", label: "단백질" },
  { key: "fat", label: "지방" },
  { key: "iron", label: "철분" },
  { key: "vitamin", label: "비타민" },
  { key: "mineral", label: "칼슘" },
];

const LEVEL_LABELS: Record<NutrientLevel, string> = { low: "하", medium: "중", high: "상" };

interface NewIngredientModalProps {
  token: string;
  onClose: () => void;
  onCreated: (ingredient: AdminIngredientDataOut) => void;
}

function NewIngredientModal({ token, onClose, onCreated }: NewIngredientModalProps) {
  useBodyScrollLock();
  const [name, setName] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [recommendedMonth, setRecommendedMonth] = useState("");
  const [nutrients, setNutrients] = useState<NutrientsState>({
    carb: null,
    protein: null,
    fat: null,
    iron: null,
    vitamin: null,
    mineral: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const toggleNutrient = (key: NutrientKey, level: NutrientLevel) => {
    setNutrients((prev) => ({ ...prev, [key]: prev[key] === level ? null : level }));
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("식재료 이름을 입력해주세요.");
      return;
    }
    const month = recommendedMonth ? parseInt(recommendedMonth, 10) : undefined;
    if (month !== undefined && (month < 4 || month > 36)) {
      setError("권장 개월 수는 4~36 사이여야 합니다.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let imageUrl: string | undefined;
      if (imageFile) {
        imageUrl = await uploadIngredientImage(token, imageFile);
      }
      const ingredient = await createAdminIngredient(token, {
        name: name.trim(),
        image_url: imageUrl,
        recommended_month: month,
        nutrient_carb: nutrients.carb ?? undefined,
        nutrient_protein: nutrients.protein ?? undefined,
        nutrient_fat: nutrients.fat ?? undefined,
        nutrient_iron: nutrients.iron ?? undefined,
        nutrient_vitamin: nutrients.vitamin ?? undefined,
        nutrient_mineral: nutrients.mineral ?? undefined,
      });
      onCreated(ingredient);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "식재료 추가에 실패했습니다.");
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card border border-border rounded-3xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-bold">새 식재료 추가</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              식재료 이름 <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 단호박"
              maxLength={50}
              autoFocus
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">이미지 (선택)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageChange}
              className="hidden"
            />
            {imagePreview ? (
              <div className="flex items-center gap-3">
                <img
                  src={imagePreview}
                  alt="미리보기"
                  className="w-16 h-16 object-cover rounded-xl border border-border"
                />
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-sm text-primary-foreground hover:underline"
                  >
                    이미지 변경
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="text-sm text-muted-foreground hover:text-destructive"
                  >
                    제거
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:bg-muted transition-colors w-full justify-center"
              >
                <Plus size={14} />
                이미지 파일 선택 (jpg · png · webp, 5MB 이하)
              </button>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">권장 시작 개월 수 (선택)</label>
            <input
              type="number"
              value={recommendedMonth}
              onChange={(e) => setRecommendedMonth(e.target.value)}
              placeholder="예: 6"
              min={4}
              max={36}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <p className="text-xs text-muted-foreground mt-1">4~36개월 사이로 입력하세요.</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-3">영양소 (선택)</label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {NUTRIENTS.map(({ key, label }) => (
                <div key={key} className="space-y-1.5">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="flex gap-1">
                    {(["low", "medium", "high"] as NutrientLevel[]).map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => toggleNutrient(key, level)}
                        className={`flex-1 py-1.5 text-xs rounded-lg transition-colors ${
                          nutrients[key] === level
                            ? "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)] text-primary-foreground border border-primary/50 shadow-sm font-medium"
                            : "border border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {LEVEL_LABELS[level]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2.5 rounded-xl text-sm border border-border hover:bg-muted transition-colors disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !name.trim()}
            className="px-4 py-2.5 rounded-3xl text-sm text-primary-foreground font-bold bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#C7E9FF_100%)] hover:bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#B8E2FF_100%)] shadow-sm transition-all duration-300 disabled:opacity-50"
          >
            {submitting ? "추가 중" : "추가하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────

type TabId = "recipes" | "ingredients";

export default function AdminContent() {
  const { user, token, authLoading } = useApp();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>("recipes");
  const [showNewRecipeModal, setShowNewRecipeModal] = useState(false);
  const [showNewIngredientModal, setShowNewIngredientModal] = useState(false);

  const [stats, setStats] = useState<AdminDataStatsOut | null>(null);
  const [recipes, setRecipes] = useState<AdminRecipeDataOut[]>([]);
  const [ingredients, setIngredients] = useState<AdminIngredientDataOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const PAGE_SIZE = 20;

  const [recipeSearch, setRecipeSearch] = useState("");
  const [recipeTotal, setRecipeTotal] = useState(0);
  const [recipeSkip, setRecipeSkip] = useState(0);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const recipeSearchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [ingredientSearch, setIngredientSearch] = useState("");
  const [ingredientTotal, setIngredientTotal] = useState(0);
  const [ingredientSkip, setIngredientSkip] = useState(0);
  const [isIngredientDeleteMode, setIsIngredientDeleteMode] = useState(false);
  const [selectedIngredientIds, setSelectedIngredientIds] = useState<Set<number>>(new Set());
  const [deletingIngredients, setDeletingIngredients] = useState(false);
  const ingredientSearchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!authLoading && !user?.isAdmin) {
      navigate("/login");
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!token) return;
    getAdminDataStats(token).then(setStats).catch(() => null);
  }, [token]);

  const fetchTabData = useCallback(
    async (search?: string, skip?: number) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        if (activeTab === "recipes") {
          const res = await getAdminRecipeData(token, { limit: PAGE_SIZE, skip: skip ?? 0, search: search || undefined });
          setRecipes(res.recipes);
          setRecipeTotal(res.total);
        } else {
          const res = await getAdminIngredientData(token, { limit: PAGE_SIZE, skip: skip ?? 0, search: search || undefined });
          setIngredients(res.ingredients);
          setIngredientTotal(res.total);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "데이터를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    },
    [token, activeTab],
  );

  useEffect(() => {
    if (authLoading || !token) return;
    fetchTabData();
  }, [authLoading, token, fetchTabData]);

  const handleRecipeCreated = (recipe: AdminRecipeDataOut) => {
    setShowNewRecipeModal(false);
    setRecipes((prev) => [recipe, ...prev]);
    setStats((prev) => (prev ? { ...prev, total_recipes: prev.total_recipes + 1 } : prev));
  };

  const handleIngredientCreated = (ingredient: AdminIngredientDataOut) => {
    setShowNewIngredientModal(false);
    setIngredients((prev) => [ingredient, ...prev]);
    setStats((prev) => (prev ? { ...prev, total_ingredients: prev.total_ingredients + 1 } : prev));
  };

  const handleRecipeSearch = (value: string) => {
    setRecipeSearch(value);
    setRecipeSkip(0);
    if (recipeSearchDebounce.current) clearTimeout(recipeSearchDebounce.current);
    recipeSearchDebounce.current = setTimeout(() => fetchTabData(value || undefined, 0), 300);
  };

  const handleIngredientSearch = (value: string) => {
    setIngredientSearch(value);
    setIngredientSkip(0);
    if (ingredientSearchDebounce.current) clearTimeout(ingredientSearchDebounce.current);
    ingredientSearchDebounce.current = setTimeout(() => fetchTabData(value || undefined, 0), 300);
  };

  const handleRecipePage = (newSkip: number) => {
    setRecipeSkip(newSkip);
    fetchTabData(recipeSearch || undefined, newSkip);
  };

  const handleIngredientPage = (newSkip: number) => {
    setIngredientSkip(newSkip);
    fetchTabData(ingredientSearch || undefined, newSkip);
  };

  const handleDeleteModeToggle = () => {
    if (isDeleteMode) {
      setIsDeleteMode(false);
      setSelectedIds(new Set());
    } else {
      setIsDeleteMode(true);
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (!token || selectedIds.size === 0) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteAdminRecipes(token, Array.from(selectedIds));
      const deletedCount = selectedIds.size;
      setRecipes((prev) => prev.filter((r) => !selectedIds.has(r.id.toString())));
      setRecipeTotal((prev) => Math.max(0, prev - deletedCount));
      setStats((prev) =>
        prev ? { ...prev, total_recipes: Math.max(0, prev.total_recipes - deletedCount) } : prev,
      );
      setSelectedIds(new Set());
      setIsDeleteMode(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  const handleIngredientDeleteModeToggle = () => {
    if (isIngredientDeleteMode) {
      setIsIngredientDeleteMode(false);
      setSelectedIngredientIds(new Set());
    } else {
      setIsIngredientDeleteMode(true);
    }
  };

  const handleToggleIngredientSelect = (id: number) => {
    setSelectedIngredientIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteIngredientsSelected = async () => {
    if (!token || selectedIngredientIds.size === 0) return;
    setDeletingIngredients(true);
    setError(null);
    try {
      await deleteAdminIngredients(token, Array.from(selectedIngredientIds));
      const deletedCount = selectedIngredientIds.size;
      setIngredients((prev) => prev.filter((ing) => !selectedIngredientIds.has(ing.id)));
      setIngredientTotal((prev) => Math.max(0, prev - deletedCount));
      setStats((prev) =>
        prev ? { ...prev, total_ingredients: Math.max(0, prev.total_ingredients - deletedCount) } : prev,
      );
      setSelectedIngredientIds(new Set());
      setIsIngredientDeleteMode(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setDeletingIngredients(false);
    }
  };

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setIsDeleteMode(false);
    setSelectedIds(new Set());
    setRecipeSearch("");
    setRecipeSkip(0);
    setIsIngredientDeleteMode(false);
    setSelectedIngredientIds(new Set());
    setIngredientSearch("");
    setIngredientSkip(0);
  };

  const tabs = [
    { id: "recipes" as const, label: "레시피 관리" },
    { id: "ingredients" as const, label: "재료 관리" },
  ];

  const currentStats =
    activeTab === "recipes"
      ? stats ? [{ label: "전체 레시피 수", value: `${stats.total_recipes}개` }] : null
      : stats ? [{ label: "전체 식재료 수", value: `${stats.total_ingredients}개` }] : null;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("ko-KR");
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
      <div className="mb-5">
        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2" 
        style={{ fontFamily: "'Paperlogic'", fontWeight: 600 }}><Package size={24} />콘텐츠 관리</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`flex items-center gap-2.5 px-3 py-1 rounded-full font-medium text-base whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? "bg-[#FEF5CC] hover:opacity-70 font-semibold transition-colors"
                : "bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {currentStats
          ? currentStats.map((stat, i) => (
              <div key={i} className="bg-card border border-border rounded-2xl p-5">
                <div className="text-sm text-muted-foreground mb-2">{stat.label}</div>
                <div className="text-2xl font-bold">{stat.value}</div>
              </div>
            ))
          : [0].map((i) => (
              <div key={i} className="bg-card border border-border rounded-2xl p-5 animate-pulse">
                <div className="h-4 bg-muted rounded w-3/4 mb-3" />
                <div className="h-7 bg-muted rounded w-1/2" />
              </div>
            ))}
      </div>

      {/* Content Area */}
      <div className="bg-card border border-border rounded-2xl p-6">
        {error && <div className="text-sm text-destructive mb-4">{error}</div>}

        {/* 레시피 관리 */}
        {activeTab === "recipes" && (
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <h3 className="text-lg font-bold shrink-0">레시피 관리</h3>

              <div className="relative flex-1 min-w-[160px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={recipeSearch}
                  onChange={(e) => handleRecipeSearch(e.target.value)}
                  placeholder="레시피 검색"
                  className="w-full pl-8 pr-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {isDeleteMode ? (
                <>
                  <button
                    onClick={handleDeleteModeToggle}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm hover:bg-muted transition-colors"
                  >
                    <X size={14} />
                    취소
                  </button>
                  <button
                    onClick={handleDeleteSelected}
                    disabled={selectedIds.size === 0 || deleting}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-destructive text-destructive-foreground text-sm hover:bg-destructive/90 transition-colors disabled:opacity-40"
                  >
                    <Trash2 size={14} />
                    {deleting ? "삭제 중" : `삭제 (${selectedIds.size})`}
                  </button>
                </>
              ) : (
                <button
                  onClick={handleDeleteModeToggle}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <Trash2 size={14} />
                  삭제
                </button>
              )}

              {!isDeleteMode && (
                <button
                  onClick={() => setShowNewRecipeModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)] text-primary-foreground border border-primary/50 shadow-sm transition-colors text-sm"
                >
                  <Upload size={14} />
                  새 레시피 추가
                </button>
              )}
            </div>

            {isDeleteMode && (
              <p className="text-xs text-muted-foreground mb-3">삭제할 레시피를 선택한 후 삭제 버튼을 누르세요.</p>
            )}

            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 bg-muted/30 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : recipes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {recipeSearch ? "검색 결과가 없습니다." : "등록된 레시피가 없습니다."}
              </p>
            ) : (
              <div className="space-y-3">
                {recipes.map((item) => {
                  const idStr = item.id.toString();
                  const isChecked = selectedIds.has(idStr);
                  return (
                    <div
                      key={item.id}
                      onClick={() => isDeleteMode && handleToggleSelect(idStr)}
                      className={`flex items-center gap-3 p-4 rounded-xl transition-colors ${
                        isDeleteMode
                          ? isChecked
                            ? "bg-destructive/10 border border-destructive/30 cursor-pointer"
                            : "bg-muted/30 cursor-pointer hover:bg-muted/50"
                          : "bg-muted/30"
                      }`}
                    >
                      {isDeleteMode && (
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelect(idStr)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 accent-destructive shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{item.title}</div>
                        {item.description && (
                          <div className="text-sm text-muted-foreground line-clamp-1">{item.description}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground ml-2 shrink-0">
                        <span>재료 {item.ingredient_count}개</span>
                        <span>{formatDate(item.created_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 레시피 페이지네이션 */}
            {recipeTotal > PAGE_SIZE && (
              <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                <span>총 {recipeTotal.toLocaleString()}개</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleRecipePage(recipeSkip - PAGE_SIZE)}
                    disabled={recipeSkip === 0}
                    className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors text-xs"
                  >
                    이전
                  </button>
                  <span className="px-3 py-1.5 text-xs">
                    {Math.floor(recipeSkip / PAGE_SIZE) + 1} / {Math.ceil(recipeTotal / PAGE_SIZE)}
                  </span>
                  <button
                    onClick={() => handleRecipePage(recipeSkip + PAGE_SIZE)}
                    disabled={recipeSkip + PAGE_SIZE >= recipeTotal}
                    className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors text-xs"
                  >
                    다음
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 재료 관리 */}
        {activeTab === "ingredients" && (
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <h3 className="text-lg font-bold shrink-0">재료 관리</h3>

              <div className="relative flex-1 min-w-[160px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={ingredientSearch}
                  onChange={(e) => handleIngredientSearch(e.target.value)}
                  placeholder="식재료 검색"
                  className="w-full pl-8 pr-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {isIngredientDeleteMode ? (
                <>
                  <button
                    onClick={handleIngredientDeleteModeToggle}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm hover:bg-muted transition-colors"
                  >
                    <X size={14} />
                    취소
                  </button>
                  <button
                    onClick={handleDeleteIngredientsSelected}
                    disabled={selectedIngredientIds.size === 0 || deletingIngredients}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-destructive text-destructive-foreground text-sm hover:bg-destructive/90 transition-colors disabled:opacity-40"
                  >
                    <Trash2 size={14} />
                    {deletingIngredients ? "삭제 중" : `삭제 (${selectedIngredientIds.size})`}
                  </button>
                </>
              ) : (
                <button
                  onClick={handleIngredientDeleteModeToggle}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <Trash2 size={14} />
                  삭제
                </button>
              )}

              {!isIngredientDeleteMode && (
                <button
                  onClick={() => setShowNewIngredientModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)] text-primary-foreground border border-primary/50 shadow-sm transition-colors text-sm"
                >
                  <Plus size={14} />
                  새 식재료 추가
                </button>
              )}
            </div>

            {isIngredientDeleteMode && (
              <p className="text-xs text-muted-foreground mb-3">
                삭제할 식재료를 선택한 후 삭제 버튼을 누르세요.
              </p>
            )}

            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 bg-muted/30 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : ingredients.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {ingredientSearch ? "검색 결과가 없습니다." : "등록된 식재료가 없습니다."}
              </p>
            ) : (
              <div className="space-y-2">
                {ingredients.map((item) => {
                  const isChecked = selectedIngredientIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      onClick={() => isIngredientDeleteMode && handleToggleIngredientSelect(item.id)}
                      className={`flex items-center gap-3 p-3.5 rounded-xl transition-colors ${
                        isIngredientDeleteMode
                          ? isChecked
                            ? "bg-destructive/10 border border-destructive/30 cursor-pointer"
                            : "bg-muted/30 cursor-pointer hover:bg-muted/50"
                          : "bg-muted/30"
                      }`}
                    >
                      {isIngredientDeleteMode && (
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleIngredientSelect(item.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 accent-destructive shrink-0"
                        />
                      )}
                      {item.emoji?.startsWith("http") ? (
                        <img
                          src={item.emoji}
                          alt={item.name}
                          className="w-7 h-7 object-cover rounded shrink-0"
                        />
                      ) : (
                        <span className="w-7 text-center text-lg shrink-0">{item.emoji ?? "🌿"}</span>
                      )}
                      <span className="flex-1 font-medium">{item.name}</span>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground shrink-0">
                        {item.recommended_month ? (
                          <span>{item.recommended_month}개월+</span>
                        ) : (
                          <span className="opacity-40">-</span>
                        )}
                        <span>{formatDate(item.created_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 식재료 페이지네이션 */}
            {ingredientTotal > PAGE_SIZE && (
              <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                <span>총 {ingredientTotal.toLocaleString()}개</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleIngredientPage(ingredientSkip - PAGE_SIZE)}
                    disabled={ingredientSkip === 0}
                    className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors text-xs"
                  >
                    이전
                  </button>
                  <span className="px-3 py-1.5 text-xs">
                    {Math.floor(ingredientSkip / PAGE_SIZE) + 1} / {Math.ceil(ingredientTotal / PAGE_SIZE)}
                  </span>
                  <button
                    onClick={() => handleIngredientPage(ingredientSkip + PAGE_SIZE)}
                    disabled={ingredientSkip + PAGE_SIZE >= ingredientTotal}
                    className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors text-xs"
                  >
                    다음
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showNewRecipeModal && token && (
        <NewRecipeModal
          token={token}
          onClose={() => setShowNewRecipeModal(false)}
          onCreated={handleRecipeCreated}
        />
      )}

      {showNewIngredientModal && token && (
        <NewIngredientModal
          token={token}
          onClose={() => setShowNewIngredientModal(false)}
          onCreated={handleIngredientCreated}
        />
      )}
    </div>
  );
}
