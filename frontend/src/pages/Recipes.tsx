import { useRef, useState, useEffect } from "react";
import { Search, Heart, ChevronUp, NotepadText, ChevronLeft, ChevronRight } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useLocation } from "react-router";
import { useApp } from "../context/AppContext";
import { IngredientIcon } from "../components/IngredientIcon";
import { RecipeScheduleModal } from "../components/RecipeScheduleModal";
import { dedupeRequest, readSessionCache, writeSessionCache } from "../utils/sessionCache";
import { getApiBase } from "../api/base";

const BASE = `${getApiBase()}/api`;

const stages = ["전체", "초기", "중기", "후기", "완료기"];
const stageMap: Record<string, string> = {
  "초기": "초기 (5~6개월)",
  "중기": "중기 (7~8개월)",
  "후기": "후기 (9~11개월)",
  "완료기": "완료기 (12~18개월)",
};

interface Recipe {
  id: string;
  name: string;
  category: string;
  ingredients: { name: string; amount: string; emoji: string | null }[];
  emoji: string | null;
  desc: string;
}

// ── API 응답 타입 (FastAPI RecipeDetail와 동일) ──
interface ApiRecipe {
  id: string;
  title: string;
  description: string | null;
  stage: "early" | "middle" | "late" | "complete" | "toddler" | "general" | null;
  ingredients: {
    amount: number; // 단위: g
    ingredient: {
      name: string;
      emoji: string | null;
      recommended_month: number | null;
    };
  }[];
}

const CARD_COLORS = [
  "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFFAE3_100%)]",
  "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFEEE8_100%)]",
  "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#E3FFF1_100%)]", 
  "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#EBF7FF_100%)]",
];

const RECIPES_CACHE_KEY = "mammacare:recipes:all";
const RECIPES_CACHE_TTL_MS = 10 * 60 * 1000;

function stageToCategory(stage: ApiRecipe["stage"], ingredients: ApiRecipe["ingredients"]): string {
  switch (stage) {
    case "early": return "초기 (5~6개월)";
    case "middle": return "중기 (7~8개월)";
    case "late": return "후기 (9~11개월)";
    case "complete": return "완료기 (12~18개월)";
    default: {
      // stage 없는 경우 기존 재료 기반 로직으로 fallback
      const maxMonth = Math.max(0, ...ingredients.map((ri) => ri.ingredient.recommended_month ?? 0));
      if (maxMonth <= 6) return "초기 (5~6개월)";
      if (maxMonth <= 8) return "중기 (7~8개월)";
      if (maxMonth <= 11) return "후기 (9~11개월)";
      return "완료기 (12~18개월)";
    }
  }
}

function mapRecipe(api: ApiRecipe): Recipe {
  const leadingEmoji =
    api.ingredients
      .filter((ri) => api.title.includes(ri.ingredient.name))
      .sort((a, b) => api.title.indexOf(a.ingredient.name) - api.title.indexOf(b.ingredient.name))[0]
      ?.ingredient.emoji ?? api.ingredients[0]?.ingredient.emoji ?? null;

  return {
    id: api.id,
    name: api.title,
    desc: api.description ?? "",
    category: stageToCategory(api.stage, api.ingredients),
    emoji: leadingEmoji,
    ingredients: api.ingredients.map((ri) => ({
      name: ri.ingredient.name,
      emoji: ri.ingredient.emoji,   // ?? 
      amount: Number.isInteger(ri.amount) ? `${ri.amount}g` : `${ri.amount.toFixed(1)}g`,
    })),
  };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Recipes() {
  const isApp = Capacitor.isNativePlatform();
  const { confirmedAllergyNames } = useApp();
  const location = useLocation();
  const [activeStage, setActiveStage] = useState("전체");
  const [search, setSearch] = useState("");
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [excludeAllergies, setExcludeAllergies] = useState(false);
  const [filterStages, setFilterStages] = useState<string[]>([]);
  const [likedIds, setLikedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("mammacare:liked_recipe_ids");
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const cachedRecipes = readSessionCache<Recipe[]>(RECIPES_CACHE_KEY);
  const [recipes, setRecipes] = useState<Recipe[]>(cachedRecipes ?? []);
  const [loading, setLoading] = useState(cachedRecipes === null);

  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 12;
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showFilterPanel) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowFilterPanel(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showFilterPanel]);

  useEffect(() => {
    let cancelled = false;
    const cached = readSessionCache<Recipe[]>(RECIPES_CACHE_KEY);
    if (cached) {
      setRecipes(cached);
      setLoading(false);
    }
    dedupeRequest(RECIPES_CACHE_KEY, async () => {
      const res = await fetch(`${BASE}/recipes`);
      if (!res.ok) throw new Error("서버 응답 오류");
      const data = (await res.json()) as ApiRecipe[];
      return data.map(mapRecipe);
    })
      .then((nextRecipes) => {
        if (cancelled) return;
        setRecipes(nextRecipes);
        writeSessionCache(RECIPES_CACHE_KEY, nextRecipes, RECIPES_CACHE_TTL_MS);
      })
      .catch(() => {
        if (!cancelled && !cached) setRecipes([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const allergies = confirmedAllergyNames;

  useEffect(() => {
    const searchQuery = (location.state as { search?: string } | null)?.search;
    if (searchQuery && recipes.length > 0) {
      setSearch(searchQuery);
    }
  }, [location.state, recipes]);

  const getStageOrder = (category: string): number => {
    if (category.includes("초기")) return 1;
    if (category.includes("중기")) return 2;
    if (category.includes("후기")) return 3;
    if (category.includes("완료기")) return 4;
    return 5;
  };

  const filtered = recipes.filter((r) => {
    if (showFavorites && !likedIds.includes(r.id)) return false;

    const stageName = activeStage === "전체" ? null : stageMap[activeStage];
    const matchStage = !stageName || r.category === stageName;

    const noSpace = (s: string) => s.toLowerCase().replace(/\s+/g, "");
    const searchTerms = search.split(",").map((t) => noSpace(t)).filter(Boolean);
    const matchSearch =
      searchTerms.length === 0 ||
      (searchTerms.length === 1
        ? noSpace(r.name).includes(searchTerms[0]) ||
          r.ingredients.some((i) => noSpace(i.name).includes(searchTerms[0]))
        : searchTerms.every((term) =>
            noSpace(r.name).includes(term) ||
            r.ingredients.some((i) => noSpace(i.name).includes(term))
          ));

    const hasAllergyIng = excludeAllergies && r.ingredients.some((ing) => allergies.includes(ing.name));
    if (hasAllergyIng) return false;

    const matchFilterStages =
      filterStages.length === 0 ||
      filterStages.some((stage) => r.category === stageMap[stage]);

    return matchStage && matchSearch && matchFilterStages;
  }).sort((a, b) => {
    const orderA = getStageOrder(a.category);
    const orderB = getStageOrder(b.category);
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const resetPage = () => setPage(1);

  const toggleLike = (id: string) => {
    setLikedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { localStorage.setItem("mammacare:liked_recipe_ids", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const toggleFilterStage = (stage: string) => {
    setFilterStages((prev) =>
      prev.includes(stage) ? prev.filter((s) => s !== stage) : [...prev, stage]
    );
  };

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
            <NotepadText className="w-4 h-4" /> 레시피 관리
          </h1>
        </div>
      ) : (
        <div className="mb-6">
          <h1
            className="text-2xl font-bold flex items-center gap-2"
            style={{ fontFamily: "'Paperlogic'", fontWeight: 600 }}>
            <NotepadText className="w-5 h-5 sm:w-6 sm:h-6" /> 레시피 관리
          </h1>
          <p className="text-base text-muted-foreground mt-1">개월별 맞춤 이유식 레시피를 찾아보세요</p>
        </div>
      )}

      <div className="relative mb-4" ref={searchRef}>
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground z-10" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setShowFilterPanel(true)}
          placeholder="레시피나 재료를 검색하세요"
          className={`w-full pl-9 pr-4 rounded-3xl border border-border bg-card focus:outline-none focus:ring-2 focus:ring-[#FFF5D4] ${isApp ? "py-2 text-sm" : "py-2.5 text-base"}`}
        />

        {showFilterPanel && (
          <div className="absolute top-full mt-2 w-full bg-card border border-border rounded-2xl shadow-lg p-4 z-20">
            <div className="flex items-center justify-between mb-3">
              <span className="text-base font-bold">검색 필터</span>
              <button onClick={() => setShowFilterPanel(false)} className="p-1 rounded-full hover:bg-muted">
                <ChevronUp size={16} className="text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={excludeAllergies}
                  onChange={(e) => setExcludeAllergies(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-base">알레르기 반응 재료 제외</span>
              </label>

              <div>
                <div className="text-base font-semibold mb-2">이유식 단계</div>
                <div className="flex flex-wrap gap-2">
                  {["초기", "중기", "후기", "완료기"].map((stage) => (
                    <button
                      key={stage}
                      onClick={() => toggleFilterStage(stage)}
                      className={`px-3 py-1.5 rounded-full text-base font-semibold border transition-all ${
                        filterStages.includes(stage)
                          ? "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)] text-primary-foreground border-primary/50"
                          : "border-border hover:bg-primary/20"
                      }`}
                    >
                      {stage}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <div
  className={`${
    isApp
      ? "flex flex-col gap-3 mb-5"
      : "flex flex-wrap items-center justify-between gap-2 mb-6"
  }`}
>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {stages.map((stage) => (
            <button
              key={stage}
              onClick={() => {
                setActiveStage(stage);
                setShowFavorites(false);
                resetPage();
                if (stage === "전체") setSearch("");
              }}
              className={`whitespace-nowrap ${isApp ? "px-3.5 text-sm" : "px-4 text-base"} py-1.5 rounded-full font-semibold transition-all border ${
                activeStage === stage && !showFavorites
                  ? "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)] text-primary-foreground border-primary/50 shadow-sm"
                  : "border-border hover:bg-primary/30 text-muted-foreground"
              }`}
            >
              {stage}
            </button>
          ))}
        </div>

          <button
            onClick={() => { setShowFavorites(!showFavorites); if (!showFavorites) setActiveStage("전체"); resetPage(); }}
            className={`whitespace-nowrap ${isApp ? "px-3.5 text-sm" : "px-4 text-base"} py-1.5 rounded-full font-semibold transition-all border flex items-center gap-1.5 ${
              showFavorites
                ? "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFE8F4_50%,#FFCFE7_100%)] text-primary-foreground border-[#FFCFE7]/50 shadow-sm"
                : "border-[#FFCFE7]/50 hover:bg-[#FFCFE7]/30 text-muted-foreground"
            }`}
          >
            <Heart size={16} className={showFavorites ? "fill-current" : ""} />
            레시피 즐겨찾기
          </button>
      </div>

      {loading && recipes.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <div className="text-4xl mb-3">🍽️</div>
          <p className="text-xl">레시피를 불러오는 중...</p>
        </div>
      )}

      <div className={isApp ? "grid grid-cols-1 gap-3" : "grid sm:grid-cols-2 lg:grid-cols-3 gap-4"}>
        {paginated.map((recipe, index) => {
          const hasAllergyIng = recipe.ingredients.some((ing) => allergies.includes(ing.name));
          return (
            <div
              key={recipe.id}
              className={`${CARD_COLORS[index % CARD_COLORS.length]} rounded-3xl p-5 hover:shadow-lg transition-all relative cursor-pointer flex flex-col border-2 ${
                hasAllergyIng ? "border-red-400/40" : "border-[#FFCFE7]/50"
              }`}
              onClick={() => setSelectedRecipe(recipe)}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-1">
                  <div className="text-3xl">
                    <IngredientIcon
                      emoji={recipe.emoji}
                      name={recipe.ingredients[0]?.name ?? ""}
                      className="w-6 h-6 sm:w-[30px] sm:h-[30px]"
                    />
                  </div>
                  <div className="px-2 py-0.5 bg-white/60 rounded-full text-sm font-medium text-muted-foreground">
                    {recipe.category}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLike(recipe.id);
                  }}
                  className="p-1 rounded-full hover:bg-[#FFCFE7]/20 transition-colors"
                >
                  <Heart
                    size={18}
                    className={likedIds.includes(recipe.id) ? "fill-[#FFCFE7] text-[#FAB6D9]" : "text-muted-foreground"}
                  />
                </button>
              </div>

              <div className="mb-2">
                <h3 className="font-bold text-base">{recipe.name}</h3>
                <p className={`${isApp ? "text-sm" : "text-base"} text-muted-foreground mt-1 leading-relaxed line-clamp-2`}>{recipe.desc}</p>
              </div>

              <div className="mt-auto pt-3 border-t border-white/40">
                <div className="text-base font-semibold mb-1.5">재료</div>
                <div className="flex flex-wrap gap-1.5">
                  {recipe.ingredients.slice(0, 4).map((ing, i) => (
                    <span
                      key={i}
                      className={`px-2 py-0.5 rounded-full text-base font-semibold text-[#575550] flex items-center gap-1 ${
                        allergies.includes(ing.name)
                          ? "bg-red-500/10 text-[#AB2B2B] dark:text-red-300"
                          : "bg-white/60"
                      }`}
                    >
                      <IngredientIcon emoji={ing.emoji} name={ing.name} size={16} />
                      <span>{ing.name}</span>
                    </span>
                  ))}
                  {recipe.ingredients.length > 4 && (
                    <span className="px-2 py-0.5 bg-white/60 rounded-full text-sm">
                      +{recipe.ingredients.length - 4}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (() => {
        const GROUP = 5;
        const groupIndex = Math.ceil(page / GROUP);
        const groupStart = (groupIndex - 1) * GROUP + 1;
        const groupEnd = Math.min(groupIndex * GROUP, totalPages);
        const hasPrev = groupStart > 1;
        const hasNext = groupEnd < totalPages;
        return (
          <div className="flex items-center justify-center gap-1 mt-6">
            <button
              onClick={() => setPage(groupStart - 1)}
              disabled={!hasPrev}
              className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: groupEnd - groupStart + 1 }, (_, i) => groupStart + i).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-8 h-8 rounded-full text-sm font-semibold transition-all ${
                  p === page
                    ? "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)] text-primary-foreground"
                    : "text-muted-foreground hover:bg-primary/20"
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage(groupEnd + 1)}
              disabled={!hasNext}
              className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        );
      })()}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-xl">검색 결과가 없어요 T.T</p>
        </div>
      )}

      {selectedRecipe && (
        <RecipeScheduleModal
          recipe={{ recipe_id: selectedRecipe.id, title: selectedRecipe.name }}
          onClose={() => setSelectedRecipe(null)}
          showScheduleAddButton
          onAdded={() => setSelectedRecipe(null)}
        />
      )}
    </div>
  );
}
