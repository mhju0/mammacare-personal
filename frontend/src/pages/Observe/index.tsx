import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { useParams, useNavigate } from "react-router";
import {
  Bell,
  ChevronRight,
  AlertTriangle,
  RefreshCw,
  CircleDot,
  Frown,
  Droplet,
  CircleUser,
  CheckCircle2,
  ClipboardPen,
} from "lucide-react";

import { useApp } from "../../context/AppContext";
import {
  listTestings,
  listSymptomChecks,
  type IngredientTestingResponse,
  type SymptomCheckResponse,
} from "../../api/allergy";
import {
  TIME_MILESTONES,
  getElapsedHours,
  getProgressPercentage,
  buildMilestoneMap,
  parseCheckedAt,
} from "../Allergy/types";
import { MilestonePopup, RecordModal } from "../Allergy/TestingModals";
import { ProgressRing } from "../../components/ui/progress-ring";
import { DayStepper } from "../../components/ui/day-stepper";
import { Card } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { StatusChip, statusFromTestStatus } from "../../components/ui/status-chip";
import { IngredientIcon } from "../../components/IngredientIcon";
import { AuthImage } from "../../components/AuthImage";

// 관찰은 3일(72h) 주기. 일차(1~3)는 TIME_MILESTONES에 이미 존재하는 24h·48h·72h
// 경계로 구간을 나눈다 — Dashboard의 ceil(경과/24) 공식을 복제하지 않고, 마일스톤
// 데이터에서 파생. 링 진행률(percent)은 types.ts의 getProgressPercentage를 재사용한다
// (TestingCard가 쓰는 것과 동일한 값 → 두 화면의 진행률 표기가 일치).
const OBSERVATION_DAYS = 3;

function observationDay(elapsedHours: number): number {
  if (elapsedHours < 24) return 1;
  if (elapsedHours < 48) return 2;
  return OBSERVATION_DAYS;
}

// ── 작은 표시 컴포넌트 ──────────────────────────────────────────────────────────

function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between px-1">
      <h2 className="text-sm font-bold text-warm-fg">{children}</h2>
      {action}
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

// 증상 빠른 기록 카드. 어느 카드를 눌러도 기존 write 경로(RecordModal → createSymptomCheck)를
// 그대로 연다. RecordModal에 증상 프리셀렉트 prop이 없어(수정 시 Tier 3) 항목 사전선택은 하지 않는다.
const SYMPTOM_CARDS: { icon: typeof CircleDot; ko: string; en: string }[] = [
  { icon: CircleDot, ko: "발진", en: "Rash" },
  { icon: Frown, ko: "구토", en: "Vomit" },
  { icon: Droplet, ko: "설사", en: "Diarrhea" },
  { icon: CircleUser, ko: "부종", en: "Swelling" },
];

// warm-kr 화면 셸: 배경 + 헤더(아기 아바타 · 제목 · 알림). 모듈 스코프에 두어 Observe가
// 리렌더될 때마다 새 컴포넌트 타입으로 인식되어 하위 트리(링/스테퍼/모달)가 리마운트되는 걸 막는다.
function ObserveShell({
  babyPhoto,
  title = "72시간 관찰 중",
  children,
}: {
  babyPhoto: string | null;
  title?: string;
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
          <h1 className="flex-1 text-xl font-bold text-warm-brand">{title}</h1>
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

// ── 메인 화면 ───────────────────────────────────────────────────────────────────

export default function Observe() {
  const { testingId } = useParams<{ testingId: string }>();
  const { token, activeBaby, authLoading } = useApp();
  const navigate = useNavigate();

  const [testings, setTestings] = useState<IngredientTestingResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false); // fetch가 최소 1회 성공했는지 (not-found 판정용)
  const [error, setError] = useState<string | null>(null);

  const [checks, setChecks] = useState<SymptomCheckResponse[]>([]);
  const [checksError, setChecksError] = useState<string | null>(null);

  const [showRecord, setShowRecord] = useState(false);
  const [milestoneIdx, setMilestoneIdx] = useState<number | null>(null);

  // 인라인 가드(공유 래퍼 없음): 이 페이지 자체 활성 아기 기준으로 testing 목록을 받아 client-side 필터.
  const loadTestings = useCallback(async () => {
    if (!token || !activeBaby) return;
    setLoading(true);
    setError(null);
    try {
      const list = await listTestings(activeBaby.id, token);
      setTestings(list); // 성공 시에만 교체 → 실패 시 stale 유지
      setLoaded(true);
    } catch {
      setError("관찰 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, [token, activeBaby]);

  useEffect(() => {
    loadTestings();
  }, [loadTestings]);

  const testing = useMemo(
    () => testings.find((t) => t.id === testingId) ?? null,
    [testings, testingId],
  );

  const loadChecks = useCallback(async () => {
    if (!token || !testingId) return;
    setChecksError(null);
    try {
      const data = await listSymptomChecks(testingId, token);
      setChecks(data); // 실패 시 이전 목록 보존 (4a4affb 패턴)
    } catch {
      setChecksError("기록을 불러오지 못했어요.");
    }
  }, [token, testingId]);

  useEffect(() => {
    if (testing) loadChecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testing?.id, loadChecks]);

  const elapsedHours = testing ? getElapsedHours(testing.test_start_date) : 0;
  const percent = testing ? Math.round(getProgressPercentage(elapsedHours)) : 0;
  const day = observationDay(elapsedHours);
  // 진행 중(초록 "Active")과 종료/반응 상태를 구분. 반응이 기록됐거나 완료된 테스트를
  // 초록 "Active"로 표시하면 신호등(안전 초록/반응 빨강) 의미가 깨지므로, 이때는 앱의
  // 표준 StatusChip으로 실제 상태색을 노출한다. deep-link는 진행 중 카드에서만 오지만
  // 화면에서 반응을 바로 기록하거나 완료된 테스트를 직접 URL로 열 수 있어 방어한다.
  const isActivelyTesting = !!testing
    && (testing.test_status === null || testing.test_status === "testing")
    && !testing.has_reaction;
  // 종료된 테스트를 반응/완료로 세분화. statusFromTestStatus의 반응 판정 조건과 동일하게 맞춰
  // 배지(StatusChip)와 링/스테퍼가 서로 다른 상태를 보여주는 일이 없도록 한다.
  const isReactionEnded = !isActivelyTesting
    && (testing?.test_status === "completed_reaction" || !!testing?.has_reaction);
  const headerTitle = isActivelyTesting
    ? "72시간 관찰 중"
    : isReactionEnded
      ? "반응으로 종료된 테스트"
      : "관찰이 완료된 테스트";

  const milestoneMap = useMemo(
    () => (testing ? buildMilestoneMap(checks, testing.test_start_date) : new Map<number, SymptomCheckResponse[]>()),
    [checks, testing?.test_start_date],
  );

  const recentChecks = useMemo(
    () =>
      [...checks].sort(
        (a, b) => parseCheckedAt(b.checked_at).getTime() - parseCheckedAt(a.checked_at).getTime(),
      ),
    [checks],
  );

  const openCheckMilestone = (check: SymptomCheckResponse) => {
    for (const [idx, arr] of milestoneMap) {
      if (arr.some((c) => c.id === check.id)) {
        setMilestoneIdx(idx);
        return;
      }
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
      <ObserveShell babyPhoto={babyPhoto}>
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
      </ObserveShell>
    );
  }

  // 첫 로딩(캐시 없음)
  if (loading && !loaded) {
    return (
      <ObserveShell babyPhoto={babyPhoto}>
        <Skeleton className="h-56 rounded-3xl" />
        <Skeleton className="h-40 rounded-3xl" />
      </ObserveShell>
    );
  }

  // fetch 실패 + 표시할 데이터 없음
  if (error && !loaded) {
    return (
      <ObserveShell babyPhoto={babyPhoto}>
        <Card variant="warm">
          <ScreenError message={error} onRetry={loadTestings} />
        </Card>
      </ObserveShell>
    );
  }

  // fetch 성공했지만 해당 testing 없음
  if (loaded && !testing) {
    return (
      <ObserveShell babyPhoto={babyPhoto}>
        <Card variant="warm">
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-sm font-semibold text-warm-fg">관찰 중인 테스트를 찾을 수 없어요.</p>
            <button
              onClick={() => navigate("/allergy")}
              className="rounded-full bg-warm-brand px-4 py-2 text-sm font-bold text-warm-brand-fg hover:bg-warm-brand-hover"
            >
              알레르기 관리로 돌아가기
            </button>
          </div>
        </Card>
      </ObserveShell>
    );
  }

  if (!testing) return null; // 타입 가드 (위 분기로 도달하지 않음)

  return (
    <ObserveShell babyPhoto={babyPhoto} title={headerTitle}>
      {/* stale 데이터 위 재조회 실패 배너 (4a4affb 패턴) */}
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-reaction-bg px-4 py-2.5 text-sm text-reaction-fg">
          <span className="font-semibold">{error}</span>
          <button
            onClick={loadTestings}
            className="shrink-0 rounded-full bg-warm-surface px-3 py-1 text-xs font-bold text-warm-brand"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* 1) 진행 히어로 — 링 + 데이 스테퍼 (테스팅 앰버) */}
      <Card variant="warm" className="gap-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {isActivelyTesting && (
              <span className="inline-block rounded-full bg-warm-surface-soft px-2.5 py-1 text-[11px] font-bold tracking-wide text-warm-brand">
                TESTING NOW
              </span>
            )}
            <div className="mt-2 flex items-center gap-2">
              <IngredientIcon
                name={testing.ingredient_name}
                emoji={testing.ingredient_emoji}
                className="h-6 w-6"
              />
              <span className="truncate text-base font-bold text-warm-fg">
                {testing.ingredient_name}
              </span>
            </div>
          </div>
          {isActivelyTesting ? (
            <span className="shrink-0 rounded-full bg-testing-bg px-3 py-1.5 text-sm font-bold text-testing-fg">
              Day {day} Active
            </span>
          ) : (
            // 반응 기록/완료 상태 — 앱 표준 상태 색(반응=빨강, 안전=초록)으로 정확히 노출
            <StatusChip
              status={statusFromTestStatus(testing.test_status ?? "testing", testing.has_reaction)}
              className="shrink-0"
            />
          )}
        </div>

        <div className="flex justify-center">
          {isActivelyTesting ? (
            <ProgressRing
              value={percent}
              size={148}
              strokeWidth={12}
              color="var(--testing-fg)"
              trackColor="var(--testing-bg)"
              aria-label="관찰 진행률"
            >
              <span className="text-3xl font-bold text-testing-fg">{percent}%</span>
              <span className="mt-0.5 text-xs font-semibold text-warm-fg-muted">Day {day}</span>
            </ProgressRing>
          ) : isReactionEnded ? (
            <ProgressRing
              value={100}
              size={148}
              strokeWidth={12}
              color="var(--reaction-fg)"
              trackColor="var(--reaction-bg)"
              aria-label="관찰 진행률"
            >
              <span className="text-3xl font-bold text-reaction-fg">반응</span>
            </ProgressRing>
          ) : (
            <ProgressRing
              value={100}
              size={148}
              strokeWidth={12}
              color="var(--safe-fg)"
              trackColor="var(--safe-bg)"
              aria-label="관찰 진행률"
            >
              <span className="text-3xl font-bold text-safe-fg">완료</span>
            </ProgressRing>
          )}
        </div>

        {!isReactionEnded && (
          <DayStepper
            steps={OBSERVATION_DAYS}
            current={isActivelyTesting ? day : OBSERVATION_DAYS}
            labels={["Day 1", "Day 2", "Day 3"]}
            color={isActivelyTesting ? "var(--testing-fg)" : "var(--safe-fg)"}
            aria-label="관찰 진행 단계"
          />
        )}
      </Card>

      {/* 2) 안내 문구 — 증상 카드가 숨겨지는 종료된 테스트에서는 함께 숨긴다 */}
      {isActivelyTesting && (
        <p className="px-1 text-center text-sm leading-relaxed text-warm-fg-muted">
          아이를 차분하게 관찰해 주세요.
          <br />
          변화가 있다면 아래 항목을 선택해 기록해 주세요.
        </p>
      )}

      {/* 3) 증상 빠른 기록 카드 (2x2) — 모두 기존 기록 모달을 연다. 종료된 테스트는 새 기록 진입점을 숨긴다 */}
      {isActivelyTesting && (
        <div className="grid grid-cols-2 gap-3">
          {SYMPTOM_CARDS.map(({ icon: Icon, ko, en }) => (
            <button
              key={en}
              onClick={() => setShowRecord(true)}
              className="flex flex-col items-center gap-3 rounded-3xl bg-warm-surface p-5 shadow-warm transition-colors hover:bg-warm-surface-soft/50"
            >
              <span className="grid size-14 place-items-center rounded-full bg-testing-bg text-testing-fg">
                <Icon className="size-7" />
              </span>
              <span className="text-center text-sm font-bold text-warm-fg">
                {ko} ({en})
              </span>
            </button>
          ))}
        </div>
      )}

      {/* 4) 최근 기록 */}
      <section>
        <SectionTitle
          action={
            <button
              onClick={() => navigate("/allergy")}
              className="text-xs font-bold text-warm-brand hover:text-warm-brand-hover"
            >
              전체 보기
            </button>
          }
        >
          최근 기록
        </SectionTitle>
        <Card variant="warm" className="gap-2">
          {checksError ? (
            <ScreenError message={checksError} onRetry={loadChecks} />
          ) : recentChecks.length === 0 ? (
            <p className="py-2 text-center text-sm text-warm-fg-muted">
              아직 기록이 없어요. 아래 버튼으로 첫 관찰을 기록해 보세요.
            </p>
          ) : (
            recentChecks.slice(0, 4).map((check) => {
              const checkDay = observationDay(
                (parseCheckedAt(check.checked_at).getTime() -
                  new Date(testing.test_start_date).getTime()) /
                  3_600_000,
              );
              return (
                <button
                  key={check.id}
                  onClick={() => openCheckMilestone(check)}
                  className="flex w-full items-center gap-3 rounded-[10px] px-1 py-1.5 text-left hover:bg-warm-surface-soft"
                >
                  <span
                    className={
                      check.has_reaction
                        ? "grid size-8 shrink-0 place-items-center rounded-full bg-reaction-bg text-reaction-fg"
                        : "grid size-8 shrink-0 place-items-center rounded-full bg-safe-bg text-safe-fg"
                    }
                  >
                    {check.has_reaction ? (
                      <AlertTriangle className="size-4" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-warm-fg">
                      {check.has_reaction ? "반응 기록" : "이상 없음 기록"}
                    </p>
                    <p className="text-xs text-warm-fg-muted">
                      {parseCheckedAt(check.checked_at).toLocaleTimeString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · 관찰 Day {checkDay}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-warm-fg-muted" />
                </button>
              );
            })
          )}
        </Card>
      </section>

      {/* 5) 기록 CTA (코랄) — 종료된 테스트는 새 기록 진입점을 숨긴다 */}
      {isActivelyTesting && (
        <button
          onClick={() => setShowRecord(true)}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-warm-cta text-base font-bold text-warm-cta-fg shadow-warm transition-colors hover:bg-warm-cta-hover"
        >
          <ClipboardPen className="size-5" />
          증상 또는 상태 기록하기
        </button>
      )}

      {/* 모달 — 기존 write/read 경로 그대로 재사용 */}
      {showRecord && (
        <RecordModal
          item={testing}
          token={token}
          onClose={() => setShowRecord(false)}
          onSaved={() => {
            loadChecks();
            loadTestings();
          }}
        />
      )}

      {milestoneIdx !== null && (
        <MilestonePopup
          milestone={TIME_MILESTONES[milestoneIdx]}
          checks={milestoneMap.get(milestoneIdx) ?? []}
          startDate={testing.test_start_date}
          elapsedHours={elapsedHours}
          onClose={() => setMilestoneIdx(null)}
        />
      )}
    </ObserveShell>
  );
}
