import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { useNavigate } from "react-router";
import { useApp } from "../../context/AppContext";
import {
  Search, Ban, CheckCircle, Trash2,
  ChevronLeft, ChevronRight, X, Baby, Activity, Smartphone, Clock,
  Users,
} from "lucide-react";
import {
  listAdminUsers,
  updateAdminUser,
  deleteAdminUser,
  getAdminUserDetail,
  type AdminUserOut,
  type AdminUserDetailOut,
} from "../../api/admin";


const PROVIDER_OPTIONS = [
  { value: "all", label: "전체 수단" },
  { value: "google", label: "구글" },
  { value: "kakao", label: "카카오" },
  { value: "naver", label: "네이버" },
  { value: "local", label: "이메일" },
];

const PROVIDER_LABELS: Record<string, string> = {
  google: "구글",
  kakao: "카카오",
  naver: "네이버",
  local: "이메일",
};

const PROVIDER_COLORS: Record<string, string> = {
  google: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  kakao: "bg-yellow-400/10 text-yellow-700 border-yellow-400/20",
  naver: "bg-green-500/10 text-green-600 border-green-500/20",
  local: "bg-purple-500/10 text-purple-600 border-purple-500/20",
};

function ProviderDropdown({
  value,
  onChange,
  options,
  minWidth,
  maxWidth,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  minWidth?: number;
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
        className="px-2.5 py-1 rounded-xl border border-[#C5E5FA] bg-[#FAFAFA]/80
          focus:outline-none focus:ring-2 focus:ring-[#EBF7FF] text-sm font-semibold
          flex items-center gap-1.5 cursor-pointer"
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
            ...(minWidth !== undefined && { minWidth }),
            ...(maxWidth !== undefined && { maxWidth }),
          }}
          className="overflow-hidden bg-[#EBF7FF] border border-[#C5E5FA] rounded-3xl shadow-lg"
        >
          {options.map((o) => (
            <button
              key={o.value}
              onMouseDown={(e) => { e.preventDefault(); onChange(o.value); setOpen(false); }}
              className={`w-full px-3 py-2 text-sm text-left font-medium transition-colors hover:bg-[#FAFAFA]/70 ${
                o.value === value ? "bg-[#FAFAFA]/70" : ""
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

function DatePickerButton({
  value,
  onChange,
  placeholder = "날짜 선택",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [pickerStep, setPickerStep] = useState<"year" | "month" | "day" | null>(null);
  const currentYear = new Date().getFullYear();

  const parts = value ? value.split("-").map(Number) : null;

  const updateDate = (y: number, m: number, d: number) => {
    onChange(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  };

  const initToday = () => {
    const t = new Date();
    updateDate(t.getFullYear(), t.getMonth() + 1, t.getDate());
    setPickerStep("year");
  };

  if (!parts) {
    return (
      <button
        type="button"
        onClick={initToday}
        className="px-2.5 py-1 text-sm text-muted-foreground rounded-xl border border-[#C5E5FA]
          bg-[#FAFAFA]/80 hover:bg-[#EBF7FF] transition-colors"
      >
        {placeholder}
      </button>
    );
  }

  const [y, m, d] = parts;

  return (
    <>
      <div className="flex items-center rounded-xl border border-[#C5E5FA] bg-[#FAFAFA]/80 overflow-hidden">
        <button type="button" onClick={() => setPickerStep("year")}
          className="px-2.5 py-1 text-sm font-semibold hover:bg-[#EBF7FF] transition-colors">
          {y}년
        </button>
        <span className="w-px self-stretch bg-[#C5E5FA]" />
        <button type="button" onClick={() => setPickerStep("month")}
          className="px-2.5 py-1 text-sm font-semibold hover:bg-[#EBF7FF] transition-colors">
          {m}월
        </button>
        <span className="w-px self-stretch bg-[#C5E5FA]" />
        <button type="button" onClick={() => setPickerStep("day")}
          className="px-2.5 py-1 text-sm font-semibold hover:bg-[#EBF7FF] transition-colors">
          {d}일
        </button>
        <span className="w-px self-stretch bg-[#C5E5FA]" />
        <button type="button" onClick={() => onChange("")}
          className="px-1.5 py-1 text-muted-foreground hover:text-foreground hover:bg-[#EBF7FF] transition-colors">
          <X size={12} />
        </button>
      </div>

      {pickerStep && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center px-4"
          onClick={() => setPickerStep(null)}>
          <div className="bg-card rounded-3xl p-5 w-72 shadow-xl border border-border"
            onClick={(e) => e.stopPropagation()}>
            {pickerStep === "year" && (
              <>
                <div className="text-sm font-bold mb-4 text-center text-foreground">연도 선택</div>
                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: 6 }, (_, i) => currentYear - 3 + i).map((yr) => (
                    <button key={yr} type="button"
                      onClick={() => { updateDate(yr, m, d); setPickerStep("month"); }}
                      className={`py-2 rounded-xl text-sm font-semibold transition-colors ${
                        yr === y ? "bg-[#C5E5FA] text-primary-foreground" : "hover:bg-[#C5E5FA]/20 text-foreground"
                      }`}>
                      {yr}
                    </button>
                  ))}
                </div>
              </>
            )}
            {pickerStep === "month" && (
              <>
                <div className="relative flex items-center mb-4">
                  <button type="button" onClick={() => setPickerStep("year")}
                    className="absolute left-0 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <ChevronLeft size={13} /> 년
                  </button>
                  <div className="text-sm font-bold text-center text-foreground w-full">{y}년</div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((mo) => (
                    <button key={mo} type="button"
                      onClick={() => { updateDate(y, mo, d); setPickerStep("day"); }}
                      className={`py-2 rounded-xl text-sm font-semibold transition-colors ${
                        mo === m ? "bg-[#C5E5FA] text-primary-foreground" : "hover:bg-[#C5E5FA]/20 text-foreground"
                      }`}>
                      {mo}월
                    </button>
                  ))}
                </div>
              </>
            )}
            {pickerStep === "day" && (
              <>
                <div className="relative flex items-center mb-4">
                  <button type="button" onClick={() => setPickerStep("month")}
                    className="absolute left-0 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <ChevronLeft size={13} /> 월
                  </button>
                  <span className="w-full text-center text-sm font-bold text-foreground">
                    {y}년 {m}월
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => i + 1).map((day) => (
                    <button key={day} type="button"
                      onClick={() => { updateDate(y, m, day); setPickerStep(null); }}
                      className={`aspect-square text-xs rounded-lg transition-colors flex items-center justify-center ${
                        day === d ? "bg-[#C5E5FA] text-primary-foreground font-bold" : "hover:bg-[#C5E5FA]/20 text-foreground"
                      }`}>
                      {day}
                    </button>
                  ))}
                </div>
              </>
            )}
            <button type="button" onClick={() => setPickerStep(null)}
              className="w-full mt-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
              취소
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function parseUserAgent(ua: string | null): string {
  if (!ua) return "알 수 없음";
  if (/iPhone|iPad/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac/.test(ua)) return "macOS";
  return ua.slice(0, 40);
}

// ── 상세 패널 ──────────────────────────────────────────────

function DetailPanel({
  userId,
  token,
  onClose,
  onUpdate,
  onDelete,
  currentAdminId,
}: {
  userId: string;
  token: string;
  onClose: () => void;
  onUpdate: (u: AdminUserOut) => void;
  onDelete: (id: string) => void;
  currentAdminId: string;
}) {
  useBodyScrollLock();
  const [detail, setDetail] = useState<AdminUserDetailOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getAdminUserDetail(token, userId)
      .then(setDetail)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "오류가 발생했습니다."))
      .finally(() => setLoading(false));
  }, [token, userId]);

  const handleToggleActive = async () => {
    if (!detail) return;
    if (!confirm(`계정을 ${detail.user.is_active ? "정지" : "활성화"}하시겠습니까?`)) return;
    setActionLoading(true);
    try {
      const updated = await updateAdminUser(token, userId, { is_active: !detail.user.is_active });
      setDetail((prev) => prev && { ...prev, user: updated });
      onUpdate(updated);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!detail) return;
    if (!confirm(`${detail.user.name} 회원을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;
    setActionLoading(true);
    try {
      await deleteAdminUser(token, userId);
      onDelete(userId);
      onClose();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "오류가 발생했습니다.");
      setActionLoading(false);
    }
  };

  const isSelf = detail?.user.id === currentAdminId;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-background border-l border-border shadow-2xl overflow-y-auto flex flex-col">
        {/* 헤더 */}
        <div className="sticky top-0 bg-background border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold">회원 상세</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-base text-muted-foreground py-20">
            불러오는 중
          </div>
        ) : error ? (
          <div className="px-6 py-8 text-sm text-destructive">{error}</div>
        ) : detail ? (
          <div className="flex-1 px-6 py-5 space-y-6">
            {/* 기본 정보 */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wide">기본 정보</h3>
                <div className="flex gap-2">
                  {detail.user.is_admin ? (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20">관리자</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/10 text-gray-500 border border-gray-500/20">일반</span>
                  )}
                  {detail.user.is_active ? (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-600 border border-green-500/20">활성</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20">정지</span>
                  )}
                </div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                <Row label="이름" value={detail.user.name} />
                <Row label="닉네임" value={detail.user.nickname} />
                <Row label="이메일" value={detail.user.email} />
                <Row label="아이디" value={detail.user.username} />
                <Row
                  label="가입 수단"
                  value={
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${PROVIDER_COLORS[detail.user.auth_provider] ?? "bg-muted"}`}>
                      {PROVIDER_LABELS[detail.user.auth_provider] ?? detail.user.auth_provider}
                    </span>
                  }
                />
                <Row label="가입일" value={formatDate(detail.user.created_at)} />
                <Row
                  label="최근 로그인"
                  value={detail.last_login_at ? formatDateTime(detail.last_login_at) : "기록 없음"}
                />
              </div>
            </section>

            {/* 아기 목록 */}
            <section>
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <Baby size={14} /> 등록 아기 ({detail.babies.length}명)
              </h3>
              {detail.babies.length === 0 ? (
                <p className="text-sm text-muted-foreground">등록된 아기가 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {detail.babies.map((b) => (
                    <div key={b.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between">
                      <div>
                        <span className="font-medium text-sm">{b.name}</span>
                        {b.gender && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {b.gender === "male" ? "남아" : b.gender === "female" ? "여아" : b.gender}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{b.age_months}개월 · {b.birth_date}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 행동 패턴 */}
            <section>
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <Activity size={14} /> 사용 현황
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <StatMini label="식재료 테스트" value={detail.activity.testing_count} unit="건" />
                <StatMini label="이유식 스케줄" value={detail.activity.schedule_count} unit="건" />
                <StatMini label="성장 기록" value={detail.activity.growth_count} unit="건" />
              </div>
            </section>

            {/* 로그인 세션 */}
            <section>
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <Smartphone size={14} /> 기기/IP별 접속 현황 (최근 10건)
              </h3>
              {detail.login_sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">로그인 기록이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {detail.login_sessions.map((s, i) => (
                    <div key={i} className="bg-card border border-border rounded-xl px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Smartphone size={13} className="text-muted-foreground" />
                          {parseUserAgent(s.user_agent)}
                        </div>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${s.is_revoked ? "bg-muted text-muted-foreground" : "bg-green-500/10 text-green-600"}`}>
                          {s.is_revoked ? "만료" : "유효"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock size={11} /> {formatDateTime(s.created_at)}
                        </span>
                        {s.ip_address && <span>IP: {s.ip_address}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 액션 버튼 */}
            {!isSelf && (
              <section className="border-t border-border pt-4 space-y-2">
                <button
                  onClick={handleToggleActive}
                  disabled={actionLoading}
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-border hover:bg-muted transition-colors text-sm font-medium disabled:opacity-50"
                >
                  {detail.user.is_active ? <><Ban size={15} className="text-destructive" /> 계정 정지</> : <><CheckCircle size={15} className="text-green-500" /> 계정 활성화</>}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={actionLoading}
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-destructive/30 hover:bg-destructive/5 transition-colors text-sm font-medium text-destructive disabled:opacity-50"
                >
                  <Trash2 size={15} /> 계정 삭제
                </button>
              </section>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground w-24 shrink-0">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function StatMini({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3 text-center">
      <div className="text-lg font-bold">{value.toLocaleString()}<span className="text-xs font-normal text-muted-foreground ml-0.5">{unit}</span></div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────

export default function AdminUsers() {
  const { user, token, authLoading } = useApp();
  const navigate = useNavigate();

  const [users, setUsers] = useState<AdminUserOut[]>([]);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [provider, setProvider] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);

  const PAGE_SIZE = 20;

  useEffect(() => {
    if (!authLoading && !user?.isAdmin) navigate("/login");
  }, [authLoading, user, navigate]);

  const fetchUsers = useCallback(
    async (opts?: { search?: string; provider?: string; date_from?: string; date_to?: string; skip?: number }) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const result = await listAdminUsers(token, {
          search: opts?.search,
          provider: opts?.provider,
          date_from: opts?.date_from,
          date_to: opts?.date_to,
          skip: opts?.skip ?? 0,
          limit: PAGE_SIZE,
        });
        setUsers(result.users);
        setTotal(result.total);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (authLoading || !token) return;
    fetchUsers({ skip: 0 });
  }, [authLoading, token, fetchUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    fetchUsers({
      search: searchTerm || undefined,
      provider,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      skip: 0,
    });
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchUsers({
      search: searchTerm || undefined,
      provider,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      skip: newPage * PAGE_SIZE,
    });
  };

  const handleUserUpdate = (updated: AdminUserOut) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  };

  const handleUserDelete = (id: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== id));
    setTotal((prev) => prev - 1);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
      <h1 className="text-2xl font-bold mb-5 flex items-center gap-2" style={{ fontFamily: "'Paperlogic'", fontWeight: 600 }}><Users size={24} />회원 관리</h1>

      {/* 검색 & 필터 */}
      <div className="bg-[#EBF7FF]/50 border border-[#E0F4FF] rounded-xl p-2 mb-3 space-y-3">
        <form onSubmit={handleSearch} className="flex gap-1">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="이름, 이메일, 아이디로 검색"
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-[#C5E5FA] 
              bg-[#FAFAFA]/80 focus:outline-none focus:ring-2 focus:ring-[#EBF7FF] text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilter((v) => !v)}
            className={`px-3 py-1 rounded-xl text-sm transition-colors flex items-center gap-1.5 
              ${showFilter ? "bg-[#E0F4FF] text-primary-foreground" 
                : "hover:bg-[#E0F4FF]/70 text-muted-foreground"}`}
          >
            필터
          </button>
          <button
            type="submit"
            className="px-3 py-1 text-sm bg-[#E0F4FF] rounded-xl text-primary-foreground"
          >
            검색
          </button>
        </form>

        {showFilter && (
          <div className="flex flex-wrap gap-3 pt-1">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">가입 수단</span>
              <ProviderDropdown
                value={provider}
                onChange={setProvider}
                options={PROVIDER_OPTIONS}
                maxWidth={103}
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">가입일</span>
              <DatePickerButton value={dateFrom} onChange={setDateFrom} placeholder="시작일" />
              <span className="text-xs text-muted-foreground">~</span>
              <DatePickerButton value={dateTo} onChange={setDateTo} placeholder="종료일" />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      {/* 테이블 */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="px-6 py-12 text-center text-muted-foreground text-base">불러오는 중</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-bold text-muted-foreground uppercase">이름</th>
                  <th className="px-5 py-3 text-left text-xs font-bold text-muted-foreground uppercase">이메일</th>
                  <th className="px-5 py-3 text-left text-xs font-bold text-muted-foreground uppercase">가입일</th>
                  <th className="px-5 py-3 text-left text-xs font-bold text-muted-foreground uppercase">가입 수단</th>
                  <th className="px-5 py-3 text-left text-xs font-bold text-muted-foreground uppercase">구분</th>
                  <th className="px-5 py-3 text-left text-xs font-bold text-muted-foreground uppercase">상태</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground text-sm">
                      회원이 없습니다.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr
                      key={u.id}
                      onClick={() => setDetailUserId(u.id)}
                      className="hover:bg-muted/30 transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-4 text-sm font-medium">{u.name}</td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">{u.email}</td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">{formatDate(u.created_at)}</td>
                      <td className="px-5 py-4 text-sm">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${PROVIDER_COLORS[u.auth_provider] ?? "bg-muted"}`}>
                          {PROVIDER_LABELS[u.auth_provider] ?? u.auth_provider}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm">
                        {u.is_admin ? (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20">관리자</span>
                        ) : (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-500/10 text-gray-500 border border-gray-500/20">일반회원</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {u.is_active ? (
                          <span className="px-2 py-1 rounded-full text-xs font-medium border bg-green-500/10 text-green-500 border-green-500/20">활성</span>
                        ) : (
                          <span className="px-2 py-1 rounded-full text-xs font-medium border bg-red-500/10 text-red-500 border-red-500/20">정지</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <ChevronRight size={16} className="text-muted-foreground" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 페이지네이션 */}
      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>총 {total.toLocaleString()}명의 회원</span>
        {totalPages > 1 && (
          <div className="flex gap-1">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 0}
              className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors text-xs"
            >
              이전
            </button>
            <span className="px-3 py-1.5 text-xs">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors text-xs"
            >
              다음
            </button>
          </div>
        )}
      </div>

      {/* 상세 패널 */}
      {detailUserId && token && user && (
        <DetailPanel
          userId={detailUserId}
          token={token}
          onClose={() => setDetailUserId(null)}
          onUpdate={handleUserUpdate}
          onDelete={handleUserDelete}
          currentAdminId={user.id}
        />
      )}
    </div>
  );
}
