import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Capacitor } from "@capacitor/core";
import { useApp } from "../context/AppContext";
import kakaoLoginIcon from "../asset/kakao_login_circle.webp";
import naverLoginIcon from "../asset/NAVER_login_Light_KR_green_icon_H56.webp";
import {
  Bell, Shield, Trash2, ChevronRight,
  Lock, User, FileText, Baby, AlertTriangle, Edit3, Check, X,
  Smartphone, HelpCircle, Link2, Monitor, Tablet, Settings as SettingsIcon,
  Eye, EyeOff, LogOut
} from "lucide-react";
import { apiFetch } from "../api/client";
import {
  changePasswordApi,
  deleteAccountApi,
  listLoginDevicesApi,
  updateMeApi,
  type LoginDevice,
} from "../api/auth";
import {
  disconnectSocialAccount,
  listSocialAccounts,
  startSocialConnect,
  type SocialAccount,
  type SocialProvider,
} from "../api/socialAccounts";
import { dedupeRequest, readSessionCache, writeSessionCache } from "../utils/sessionCache";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";

// ─── Constants ────────────────────────────────────────────────────────────────

const SOCIAL_PROVIDERS: SocialProvider[] = ["google", "naver", "kakao"];
const PROVIDER_LABELS: Record<SocialProvider, string> = {
  google: "Google",
  naver: "Naver",
  kakao: "Kakao",
};
const PROVIDER_ACTIVE_STYLES: Record<SocialProvider, string> = {
  google: "border-blue-500/30 bg-blue-500/10",
  naver: "border-green-500/30 bg-green-500/10",
  kakao: "border-yellow-400/40 bg-yellow-400/10",
};
const SOCIAL_ERROR_MESSAGES: Record<string, string> = {
  invalid_state: "소셜 연결 요청이 만료되었습니다. 다시 시도해 주세요.",
  invalid_user: "연결할 계정을 찾을 수 없습니다. 다시 로그인해주세요.",
  inactive_user: "정지된 계정에는 소셜 계정을 연결할 수 없습니다.",
  already_linked: "이미 다른 맘마케어 계정에 연결된 소셜 계정입니다.",
  provider_already_connected: "이미 연결된 소셜 서비스입니다.",
  connect_failed: "소셜 계정 연결에 실패했습니다. 다시 시도해 주세요.",
};
const SOCIAL_ACCOUNTS_CACHE_TTL_MS = 5 * 60 * 1000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function socialAccountsCacheKey(userId: string): string {
  return `mammacare:settings:social-accounts:${userId}`;
}

function sanitizeAddress(address: string | null | undefined): string {
  return (address ?? "").replace(/^\s*(?:[\(\[]?\d{5}[\)\]]?)\s+/, "").trim();
}

function formatLoginDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function DeviceIcon({ type }: { type: LoginDevice["device_type"] }) {
  const className = "text-muted-foreground";
  if (type === "phone") return <Smartphone size={22} className={className} />;
  if (type === "tablet") return <Tablet size={22} className={className} />;
  return <Monitor size={22} className={className} />;
}

// ─── Provider Icon ────────────────────────────────────────────────────────────

function ProviderIcon({ provider, size = 36 }: { provider: SocialProvider; size?: number }) {
  if (provider === "kakao") {
    return (
      <img
        src={kakaoLoginIcon}
        alt="카카오"
        style={{ width: size, height: size }}
        className="object-contain rounded-full shrink-0"
      />
    );
  }
  if (provider === "naver") {
    return (
      <img
        src={naverLoginIcon}
        alt="네이버"
        style={{ width: size, height: size }}
        className="object-contain rounded-full shrink-0"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="flex items-center justify-center rounded-full border border-gray-200 bg-white shrink-0"
    >
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ width: size * 0.58, height: size * 0.58, display: "block" }}>
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        <path fill="none" d="M0 0h48v48H0z" />
      </svg>
    </div>
  );
}

// ─── Account Info Modal ───────────────────────────────────────────────────────

function Field({
  label,
  value,
  type = "text",
  isEditing,
  onChange,
  errorMsg,
}: {
  label: string;
  value: string;
  type?: string;
  isEditing: boolean;
  onChange: (v: string) => void;
  errorMsg?: string;
}) {
  return (
    <div className="py-3">
      <div className="text-sm font-normal mb-1">{label}</div>
      {isEditing ? (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full px-3 py-2 rounded-xl text-base font-normal
          border bg-warm-surface/80 focus:outline-none focus:ring-2 ${
            errorMsg
              ? "border-destructive focus:ring-destructive/20"
              : "border-sage-100 focus:ring-sage-50"
          }`}
        />
      ) : (
        <div className="text-base font-medium text-foreground">
          {value || <span className="text-muted-foreground">—</span>}
        </div>
      )}
      {errorMsg && <p className="mt-1 text-xs text-destructive">{errorMsg}</p>}
    </div>
  );
}

function StaticField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="py-3">
      <div className="text-sm font-normal mb-1">{label}</div>
      <div className="text-base font-medium text-foreground">
        {value || <span className="text-muted-foreground">—</span>}
      </div>
    </div>
  );
}

function AccountInfoModal({ onClose }: { onClose: () => void }) {
  useBodyScrollLock();
  const { user, token, set_user } = useApp();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({
    nickname: user?.nickname ?? "",
    name: user?.name ?? "",
    phone: user?.phone ?? "",
    email: user?.email ?? "",
    address: sanitizeAddress(user?.address),
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nicknameError, setNicknameError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!token) {
      setError("로그인이 필요합니다.");
      return;
    }
    setSaving(true);
    setError(null);
    setNicknameError(null);
    setMessage(null);
    try {
      const updated = await updateMeApi(token, {
        nickname: form.nickname,
        name: form.name,
        phone: form.phone || null,
        email: form.email,
        address: sanitizeAddress(form.address) || null,
      });
      const nextUser = {
        id: updated.id,
        name: updated.name,
        nickname: updated.nickname,
        email: updated.email,
        username: updated.username,
        phone: updated.phone,
        address: updated.address,
        auth_provider: updated.auth_provider,
        isAdmin: updated.is_admin ?? false,
      };
      set_user(nextUser);
      localStorage.setItem("mammacare_cached_user", JSON.stringify(nextUser));
      setForm({
        nickname: updated.nickname,
        name: updated.name,
        phone: updated.phone ?? "",
        email: updated.email,
        address: sanitizeAddress(updated.address),
      });
      setIsEditing(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "계정 정보 저장에 실패했습니다.";
      if (msg.includes("닉네임")) {
        setNicknameError(msg);
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm({
      nickname: user?.nickname ?? "",
      name: user?.name ?? "",
      phone: user?.phone ?? "",
      email: user?.email ?? "",
      address: sanitizeAddress(user?.address),
    });
    setError(null);
    setNicknameError(null);
    setMessage(null);
    setIsEditing(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center pt-16 px-4">
      <div className="bg-card rounded-3xl w-full max-w-xl shadow-2xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4">
          <h2 className="font-bold text-lg text-foreground">
            계정 정보
          </h2>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.name.trim() || !form.email.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold bg-sage-150
                  text-primary-foreground rounded-full hover:opacity-80 transition-opacity
                  disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check size={13} /> {saving ? "저장 중" : "저장"}
                </button>
                <button onClick={handleCancel} disabled={saving}
                className="p-1.5 rounded-full hover:bg-muted disabled:opacity-50">
                  <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold border border-border
                  rounded-full hover:bg-sage-150 transition-colors"
                >
                  <Edit3 size={13} /> 수정
                </button>
                <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted">
                  <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="px-6 py-2">
          <div className="grid grid-cols-2 gap-x-6">
            <Field label="닉네임" value={form.nickname} isEditing={isEditing} errorMsg={nicknameError ?? undefined} onChange={(v) => { setNicknameError(null); setForm((f) => ({ ...f, nickname: v })); }} />
            <StaticField label="아이디" value={user?.username} />
          </div>
          <div className="border-t border-border/60 my-1" />
          <div className="grid grid-cols-2 gap-x-6">
            <Field label="이름" value={form.name} isEditing={isEditing} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
            <Field label="연락처" value={form.phone} isEditing={isEditing} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
          </div>
          <Field label="이메일" value={form.email} type="email" isEditing={isEditing} onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
          <Field label="주소" value={form.address} isEditing={isEditing} onChange={(v) => setForm((f) => ({ ...f, address: v }))} />
        </div>

        {(error || message) && (
          <div className={`px-6 pb-2 text-sm ${error ? "text-destructive" : "text-foreground"}`}>
            {error ?? message}
          </div>
        )}

        <div className="px-6 py-4">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-full text-primary-foreground text-base font-bold 
                bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--safe-bg)_50%,var(--sage-150)_100%)] 
                hover:bg-[radial-gradient(ellipse_at_center,var(--safe-bg)_0%,var(--safe-bg)_100%)] transition-opacity disabled:opacity-40"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Social Connect Modal ─────────────────────────────────────────────────────

function SocialConnectModal({
  accounts,
  actionProvider,
  socialLoading,
  onClose,
  onConnect,
  onDisconnect,
}: {
  accounts: SocialAccount[];
  actionProvider: SocialProvider | null;
  socialLoading: boolean;
  onClose: () => void;
  onConnect: (provider: SocialProvider) => void;
  onDisconnect: (provider: SocialProvider) => void;
}) {
  useBodyScrollLock();
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center pt-16 px-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-3xl w-full max-w-lg shadow-2xl border border-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5">
          <div>
            <h2 className="font-bold text-lg text-foreground">
              소셜 계정 연동하기
            </h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              연결한 소셜 계정으로도 로그인할 수 있어요.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted shrink-0">
            <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-5 pb-4 space-y-3">
          {SOCIAL_PROVIDERS.map((provider) => {
            const account = accounts.find((item) => item.provider === provider);
            const isConnected = Boolean(account);
            const isBusy = actionProvider === provider;
            return (
              <div
                key={provider}
                className={`rounded-full px-4 py-4 transition-all ${
                  isConnected
                    ? "border-border bg-muted/40 opacity-80"
                    : PROVIDER_ACTIVE_STYLES[provider]
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <ProviderIcon provider={provider} size={38} />
                    <p className="text-sm text-foreground font-medium">
                      {isConnected
                        ? `현재 ${PROVIDER_LABELS[provider]} 계정이 연결되어 있어요.`
                        : `${PROVIDER_LABELS[provider]} 계정으로 간편하게 로그인할 수 있어요.`}
                    </p>
                  </div>
                  {isConnected ? (
                    <button
                      type="button"
                      onClick={() => onDisconnect(provider)}
                      disabled={isBusy}
                      className="shrink-0 px-4 py-2.5 rounded-3xl text-sm font-semibold transition-opacity bg-card 
                      text-primary-foreground hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isBusy ? "해제 중" : "해제하기"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onConnect(provider)}
                      disabled={isBusy || socialLoading}
                      className="shrink-0 px-4 py-2.5 rounded-3xl text-sm font-semibold transition-opacity bg-card 
                      text-primary-foreground hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isBusy ? "연결 중" : "연결하기"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}

// ─── Password Change Modal ────────────────────────────────────────────────────

function PasswordField({
  label,
  value,
  onChange,
  visible,
  onToggle,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  visible: boolean;
  onToggle: () => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-sm font-normal mb-1 block">{label}</label>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 pr-10 rounded-xl text-base font-normal
          border border-sage-100 bg-warm-surface/80 focus:outline-none focus:ring-2 focus:ring-sage-50"
        />
        <button
          type="button"
          onClick={onToggle}
          tabIndex={-1}
          aria-label={visible ? "비밀번호 숨기기" : "비밀번호 표시"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground 
          hover:text-foreground transition-colors"
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}

function PasswordChangeModal({ onClose }: { onClose: () => void }) {
  useBodyScrollLock();
  const { token } = useApp();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    setMessage(null);
    if (!token) {
      setError("로그인이 필요합니다.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("새 비밀번호가 일치하지 않습니다.");
      return;
    }
    setSaving(true);
    try {
      const result = await changePasswordApi(token, {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "비밀번호 변경에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center pt-16 px-4">
      <div className="bg-card rounded-3xl w-full max-w-md shadow-2xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4">
          <h2 className="font-bold text-lg text-foreground">
            비밀번호 변경
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted">
            <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <PasswordField
            label="현재 비밀번호"
            value={currentPassword}
            onChange={setCurrentPassword}
            visible={showCurrent}
            onToggle={() => setShowCurrent((v) => !v)}
          />
          <PasswordField
            label="새 비밀번호"
            value={newPassword}
            onChange={setNewPassword}
            visible={showNew}
            onToggle={() => setShowNew((v) => !v)}
            placeholder="영문 + 숫자 조합 8자 이상"
          />
          <PasswordField
            label="새 비밀번호 확인"
            value={confirmPassword}
            onChange={setConfirmPassword}
            visible={showConfirm}
            onToggle={() => setShowConfirm((v) => !v)}
            placeholder="비밀번호를 다시 입력하세요"
          />
        </div>

        {(error || message) && (
          <div className={`px-6 -mt-2 text-sm ${error ? "text-destructive" : "text-foreground"}`}>
            {error ?? message}
          </div>
        )}

        <div className="px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-3 rounded-full border border-border text-sm 
              font-semibold hover:bg-[radial-gradient(ellipse_at_center,var(--safe-bg)_0%,var(--safe-bg)_100%)] transition-colors"
          >
            닫기
          </button>
          <button
            onClick={handleSave}
            disabled={!currentPassword || !newPassword || !confirmPassword || saving}
            className="flex-1 py-3 rounded-full text-primary-foreground text-sm font-bold 
                bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--safe-bg)_50%,var(--sage-150)_100%)] 
                hover:bg-[radial-gradient(ellipse_at_center,var(--safe-bg)_0%,var(--safe-bg)_100%)] transition-opacity disabled:opacity-40"
          >
            {saving ? "변경 중" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Device Management Modal ──────────────────────────────────────────────────

function DeviceManagementModal({ onClose }: { onClose: () => void }) {
  useBodyScrollLock();
  const { token } = useApp();
  const [devices, setDevices] = useState<LoginDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("로그인이 필요합니다.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    listLoginDevicesApi(token)
      .then(setDevices)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "연결된 기기 목록을 불러오지 못했습니다.");
      })
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center pt-16 sm:pt-24 px-4">
      <div className="bg-card rounded-3xl w-full max-w-lg shadow-2xl border border-border overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-border">
          <div>
            <h2 className="font-bold text-lg text-foreground">
              연결된 기기 관리
            </h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              최근 로그인한 브라우저와 기기 기록을 확인할 수 있어요.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted shrink-0">
            <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-5 py-5">
          {loading ? (
            <div className="rounded-2xl border border-border bg-muted/30 px-4 py-5 text-sm text-muted-foreground">
              기기 목록을 불러오는 중입니다.
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-5 text-sm text-destructive">
              {error}
            </div>
          ) : devices.length === 0 ? (
            <div className="rounded-2xl border border-border bg-muted/30 px-4 py-5 text-sm text-muted-foreground">
              이 계정에 저장된 로그인 기기 기록이 아직 없습니다.
            </div>
          ) : (
            <div className="space-y-3">
              {devices.map((device) => (
                <div
                  key={device.id}
                  className="flex items-start gap-4 rounded-2xl border border-border bg-muted/30 px-4 py-4"
                >
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card border border-border">
                    <DeviceIcon type={device.device_type} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-sm text-foreground truncate">
                        {device.device_name}
                      </p>
                      {device.is_current && (
                        <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-foreground">
                          현재 기기
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      마지막 접속: {formatLoginDate(device.last_login_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Settings() {
  const isApp = Capacitor.isNativePlatform();
  const { user, activeBaby, babies, deleteBaby, token, set_user, logout } = useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [notifyAllergyCheck, setNotifyAllergyCheck] = useState(user?.notify_allergy_check ?? true);

  const toggleNotification = async (
    key: "notify_allergy_check",
    setter: (v: boolean) => void,
    current: boolean,
  ) => {
    if (!token) return;
    const next = !current;
    setter(next);
    try {
      const updated = await updateMeApi(token, { [key]: next });
      set_user({
        id: updated.id,
        name: updated.name,
        nickname: updated.nickname,
        email: updated.email,
        username: updated.username,
        phone: updated.phone,
        address: updated.address,
        auth_provider: updated.auth_provider,
        isAdmin: updated.is_admin ?? false,
        notify_meal_time: updated.notify_meal_time,
        notify_allergy_check: updated.notify_allergy_check,
        notify_community: updated.notify_community,
      });
    } catch {
      setter(current);
    }
  };
  const cachedSocialAccounts = user
    ? readSessionCache<SocialAccount[]>(socialAccountsCacheKey(user.id))
    : null;
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [showAccountInfo, setShowAccountInfo] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [showDeviceManagement, setShowDeviceManagement] = useState(false);
  const [showSocialConnect, setShowSocialConnect] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactForm, setContactForm] = useState({ email: "", subject: "", content: "" });
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>(cachedSocialAccounts ?? []);
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialActionProvider, setSocialActionProvider] = useState<SocialProvider | null>(null);
  const [socialMessage, setSocialMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadSocialAccounts = useCallback(async () => {
    if (!token || !user) return;
    const cacheKey = socialAccountsCacheKey(user.id);
    const cached = readSessionCache<SocialAccount[]>(cacheKey);
    if (cached) setSocialAccounts(cached);
    setSocialLoading(!cached);
    try {
      const data = await dedupeRequest(cacheKey, () => listSocialAccounts(token));
      setSocialAccounts(data.connected);
      writeSessionCache(cacheKey, data.connected, SOCIAL_ACCOUNTS_CACHE_TTL_MS);
    } catch (e: unknown) {
      setSocialMessage({
        type: "error",
        text: e instanceof Error ? e.message : "연결된 소셜 계정을 불러오지 못했습니다.",
      });
    } finally {
      setSocialLoading(false);
    }
  }, [token, user]);

  useEffect(() => {
    loadSocialAccounts();
  }, [loadSocialAccounts]);

  useEffect(() => {
    const connected = searchParams.get("social_connected") as SocialProvider | null;
    const error = searchParams.get("social_error");
    if (connected && SOCIAL_PROVIDERS.includes(connected)) {
      setSocialMessage({
        type: "success",
        text: `${PROVIDER_LABELS[connected]} 계정이 연결되었습니다.`,
      });
      loadSocialAccounts();
    } else if (error) {
      setSocialMessage({
        type: "error",
        text: SOCIAL_ERROR_MESSAGES[error] ?? SOCIAL_ERROR_MESSAGES.connect_failed,
      });
    }
    if (connected || error) {
      const next = new URLSearchParams(searchParams);
      next.delete("social_connected");
      next.delete("social_error");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSocialConnect = async (provider: SocialProvider) => {
    if (!token) {
      setSocialMessage({ type: "error", text: "로그인이 필요합니다." });
      return;
    }
    setSocialActionProvider(provider);
    setSocialMessage(null);
    try {
      const authorizeUrl = await startSocialConnect(token, provider);
      window.location.href = authorizeUrl;
    } catch (e: unknown) {
      setSocialMessage({
        type: "error",
        text: e instanceof Error ? e.message : "소셜 연결을 시작하지 못했습니다.",
      });
      setSocialActionProvider(null);
    }
  };

  const handleSocialDisconnect = async (provider: SocialProvider) => {
    if (!token) {
      setSocialMessage({ type: "error", text: "로그인이 필요합니다." });
      return;
    }
    const label = PROVIDER_LABELS[provider];
    const confirmed = window.confirm(
      `${label} 연결을 해제할까요?\n해제하면 ${label}로는 로그인할 수 없어요.`,
    );
    if (!confirmed) return;

    setSocialActionProvider(provider);
    setSocialMessage(null);
    try {
      await disconnectSocialAccount(token, provider);
      await loadSocialAccounts();
      setSocialMessage({
        type: "success",
        text: `${label} 연결이 해제되었습니다.`,
      });
    } catch (e: unknown) {
      const code = e instanceof Error && "code" in e
        ? (e as { code?: string }).code
        : undefined;
      setSocialMessage({
        type: "error",
        text: code === "LAST_LOGIN_METHOD"
          ? "마지막 로그인 수단은 해제할 수 없습니다. 다른 소셜 계정을 먼저 연결해 주세요."
          : e instanceof Error
            ? e.message
            : "연결 해제에 실패했습니다. 다시 시도해 주세요.",
      });
    } finally {
      setSocialActionProvider(null);
    }
  };

  const handleDeleteProfile = () => {
    if (!activeBaby) return;
    const remaining = babies.length - 1;
    deleteBaby(activeBaby.id);
    setShowDeleteConfirm(false);
    if (remaining === 0) navigate("/profile");
    else if (remaining === 1) navigate("/");
    else navigate("/profile-select");
  };

  const handleWithdraw = async () => {
    if (!token) return;
    setWithdrawing(true);
    try {
      await deleteAccountApi(token);
      setShowWithdrawConfirm(false);
      logout();
      navigate("/");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "계정 탈퇴에 실패했습니다.");
    } finally {
      setWithdrawing(false);
    }
  };

  const handleContactSubmit = async () => {
    if (!token) return;
    setContactSubmitting(true);
    setContactError(null);
    try {
      await apiFetch("/inquiries", {
        method: "POST",
        body: JSON.stringify({
          email: contactForm.email,
          subject: contactForm.subject,
          content: contactForm.content,
        }),
      }, token);
      setContactForm({ email: "", subject: "", content: "" });
      setShowContactModal(false);
      alert("문의가 접수되었습니다. 빠른 시일 내에 답변 드리겠습니다.");
    } catch (e: unknown) {
      setContactError(e instanceof Error ? e.message : "문의 전송에 실패했습니다.");
    } finally {
      setContactSubmitting(false);
    }
  };

  const settingGroups = [
    {
      title: "알림 설정",
      items: [
        { icon: Bell, label: "알레르기 증상 체크 알림", sub: "새 식품 도입 후 알림", type: "toggle", value: notifyAllergyCheck, action: () => toggleNotification("notify_allergy_check", setNotifyAllergyCheck, notifyAllergyCheck) },
      ],
    },
    {
      title: "개인정보 및 보안",
      items: [
        { icon: User, label: "계정 정보", sub: "", type: "nav", action: () => setShowAccountInfo(true) },
        {
          icon: Link2,
          label: "소셜 계정 연동하기",
          sub: "",
          type: "nav",
          action: () => setShowSocialConnect(true),
          meta: `${socialAccounts.length}개 연결됨`,
        },
        { icon: Lock, label: "비밀번호 변경", sub: "", type: "nav", action: () => setShowPasswordChange(true) },
        { icon: Smartphone, label: "연결된 기기 관리", sub: "", type: "nav", action: () => setShowDeviceManagement(true) },
      ],
    },
    {
      title: "법적 고지",
      items: [
        { icon: Shield, label: "서비스 이용약관", sub: "", type: "nav", action: () => navigate("/terms") },
        { icon: Shield, label: "개인정보 처리방침", sub: "", type: "nav", action: () => navigate("/privacy") },
        { icon: FileText, label: "오픈소스 라이선스", sub: "", type: "nav", action: () => navigate("/licenses") },
      ],
    },
    {
      title: "고객센터",
      items: [
        { icon: HelpCircle, label: "문의하기", sub: "궁금한 점을 문의해주세요", type: "nav", action: () => setShowContactModal(true) },
      ],
    },
    {
      title: "계정",
      items: [
        ...(isApp ? [{
          icon: LogOut,
          label: "로그아웃",
          sub: "",
          type: "nav" as const,
          action: () => setShowLogoutConfirm(true),
        }] : []),
        ...(activeBaby ? [{
          icon: Baby,
          label: "프로필 삭제",
          sub: `${activeBaby.name} 프로필을 삭제합니다`,
          type: "danger" as const,
          action: () => setShowDeleteConfirm(true),
        }] : []),
        { icon: Trash2, 
          label: "계정 탈퇴", 
          sub: "모든 데이터가 삭제됩니다", 
          type: "danger" as const, 
          action: () => setShowWithdrawConfirm(true) 
        },
      ],
    },
  ];

  return (
    <div className={isApp ? "px-3 py-4" : "max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5"}>
      <h1 className="text-2xl font-bold mb-5 flex items-center gap-2" style={{ fontFamily: "'Paperlogic'", fontWeight: 600 }}>
        <SettingsIcon className="w-5 h-5 sm:w-6 sm:h-6" /> 설정
      </h1>


      {socialMessage && (
        <div className={`mb-4 rounded-3xl px-5 py-3 text-sm border ${
          socialMessage.type === "success"
            ? "text-green-700 bg-green-500/10 border-green-500/20"
            : "text-destructive bg-destructive/10 border-destructive/20"
        }`}>
          {socialMessage.text}
        </div>
      )}

      {/* Settings Groups */}
      <div className="space-y-4">
        {settingGroups.map((group) => (
          <div key={group.title} className="bg-card border border-border rounded-3xl overflow-hidden">
            <div className="px-6 py-2 border-b border-border">
              <span className="text-base font-semibold text-muted-foreground uppercase tracking-wide">{group.title}</span>
            </div>
            <div className="divide-y divide-border">
              {group.items.map((item, i) => (
                <div
                  key={i}
                  onClick={item.type !== "toggle" ? item.action : undefined}
                  className={`flex items-center justify-between px-6 py-4 ${
                    item.type !== "toggle" ? "cursor-pointer hover:bg-primary/5 transition-colors" : ""
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <item.icon size={20} className={item.type === "danger" ? "text-destructive" : "text-muted-foreground"} />
                    <div>
                      <div className={`font-medium ${item.type === "danger" ? "text-destructive" : ""}`}>
                        {item.label}
                      </div>
                      {item.sub && <div className="text-sm text-muted-foreground mt-0.5">{item.sub}</div>}
                    </div>
                  </div>
                  {item.type === "toggle" ? (
                    <button
                      onClick={item.action}
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none ${(item as { value?: boolean }).value ? "bg-primary" : "bg-muted"}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${(item as { value?: boolean }).value ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 shrink-0">
                      {"meta" in item && item.meta && (
                        <span className="text-sm font-medium text-muted-foreground">
                          {item.meta}
                        </span>
                      )}
                      <ChevronRight size={18} className="text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Account Info Modal */}
      {showAccountInfo && <AccountInfoModal onClose={() => setShowAccountInfo(false)} />}

      {/* Social Connect Modal */}
      {showSocialConnect && (
        <SocialConnectModal
          accounts={socialAccounts}
          actionProvider={socialActionProvider}
          socialLoading={socialLoading}
          onClose={() => setShowSocialConnect(false)}
          onConnect={handleSocialConnect}
          onDisconnect={handleSocialDisconnect}
        />
      )}

      {/* Password Change Modal */}
      {showPasswordChange && (
        <PasswordChangeModal onClose={() => setShowPasswordChange(false)} />
      )}

      {/* Device Management Modal */}
      {showDeviceManagement && (
        <DeviceManagementModal onClose={() => setShowDeviceManagement(false)} />
      )}

      {/* Contact Modal */}
      {showContactModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center pt-16 px-4">
          <div className="bg-card rounded-3xl w-full max-w-md shadow-2xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-bold text-lg text-foreground">
                문의하기
              </h2>
              <button onClick={() => setShowContactModal(false)} className="p-1.5 rounded-full hover:bg-muted">
                <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div>
                <label className={`text-sm block ${isApp ? "font-semibold mb-2" : "font-normal mb-1"}`}>이메일</label>
                <input
                  type="email"
                  value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                  placeholder="답변 받으실 이메일 주소"
                  className="w-full px-3 py-2 rounded-xl text-base font-normal
                  border border-sage-100 bg-warm-surface/80 focus:outline-none focus:ring-2 focus:ring-sage-50"
                />
              </div>
              <div>
                <label className={`text-sm block ${isApp ? "font-semibold mb-2" : "font-normal mb-1"}`}>제목</label>
                <input
                  type="text"
                  value={contactForm.subject}
                  onChange={(e) => setContactForm({ ...contactForm, subject: e.target.value })}
                  placeholder="문의 제목"
                  className="w-full px-3 py-2 rounded-xl text-base font-normal
                  border border-sage-100 bg-warm-surface/80 focus:outline-none focus:ring-2 focus:ring-sage-50"
                />
              </div>
              <div>
                <label className={`text-sm block ${isApp ? "font-semibold mb-2" : "font-normal mb-1"}`}>문의 내용</label>
                <textarea
                  value={contactForm.content}
                  onChange={(e) => setContactForm({ ...contactForm, content: e.target.value })}
                  placeholder="문의하실 내용을 입력해주세요"
                  className="w-full px-3 py-2 rounded-xl text-base font-normal resize-none
                  border border-sage-100 bg-warm-surface/80 focus:outline-none focus:ring-2 focus:ring-sage-50"
                  rows={3}
                />
              </div>
            </div>

            {contactError && (
              <div className="px-6 -mt-3 text-sm text-destructive">{contactError}</div>
            )}
            <div className="px-6 py-4 flex gap-3">
              <button
                onClick={() => { setShowContactModal(false); setContactError(null); }}
                disabled={contactSubmitting}
                className="flex-1 py-3 rounded-full border border-border text-sm 
                  font-semibold hover:bg-[radial-gradient(ellipse_at_center,var(--safe-bg)_0%,var(--safe-bg)_100%)] transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleContactSubmit}
                disabled={!contactForm.email || !contactForm.subject || !contactForm.content || contactSubmitting}
                className="flex-1 py-3 rounded-full text-primary-foreground text-sm font-bold 
                    bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--safe-bg)_50%,var(--sage-150)_100%)] 
                    hover:bg-[radial-gradient(ellipse_at_center,var(--safe-bg)_0%,var(--safe-bg)_100%)] transition-opacity disabled:opacity-40"
              >
                {contactSubmitting ? "전송 중" : "문의하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logout confirmation */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center pt-16 justify-center px-4">
          <div className="bg-card rounded-3xl w-full max-w-sm shadow-2xl border border-border p-6 text-center">
            <h2 className="text-xl font-bold text-foreground mb-6">
              로그아웃 하시겠습니까?
            </h2>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-3 rounded-full border border-border text-sm font-semibold
                hover:bg-muted transition-colors"
              >
                아니오
              </button>
              <button
                onClick={() => { logout(); navigate("/"); setShowLogoutConfirm(false); }}
                className="flex-1 py-3 rounded-full text-primary-foreground text-sm font-bold
                bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--safe-bg)_50%,var(--sage-150)_100%)]
                hover:bg-[radial-gradient(ellipse_at_center,var(--safe-bg)_0%,var(--safe-bg)_100%)] transition-opacity"
              >
                네
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center pt-16 justify-center px-4">
          <div className="bg-card rounded-3xl w-full max-w-sm shadow-2xl border border-border p-4 text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-5">
              <AlertTriangle className="text-destructive w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-3">
              프로필을 삭제할까요?
            </h2>
            <p className="text-base text-center text-muted-foreground leading-relaxed mb-5">
              삭제 후 복구가 불가능합니다. <br/>
              정말 삭제하시겠습니까?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-3 rounded-full border border-border text-sm font-semibold 
                hover:bg-[radial-gradient(ellipse_at_center,var(--terracotta-50)_0%,var(--terracotta-100)_100%)] transition-opacity"
              >
                취소
              </button>
              <button
                onClick={handleDeleteProfile}
                className="flex-1 py-3 rounded-full text-primary-foreground text-sm font-bold 
                bg-[radial-gradient(ellipse_at_center,var(--terracotta-100)_0%,var(--terracotta-150)_100%)] 
                hover:bg-[radial-gradient(ellipse_at_center,var(--terracotta-50)_0%,var(--terracotta-100)_100%)] transition-opacity disabled:opacity-40"
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Account withdraw confirmation */}
      {showWithdrawConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center pt-16 justify-center px-4">
          <div className="bg-card rounded-3xl w-full max-w-sm shadow-2xl border border-border p-4 text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-5">
              <AlertTriangle className="text-destructive w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-3">
              정말 탈퇴하시겠어요?
            </h2>
            <p className="text-base text-center text-muted-foreground leading-relaxed mb-5">
              탈퇴하면 모든 데이터가 삭제되며 <br/>
              복구할 수 없습니다.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowWithdrawConfirm(false)}
                disabled={withdrawing}
                className="flex-1 py-3 rounded-full border border-border text-sm font-semibold
                hover:bg-[radial-gradient(ellipse_at_center,var(--terracotta-50)_0%,var(--terracotta-100)_100%)] transition-opacity disabled:opacity-40"
              >
                취소
              </button>
              <button
                onClick={handleWithdraw}
                disabled={withdrawing}
                className="flex-1 py-3 rounded-full text-primary-foreground text-sm font-bold
                bg-[radial-gradient(ellipse_at_center,var(--terracotta-100)_0%,var(--terracotta-150)_100%)]
                hover:bg-[radial-gradient(ellipse_at_center,var(--terracotta-50)_0%,var(--terracotta-100)_100%)] transition-opacity disabled:opacity-40"
              >
                {withdrawing ? "탈퇴 중" : "탈퇴하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer — 설정 페이지 전용 */}
      {isApp && (
        <footer className="mt-4 mb-1 py-2 border-t border-border text-center space-y-1">
          <p className="text-sm font-bold text-foreground" style={{ fontFamily: "'Paperlogic'" }}>맘마케어</p>
          <p className="text-xs text-muted-foreground">© 2025 MammaCare. All rights reserved.</p>
          <p className="text-xs text-muted-foreground">버전 1.0.0</p>
        </footer>
      )}
    </div>
  );
}
