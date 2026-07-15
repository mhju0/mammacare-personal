import { useState, useEffect, useCallback } from "react";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { useNavigate } from "react-router";
import { useApp } from "../../context/AppContext";
import {
  Shield, RefreshCw, UserCheck, UserX, ChevronDown, ChevronUp, X,
} from "lucide-react";
import {
  grantAdmin,
  revokeAdmin,
  listAdminUsers,
  type AdminUserOut,
} from "../../api/admin";

// ── 확인 모달 ─────────────────────────────────────────────────

function ConfirmModal({
  title,
  description,
  confirmLabel,
  confirmClass,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  confirmClass: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useBodyScrollLock();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-background border border-border rounded-3xl p-6 w-full max-w-sm shadow-2xl">
        <button onClick={onCancel} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-muted">
          <X size={16} />
        </button>
        <h3 className="font-bold text-lg mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground mb-5">{description}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-3xl text-sm transition-colors ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 ─────────────────────────────────────────────────────

export default function AdminPermissions() {
  const { user, token, authLoading } = useApp();
  const navigate = useNavigate();

  const [adminList, setAdminList] = useState<AdminUserOut[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<AdminUserOut[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [modal, setModal] = useState<{ user: AdminUserOut; action: "grant" | "revoke" } | null>(null);
  const [acting, setActing] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user?.isAdmin) navigate("/login");
  }, [authLoading, user, navigate]);

  const fetchAdmins = useCallback(async () => {
    if (!token) return;
    setAdminLoading(true);
    try {
      const data = await listAdminUsers(token, { provider: "all", limit: 100 });
      setAdminList(data.users.filter((u) => u.is_admin));
    } catch {
      // 조용히 실패
    } finally {
      setAdminLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchAdmins(); }, [fetchAdmins]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !search.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const data = await listAdminUsers(token, { search: search.trim(), limit: 10 });
      setSearchResults(data.users.filter((u) => !u.is_admin));
    } catch (e: unknown) {
      setSearchError(e instanceof Error ? e.message : "검색 중 오류가 발생했습니다.");
    } finally {
      setSearching(false);
    }
  };

  const handleAction = async () => {
    if (!modal || !token) return;
    setActing(true);
    try {
      if (modal.action === "grant") {
        await grantAdmin(token, modal.user.id);
        setSuccessMsg(`${modal.user.name}님에게 관리자 권한이 부여되었습니다.`);
        setSearchResults((prev) => prev.filter((u) => u.id !== modal.user.id));
      } else {
        await revokeAdmin(token, modal.user.id);
        setSuccessMsg(`${modal.user.name}님의 관리자 권한이 해제되었습니다.`);
      }
      await fetchAdmins();
      setModal(null);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setActing(false);
    }
  };

  if (!token || !user) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
      <h1 className="text-2xl font-bold mb-5 flex items-center gap-2" style={{ fontFamily: "'Paperlogic'", fontWeight: 600 }}><Shield size={24} />보안 &amp; 권한</h1>

      {successMsg && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-green-500/10 text-green-600 text-sm flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)}><X size={14} /></button>
        </div>
      )}

      {/* 현재 관리자 목록 */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden mb-4">
        <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
          <h2 className="font-bold">현재 관리자 목록</h2>
          <button onClick={fetchAdmins} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
            <RefreshCw size={14} className="text-muted-foreground" />
          </button>
        </div>

        {adminLoading ? (
          <div className="px-6 py-10 text-center text-base text-muted-foreground">불러오는 중</div>
        ) : adminList.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">관리자가 없습니다.</div>
        ) : (
          <div className="divide-y divide-border">
            {adminList.map((u) => (
              <div key={u.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{u.name}</span>
                    <span className="px-1.5 py-0.5 rounded-full text-xs bg-amber-500/10 text-amber-600 border border-amber-500/20">관리자</span>
                    {u.id === user.id && (
                      <span className="px-1.5 py-0.5 rounded-full text-xs bg-primary/10 text-primary-foreground border border-primary/20">나</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{u.email}</div>
                </div>
                {u.id !== user.id && (
                  <button
                    onClick={() => setModal({ user: u, action: "revoke" })}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/10 text-orange-600 text-xs font-medium hover:bg-orange-500/20 transition-colors"
                  >
                    <UserX size={13} /> 권한 해제
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 권한 부여 */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowSearch((v) => !v)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2 font-bold">
            <UserCheck size={16} className="text-primary-foreground" />
            관리자 권한 부여
          </div>
          {showSearch ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
        </button>

        {showSearch && (
          <div className="px-6 pb-5 border-t border-border pt-4 space-y-3">
            <p className="text-sm text-muted-foreground">일반 회원을 검색해 관리자 권한을 부여합니다.</p>
            <form onSubmit={handleSearch} className="flex gap-3">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="이름, 이메일, 아이디 검색"
                className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-muted focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
              <button
                type="submit"
                disabled={searching}
                className="px-4 py-2.5 rounded-xl bg-[radial-gradient(ellipse_at_center,var(--warm-surface)_0%,var(--warm-surface-soft)_50%,var(--secondary)_100%)] text-primary-foreground border border-primary/50 shadow-sm text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                검색
              </button>
            </form>

            {searchError && (
              <div className="px-4 py-3 rounded-xl bg-destructive/10 text-destructive text-sm">{searchError}</div>
            )}

            {searchResults.length > 0 && (
              <div className="bg-background border border-border rounded-xl divide-y divide-border">
                {searchResults.map((u) => (
                  <div key={u.id} className="px-5 py-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{u.name}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </div>
                    <button
                      onClick={() => setModal({ user: u, action: "grant" })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--sage-100)_100%)] text-blue-600 text-xs font-medium hover:bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--sage-200)_100%)] transition-colors"
                    >
                      <UserCheck size={13} /> 권한 부여
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!searching && search && searchResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">검색 결과가 없습니다.</p>
            )}
          </div>
        )}
      </div>

      {modal && (
        <ConfirmModal
          title={modal.action === "grant" ? "관리자 권한 부여" : "관리자 권한 해제"}
          description={
            modal.action === "grant"
              ? `${modal.user.name}(${modal.user.email})님에게 관리자 권한을 부여합니다.`
              : `${modal.user.name}(${modal.user.email})님의 관리자 권한을 해제합니다.`
          }
          confirmLabel={acting ? "처리 중" : modal.action === "grant" ? "권한 부여" : "권한 해제"}
          confirmClass={
            modal.action === "grant"
              ? "text-primary-foreground font-bold bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--sage-100)_100%)] hover:bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--sage-200)_100%)] shadow-sm transition-all duration-300"
              : "bg-orange-500 text-white hover:bg-orange-600"
          }
          onConfirm={handleAction}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  );
}
