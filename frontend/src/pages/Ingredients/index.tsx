import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { Bell, Search, Sparkles, AlertTriangle, RefreshCw } from "lucide-react";

import { useApp } from "../../context/AppContext";
import {
  listTestings,
  listConfirmedAllergies,
  createTesting,
  type IngredientTestingResponse,
  type ConfirmedAllergyResponse,
} from "../../api/allergy";
import { listIngredients, type IngredientResponse } from "../../api/ingredients";
import { getRecommendations } from "../../api/recommendations";
import { ApiError } from "../../api/client";
import {
  deriveIngredientStatuses,
  dedupeByIngredientLatest,
  type IngredientStatusRecord,
} from "../../utils/allergyStatus";
import { statusFromTestStatus, type ChipStatus } from "../../components/ui/status-chip";
import { Card } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { IngredientIcon } from "../../components/IngredientIcon";
import { AuthImage } from "../../components/AuthImage";
import { ReactionRetestConfirm } from "../../components/ReactionRetestConfirm";
import { IngredientCard } from "./IngredientCard";
import {
  StatusFilterPills,
  type IngredientFilterKey,
  type FilterPill,
} from "./StatusFilterPills";

// Per-ingredient chip precedence: a confirmed allergen or any reaction is the most severe
// state → "반응" (reaction, red), matching the Dashboard and Allergy screens so red always
// means reaction everywhere. The 주의 filter pill still groups these (bucketForChip folds the
// reaction chip into the caution/주의 bucket) — only the chip COLOR is decoupled from the
// filter bucket. Everything else maps through statusFromTestStatus (safe/reaction/testing);
// ingredients with no testing row get "미시작" (not-started) from chipFor's fallback.
function chipForRecord(record: IngredientStatusRecord): ChipStatus {
  if (record.isConfirmedAllergen || record.hasReaction) return "reaction";
  return statusFromTestStatus(record.testStatus ?? "testing", record.hasReaction);
}

// Filter bucket for a chip. "주의" folds caution + reaction (there is no separate
// 반응 pill), so the count matches the Dashboard traffic-light reaction tally.
function bucketForChip(chip: ChipStatus): IngredientFilterKey {
  if (chip === "safe") return "safe";
  if (chip === "testing") return "testing";
  if (chip === "caution" || chip === "reaction") return "caution";
  return "not-started";
}

function compareIngredient(a: IngredientResponse, b: IngredientResponse): number {
  const ma = a.recommended_month ?? Number.MAX_SAFE_INTEGER;
  const mb = b.recommended_month ?? Number.MAX_SAFE_INTEGER;
  if (ma !== mb) return ma - mb;
  return a.name.localeCompare(b.name, "ko");
}

// warm-kr screen shell: page bg + header (baby avatar · title · 알림). Module scope so
// the tree isn't remounted on every page re-render (same reasoning as Observe).
function IngredientsShell({
  babyPhoto,
  children,
}: {
  babyPhoto: string | null;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="min-h-full bg-warm-bg px-4 py-5">
      <div className="mx-auto flex max-w-md flex-col gap-5 pb-10">
        <header className="flex items-center gap-3 px-1">
          {babyPhoto ? (
            <AuthImage
              src={babyPhoto}
              alt=""
              className="size-10 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="size-10 shrink-0 rounded-full bg-warm-surface-soft" aria-hidden="true" />
          )}
          <h1 className="flex-1 text-xl font-bold text-warm-brand">식재료 도감</h1>
          <button
            onClick={() => navigate("/notifications")}
            aria-label="알림"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-warm-surface-soft text-warm-brand hover:bg-warm-surface-soft/70"
          >
            <Bell className="size-5" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

function ScreenError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <AlertTriangle className="size-6 text-reaction-fg" />
      <p className="text-sm font-semibold text-warm-fg">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 inline-flex items-center gap-1 rounded-full bg-warm-surface-soft px-3 py-1.5 text-xs font-bold text-warm-brand hover:bg-warm-surface-soft/70"
        >
          <RefreshCw className="size-3.5" />
          다시 시도
        </button>
      )}
    </div>
  );
}

const FILTER_LABELS: { key: IngredientFilterKey; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "safe", label: "안심" },
  { key: "testing", label: "테스트중" },
  { key: "caution", label: "주의" },
  { key: "not-started", label: "미테스트" },
];

export default function Ingredients() {
  const { token, activeBaby, authLoading } = useApp();
  const navigate = useNavigate();

  const [ingredients, setIngredients] = useState<IngredientResponse[]>([]);
  const [testings, setTestings] = useState<IngredientTestingResponse[]>([]);
  const [confirmed, setConfirmed] = useState<ConfirmedAllergyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recHero, setRecHero] = useState<IngredientResponse | null>(null);

  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<IngredientFilterKey>("all");

  const [startingId, setStartingId] = useState<number | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [pendingConsent, setPendingConsent] = useState<IngredientResponse | null>(null);

  // Single load: ingredient master + testing rows + confirmed allergens together, so the
  // derived statuses are consistent. The master list is the critical fetch — any failure
  // shows the error screen and keeps the last-good data.
  const loadAll = useCallback(async () => {
    if (!token || !activeBaby) return;
    setLoading(true);
    setError(null);
    // Reset per-baby state before refetching. loadAll re-runs on activeBaby change; without
    // this, a failed refetch after switching babies keeps loaded=true and renders the PREVIOUS
    // baby's allergy chips (the error screen is gated on !loaded). Clear so a failure shows the
    // error screen, never another baby's data.
    setLoaded(false);
    setIngredients([]);
    setTestings([]);
    setConfirmed([]);
    setRecHero(null);
    try {
      const [ings, tests, confs] = await Promise.all([
        listIngredients(),
        listTestings(activeBaby.id, token),
        listConfirmedAllergies(activeBaby.id, token),
      ]);
      setIngredients(ings);
      setTestings(tests);
      setConfirmed(confs);
      setLoaded(true);
    } catch {
      setError("재료 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, [token, activeBaby]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Hero recommendation — best-effort, loads after the core data succeeds.
  useEffect(() => {
    if (!loaded || !token || !activeBaby) return;
    let cancelled = false;
    getRecommendations(activeBaby.id, token)
      .then((recs) => {
        if (!cancelled) setRecHero(recs[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setRecHero(null);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, token, activeBaby]);

  // Deduped-to-latest per ingredient (shared dedup), then annotated with the confirmed
  // flag. One record per tested ingredient → one chip per ingredient.
  const statusById = useMemo(() => {
    const records = deriveIngredientStatuses(dedupeByIngredientLatest(testings), confirmed);
    const map = new Map<number, ChipStatus>();
    for (const record of records) map.set(record.ingredientId, chipForRecord(record));
    // Confirmed allergens have their testing rows deleted on confirm (backend), so they
    // produce no record above and would fall through to "미시작". Add them explicitly as
    // 반응 (red) — a known allergen is the most severe state and must never read as neutral.
    for (const c of confirmed) map.set(c.ingredient_id, "reaction");
    return map;
  }, [testings, confirmed]);

  const chipFor = useCallback(
    (id: number): ChipStatus => statusById.get(id) ?? "not-started",
    [statusById],
  );

  // Medical-safety gate scope — SEPARATE from the display chip. An ingredient must pass
  // the reaction-retest consent gate if it has ANY reaction history (scans every row, not
  // just the deduped-latest one — matching the Allergy screen's reactionIngredientIds) OR
  // is a confirmed allergen. Confirmed allergens have their testing rows deleted on confirm
  // (backend), so they never appear in `deriveIngredientStatuses` output — they MUST be
  // added explicitly here, otherwise tapping a known allergen would start a test with no
  // consent dialog. Kept independent of the pill buckets so counts stay per spec.
  const gateIngredientIds = useMemo(() => {
    const ids = new Set<number>();
    for (const r of deriveIngredientStatuses(testings, confirmed)) {
      if (r.isConfirmedAllergen || r.hasReaction || r.testStatus === "completed_reaction") {
        ids.add(r.ingredientId);
      }
    }
    for (const c of confirmed) ids.add(c.ingredient_id);
    return ids;
  }, [testings, confirmed]);

  const counts = useMemo(() => {
    const acc: Record<IngredientFilterKey, number> = {
      all: ingredients.length,
      safe: 0,
      testing: 0,
      caution: 0,
      "not-started": 0,
    };
    for (const ing of ingredients) acc[bucketForChip(chipFor(ing.id))] += 1;
    return acc;
  }, [ingredients, chipFor]);

  const pills: FilterPill[] = FILTER_LABELS.map((f) => ({ ...f, count: counts[f.key] }));

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    return ingredients
      .filter((ing) => {
        if (activeFilter !== "all" && bucketForChip(chipFor(ing.id)) !== activeFilter) return false;
        if (normalizedQuery && !ing.name.toLowerCase().includes(normalizedQuery)) return false;
        return true;
      })
      .sort(compareIngredient);
  }, [ingredients, activeFilter, normalizedQuery, chipFor]);

  // Reaction-history / confirmed-allergen ingredients must pass the consent gate before
  // a new test starts. Reuse the derived chip so the rule matches the 주의 bucket exactly.
  const handleStart = (ing: IngredientResponse) => {
    if (startingId !== null) return; // one start at a time (duplicate-tap guard)
    if (gateIngredientIds.has(ing.id)) {
      setPendingConsent(ing);
      return;
    }
    void startTest(ing);
  };

  const startTest = async (ing: IngredientResponse) => {
    if (!token || !activeBaby) return;
    setStartingId(ing.id);
    setStartError(null);
    try {
      const created = await createTesting(
        {
          baby_id: activeBaby.id,
          ingredient_id: ing.id,
          test_start_date: new Date().toISOString(),
        },
        token,
      );
      navigate(`/observe/${created.id}`);
    } catch (e) {
      setStartError(
        e instanceof ApiError ? e.message : "테스트 시작에 실패했어요. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setStartingId(null);
    }
  };

  // ── 렌더 분기 ──────────────────────────────────────────────────────────────────

  const babyPhoto = activeBaby?.photo ?? null;

  if (authLoading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-warm-bg text-sm text-warm-fg-muted">
        로그인 상태 확인 중
      </div>
    );
  }

  if (!token || !activeBaby) {
    return (
      <IngredientsShell babyPhoto={babyPhoto}>
        <Card variant="warm">
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-sm font-semibold text-warm-fg">로그인이 필요한 서비스예요.</p>
            <button
              onClick={() => navigate("/login")}
              className="rounded-full bg-warm-brand px-4 py-2 text-sm font-bold text-warm-brand-fg hover:bg-warm-brand-hover"
            >
              로그인하기
            </button>
          </div>
        </Card>
      </IngredientsShell>
    );
  }

  return (
    <IngredientsShell babyPhoto={babyPhoto}>
      {/* 1) 추천 히어로 */}
      {recHero && (
        <Card variant="warm" className="gap-3 bg-warm-surface-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-widest text-warm-brand">다음 도입 추천</span>
            <Sparkles className="size-4 text-warm-brand" />
          </div>
          <div className="flex items-center gap-3">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-warm-surface">
              <IngredientIcon name={recHero.name} emoji={recHero.emoji} className="h-9 w-9" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold text-warm-fg">{recHero.name}</p>
              {recHero.recommended_month != null && (
                <p className="text-xs font-medium text-warm-fg-muted">
                  {recHero.recommended_month}개월~ 도입 추천
                </p>
              )}
            </div>
            <button
              onClick={() => handleStart(recHero)}
              disabled={startingId !== null}
              className="shrink-0 rounded-full bg-warm-brand px-4 py-2 text-sm font-bold text-warm-brand-fg hover:bg-warm-brand-hover disabled:opacity-60"
            >
              시작하기
            </button>
          </div>
        </Card>
      )}

      {/* 2) 검색 */}
      <div className="flex items-center gap-2 rounded-full bg-warm-surface px-4 py-3 shadow-warm">
        <Search className="size-5 shrink-0 text-warm-fg-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="식재료 검색"
          aria-label="식재료 검색"
          className="w-full bg-transparent text-sm text-warm-fg placeholder:text-warm-fg-muted focus:outline-none"
        />
      </div>

      {/* 3) 상태 필터 pill */}
      {!loading && !error && (
        <StatusFilterPills pills={pills} active={activeFilter} onSelect={setActiveFilter} />
      )}

      {/* 테스트 시작 실패 배너 */}
      {startError && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-reaction-bg px-4 py-2.5 text-sm text-reaction-fg">
          <span className="font-semibold">{startError}</span>
          <button
            onClick={() => setStartError(null)}
            className="shrink-0 rounded-full bg-warm-surface px-3 py-1 text-xs font-bold text-warm-brand"
          >
            닫기
          </button>
        </div>
      )}

      {/* 4) 카드 그리드 / 상태 */}
      {loading && !loaded ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-3xl" />
          ))}
        </div>
      ) : error && !loaded ? (
        <Card variant="warm">
          <ScreenError message={error} onRetry={loadAll} />
        </Card>
      ) : filtered.length === 0 ? (
        <Card variant="warm">
          <p className="py-6 text-center text-sm text-warm-fg-muted">
            {normalizedQuery
              ? `'${query.trim()}'에 해당하는 재료가 없어요`
              : "이 상태의 재료가 아직 없어요"}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((ing) => (
            <IngredientCard
              key={ing.id}
              ingredient={ing}
              chip={chipFor(ing.id)}
              starting={startingId === ing.id}
              disabled={startingId !== null}
              onStart={handleStart}
            />
          ))}
        </div>
      )}

      {/* 반응 이력 재료 재테스트 동의 게이트 (Allergy 화면과 동일 컴포넌트) */}
      {pendingConsent && (
        <ReactionRetestConfirm
          onCancel={() => setPendingConsent(null)}
          onConfirm={() => {
            const ing = pendingConsent;
            setPendingConsent(null);
            void startTest(ing);
          }}
        />
      )}
    </IngredientsShell>
  );
}
