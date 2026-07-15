import { useEffect, useState } from "react";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { AuthImage } from "../components/AuthImage";
import { useNavigate, useLocation } from "react-router";
import { Capacitor } from "@capacitor/core";
import { useApp } from "../context/AppContext";
import { ApiError } from "../api/client";
import type { BabyProfile } from "../context/AppContext";
import {
  BabyInfoForm,
  DEFAULT_BABY_FORM,
  MonthDayPicker,
  calcAgeText,
  calcFeedingStage,
  calcFeedingDday,
} from "../components/BabyInfoForm";
import { Edit3, Plus, RefreshCw, Venus, Mars, X, ChevronDown, Check, Trash2, ShieldAlert } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { listGrowthApi, addGrowthEntriesApi, updateGrowthApi, deleteGrowthApi, type GrowthRecord } from "../api/baby";
import type { ConfirmedAllergyResponse } from "../api/allergy";
import { IngredientIcon } from "../components/IngredientIcon";
import { CheckCircle } from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const GROWTH_YEARS = [2025, 2026];

// ─── Default profile icon ─────────────────────────────────────────────────────

function DefaultIcon({ gender }: { gender: BabyProfile["gender"] }) {
  const strokeColor =
    gender === "girl" ? "var(--terracotta)" : gender === "boy" ? "var(--secondary)" : "#A1A1A1";

  return (
    <div className="w-full h-full flex items-center justify-center bg-warm-surface">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        className="w-3/4 h-3/4"
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5" />
        <path d="M15 12h.01" />
        <path d="M19.38 6.813A9 9 0 0 1 20.8 10.2a2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1" />
        <path d="M9 12h.01" />
      </svg>
    </div>
  );
}

function renderAppFeedingStage(stage: string) {
  const match = stage.match(/^(.+?기)(\s+.*)$/);
  if (!match) return stage;
  return (
    <>
      {match[1]}
      <br />
      {match[2].trim()}
    </>
  );
}

// ─── Expected birth view (single centered column) ─────────────────────────────

function ExpectedBirthView({
  info,
  onAdd,
  onSwitch,
  showSwitch,
  onEdit,
}: {
  info: BabyProfile;
  onAdd: () => void;
  onSwitch: () => void;
  showSwitch: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-6">
      <div className="flex items-center gap-2 self-end">
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 text-sm font-semibold text-warm-fg transition-colors px-3 py-1.5 rounded-full border border-border whitespace-nowrap
          bg-[radial-gradient(ellipse_at_center,var(--warm-surface)_0%,var(--warm-surface-soft)_100%)]
          hover:bg-[radial-gradient(ellipse_at_center,var(--warm-surface-soft)_0%,var(--secondary)_100%)]"
        >
          <Plus size={13} /> 프로필 추가
        </button>
        {showSwitch && (
          <button
            onClick={onSwitch}
            className="flex items-center gap-1.5 text-sm font-semibold text-warm-fg transition-colors px-3 py-1.5 rounded-full border border-border whitespace-nowrap
            bg-[radial-gradient(ellipse_at_center,var(--warm-surface)_0%,var(--warm-surface-soft)_100%)]
            hover:bg-[radial-gradient(ellipse_at_center,var(--warm-surface-soft)_0%,var(--secondary)_100%)]"
          >
            <RefreshCw size={13} /> 프로필 전환
          </button>
        )}
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 text-sm font-semibold text-warm-fg transition-colors px-3 py-1.5 rounded-full border border-border whitespace-nowrap
          bg-[radial-gradient(ellipse_at_center,var(--warm-surface)_0%,var(--warm-surface-soft)_100%)]
          hover:bg-[radial-gradient(ellipse_at_center,var(--warm-surface-soft)_0%,var(--secondary)_100%)]"
        >
          <Edit3 size={13} /> 수정
        </button>
      </div>
      <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-border shadow-md">
        {info.photo ? (
          <AuthImage src={info.photo} alt={info.name} className="w-full h-full object-cover" />
        ) : (
          <DefaultIcon gender={null} />
        )}
      </div>
      <div>
        <h2 className="text-3xl font-bold text-foreground" style={{ fontFamily: "'Paperlogic', sans-serif" }}>
          {info.name}
        </h2>
        <p className="text-xl text-muted-foreground mt-3">
          아기를 기다리고 있어요.
        </p>
        <div className="mt-6 inline-block">
          <div className="px-12 py-5 bg-card border border-primary/40 rounded-3xl shadow-lg">
            <div className="text-xl text-muted-foreground mb-2">출생 예정일</div>
            <div className="text-3xl font-bold text-foreground" style={{ fontFamily: "'Paperlogic', sans-serif" }}>
              {info.birthYear}년 {info.birthMonth}월 {info.birthDay}일
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Baby info left column ────────────────────────────────────────────────────

function BabyInfoColumn({
  info,
  latestHeight,
  latestWeight,
  onAdd,
  onSwitch,
  showSwitch,
  onEdit,
  confirmedAllergies,
  safeIngredients,
}: {
  info: BabyProfile;
  latestHeight: string;
  latestWeight: string;
  onAdd: () => void;
  onSwitch: () => void;
  showSwitch: boolean;
  onEdit: () => void;
  confirmedAllergies: ConfirmedAllergyResponse[];
  safeIngredients: { id: number; name: string; emoji: string | null }[];
}) {
  const isApp = Capacitor.isNativePlatform();
  const ageText = calcAgeText(info.birthYear, info.birthMonth, info.birthDay);
  const stage = info.feedingStatus === "undecided" ? "미정" : calcFeedingStage(info.birthYear, info.birthMonth, info.birthDay);
  const dday = calcFeedingDday(info.feedingStatus, info.feedingYear, info.feedingMonth, info.feedingDay);
  const showDday = info.feedingStatus !== "undecided";
  const dayCount = Math.floor(
    (Date.now() - new Date(info.birthYear, info.birthMonth - 1, info.birthDay).getTime()) / 86400000
  ) + 1;

  return (
    <div className="space-y-5">
      <div className={`flex items-center justify-between ${isApp ? "" : "mt-5"}`}>
        <h2
          className={`${isApp ? "h-8 text-xl leading-8 font-bold flex items-center" : "text-2xl font-medium"} text-foreground`}
          style={{ fontFamily: "'Paperlogic', sans-serif", fontWeight: isApp ? 600 : undefined }}
        >
          아기 프로필
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onAdd}
            className={`flex items-center gap-1.5 text-sm ${isApp ? "font-bold" : "font-semibold"} text-warm-fg transition-colors px-3 py-1.5 rounded-full border border-border whitespace-nowrap
            bg-[radial-gradient(ellipse_at_center,var(--warm-surface)_0%,var(--warm-surface-soft)_100%)]
            hover:bg-[radial-gradient(ellipse_at_center,var(--warm-surface-soft)_0%,var(--secondary)_100%)]`}
          >
            <Plus size={13} /> 프로필 추가
          </button>
          {showSwitch && (
            <button
              onClick={onSwitch}
              className={`flex items-center gap-1.5 text-sm ${isApp ? "font-bold" : "font-semibold"} text-warm-fg transition-colors px-3 py-1.5 rounded-full border border-border whitespace-nowrap
              bg-[radial-gradient(ellipse_at_center,var(--warm-surface)_0%,var(--warm-surface-soft)_100%)]
              hover:bg-[radial-gradient(ellipse_at_center,var(--warm-surface-soft)_0%,var(--secondary)_100%)]`}
            >
              <RefreshCw size={13} /> 프로필 전환
            </button>
          )}
          <button
            onClick={onEdit}
            className={`flex items-center gap-1.5 text-sm ${isApp ? "font-bold" : "font-semibold"} text-warm-fg transition-colors px-3 py-1.5 rounded-full border border-border whitespace-nowrap
            bg-[radial-gradient(ellipse_at_center,var(--warm-surface)_0%,var(--warm-surface-soft)_100%)]
            hover:bg-[radial-gradient(ellipse_at_center,var(--warm-surface-soft)_0%,var(--secondary)_100%)]`}
          >
            <Edit3 size={13} /> 수정
          </button>
        </div>
      </div>

      {/* Identity card */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-5">
          <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-border shrink-0">
            {info.photo ? (
              <AuthImage src={info.photo} alt={info.name} className="w-full h-full object-cover" />
            ) : (
              <DefaultIcon gender={info.gender} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-2xl text-foreground" style={{ fontFamily: "'Paperlogic', sans-serif" }}>{info.name}</div>
            <div className="text-lg text-muted-foreground mt-0.5">
              {info.birthYear}.{String(info.birthMonth).padStart(2, "0")}.{String(info.birthDay).padStart(2, "0")}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="inline-flex items-center h-7 text-base bg-[radial-gradient(ellipse_at_center,var(--warm-surface)_0%,var(--warm-surface-soft)_50%,var(--secondary)_100%)] text-foreground px-2.5 rounded-full font-semibold">
                {ageText}
              </span>
              <span className="inline-flex items-center h-7 text-base bg-[radial-gradient(ellipse_at_center,var(--warm-surface)_0%,var(--safe-bg)_50%,var(--safe-bg)_100%)] text-foreground px-2.5 rounded-full font-semibold">
                {dayCount}일차
              </span>
              {info.gender && (
                <span
                  className="inline-flex items-center gap-1 h-7 text-base text-foreground px-2.5 rounded-full font-semibold"
                  style={{
                    background: info.gender === "girl"
                      ? "radial-gradient(ellipse at center, var(--warm-surface) 0%, var(--terracotta) 100%)"
                      : "radial-gradient(ellipse at center, var(--sage-50) 0%, var(--secondary) 100%)",
                  }}
                >
                  {info.gender === "girl" ? <><Venus size={14} /> 여아</> : <><Mars size={14} /> 남아</>}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className={`grid gap-3 ${showDday ? "grid-cols-3" : "grid-cols-2"}`}>
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <div className="text-base text-muted-foreground">이유식 단계</div>
          <div className="font-bold text-base text-foreground">
            {isApp ? renderAppFeedingStage(stage) : stage}
          </div>
        </div>
        {showDday && (
          <div className="bg-card border border-border rounded-2xl p-4 text-center">
            <div className="text-base text-muted-foreground">
              {info.feedingStatus === "started" ? "이유식 경과" : "이유식까지"}
            </div>
            <div className="font-bold text-base text-foreground">{dday}</div>
          </div>
        )}
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <div className="text-base text-muted-foreground">신체 정보</div>
          <div className="font-bold text-base text-foreground">
            {latestHeight ? `${latestHeight}cm` : "—"}
            {latestHeight && latestWeight ? " / " : ""}
            {latestWeight ? `${latestWeight}kg` : (latestHeight ? "" : "—")}
          </div>
        </div>
      </div>

      {/* 알레르기 확정 목록 */}
      {confirmedAllergies.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-1.5 text-base text-muted-foreground mb-2">
            <ShieldAlert size={18} />
            알레르기 확정 재료</div>
          <div className="flex flex-wrap gap-2">
            {confirmedAllergies.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-1 pl-3 pr-2 py-1 rounded-full
                bg-[radial-gradient(ellipse_at_center,var(--warm-surface)_0%,var(--terracotta-50)_100%)] border border-terracotta/50"
              >
                <IngredientIcon name={item.ingredient_name ?? ""} emoji={item.ingredient_emoji} size={17} />
                <span className="text-xs font-semibold">{item.ingredient_name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 알레르기 안전 목록 */}
      {safeIngredients.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-1.5 text-base text-muted-foreground mb-2">
            <CheckCircle size={18} />
            안전하게 통과한 재료
          </div>
          <div className="flex flex-wrap gap-2">
            {safeIngredients.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-1 pl-3 pr-2 py-1 rounded-full
                bg-[radial-gradient(ellipse_at_center,var(--warm-surface)_0%,var(--safe-bg)_100%)] border border-secondary/70"
              >
                <IngredientIcon name={item.name} emoji={item.emoji} size={17} />
                <span className="text-xs font-semibold">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Growth Add Modal ─────────────────────────────────────────────────────────

function GrowthAddModal({
  babyId,
  token,
  onClose,
  onSaved,
}: {
  babyId: string;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  useBodyScrollLock();
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [heightDate, setHeightDate] = useState(todayIso);
  const [weightDate, setWeightDate] = useState(todayIso);
  const [showHeightPicker, setShowHeightPicker] = useState(false);
  const [heightPickerStep, setHeightPickerStep] = useState<"month" | "day">("month");
  const [heightYearOpen, setHeightYearOpen] = useState(false);
  const [showWeightPicker, setShowWeightPicker] = useState(false);
  const [weightPickerStep, setWeightPickerStep] = useState<"month" | "day">("month");
  const [weightYearOpen, setWeightYearOpen] = useState(false);
  // 몸무게 측정일을 사용자가 직접 수정했는지 여부 — 수정 전까지는 키 측정일을 따라간다
  const [weightDateTouched, setWeightDateTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const parseDate = (d: string) => ({
    year: parseInt(d.split("-")[0]),
    month: parseInt(d.split("-")[1]),
    day: parseInt(d.split("-")[2]),
  });
  const toIso = (y: number, m: number, d: number) =>
    `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const hd = parseDate(heightDate);
  const wd = parseDate(weightDate);

  const updateHeightDate = (iso: string) => {
    setHeightDate(iso);
    if (!weightDateTouched) setWeightDate(iso);
  };
  const updateWeightDate = (iso: string) => {
    setWeightDateTouched(true);
    setWeightDate(iso);
  };

  const handleHeightChange = (v: string) => {
    if (v === "") { setHeight(""); return; }
    if (!/^\d*\.?\d{0,1}$/.test(v)) return;
    const n = parseFloat(v);
    if (!isNaN(n) && n > 140) return;
    setHeight(v);
  };

  const handleWeightChange = (v: string) => {
    if (v === "") { setWeight(""); return; }
    if (!/^\d*\.?\d{0,1}$/.test(v)) return;
    const n = parseFloat(v);
    if (!isNaN(n) && n > 140) return;
    setWeight(v);
  };

  const handleSave = async () => {
    if (!height && !weight) {
      alert("키 또는 몸무게를 입력해 주세요.");
      return;
    }
    setSaving(true);
    try {
      const heightCm = height ? parseFloat(height) : null;
      const weightKg = weight ? parseFloat(weight) : null;
      await addGrowthEntriesApi(token, babyId, {
        heightCm,
        heightLogDate: heightCm !== null ? heightDate : null,
        weightKg,
        weightLogDate: weightKg !== null ? weightDate : null,
      });
      onSaved();
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const isApp = Capacitor.isNativePlatform();

  return (
    <div className={`fixed inset-0 bg-black/50 z-50 flex items-center ${isApp ? "pt-16" : ""} justify-center px-4`}>
      <div className="bg-card rounded-3xl p-6 w-full max-w-xl shadow-xl border border-border">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-foreground">성장 기록 추가</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5">
          {/* 키 */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <span className="text-sm shrink-0 w-10">키</span>
              <div className="flex items-center gap-1.5 w-[140px] shrink-0">
                <input
                  type="number"
                  value={height}
                  onChange={(e) => handleHeightChange(e.target.value)}
                  min={0} max={140} step={0.1} inputMode="decimal"
                  placeholder="0.0"
                  className="w-[110px] px-3 py-2 rounded-3xl border border-border bg-card focus:outline-none focus:ring-2 focus:ring-warm-surface-soft text-sm font-semibold"
                />
                <span className="text-sm shrink-0">cm</span>
              </div>
              <div className="flex gap-2 items-center flex-1">
                <span className="text-sm shrink-0">측정일</span>
                <div className="flex gap-1.5 items-center flex-1">
                  <div className="relative flex-[3]">
                    <button
                      type="button"
                      onClick={() => setHeightYearOpen(!heightYearOpen)}
                      className="w-full px-3 py-1.5 rounded-3xl border border-border bg-card text-sm text-left focus:outline-none focus:ring-2 focus:ring-warm-surface-soft"
                    >
                      {hd.year}
                    </button>
                    <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    {heightYearOpen && (
                      <div className="absolute z-10 mt-1 w-full max-h-40 overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                        {GROWTH_YEARS.map((y) => (
                          <div
                            key={y}
                            onClick={() => { updateHeightDate(toIso(y, hd.month, hd.day)); setHeightYearOpen(false); setHeightPickerStep("month"); setShowHeightPicker(true); }}
                            className="px-3 py-1.5 text-sm hover:bg-primary/10 cursor-pointer"
                          >
                            {y}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-sm shrink-0">년</span>
                  <button
                    type="button"
                    onClick={() => { setHeightPickerStep("month"); setShowHeightPicker(true); }}
                    className="flex-[2] px-3 py-1.5 rounded-3xl border border-border bg-card text-sm text-left hover:border-primary/50 transition-colors"
                  >
                    {hd.month}
                  </button>
                  <span className="text-sm shrink-0">월</span>
                  <button
                    type="button"
                    onClick={() => { setHeightPickerStep("day"); setShowHeightPicker(true); }}
                    className="flex-[2] px-3 py-1.5 rounded-3xl border border-border bg-card text-sm text-left hover:border-primary/50 transition-colors"
                  >
                    {hd.day}
                  </button>
                  <span className="text-sm shrink-0">일</span>
                </div>
              </div>
            </div>

            {/* 몸무게 */}
            <div className="flex items-center gap-3 mt-3">
              <span className="text-sm shrink-0 w-10">몸무게</span>
              <div className="flex items-center gap-1.5 w-[140px] shrink-0">
                <input
                  type="number"
                  value={weight}
                  onChange={(e) => handleWeightChange(e.target.value)}
                  min={0} max={140} step={0.1} inputMode="decimal"
                  placeholder="0.0"
                  className="w-[110px] px-3 py-2 rounded-3xl border border-border bg-card focus:outline-none focus:ring-2 focus:ring-warm-surface-soft text-sm font-semibold"
                />
                <span className="text-sm shrink-0">kg</span>
              </div>
              <div className="flex gap-2 items-center flex-1">
                <span className="text-sm shrink-0">측정일</span>
                <div className="flex gap-1.5 items-center flex-1">
                  <div className="relative flex-[3]">
                    <button
                      type="button"
                      onClick={() => setWeightYearOpen(!weightYearOpen)}
                      className="w-full px-3 py-1.5 rounded-3xl border border-border bg-card text-sm text-left focus:outline-none focus:ring-2 focus:ring-warm-surface-soft"
                    >
                      {wd.year}
                    </button>
                    <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    {weightYearOpen && (
                      <div className="absolute z-10 mt-1 w-full max-h-40 overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                        {GROWTH_YEARS.map((y) => (
                          <div
                            key={y}
                            onClick={() => { updateWeightDate(toIso(y, wd.month, wd.day)); setWeightYearOpen(false); setWeightPickerStep("month"); setShowWeightPicker(true); }}
                            className="px-3 py-1.5 text-sm hover:bg-primary/10 cursor-pointer"
                          >
                            {y}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-sm shrink-0">년</span>
                  <button
                    type="button"
                    onClick={() => { setWeightPickerStep("month"); setShowWeightPicker(true); }}
                    className="flex-[2] px-3 py-1.5 rounded-3xl border border-border bg-card text-sm text-left hover:border-primary/50 transition-colors"
                  >
                    {wd.month}
                  </button>
                  <span className="text-sm shrink-0">월</span>
                  <button
                    type="button"
                    onClick={() => { setWeightPickerStep("day"); setShowWeightPicker(true); }}
                    className="flex-[2] px-3 py-1.5 rounded-3xl border border-border bg-card text-sm text-left hover:border-primary/50 transition-colors"
                  >
                    {wd.day}
                  </button>
                  <span className="text-sm shrink-0">일</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full mt-6 py-3.5 text-warm-fg text-base font-bold rounded-3xl
          bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--sage-100)_100%)]
          hover:bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--sage-200)_100%)]
          shadow-sm transition-all duration-300
          disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Check size={16} /> {saving ? "저장 중..." : "등록하기"}
        </button>

        {showHeightPicker && (
          <MonthDayPicker
            year={hd.year}
            value={{ month: hd.month, day: hd.day }}
            onChange={({ month, day }) => updateHeightDate(toIso(hd.year, month, day))}
            onClose={() => setShowHeightPicker(false)}
            initialStep={heightPickerStep}
          />
        )}
        {showWeightPicker && (
          <MonthDayPicker
            year={wd.year}
            value={{ month: wd.month, day: wd.day }}
            onChange={({ month, day }) => updateWeightDate(toIso(wd.year, month, day))}
            onClose={() => setShowWeightPicker(false)}
            initialStep={weightPickerStep}
          />
        )}
      </div>
    </div>
  );
}

// ─── Growth Edit Modal ────────────────────────────────────────────────────────

function GrowthEditModal({
  records,
  babyId,
  token,
  onClose,
  onSaved,
}: {
  records: GrowthRecord[];
  babyId: string;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  useBodyScrollLock();
  const [localRecords, setLocalRecords] = useState(
    [...records].sort((a, b) => b.logDate.localeCompare(a.logDate)),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHeight, setEditHeight] = useState("");
  const [editWeight, setEditWeight] = useState("");
  const [editDate, setEditDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editYearOpen, setEditYearOpen] = useState(false);
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);
  const [editDatePickerStep, setEditDatePickerStep] = useState<"month" | "day">("month");

  const parseDate = (d: string) => ({
    year: parseInt(d.split("-")[0]),
    month: parseInt(d.split("-")[1]),
    day: parseInt(d.split("-")[2]),
  });
  const toIso = (y: number, m: number, d: number) =>
    `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const startEdit = (r: GrowthRecord) => {
    setEditingId(r.id);
    setEditHeight(r.heightCm !== null ? String(r.heightCm) : "");
    setEditWeight(r.weightKg !== null ? String(r.weightKg) : "");
    setEditDate(r.logDate);
  };

  const handleSave = async (r: GrowthRecord) => {
    if (!editDate) { alert("날짜를 입력해 주세요."); return; }
    if (!editHeight && !editWeight) { alert("키 또는 몸무게를 입력해 주세요."); return; }
    setSaving(true);
    try {
      const payload: Parameters<typeof updateGrowthApi>[3] = { logDate: editDate };
      if (editHeight) payload.heightCm = parseFloat(editHeight);
      if (editWeight) payload.weightKg = parseFloat(editWeight);
      const updated = await updateGrowthApi(token, babyId, r.id, payload);
      setLocalRecords((prev) =>
        [...prev.map((x) => (x.id === r.id ? updated : x))].sort((a, b) =>
          b.logDate.localeCompare(a.logDate),
        ),
      );
      setEditingId(null);
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (r: GrowthRecord) => {
    if (!window.confirm("이 기록을 삭제할까요?")) return;
    setDeletingId(r.id);
    try {
      await deleteGrowthApi(token, babyId, r.id);
      setLocalRecords((prev) => prev.filter((x) => x.id !== r.id));
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center pt-16 justify-center px-4">
      <div className="bg-card rounded-3xl p-6 w-full max-w-xl shadow-xl border border-border">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-foreground">성장 기록 수정</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={20} />
          </button>
        </div>

        {localRecords.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">등록된 기록이 없습니다.</div>
        ) : (
          <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
            {localRecords.map((r) =>
              editingId === r.id ? (
                <div key={r.id} className="bg-card border border-primary/40 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground w-8 shrink-0">날짜</span>
                    <div className="flex gap-1.5 items-center flex-1">
                      <div className="relative flex-[3]">
                        <button
                          type="button"
                          onClick={() => setEditYearOpen(!editYearOpen)}
                          className="w-full px-3 py-1.5 rounded-3xl border border-border bg-card text-sm text-left focus:outline-none focus:ring-2 focus:ring-warm-surface-soft"
                        >
                          {editDate ? parseDate(editDate).year : ""}
                        </button>
                        <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        {editYearOpen && (
                          <div className="absolute z-10 mt-1 w-full max-h-40 overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                            {GROWTH_YEARS.map((y) => (
                              <div
                                key={y}
                                onClick={() => {
                                  const ed = editDate ? parseDate(editDate) : { year: y, month: 1, day: 1 };
                                  setEditDate(toIso(y, ed.month, ed.day));
                                  setEditYearOpen(false);
                                  setEditDatePickerStep("month");
                                  setShowEditDatePicker(true);
                                }}
                                className="px-3 py-1.5 text-sm hover:bg-primary/10 cursor-pointer"
                              >
                                {y}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="text-sm shrink-0">년</span>
                      <button
                        type="button"
                        onClick={() => { setEditDatePickerStep("month"); setShowEditDatePicker(true); }}
                        className="flex-[2] px-3 py-1.5 rounded-3xl border border-border bg-card text-sm text-left hover:border-primary/50 transition-colors"
                      >
                        {editDate ? parseDate(editDate).month : ""}
                      </button>
                      <span className="text-sm shrink-0">월</span>
                      <button
                        type="button"
                        onClick={() => { setEditDatePickerStep("day"); setShowEditDatePicker(true); }}
                        className="flex-[2] px-3 py-1.5 rounded-3xl border border-border bg-card text-sm text-left hover:border-primary/50 transition-colors"
                      >
                        {editDate ? parseDate(editDate).day : ""}
                      </button>
                      <span className="text-sm shrink-0">일</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-muted-foreground w-8 shrink-0">키</span>
                    <input
                      type="number"
                      value={editHeight}
                      onChange={(e) => setEditHeight(e.target.value)}
                      placeholder="0.0"
                      min={0} max={140} step={0.1} inputMode="decimal"
                      className="w-24 px-3 py-1.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-warm-surface-soft"
                    />
                    <span className="text-sm text-muted-foreground">cm</span>
                    <span className="text-sm text-muted-foreground ml-2 w-12 shrink-0">몸무게</span>
                    <input
                      type="number"
                      value={editWeight}
                      onChange={(e) => setEditWeight(e.target.value)}
                      placeholder="0.0"
                      min={0} max={140} step={0.1} inputMode="decimal"
                      className="w-24 px-3 py-1.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-warm-surface-soft"
                    />
                    <span className="text-sm text-muted-foreground">kg</span>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => handleSave(r)}
                      disabled={saving}
                      className="flex-1 py-2 text-sm font-semibold rounded-xl
                      bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--sage-100)_100%)]
                      hover:bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--sage-200)_100%)]
                      shadow-sm transition-all duration-300
                      text-warm-fg disabled:opacity-40 flex items-center justify-center gap-1.5"
                    >
                      <Check size={13} /> {saving ? "저장 중..." : "저장"}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="flex-1 py-2 text-sm text-muted-foreground hover:text-foreground rounded-xl border border-border transition-colors"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <div key={r.id} className="flex items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground">{r.logDate}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {r.heightCm !== null ? `키 ${r.heightCm}cm` : ""}
                      {r.heightCm !== null && r.weightKg !== null ? " · " : ""}
                      {r.weightKg !== null ? `몸무게 ${r.weightKg}kg` : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => startEdit(r)}
                    className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(r)}
                    disabled={deletingId === r.id}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ),
            )}
          </div>
        )}
        {showEditDatePicker && editDate && (
          <MonthDayPicker
            year={parseDate(editDate).year}
            value={{ month: parseDate(editDate).month, day: parseDate(editDate).day }}
            onChange={({ month, day }) => setEditDate(toIso(parseDate(editDate).year, month, day))}
            onClose={() => setShowEditDatePicker(false)}
            initialStep={editDatePickerStep}
          />
        )}
      </div>
    </div>
  );
}

// ─── Growth chart right column ────────────────────────────────────────────────

function GrowthColumn({
  records,
  onAddRecord,
  onEditRecord,
}: {
  records: GrowthRecord[];
  onAddRecord: () => void;
  onEditRecord: () => void;
}) {
  const heightRecords = records.filter((r) => r.heightCm !== null && r.heightCm > 0);
  const weightRecords = records.filter((r) => r.weightKg !== null && r.weightKg > 0);

  const heightData = heightRecords.map((r) => ({
    month: r.logDate.slice(5).replace("-", "/"),
    height: r.heightCm,
  }));

  const weightData = weightRecords.map((r) => ({
    month: r.logDate.slice(5).replace("-", "/"),
    weight: r.weightKg,
  }));

  const tooltipStyle = {
    contentStyle: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: "12px",
      fontSize: "12px",
    },
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between mt-5">
        <h2 className={`isApp ? "text-xl" : "text-2xl"} font-medium text-foreground" style={{ fontFamily: "'Paperlogic', sans-serif" }}`}>
          성장 기록
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onAddRecord}
            className="flex items-center gap-1.5 text-sm font-semibold text-warm-fg transition-colors px-3 py-1.5 rounded-full border border-border whitespace-nowrap
            bg-[radial-gradient(ellipse_at_center,var(--warm-surface)_0%,var(--warm-surface-soft)_100%)]
            hover:bg-[radial-gradient(ellipse_at_center,var(--warm-surface-soft)_0%,var(--secondary)_100%)]"
          >
            <Plus size={13} /> 기록 추가하기
          </button>
          <button
            onClick={onEditRecord}
            className="flex items-center gap-1.5 text-sm font-semibold text-warm-fg transition-colors px-3 py-1.5 rounded-full border border-border whitespace-nowrap
            bg-[radial-gradient(ellipse_at_center,var(--warm-surface)_0%,var(--warm-surface-soft)_100%)]
            hover:bg-[radial-gradient(ellipse_at_center,var(--warm-surface-soft)_0%,var(--secondary)_100%)]"
          >
            <Edit3 size={13} /> 기록 수정하기
          </button>
        </div>
      </div>

      {/* 키 그래프 */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="text-base font-semibold text-muted-foreground mb-4">신장 변화 (cm)</div>
        {heightRecords.length >= 2 ? (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={heightData} margin={{ top: 8, right: 20, left: 5, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 15 }} tickMargin={10} interval={0} />
              <YAxis tick={{ fontSize: 15 }} tickMargin={4} width={48} domain={["auto", "auto"]} tickCount={4} />
              <Tooltip {...tooltipStyle} />
              <Line
                type="monotone"
                dataKey="height"
                stroke="var(--terracotta)"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "var(--terracotta)" }}
                activeDot={{ r: 6 }}
                name="신장(cm)"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[180px] flex items-center text-center justify-center text-muted-foreground text-lg">
            현재 신체 정보를 1회만 입력했어요. <br/>아기의 신체 정보를 기록해 주세요.
          </div>
        )}
      </div>

      {/* 몸무게 그래프 */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="text-base font-semibold text-muted-foreground mb-4">체중 변화 (kg)</div>
        {weightRecords.length >= 2 ? (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={weightData} margin={{ top: 8, right: 20, left: 5, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 15 }} tickMargin={10} interval={0} />
              <YAxis tick={{ fontSize: 15 }} tickMargin={4} width={48} domain={["auto", "auto"]} tickCount={4} />
              <Tooltip {...tooltipStyle} />
              <Line
                type="monotone"
                dataKey="weight"
                stroke="var(--secondary)"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "var(--secondary)" }}
                activeDot={{ r: 6 }}
                name="체중(kg)"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[180px] flex items-center text-center justify-center text-muted-foreground text-lg">
            현재 신체 정보를 1회만 입력했어요. <br/>아기의 신체 정보를 기록해 주세요.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Profile() {
  const isApp = Capacitor.isNativePlatform();
  const { user, babies, activeBaby, addBaby, selectBaby, token, ingredientTestings, confirmedAllergies } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [growthRecords, setGrowthRecords] = useState<GrowthRecord[]>([]);
  const [showGrowthModal, setShowGrowthModal] = useState(false);
  const [showGrowthEditModal, setShowGrowthEditModal] = useState(false);

  useEffect(() => {
    if (user && babies.length > 0 && !activeBaby) {
      selectBaby(babies[0].id);
    }
  }, [user, babies, activeBaby, selectBaby]);

  useEffect(() => {
    if (!token || !activeBaby) {
      setGrowthRecords([]);
      return;
    }
    listGrowthApi(token, activeBaby.id)
      .then(setGrowthRecords)
      .catch(() => setGrowthRecords([]));
  }, [token, activeBaby?.id, location.key]);

  const refreshGrowth = () => {
    if (!token || !activeBaby) return;
    listGrowthApi(token, activeBaby.id)
      .then(setGrowthRecords)
      .catch(() => {});
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] px-4 gap-5">
        <div className="text-6xl">🔒</div>
        <p className="text-base text-muted-foreground">로그인 후 이용하실 수 있어요</p>
        <button
          onClick={() => navigate("/login")}
          className="px-6 py-3 bg-primary text-primary-foreground font-bold rounded-full hover:opacity-90"
        >
          로그인하기
        </button>
      </div>
    );
  }

  // First visit: no babies
  if (babies.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-5 py-6">
        <div className="text-center mb-7">
          <h1 className="text-2xl font-bold text-foreground">
            아기 프로필을 만들어 주세요 🌱
          </h1>
          <p className="text-base text-muted-foreground mt-2">
            맞춤 이유식 관리를 위해 아기 정보가 필요해요.
          </p>
        </div>
        <BabyInfoForm
          initial={DEFAULT_BABY_FORM}
          onSave={async (info, file) => {
            try {
              const id = await addBaby(info, file);
              selectBaby(id);
              navigate("/profile");
            } catch (e) {
              const message = e instanceof ApiError ? e.message : "프로필 등록에 실패했습니다. 다시 시도해주세요.";
              alert(message);
            }
          }}
          title=""
          saveLabel="등록 완료"
        />
      </div>
    );
  }

  const isExpected = activeBaby?.birthType === "expected";

  const latestHeight = (() => {
    const r = [...growthRecords].reverse().find((g) => g.heightCm !== null);
    return r ? String(r.heightCm) : activeBaby?.height ?? "";
  })();
  const latestWeight = (() => {
    const r = [...growthRecords].reverse().find((g) => g.weightKg !== null);
    return r ? String(r.weightKg) : activeBaby?.weight ?? "";
  })();

  // Normal view
  return (
    <div className={isApp ? "px-3 py-4" : "max-w-6xl mx-auto px-5 py-6"}>
      {/* Content */}
      {activeBaby && (
        isExpected ? (
          <ExpectedBirthView
              info={activeBaby}
              onAdd={() => navigate("/profile/add")}
              onSwitch={() => navigate("/profile-select")}
              showSwitch={babies.length >= 2}
              onEdit={() => navigate("/profile/edit")}
            />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <BabyInfoColumn
              info={activeBaby}
              latestHeight={latestHeight}
              latestWeight={latestWeight}
              onAdd={() => navigate("/profile/add")}
              onSwitch={() => navigate("/profile-select")}
              showSwitch={babies.length >= 2}
              onEdit={() => navigate("/profile/edit")}
              confirmedAllergies={confirmedAllergies}
              safeIngredients={(() => {
                const reactionIds = new Set(
                  ingredientTestings
                    .filter((t) => t.test_status === "completed_reaction")
                    .map((t) => t.ingredient_id),
                );
                const seen = new Map<number, { id: number; name: string; emoji: string | null }>();
                for (const t of ingredientTestings) {
                  if (t.test_status === "completed_safe" && !reactionIds.has(t.ingredient_id)) {
                    if (!seen.has(t.ingredient_id)) {
                      seen.set(t.ingredient_id, { id: t.ingredient_id, name: t.ingredient_name, emoji: t.ingredient_emoji });
                    }
                  }
                }
                return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name, "ko"));
              })()}
            />
            <GrowthColumn
              records={growthRecords}
              onAddRecord={() => setShowGrowthModal(true)}
              onEditRecord={() => setShowGrowthEditModal(true)}
            />
          </div>
        )
      )}

      {showGrowthModal && activeBaby && token && (
        <GrowthAddModal
          babyId={activeBaby.id}
          token={token}
          onClose={() => setShowGrowthModal(false)}
          onSaved={refreshGrowth}
        />
      )}

      {showGrowthEditModal && activeBaby && token && (
        <GrowthEditModal
          records={growthRecords}
          babyId={activeBaby.id}
          token={token}
          onClose={() => setShowGrowthEditModal(false)}
          onSaved={refreshGrowth}
        />
      )}
    </div>
  );
}
