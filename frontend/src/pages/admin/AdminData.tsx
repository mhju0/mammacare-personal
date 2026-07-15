import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { useApp } from "../../context/AppContext";
import { BarChart2 } from "lucide-react";
import {
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  ResponsiveContainer,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { getAdminDashboard, type AdminDashboardOut } from "../../api/admin";

// ── 상수 ──────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { value: "all", label: "전체 기간" },
  { value: "day", label: "오늘 (24시간)" },
  { value: "week", label: "이번 주 (7일)" },
  { value: "month", label: "이번 달 (30일)" },
  { value: "quarter", label: "이번 분기 (90일)" },
] as const;

const PROVIDER_OPTIONS = [
  { value: "all", label: "전체 경로" },
  { value: "google", label: "구글" },
  { value: "kakao", label: "카카오" },
  { value: "naver", label: "네이버" },
  { value: "local", label: "이메일" },
];

const AGE_GROUP_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "0-6", label: "0~6개월" },
  { value: "6-12", label: "6~12개월" },
  { value: "12-24", label: "12~24개월" },
  { value: "24+", label: "24개월+" },
];

const PROVIDER_COLORS: Record<string, string> = {
  google: "#A9C6B0",
  kakao: "#F0DFAE",
  naver: "#A9C6B0",
  local: "#A9C6B0",
};
const PROVIDER_LABELS: Record<string, string> = {
  google: "구글",
  kakao: "카카오",
  naver: "네이버",
  local: "이메일",
};
const SEVERITY_COLORS = ["#A9C6B0", "#F0DFAE", "#E3A24C", "#E0A48F", "#DDE8DD"];
const STATUS_LABELS: Record<string, string> = {
  planned: "예정",
  done: "완료",
  skipped: "건너뜀",
};
const CHART_PRIMARY = "#A9C6B0";
const CHART_GREEN = "#A9C6B0";
const CHART_YELLOW = "#F0DFAE";

// ── 공통 컴포넌트 ──────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="text-sm text-muted-foreground mb-1">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function ChartCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-card border border-border rounded-2xl p-5 ${className}`}>
      <h3 className="text-sm font-semibold text-muted-foreground mb-4">{title}</h3>
      {children}
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`bg-muted rounded animate-pulse ${className}`} />;
}

// ── 필터 드롭다운 ──────────────────────────────────────────

function FilterSelect({
  value, onChange, options, maxWidth,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  maxWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.top, left: rect.left, width: rect.width });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const handle = () => updatePosition();
    window.addEventListener("scroll", handle, true);
    window.addEventListener("resize", handle);
    return () => {
      window.removeEventListener("scroll", handle, true);
      window.removeEventListener("resize", handle);
    };
  }, [open]);

  const triggerHeight = triggerRef.current?.offsetHeight ?? 0;
  const selected = options.find((o) => o.value === value);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="px-3 py-2 rounded-xl border border-sage-100 bg-warm-surface/80
          focus:outline-none focus:ring-2 focus:ring-sage-50 text-sm font-semibold
          flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
      >
        {selected?.label ?? value}
        <span className={`text-xs transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && pos && createPortal(
        <div
          style={{
            position: "fixed",
            top: pos.top + triggerHeight + 4,
            left: pos.left,
            zIndex: 9999,
            ...(maxWidth !== undefined && { maxWidth }),
          }}
          className="overflow-hidden bg-sage-50 border border-sage-100 rounded-3xl shadow-lg"
        >
          {options.map((o) => (
            <button
              key={o.value}
              onMouseDown={(e) => { e.preventDefault(); onChange(o.value); setOpen(false); }}
              className={`w-full px-3 py-2.5 text-sm text-left font-medium transition-colors hover:bg-warm-surface/70 whitespace-nowrap ${
                o.value === value ? "bg-warm-surface/70" : ""
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────

export default function AdminData() {
  const { user, token, authLoading } = useApp();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<"users" | "features" | "babies">("users");
  const [period, setPeriod] = useState<string>("month");
  const [provider, setProvider] = useState("all");
  const [ageGroup, setAgeGroup] = useState("all");
  const [data, setData] = useState<AdminDashboardOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tabs = [
    { id: "users" as const, label: "사용자 지표" },
    { id: "features" as const, label: "핵심 기능 지표" },
    { id: "babies" as const, label: "아기 데이터 인사이트" },
  ];

  useEffect(() => {
    if (!authLoading && !user?.isAdmin) navigate("/login");
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!token || !user?.isAdmin) return;
    setLoading(true);
    setError(null);
    getAdminDashboard(token, { period, provider, age_group: ageGroup })
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "데이터를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [token, user, period, provider, ageGroup]);

  const providerChartData = data?.provider_distribution.map((p) => ({
    name: PROVIDER_LABELS[p.provider] ?? p.provider,
    value: p.count,
    color: PROVIDER_COLORS[p.provider] ?? "#6b7280",
  })) ?? [];

  const scheduleChartData = data?.schedule_status_dist.map((s) => ({
    name: STATUS_LABELS[s.status] ?? s.status,
    value: s.count,
  })) ?? [];

  const severityChartData = data?.symptom_severity_dist.map((s, i) => ({
    name: s.severity,
    value: s.count,
    color: SEVERITY_COLORS[i % SEVERITY_COLORS.length],
  })) ?? [];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
      {/* 헤더 & 필터 */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2" 
          style={{ fontFamily: "'Paperlogic'", fontWeight: 600 }}><BarChart2 size={24} />대시보드</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterSelect value={period} onChange={setPeriod} options={PERIOD_OPTIONS as unknown as { value: string; label: string }[]} maxWidth={140} />
          <FilterSelect value={provider} onChange={setProvider} options={PROVIDER_OPTIONS} maxWidth={107} />
          <FilterSelect value={ageGroup} onChange={setAgeGroup} options={AGE_GROUP_OPTIONS} maxWidth={100} />
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {/* 탭 인덱스 */}
      <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2.5 px-3 py-1 rounded-full font-medium text-base whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? "bg-warm-surface-soft hover:opacity-70 font-semibold transition-colors"
                : "bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── 섹션 1: 사용자 지표 ──────────────────────────── */}
      {activeTab === "users" && <section className="mb-5">
        {/* 요약 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          {loading ? (
            [0,1,2,3].map(i => <div key={i} className="bg-card border border-border rounded-full p-5"><Skeleton className="h-4 w-3/4 mb-3" /><Skeleton className="h-7 w-1/2" /></div>)
          ) : (
            <>
              <StatCard label="전체 회원" value={data?.total_users.toLocaleString() ?? "-"} />
              <StatCard label="DAU" value={data?.dau.toLocaleString() ?? "-"} sub="오늘 로그인" />
              <StatCard label="MAU" value={data?.mau.toLocaleString() ?? "-"} sub="이번 달 로그인" />
              <StatCard label="활성률" value={data ? `${Math.round(data.mau / (data.total_users || 1) * 100)}%` : "-"} sub="MAU/전체" />
            </>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* 신규 가입자 추이 */}
          <ChartCard title="신규 가입자 추이" className="lg:col-span-2">
            {loading ? <Skeleton className="h-52" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={data?.new_users_trend ?? []} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorUser" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_PRIMARY} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={CHART_PRIMARY} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ECE5D5" />
                  <XAxis dataKey="period_label" tick={{ fontSize: 11 }} stroke="#6F6A5C" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#6F6A5C" allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 13 }} />
                  <Area type="monotone" dataKey="count" name="신규 가입" stroke={CHART_PRIMARY} fill="url(#colorUser)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* OAuth 제공자별 비율 */}
          <ChartCard title="가입 경로별 비율">
            {loading ? <Skeleton className="h-52" /> : providerChartData.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">데이터 없음</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={providerChartData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                      {providerChartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 13 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-1.5 mt-2">
                  {providerChartData.map((p) => (
                    <div key={p.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
                        <span>{p.name}</span>
                      </div>
                      <span className="font-medium">{p.value}명</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </ChartCard>
        </div>
      </section>}

      {/* ── 섹션 2: 핵심 기능 지표 ───────────────────────── */}
      {activeTab === "features" && <section className="mb-10">
        {/* 완료율 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          {loading ? (
            [0,1].map(i => <div key={i} className="bg-card border border-border rounded-2xl p-5"><Skeleton className="h-4 w-1/2 mb-3" /><Skeleton className="h-3 w-full rounded-full" /></div>)
          ) : (
            <>
              <div className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-muted-foreground">식재료 테스트 완료율</span>
                  <span className="text-lg font-bold">{data?.testing_completion_rate ?? 0}%</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-secondary transition-all" style={{ width: `${data?.testing_completion_rate ?? 0}%` }} />
                </div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-muted-foreground">스케줄 완료율</span>
                  <span className="text-lg font-bold">{data?.schedule_completion_rate ?? 0}%</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-secondary transition-all" style={{ width: `${data?.schedule_completion_rate ?? 0}%` }} />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          {/* 테스트 생성/완료 추이 */}
          <ChartCard title="식재료 테스트 생성 & 완료 추이">
            {loading ? <Skeleton className="h-52" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data?.testing_trend ?? []} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ECE5D5" />
                  <XAxis dataKey="period_label" tick={{ fontSize: 11 }} stroke="#6F6A5C" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#6F6A5C" allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 13 }} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="created" name="생성" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="completed" name="완료" fill={CHART_GREEN} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* 스케줄 상태 분포 */}
          <ChartCard title="스케줄 상태 분포">
            {loading ? <Skeleton className="h-52" /> : scheduleChartData.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">데이터 없음</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={scheduleChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ECE5D5" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#6F6A5C" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#6F6A5C" allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 13 }} />
                  <Bar dataKey="value" name="건수" fill={CHART_YELLOW} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* TOP 알레르기 식재료 */}
          <ChartCard title="알레르기 확진 TOP 10 식재료">
            {loading ? <Skeleton className="h-64" /> : (data?.top_allergy_ingredients.length ?? 0) === 0 ? (
              <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">데이터 없음</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  data={data?.top_allergy_ingredients}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#ECE5D5" />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="#6F6A5C" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="#6F6A5C" width={60} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 13 }} />
                  <Bar dataKey="count" name="확진 수" fill="#E0A48F" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* 증상 심각도 분포 */}
          <ChartCard title="증상 심각도 분포">
            {loading ? <Skeleton className="h-64" /> : severityChartData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">데이터 없음</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={severityChartData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                      {severityChartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 13 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-1.5 mt-2">
                  {severityChartData.map((s) => (
                    <div key={s.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                        <span>{s.name}</span>
                      </div>
                      <span className="font-medium">{s.value}건</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </ChartCard>
        </div>
      </section>}

      {/* ── 섹션 3: 아기 데이터 인사이트 ─────────────────── */}
      {activeTab === "babies" && <section>
        {/* 요약 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
          {loading ? (
            [0,1,2].map(i => <div key={i} className="bg-card border border-border rounded-2xl p-5"><Skeleton className="h-4 w-3/4 mb-3" /><Skeleton className="h-7 w-1/2" /></div>)
          ) : (
            <>
              <StatCard label="등록 아기 수" value={`${data?.total_babies ?? 0}명`} />
              <StatCard
                label="이유식 시작 평균 시기"
                value={data?.avg_baby_food_start_month != null ? `${data.avg_baby_food_start_month}개월` : "-"}
                sub="baby_food_start_date 기준"
              />
              <StatCard
                label="아기 수가 많은 개월대"
                value={data?.baby_age_distribution.sort((a, b) => b.count - a.count)[0]?.age_group ?? "-"}
                sub={`${data?.baby_age_distribution.sort((a, b) => b.count - a.count)[0]?.count ?? 0}명`}
              />
            </>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* 생후 개월 수 분포 */}
          <ChartCard title="등록 아기 개월 수 분포">
            {loading ? <Skeleton className="h-52" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data?.baby_age_distribution ?? []} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ECE5D5" />
                  <XAxis dataKey="age_group" tick={{ fontSize: 10 }} stroke="#6F6A5C" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#6F6A5C" allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 13 }} />
                  <Bar dataKey="count" name="아기 수" fill="#A9C6B0" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* 생후 개월 구간별 평균 성장 */}
          <ChartCard title="개월 구간별 평균 성장 수치">
            {loading ? <Skeleton className="h-52" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={(data?.monthly_avg_growth ?? []).filter(g => g.avg_weight != null || g.avg_height != null)}
                  margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#ECE5D5" />
                  <XAxis dataKey="age_group" tick={{ fontSize: 10 }} stroke="#6F6A5C" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#6F6A5C" />
                  <Tooltip
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 13 }}
                    formatter={(value: number, name: string) => [
                      name === "avg_weight" ? `${value} kg` : `${value} cm`,
                      name === "avg_weight" ? "평균 체중" : "평균 키",
                    ]}
                  />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} formatter={(v) => v === "avg_weight" ? "평균 체중(kg)" : "평균 키(cm)"} />
                  <Bar dataKey="avg_weight" name="avg_weight" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="avg_height" name="avg_height" fill="#E3A24C" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      </section>}
    </div>
  );
}
