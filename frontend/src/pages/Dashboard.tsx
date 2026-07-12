import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router";
import {
  AlertTriangle,
  Sparkles,
  RefreshCw,
  ChevronRight,
} from "lucide-react";

import { useApp } from "../context/AppContext";
import {
  listTestings,
  type IngredientTestingResponse,
  type TestStatus,
} from "../api/allergy";
import { getRecommendations } from "../api/recommendations";
import type { IngredientResponse } from "../api/ingredients";
import { getElapsedHours } from "./Allergy/types";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { StatusChip, statusFromTestStatus } from "../components/ui/status-chip";
import { deriveIngredientStatuses, toDashboardCounts } from "../utils/allergyStatus";
import { IngredientIcon } from "../components/IngredientIcon";
import { cn } from "../components/ui/utils";

// 관찰 기간: 알레르기 테스트 타임라인(TIME_MILESTONES)이 72시간까지이므로 3일을 한 주기로 본다.
const OBSERVATION_DAYS = 3;
const RECENT_LIMIT = 5;

function observationDay(startDate: string): number {
  const day = Math.ceil(getElapsedHours(startDate) / 24);
  return Math.min(OBSERVATION_DAYS, Math.max(1, day));
}

function observationPercent(startDate: string): number {
  const pct = (getElapsedHours(startDate) / (OBSERVATION_DAYS * 24)) * 100;
  return Math.min(100, Math.max(0, pct));
}

// ── 작은 표시 컴포넌트 ──────────────────────────────────────────────────────────

// warm-kr 신호등 요약: 3개 타일 그리드 대신 가로 pill 한 줄(home.png). 점 색은 상태 semantic
// 토큰(safe/testing/reaction-fg)을 그대로 쓰고, pill 표면·글자만 warm chrome으로 스타일링한다.
function TrafficStat({
  dotClass,
  label,
  count,
}: {
  dotClass: string;
  label: string;
  count: number;
}) {
  return (
    <span className="flex items-center gap-1.5 text-sm font-semibold text-warm-fg">
      <span className={cn("size-2 rounded-full", dotClass)} aria-hidden="true" />
      {label}
      <span className="tabular-nums text-warm-fg-muted">{count}</span>
    </span>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 px-1 text-sm font-bold text-warm-fg">{children}</h2>;
}

function SectionError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
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

// ── 메인 대시보드 ───────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { token, activeBaby } = useApp();
  const navigate = useNavigate();

  const [testings, setTestings] = useState<IngredientTestingResponse[]>([]);
  const [coreLoading, setCoreLoading] = useState(true);
  const [coreError, setCoreError] = useState<string | null>(null);

  const [recs, setRecs] = useState<IngredientResponse[]>([]);
  const [recLoading, setRecLoading] = useState(true);
  const [recError, setRecError] = useState<string | null>(null);

  const loadCore = useCallback(async () => {
    if (!token || !activeBaby) return;
    setCoreLoading(true);
    setCoreError(null);
    try {
      const testList = await listTestings(activeBaby.id, token);
      setTestings(testList);
    } catch {
      setCoreError("대시보드 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setCoreLoading(false);
    }
  }, [token, activeBaby]);

  useEffect(() => {
    loadCore();
  }, [loadCore]);

  const loadRecommendations = useCallback(async () => {
    if (!token || !activeBaby) return;
    setRecLoading(true);
    setRecError(null);
    try {
      const suggestions = await getRecommendations(activeBaby.id, token);
      setRecs(suggestions);
    } catch {
      setRecError("추천을 불러오지 못했어요.");
    } finally {
      setRecLoading(false);
    }
  }, [activeBaby, token]);

  useEffect(() => {
    // 핵심 데이터 로딩이 끝나고 에러가 없을 때만 추천 계산
    if (!coreLoading && !coreError) loadRecommendations();
  }, [coreLoading, coreError, loadRecommendations]);

  // Dashboard never fetches confirmed allergies; counts tally raw testing rows.
  const counts = useMemo(
    () => toDashboardCounts(deriveIngredientStatuses(testings)),
    [testings],
  );

  const inProgress = useMemo(
    () =>
      testings.filter(
        (t) => (t.test_status === "testing" || t.test_status === null) && !t.has_reaction,
      ),
    [testings],
  );

  const recent = useMemo(
    () =>
      [...testings]
        .sort((a, b) => b.test_start_date.localeCompare(a.test_start_date))
        .slice(0, RECENT_LIMIT),
    [testings],
  );

  return (
    <div className="min-h-full bg-warm-bg px-4 py-5">
      <div className="mx-auto flex max-w-md flex-col gap-5">
        {/* 헤더 */}
        <header className="px-1">
          <h1 className="text-2xl font-bold text-warm-fg">
            {activeBaby ? `${activeBaby.name}의 오늘` : "오늘"}
          </h1>
          <p className="mt-1 text-sm text-warm-fg-muted">오늘도 건강한 성장을 응원해요!</p>
        </header>

        {/* 1) 신호등 요약 — warm-kr 가로 pill */}
        <section>
          {coreLoading ? (
            <Skeleton className="h-14 rounded-full" />
          ) : coreError ? (
            <Card variant="warm">
              <SectionError message={coreError} onRetry={loadCore} />
            </Card>
          ) : (
            <div className="flex items-center justify-around rounded-full bg-warm-surface-soft px-4 py-3.5">
              <TrafficStat dotClass="bg-safe-fg" label="안전" count={counts.safe} />
              <span className="h-4 w-px bg-warm-border" aria-hidden="true" />
              <TrafficStat dotClass="bg-testing-fg" label="테스트중" count={counts.testing} />
              <span className="h-4 w-px bg-warm-border" aria-hidden="true" />
              <TrafficStat dotClass="bg-reaction-fg" label="반응" count={counts.reaction} />
            </div>
          )}
        </section>

        {/* 새 재료 테스트 CTA */}
        <Button
          variant="warmPrimary"
          onClick={() => navigate("/allergy")}
          className="h-12 w-full rounded-full text-base font-bold"
        >
          새 재료 테스트 시작하기
        </Button>

        {/* 2) 다음 도입 추천 */}
        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-warm-fg">다음 도입 추천</h2>
            {/* TEMP: X-cut 시 탭으로 대체 */}
            <button
              onClick={() => navigate("/ingredients")}
              className="text-xs font-bold text-warm-brand hover:text-warm-brand-hover"
            >
              식재료 도감 →
            </button>
          </div>
          <Card variant="warm" className="gap-3">
            {recLoading || coreLoading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-5 w-28" />
              </div>
            ) : recError ? (
              <SectionError message={recError} onRetry={loadRecommendations} />
            ) : recs.length === 0 ? (
              <div className="flex items-center gap-2 py-1 text-sm text-warm-fg-muted">
                <Sparkles className="size-4 shrink-0 text-warm-brand" />
                <span>지금은 추천할 새 재료가 없어요. 새로운 재료가 준비되면 알려드릴게요.</span>
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                {recs.map((ing) => (
                  <li key={ing.id}>
                    <button
                      onClick={() => navigate("/allergy")}
                      className="flex w-full items-center gap-3 rounded-[10px] px-1 py-1.5 text-left hover:bg-warm-surface-soft"
                    >
                      <IngredientIcon name={ing.name} emoji={ing.emoji} className="h-7 w-7" />
                      <span className="flex-1 text-sm font-semibold text-warm-fg">{ing.name}</span>
                      {ing.recommended_month != null && (
                        <span className="text-xs font-medium text-warm-fg-muted">
                          {ing.recommended_month}개월~
                        </span>
                      )}
                      <ChevronRight className="size-4 text-warm-fg-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        {/* 3) 진행 중 테스트 관찰 진행 */}
        <section>
          <SectionTitle>진행 중인 테스트</SectionTitle>
          {coreLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-16 rounded-[14px]" />
              <Skeleton className="h-16 rounded-[14px]" />
            </div>
          ) : coreError ? null : inProgress.length === 0 ? (
            <Card variant="warm">
              <p className="py-2 text-center text-sm text-warm-fg-muted">
                진행 중인 테스트가 없어요. 새로운 재료를 테스트해 보세요.
              </p>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {inProgress.map((t) => {
                const day = observationDay(t.test_start_date);
                const pct = observationPercent(t.test_start_date);
                return (
                  <Card
                    key={t.id}
                    variant="warm"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/observe/${t.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/observe/${t.id}`);
                      }
                    }}
                    className="cursor-pointer gap-2 transition-colors hover:bg-warm-surface-soft/40"
                  >
                    <div className="flex items-center gap-3">
                      <IngredientIcon
                        name={t.ingredient_name}
                        emoji={t.ingredient_emoji}
                        className="h-7 w-7"
                      />
                      <span className="flex-1 text-sm font-bold text-warm-fg">
                        {t.ingredient_name}
                      </span>
                      <span className="text-xs font-semibold text-testing-fg">
                        {OBSERVATION_DAYS}일 중 {day}일째
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-testing-bg">
                      <div
                        className="h-full rounded-full bg-testing-fg transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* 4) 최근 기록 */}
        <section>
          <SectionTitle>최근 기록</SectionTitle>
          {coreLoading ? (
            <Card variant="warm" className="gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-7 w-7 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </Card>
          ) : coreError ? null : recent.length === 0 ? (
            <Card variant="warm">
              <p className="py-2 text-center text-sm text-warm-fg-muted">
                아직 기록이 없어요. 첫 재료를 추가하면 여기에 표시돼요.
              </p>
            </Card>
          ) : (
            <Card variant="warm" className="gap-2">
              {recent.map((t) => (
                <div key={t.id} className="flex items-center gap-3 py-1">
                  <IngredientIcon
                    name={t.ingredient_name}
                    emoji={t.ingredient_emoji}
                    className="h-7 w-7"
                  />
                  <span className="flex-1 text-sm font-semibold text-warm-fg">
                    {t.ingredient_name}
                  </span>
                  <StatusChip
                    status={statusFromTestStatus(
                      (t.test_status ?? "testing") as TestStatus,
                      t.has_reaction,
                    )}
                  />
                </div>
              ))}
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
