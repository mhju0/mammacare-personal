import { useState, useEffect, useCallback, useMemo, type ComponentType, type ReactNode } from "react";
import { useNavigate } from "react-router";
import {
  ShieldCheck,
  Clock,
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
import { Card } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { StatusChip, statusFromTestStatus } from "../components/ui/status-chip";
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

type Tone = "safe" | "testing" | "reaction";

const TONE_TILE: Record<Tone, string> = {
  safe: "bg-safe-bg text-safe-fg",
  testing: "bg-testing-bg text-testing-fg",
  reaction: "bg-reaction-bg text-reaction-fg",
};

function MetricTile({
  tone,
  label,
  count,
  Icon,
}: {
  tone: Tone;
  label: string;
  count: number;
  Icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1 rounded-[14px] px-2 py-4",
        TONE_TILE[tone],
      )}
    >
      <Icon className="size-5" />
      <span className="text-2xl font-bold tabular-nums leading-none">{count}</span>
      <span className="text-xs font-semibold">{label}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 px-1 text-sm font-bold text-text">{children}</h2>;
}

function SectionError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <AlertTriangle className="size-6 text-reaction-fg" />
      <p className="text-sm font-semibold text-text">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 inline-flex items-center gap-1 rounded-[10px] bg-clinic-blue px-3 py-1.5 text-xs font-bold text-white hover:bg-clinic-blue/90"
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

  const counts = useMemo(() => {
    let safe = 0;
    let testing = 0;
    let reaction = 0;
    for (const t of testings) {
      if (t.test_status === "completed_reaction" || t.has_reaction) reaction += 1;
      else if (t.test_status === "completed_safe") safe += 1;
      else testing += 1;
    }
    return { safe, testing, reaction };
  }, [testings]);

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
    <div className="min-h-full bg-bg px-4 py-5">
      <div className="mx-auto flex max-w-md flex-col gap-5">
        {/* 헤더 */}
        <header className="px-1">
          <p className="text-xs font-semibold text-text-muted">알레르기 대시보드</p>
          <h1 className="text-xl font-bold text-text">
            {activeBaby ? `${activeBaby.name}의 이유식 현황` : "이유식 현황"}
          </h1>
        </header>

        {/* 1) 신호등 요약 */}
        <section>
          {coreLoading ? (
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[92px] rounded-[14px]" />
              ))}
            </div>
          ) : coreError ? (
            <Card variant="clinical">
              <SectionError message={coreError} onRetry={loadCore} />
            </Card>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <MetricTile tone="safe" label="안전" count={counts.safe} Icon={ShieldCheck} />
              <MetricTile tone="testing" label="테스트중" count={counts.testing} Icon={Clock} />
              <MetricTile tone="reaction" label="반응" count={counts.reaction} Icon={AlertTriangle} />
            </div>
          )}
        </section>

        {/* 2) 다음 도입 추천 */}
        <section>
          <SectionTitle>다음 도입 추천</SectionTitle>
          <Card variant="clinical" className="gap-3">
            {recLoading || coreLoading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-5 w-28" />
              </div>
            ) : recError ? (
              <SectionError message={recError} onRetry={loadRecommendations} />
            ) : recs.length === 0 ? (
              <div className="flex items-center gap-2 py-1 text-sm text-text-muted">
                <Sparkles className="size-4 shrink-0 text-clinic-blue" />
                <span>지금은 추천할 새 재료가 없어요. 새로운 재료가 준비되면 알려드릴게요.</span>
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                {recs.map((ing) => (
                  <li key={ing.id}>
                    <button
                      onClick={() => navigate("/allergy")}
                      className="flex w-full items-center gap-3 rounded-[10px] px-1 py-1.5 text-left hover:bg-bg"
                    >
                      <IngredientIcon name={ing.name} emoji={ing.emoji} className="h-7 w-7" />
                      <span className="flex-1 text-sm font-semibold text-text">{ing.name}</span>
                      {ing.recommended_month != null && (
                        <span className="text-xs font-medium text-text-muted">
                          {ing.recommended_month}개월~
                        </span>
                      )}
                      <ChevronRight className="size-4 text-text-muted" />
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
            <Card variant="clinical">
              <p className="py-2 text-center text-sm text-text-muted">
                진행 중인 테스트가 없어요. 새로운 재료를 테스트해 보세요.
              </p>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {inProgress.map((t) => {
                const day = observationDay(t.test_start_date);
                const pct = observationPercent(t.test_start_date);
                return (
                  <Card key={t.id} variant="clinical" className="gap-2">
                    <div className="flex items-center gap-3">
                      <IngredientIcon
                        name={t.ingredient_name}
                        emoji={t.ingredient_emoji}
                        className="h-7 w-7"
                      />
                      <span className="flex-1 text-sm font-bold text-text">
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
            <Card variant="clinical" className="gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-7 w-7 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </Card>
          ) : coreError ? null : recent.length === 0 ? (
            <Card variant="clinical">
              <p className="py-2 text-center text-sm text-text-muted">
                아직 기록이 없어요. 첫 재료를 추가하면 여기에 표시돼요.
              </p>
            </Card>
          ) : (
            <Card variant="clinical" className="gap-2">
              {recent.map((t) => (
                <div key={t.id} className="flex items-center gap-3 py-1">
                  <IngredientIcon
                    name={t.ingredient_name}
                    emoji={t.ingredient_emoji}
                    className="h-7 w-7"
                  />
                  <span className="flex-1 text-sm font-semibold text-text">
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
