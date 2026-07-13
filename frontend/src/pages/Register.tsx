import { useState } from "react";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useNavigate } from "react-router";
import { useApp } from "../context/AppContext";
import { checkEmailApi, checkNicknameApi, checkUsernameApi } from "../api/auth";
import { Eye, EyeOff, CheckCircle, XCircle, ChevronLeft, ChevronDown } from "lucide-react";
import { BabyInfoForm, DEFAULT_BABY_FORM } from "../components/BabyInfoForm";
import type { BabyProfile } from "../types";
import { motion } from "framer-motion";
import logoImage from "../asset/mamma_6.webp";

const EMAIL_DOMAIN_OPTIONS = [
  "gmail.com",
  "naver.com",
  "kakao.com",
  "daum.net",
  "hanmail.net",
  "outlook.com",
];
const EMAIL_REQUIRED_MESSAGE = "이메일을 입력해주세요.";
const EMAIL_FORMAT_MESSAGE = "올바른 이메일 형식으로 입력해주세요.";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function buildEmail(local: string, domain: string) {
  return normalizeEmail(`${local.trim()}@${domain.trim()}`);
}

function splitEmail(value: string): [string, string] {
  const normalized = normalizeEmail(value);
  const atIndex = normalized.indexOf("@");
  if (atIndex <= 0 || atIndex !== normalized.lastIndexOf("@")) return ["", ""];
  return [normalized.slice(0, atIndex), normalized.slice(atIndex + 1)];
}

function isValidEmailFormat(value: string) {
  const normalized = normalizeEmail(value);
  if (!normalized || /\s/.test(normalized)) return false;

  const parts = normalized.split("@");
  if (parts.length !== 2) return false;

  const [local, domain] = parts;
  if (!local || !domain || !domain.includes(".")) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;

  const labels = domain.split(".");
  if (labels.length < 2) return false;
  if (
    labels.some(
      (label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
    )
  ) {
    return false;
  }

  return /^[a-z]{2,63}$/.test(labels[labels.length - 1]);
}

function getEmailValidationMessage(local: string, domain: string) {
  if (!local.trim() || !domain.trim()) return EMAIL_REQUIRED_MESSAGE;
  if (!isValidEmailFormat(buildEmail(local, domain))) return EMAIL_FORMAT_MESSAGE;
  return "";
}

function getSocialSignupParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  const raw = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.search.slice(1);
  return new URLSearchParams(raw);
}

function isPasswordValid(pw: string) {
  return (
    /[a-zA-Z]/.test(pw) &&
    /[0-9]/.test(pw) &&
    pw.length >= 8 &&
    !/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(pw)
  );
}

type Tab = "parent" | "account" | "baby";

export default function Register() {
  const { registerAndLogin } = useApp();
  const navigate = useNavigate();
  const [socialSignupParams] = useState(getSocialSignupParams);
  const socialSignupToken = socialSignupParams.get("token") ?? "";
  const socialEmail = normalizeEmail(socialSignupParams.get("email") ?? "");
  const socialName = socialSignupParams.get("name") ?? "";
  const socialEmailParts = splitEmail(socialEmail);
  const socialEmailDomain = socialEmailParts[1] ?? "";

  const [activeTab, setActiveTab] = useState<Tab>("parent");

  // ── 부모님 정보 ──
  const [name, setName] = useState(socialName);
  const [phone, setPhone] = useState("");
  const [, setEmail] = useState(socialEmail);
  const [emailId, setEmailId] = useState(socialEmailParts[0] ?? "");
  const [emailDomain, setEmailDomain] = useState(socialEmailDomain);
  const [isCustomDomain, setIsCustomDomain] = useState(
    Boolean(socialEmailDomain && !EMAIL_DOMAIN_OPTIONS.includes(socialEmailDomain)),
  );
  const [domainOpen, setDomainOpen] = useState(false);
  const [emailError, setEmailError] = useState("");

  // ── 계정 정보 ──
  const [nickname, setNickname] = useState("");
  const [nicknameStatus, setNicknameStatus] = useState<null | "ok" | "taken">(null);
  const [userId, setUserId] = useState("");
  const [userIdStatus, setUserIdStatus] = useState<null | "ok" | "taken">(null);
  const [userIdFormatError, setUserIdFormatError] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPwConfirm, setShowPwConfirm] = useState(false);
  const [passwordConfirmError, setPasswordConfirmError] = useState("");
  const [signupError, setSignupError] = useState("");
  const [signupErrorCode, setSignupErrorCode] = useState("");

  // ── 유효성 검사 트리거 ──
  const [parentSubmitted, setParentSubmitted] = useState(false);
  const [accountSubmitted, setAccountSubmitted] = useState(false);

  // ── 성공 팝업 ──
  const [showSuccess, setShowSuccess] = useState(false);
  useBodyScrollLock(showSuccess);

  const validateEmail = async () => {
    const validationMessage = getEmailValidationMessage(emailId, emailDomain);
    if (validationMessage) {
      setEmailError(validationMessage);
      return false;
    }

    const normalizedEmail = buildEmail(emailId, emailDomain);
    setEmail(normalizedEmail);

    try {
      const available = await checkEmailApi(normalizedEmail);
      if (!available) {
        setEmailError("이미 사용 중인 이메일입니다.");
        return false;
      }
      setEmailError("");
      return true;
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "이메일 확인 중 오류가 발생했습니다.");
      return false;
    }
  };

  const handleEmailBlur = () => {
    void validateEmail();
  };

  const handleNicknameCheck = async () => {
    if (!nickname.trim()) return;
    const available = await checkNicknameApi(nickname);
    setNicknameStatus(available ? "ok" : "taken");
  };

  const handleUserIdCheck = async () => {
    if (!userId.trim()) return;
    if (!/^[a-z0-9]{4,16}$/.test(userId)) {
      setUserIdFormatError("영문 소문자와 숫자만 사용 가능하며 4~16자여야 합니다.");
      setUserIdStatus(null);
      return;
    }
    setUserIdFormatError("");
    const available = await checkUsernameApi(userId);
    setUserIdStatus(available ? "ok" : "taken");
  };

  const handlePasswordBlur = () => {
    if (password && !isPasswordValid(password)) {
      setPasswordError("영문 + 숫자를 조합하여 8자 이상 입력하세요");
    } else {
      setPasswordError("");
    }
  };

  const handlePasswordConfirmBlur = () => {
    if (passwordConfirm && password !== passwordConfirm) {
      setPasswordConfirmError("비밀번호를 다시 확인해주세요");
    } else {
      setPasswordConfirmError("");
    }
  };

  const handleEnglishKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    value: string,
    setValue: (next: string) => void,
    clearError: () => void,
  ) => {
    if (e.key !== "Process" && !e.nativeEvent.isComposing) return;

    const letterMatch = e.code.match(/^Key([A-Z])$/);
    const digitMatch = e.code.match(/^Digit([0-9])$/);
    if (!letterMatch && !digitMatch) return;

    e.preventDefault();
    const char = letterMatch
      ? e.shiftKey
        ? letterMatch[1]
        : letterMatch[1].toLowerCase()
      : digitMatch![1];
    const input = e.currentTarget;
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? value.length;
    setValue(value.slice(0, start) + char + value.slice(end));
    clearError();
    requestAnimationFrame(() => input.setSelectionRange(start + 1, start + 1));
  };

  const currentEmail = buildEmail(emailId, emailDomain);
  const isEmailValid = isValidEmailFormat(currentEmail) && !emailError;

  const canContinueToAccount =
    Boolean(name && phone && isEmailValid);

  const canContinueToBaby =
    canContinueToAccount &&
    Boolean(
      nickname &&
      nicknameStatus === "ok" &&
      userId &&
      userIdStatus === "ok" &&
      isPasswordValid(password) &&
      password === passwordConfirm
    );

  const resetForm = () => {
    setActiveTab("parent");
    setName(socialName);
    setPhone("");
    setEmail(socialEmail);
    setEmailId(socialEmailParts[0] ?? "");
    setEmailDomain(socialEmailDomain);
    setIsCustomDomain(Boolean(socialEmailDomain && !EMAIL_DOMAIN_OPTIONS.includes(socialEmailDomain)));
    setEmailError("");
    setNickname("");
    setNicknameStatus(null);
    setUserId("");
    setUserIdStatus(null);
    setPassword("");
    setPasswordError("");
    setPasswordConfirm("");
    setPasswordConfirmError("");
  };

  const handleSubmit = async (babyInfo: Omit<BabyProfile, "id">, babyFile?: File | null) => {
    if (!canContinueToBaby) return;
    setSignupError("");
    setSignupErrorCode("");
    const result = await registerAndLogin({
      username: userId,
      password,
      name,
      nickname,
      email: currentEmail,
      phone: phone || undefined,
      oauth_signup_token: socialSignupToken || undefined,
      baby_profile: babyInfo,
    }, babyFile);
    if (result.success) {
      setShowSuccess(true);
      // 완료 팝업을 잠깐 보여준 뒤 → 홈으로 이동 (홈에서 튜토리얼 팝업 자동 오픈)
      setTimeout(() => {
        setShowSuccess(false);
        navigate("/?showTutorial=true");
      }, 4000);
      return;
    }
    const errorMsg = result.error ?? "회원가입에 실패했습니다. 다시 시도해주세요.";
    const errorCode = result.errorCode ?? "";
    resetForm();
    setSignupError(errorMsg);
    setSignupErrorCode(errorCode);
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-4">
      {/* Header */}
      <div className="relative flex items-center justify-center mb-3 py-1">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="absolute left-0 top-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={16} />
          뒤로 가기
        </button>
        <h1
          className="text-2xl font-bold text-foreground text-center"
          style={{ fontFamily: "'Paperlogic', sans-serif" }}
        >
          회원가입
        </h1>
        
      </div>

      {/* 회원가입 오류 메시지 */}
      {signupError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 mb-4">
          <p className="text-sm font-semibold text-destructive">{signupError}</p>
          {signupErrorCode === "EMAIL_ALREADY_EXISTS_SOCIAL_NOT_CONNECTED" && (
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="mt-2 text-sm font-semibold text-foreground underline underline-offset-4"
            >
              기존 계정으로 로그인하기
            </button>
          )}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-0 rounded-3xl p-1 mb-6
      bg-[radial-gradient(ellipse_at_center,#E8F6FF_0%,#E8F6FF_100%)]">
        {(["parent", "account", "baby"] as Tab[]).map((tab) => {
          const isLocked =
            (tab === "account" && !canContinueToAccount) ||
            (tab === "baby" && !canContinueToBaby);
          return (
            <button
              key={tab}
              onClick={() => { if (!isLocked) setActiveTab(tab); }}
              disabled={isLocked}
              className={`relative flex-1 py-2.5 rounded-3xl text-base font-bold transition-colors ${
                isLocked ? "opacity-40 cursor-not-allowed" : ""
              }`}
            >
              {/* 움직이는 타원 배경 — active일 때만 렌더링 */}
              {activeTab === tab && (
                <motion.div
                  layoutId="activeTabPill"
                  className="absolute inset-0 rounded-3xl
                  bg-[radial-gradient(ellipse_at_center,#FEF5CC_0%,#FFFAF0_100%)] shadow-sm"
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                />
              )}

              {/* 글자는 배경 위로 올라오게 z-10 */}
              <span
                className={`relative z-10 ${
                  activeTab === tab ? "text-[#3D3C38]" : "text-muted-foreground"
                }`}
              >
                {tab === "parent" ? "① 부모님 정보" : tab === "account" ? "② 계정 정보" : "③ 아기 정보"}
              </span>
            </button>
          );
        })}
      </div>

      {/* ─────────────────────────────────────── */}
      {/* TAB 1: 부모님 정보 */}
      {/* ─────────────────────────────────────── */}
      {activeTab === "parent" && (
        <div className="grid grid-cols-2 gap-3">
          {/* 이름 */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름을 입력하세요"
              className={`w-full px-4 py-3 rounded-3xl border bg-card focus:outline-none focus:ring-2 focus:ring-[#FFF5D4] text-sm font-semibold placeholder:text-muted-foreground ${
                parentSubmitted && !name ? "border-destructive" : "border-border"
              }`}
            />
            {parentSubmitted && !name && (
              <p className="text-xs text-destructive">이름을 입력해주세요.</p>
            )}
          </div>

          {/* 연락처 */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">연락처</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
                const formatted = digits
                  .replace(/^(\d{3})(\d{4})(\d{4})$/, "$1-$2-$3")
                  .replace(/^(\d{3})(\d{1,4})$/, "$1-$2")
                  .replace(/^(\d{3})(\d{4})(\d{1,4})$/, "$1-$2-$3");
                 setPhone(formatted);
              }}
              placeholder="010-0000-0000"
              className={`w-full px-4 py-3 rounded-3xl border bg-card focus:outline-none focus:ring-2 focus:ring-[#FFF5D4] text-sm font-semibold placeholder:text-muted-foreground ${
                parentSubmitted && !phone ? "border-destructive" : "border-border"
              }`}
            />
            {parentSubmitted && !phone && (
              <p className="text-xs text-destructive">연락처를 입력해주세요.</p>
            )}
          </div>

          {/* 이메일 */}
          <div className="col-span-2 space-y-1.5">
            <label className="text-sm font-semibold text-foreground">이메일</label>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={emailId}
                lang="en"
                inputMode="email"
                onKeyDown={(e) =>
                  handleEnglishKeyDown(
                    e,
                    emailId,
                    (next) => {
                      setEmailId(next);
                      setEmail(buildEmail(next, emailDomain));
                    },
                    () => setEmailError(""),
                  )
                }
                onChange={(e) => {
                  const filtered = e.target.value.replace(/[^a-zA-Z0-9._+\-]/g, "");
                  setEmailId(filtered);
                  setEmail(buildEmail(filtered, emailDomain));
                  setEmailError("");
                }}
                onBlur={handleEmailBlur}
                placeholder="이메일 아이디"
                className={`flex-1 px-4 py-3 rounded-3xl border bg-card focus:outline-none focus:ring-2 focus:ring-[#FFF5D4] text-sm font-semibold placeholder:text-muted-foreground ${
                  parentSubmitted && !isEmailValid ? "border-destructive" : "border-border"
                }`}
              />
              <span className="text-sm font-semibold text-muted-foreground">@</span>
              <div className="relative flex-1">
                {isCustomDomain ? (
                  <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={emailDomain}
                        lang="en"
                        inputMode="url"
                        onKeyDown={(e) =>
                          handleEnglishKeyDown(
                            e,
                            emailDomain,
                            (next) => {
                              setEmailDomain(next);
                              setEmail(buildEmail(emailId, next));
                            },
                            () => setEmailError(""),
                          )
                        }
                        onChange={(e) => {
                          const filtered = e.target.value.replace(/[^a-zA-Z0-9.\-]/g, "");
                          setEmailDomain(filtered);
                          setEmail(buildEmail(emailId, filtered));
                          setEmailError("");
                        }}
                        onBlur={handleEmailBlur}
                        placeholder="도메인 직접 입력"
                        className={`w-full px-4 py-3 pr-8 rounded-3xl border bg-card focus:outline-none focus:ring-2 focus:ring-[#FFF5D4] text-sm font-bold ${
                          parentSubmitted && !isEmailValid ? "border-destructive" : "border-border"
                        }`}
                      />
                      <span
                        onClick={() => {
                          setIsCustomDomain(false);
                          setEmailDomain("");
                          setEmail("");
                          setEmailError("");
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground cursor-pointer hover:text-foreground"
                      >
                        ▾
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setDomainOpen(!domainOpen)}
                      className={`w-full px-4 py-3 rounded-3xl border bg-card focus:outline-none focus:ring-2 focus:ring-[#FFF5D4] text-sm font-semibold text-left ${
                        emailDomain ? "text-foreground" : "text-muted-foreground"
                      } ${parentSubmitted && !isEmailValid ? "border-destructive" : "border-border"}`}
                    >
                      {emailDomain || "도메인 선택"}
                    </button>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />

                    {domainOpen && (
                      <div className="absolute z-10 mt-1 w-full rounded-xl border border-border bg-card shadow-lg overflow-hidden">
                        <div className="max-h-48 overflow-y-auto py-2">
                          <div
                            onClick={() => {
                              setIsCustomDomain(true);
                              setEmailDomain("");
                              setEmail("");
                              setEmailError("");
                              setDomainOpen(false);
                            }}
                            className="px-4 py-2 text-sm hover:bg-primary/10 cursor-pointer"
                          >
                            직접 입력
                          </div>
                          {EMAIL_DOMAIN_OPTIONS.map((domain) => (
                            <div
                              key={domain}
                              onClick={() => {
                                setEmailDomain(domain);
                                setEmail(buildEmail(emailId, domain));
                                setEmailError("");
                                setDomainOpen(false);
                              }}
                              className="px-4 py-2 text-sm hover:bg-primary/10 cursor-pointer"
                            >
                              {domain}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {emailError && (
              <p className="text-xs text-destructive mt-1">{emailError}</p>
            )}
            {parentSubmitted && !isEmailValid && !emailError && (
              <p className="text-xs text-destructive mt-1">올바른 이메일을 입력해주세요.</p>
            )}
          </div>

          {/* 다음 버튼 */}
          <div className="col-span-2 pt-2 flex justify-end w-full">
            <button
              onClick={async () => {
                setParentSubmitted(true);
                const emailIsAvailable = await validateEmail();
                if (name && phone && emailIsAvailable) setActiveTab("account");
              }}
              className={`w-[calc(50%-6px)] py-3.5 text-[#3D3C38] text-base font-bold rounded-3xl
              bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#C7E9FF_100%)]
              hover:bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#B8E2FF_100%)]
              shadow-sm transition-all duration-300 ${
                !name || !phone || !isEmailValid ? "opacity-70" : ""
              }`}
            >
              다음 단계 →
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────── */}
      {/* TAB 2: 계정 정보 */}
      {/* ─────────────────────────────────────── */}
      {activeTab === "account" && (
        <div className="grid grid-cols-2 gap-3">
          {/* 닉네임 */}
          <div className="col-span-2 space-y-1.5">
            <label className="text-sm font-semibold text-foreground">닉네임</label>
            <div className="flex gap-3">
              <input
                type="text"
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value);
                  setNicknameStatus(null);
                }}
                placeholder="커뮤니티에서 사용할 닉네임"
                className={`w-[300px] px-4 py-3 rounded-3xl border bg-card focus:outline-none focus:ring-2 focus:ring-[#FFF5D4] text-sm placeholder:text-muted-foreground font-semibold ${
                  accountSubmitted && (!nickname || nicknameStatus !== "ok") ? "border-destructive" : "border-border"
                }`}
              />
              <button
                onClick={handleNicknameCheck}
                disabled={!nickname.trim()}
                className="px-4 py-3 rounded-3xl text-[#3D3C38] text-sm font-semibold disabled:opacity-70 disabled:cursor-not-allowed whitespace-nowrap
                bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)]
                hover:bg-[radial-gradient(ellipse_at_center,#FEF5CC_0%,#FFEFAB_100%)]
                shadow-sm transition-all duration-300"
              >
                중복 확인
              </button>
            </div>
            {nicknameStatus === "taken" && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <XCircle size={12} /> 사용 중인 닉네임입니다.
              </p>
            )}
            {nicknameStatus === "ok" && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle size={12} /> 사용 가능한 닉네임입니다.
              </p>
            )}
            {accountSubmitted && !nickname && (
              <p className="text-xs text-destructive">닉네임을 입력해주세요.</p>
            )}
            {accountSubmitted && nickname && nicknameStatus !== "ok" && (
              <p className="text-xs text-destructive">닉네임 중복 확인을 완료해주세요.</p>
            )}
          </div>

          {/* 아이디 */}
          <div className="col-span-2 space-y-1.5">
            <label className="text-sm font-semibold text-foreground">아이디</label>
            <div className="flex gap-3">
              <input
                type="text"
                value={userId}
                onKeyDown={(e) => {
                  if (e.key !== "Process" && !e.nativeEvent.isComposing) return;
                  const letterMatch = e.code.match(/^Key([A-Z])$/);
                  const digitMatch = e.code.match(/^Digit([0-9])$/);
                  if (!letterMatch && !digitMatch) return;
                  e.preventDefault();
                  const char = letterMatch ? letterMatch[1].toLowerCase() : digitMatch![1];
                  const input = e.currentTarget;
                  const start = input.selectionStart ?? userId.length;
                  const end = input.selectionEnd ?? userId.length;
                  const next = (userId.slice(0, start) + char + userId.slice(end)).slice(0, 16);
                  setUserId(next);
                  setUserIdStatus(null);
                  setUserIdFormatError("");
                  requestAnimationFrame(() => input.setSelectionRange(start + 1, start + 1));
                }}
                onChange={(e) => {
                  const filtered = e.target.value.replace(/[^a-z0-9]/g, "").slice(0, 16);
                  setUserId(filtered);
                  setUserIdStatus(null);
                  setUserIdFormatError("");
                }}
                placeholder="영문 소문자 + 숫자 조합 4~16자"
                className={`w-[300px] px-4 py-3 rounded-3xl border bg-card focus:outline-none focus:ring-2 focus:ring-[#FFF5D4] text-sm placeholder:text-muted-foreground font-semibold ${
                  accountSubmitted && (!userId || userIdStatus !== "ok") ? "border-destructive" : "border-border"
                }`}
              />
              <button
                onClick={handleUserIdCheck}
                disabled={!userId.trim()}
                className="px-4 py-3 rounded-3xl text-[#3D3C38] text-sm font-semibold disabled:opacity-70 disabled:cursor-not-allowed whitespace-nowrap
                bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)]
                hover:bg-[radial-gradient(ellipse_at_center,#FEF5CC_0%,#FFEFAB_100%)]
                shadow-sm transition-all duration-300"
              >
                중복 확인
              </button>
            </div>
            {userIdFormatError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <XCircle size={12} /> {userIdFormatError}
              </p>
            )}
            {userIdStatus === "taken" && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <XCircle size={12} /> 사용 중인 아이디입니다.
              </p>
            )}
            {userIdStatus === "ok" && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle size={12} /> 사용 가능한 아이디입니다.
              </p>
            )}
            {accountSubmitted && !userId && (
              <p className="text-xs text-destructive">아이디를 입력해주세요.</p>
            )}
            {accountSubmitted && userId && userIdStatus !== "ok" && (
              <p className="text-xs text-destructive">아이디 중복 확인을 완료해주세요.</p>
            )}
          </div>

          {/* 비밀번호 */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">비밀번호</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                lang="en"
                inputMode="text"
                onKeyDown={(e) =>
                  handleEnglishKeyDown(e, password, setPassword, () => setPasswordError(""))
                }
                onChange={(e) => {
                  const filtered = e.target.value.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, "");
                  setPassword(filtered);
                  setPasswordError("");
                }}
                onBlur={handlePasswordBlur}
                placeholder="영문 + 숫자 조합 8자 이상"
                className={`w-full px-4 py-3 pr-11 rounded-3xl border bg-card focus:outline-none focus:ring-2 focus:ring-[#FFF5D4] text-sm font-semibold placeholder:text-muted-foreground ${
                  passwordError || (accountSubmitted && !password) ? "border-destructive" : "border-border"
                }`}
              />
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {passwordError && (
              <p className="text-xs text-destructive">{passwordError}</p>
            )}
            {accountSubmitted && !password && (
              <p className="text-xs text-destructive">비밀번호를 입력해주세요.</p>
            )}
          </div>

          {/* 비밀번호 확인 */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">비밀번호 확인</label>
            <div className="relative">
              <input
                type={showPwConfirm ? "text" : "password"}
                value={passwordConfirm}
                lang="en"
                inputMode="text"
                onKeyDown={(e) =>
                  handleEnglishKeyDown(e, passwordConfirm, setPasswordConfirm, () =>
                    setPasswordConfirmError(""),
                  )
                }
                onChange={(e) => {
                  const filtered = e.target.value.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, "");
                  setPasswordConfirm(filtered);
                  setPasswordConfirmError("");
                }}
                onBlur={handlePasswordConfirmBlur}
                placeholder="비밀번호를 다시 입력하세요"
                className={`w-full px-4 py-3 pr-11 rounded-3xl border bg-card focus:outline-none focus:ring-2 focus:ring-[#FFF5D4] text-sm font-semibold placeholder:text-muted-foreground ${
                  passwordConfirmError || (accountSubmitted && !passwordConfirm) ? "border-destructive" : "border-border"
                }`}
              />
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => setShowPwConfirm(!showPwConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPwConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {passwordConfirmError && (
              <p className="text-xs text-destructive">{passwordConfirmError}</p>
            )}
            {accountSubmitted && !passwordConfirm && (
              <p className="text-xs text-destructive">비밀번호 확인을 입력해주세요.</p>
            )}
          </div>

          {/* 이전,다음 버튼 */}
          <div className="col-span-2 pt-2 mt-3 flex gap-3 w-full">
            <button
              onClick={() => setActiveTab("parent")}
              className="flex-1 py-3.5 text-[#3D3C38] text-base font-bold rounded-3xl disabled:opacity-70 disabled:cursor-not-allowed
              bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#C7E9FF_100%)]
              hover:bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#B8E2FF_100%)]
              shadow-sm transition-all duration-300"
            >
              ← 이전 단계
            </button>
            <button
              onClick={() => {
                setAccountSubmitted(true);
                if (password && !isPasswordValid(password))
                  setPasswordError("영문 + 숫자 조합 8자 이상이어야 합니다.");
                if (password && passwordConfirm && password !== passwordConfirm)
                  setPasswordConfirmError("비밀번호가 일치하지 않습니다.");
                if (canContinueToBaby) setActiveTab("baby");
              }}
              className={`flex-1 py-3.5 text-[#3D3C38] text-base font-bold rounded-3xl
              bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#C7E9FF_100%)]
              hover:bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#B8E2FF_100%)]
              shadow-sm transition-all duration-300 ${!canContinueToBaby ? "opacity-70" : ""}`}
            >
              다음 단계 →
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────── */}
      {/* TAB 3: 아기 정보 */}
      {/* ─────────────────────────────────────── */}
      {activeTab === "baby" && (
        <div className="space-y-4">
          <BabyInfoForm
            initial={DEFAULT_BABY_FORM}
            onSave={handleSubmit}
            onCancel={() => setActiveTab("account")}
            title=""
            saveLabel="회원가입 완료"
          />
        </div>
      )}

      {/* ─────────────────────────────────────── */}
      {/* 회원가입 완료 팝업 */}
      {/* ─────────────────────────────────────── */}
      {showSuccess && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-card rounded-3xl w-fit max-w-[calc(100vw-2rem)] shadow-2xl border border-border px-7 py-7 text-center">
            <img
              src={logoImage}
              alt="맘마케어 로고"
              className="w-32 h-32 object-contain mx-auto mb-5"
            />
            <h2
              className="text-xl font-bold text-foreground mb-3"
              style={{ fontFamily: "'Paperlogic', sans-serif" }}
            >
              회원가입 완료!
            </h2>
            <p className="text-lg text-muted-foreground mt-3 opacity-80">
              잠시 후 사용법을 안내해드릴게요.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
