import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { AuthImage } from "./AuthImage";
import type { BabyProfile } from "../types";
import { Camera, Check, ChevronLeft, ChevronDown, X, Venus, Mars, Search, AlertCircle } from "lucide-react";
import { listIngredients, type IngredientResponse } from "../api/ingredients";
import { IngredientIcon } from "./IngredientIcon";
import { STANDARD_KOREAN_ALLERGENS } from "../data/crossReactivity";

// ─── Constants ────────────────────────────────────────────────────────────────


const BIRTH_YEARS = [2025, 2026];               // 생년월일
const EXPECTED_BIRTH_YEARS = [2026, 2027];      // 출생 예정일
const FEEDING_STARTED_YEARS = [2025, 2026];     // 이유식 시작일
const FEEDING_PLANNED_YEARS = [2026, 2027];     // 이유식 시작 예정일
const GROWTH_YEARS = [2025, 2026];  // 신체 측정일


export const DEFAULT_BABY_FORM: Omit<BabyProfile, "id"> = {
  photo: null,
  name: "",
  birthType: "born",
  birthYear: 2026,
  birthMonth: 1,
  birthDay: 1,
  gender: null,
  feedingStatus: "undecided",
  feedingYear: 2026,
  feedingMonth: 1,
  feedingDay: 1,
  height: "",
  heightDate: null,
  weight: "",
  weightDate: null,
  allergens: [] as { id: number; name: string; emoji: string | null }[],
  safeIngredients: [] as { id: number; name: string; emoji: string | null }[],
  isComplete: false,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function calcAgeText(year: number, month: number, day: number) {
  const birth = new Date(year, month - 1, day);
  const now = new Date();
  const diffMs = now.getTime() - birth.getTime();
  if (diffMs < 0) return "출생 예정";
  const totalDays = Math.floor(diffMs / 86400000);
  const months = Math.floor(totalDays / 30.44);
  const days = totalDays - Math.floor(months * 30.44);
  return `생후 ${months}개월 ${days}일`;
}

export function calcFeedingStage(
  birthYear: number,
  birthMonth: number,
  birthDay: number,
) {
  const birth = new Date(birthYear, birthMonth - 1, birthDay);
  const months = Math.floor(
    (Date.now() - birth.getTime()) / (86400000 * 30.44),
  );
  if (months < 4) return "시작 전";
  if (months <= 6) return "초기 (5~6개월)";
  if (months <= 8) return "중기 (7-8개월)";
  if (months <= 11) return "후기 (9-11개월)";
  if (months <= 18) return "완료기 (12-18m)";
  return "완료기 이후";
}

export function calcFeedingDday(
  status: BabyProfile["feedingStatus"],
  fy: number,
  fm: number,
  fd: number,
) {
  if (status === "undecided") return "미정";
  const target = new Date(fy, fm - 1, fd);
  const diff = Math.floor((target.getTime() - Date.now()) / 86400000);
  if (status === "started")
    return diff <= 0 ? `D+${Math.abs(diff)}` : `D-${diff}`;
  return diff >= 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function compareIngredientByMonth(
  a: Pick<IngredientResponse, "name" | "recommended_month">,
  b: Pick<IngredientResponse, "name" | "recommended_month">,
) {
  const monthA = a.recommended_month ?? Number.MAX_SAFE_INTEGER;
  const monthB = b.recommended_month ?? Number.MAX_SAFE_INTEGER;
  if (monthA !== monthB) return monthA - monthB;
  return a.name.localeCompare(b.name, "ko");
}

type StageFilter = "all" | "early" | "mid" | "late" | "final";
const STAGE_TABS: { key: StageFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "early", label: "초기" },
  { key: "mid", label: "중기" },
  { key: "late", label: "후기" },
  { key: "final", label: "완료기" },
];
function stageFromMonth(m: number | null): Exclude<StageFilter, "all"> | null {
  if (m === null) return null;
  if (m <= 6) return "early";
  if (m <= 8) return "mid";
  if (m <= 11) return "late";
  return "final";
}
function matchesStageFilter(m: number | null, filter: StageFilter): boolean {
  if (filter === "all") return true;
  return stageFromMonth(m) === filter;
}

// ─── MonthDayPicker ───────────────────────────────────────────────────────────

export function MonthDayPicker({
  year,
  value,
  onChange,
  onClose,
  initialStep = "month",
  minDate,
  maxDate,
}: {
  year: number;
  value: { month: number; day: number };
  onChange: (v: { month: number; day: number }) => void;
  onClose: () => void;
  initialStep?: "month" | "day";
  minDate?: { year: number; month: number; day: number };
  maxDate?: { year: number; month: number; day: number };
}) {
  useBodyScrollLock();
  const [step, setStep] = useState<"month" | "day">(initialStep);
  const [selMonth, setSelMonth] = useState(value.month);
  const numDays = daysInMonth(year, selMonth);

  const isMonthDisabled = (m: number) => {
    if (minDate && year === minDate.year && m < minDate.month) return true;
    if (maxDate && year === maxDate.year && m > maxDate.month) return true;
    return false;
  };

  const isDayDisabled = (d: number) => {
    if (minDate && year === minDate.year) {
      if (selMonth < minDate.month) return true;
      if (selMonth === minDate.month && d < minDate.day) return true;
    }
    if (maxDate && year === maxDate.year) {
      if (selMonth > maxDate.month) return true;
      if (selMonth === maxDate.month && d > maxDate.day) return true;
    }
    return false;
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
      <div className="bg-card rounded-3xl p-5 w-72 shadow-xl border border-border">
        {step === "month" ? (
          <>
            <div className="text-sm font-bold mb-4 text-center text-foreground">
              월 선택
            </div>
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    if (isMonthDisabled(m)) return;
                    setSelMonth(m);
                    setStep("day");
                  }}
                  disabled={isMonthDisabled(m)}
                  className={`py-2 rounded-xl text-sm font-semibold transition-colors ${
                    isMonthDisabled(m)
                      ? "opacity-30 cursor-not-allowed text-muted-foreground"
                      : m === value.month
                        ? "bg-honey-100 text-primary-foreground"
                        : "hover:bg-primary/20 text-foreground"
                  }`}
                >
                  {m}월
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => setStep("month")}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <ChevronLeft size={13} /> 월 선택
              </button>
              <span className="text-sm font-bold text-foreground">
                {selMonth}월
              </span>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: numDays }, (_, i) => i + 1).map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    if (isDayDisabled(d)) return;
                    onChange({ month: selMonth, day: d });
                    onClose();
                  }}
                  disabled={isDayDisabled(d)}
                  className={`aspect-square text-xs rounded-lg transition-colors flex items-center justify-center ${
                    isDayDisabled(d)
                      ? "opacity-30 cursor-not-allowed text-muted-foreground"
                      : d === value.day && selMonth === value.month
                        ? "bg-honey-100 text-primary-foreground font-bold"
                        : "hover:bg-primary/20 text-foreground"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </>
        )}
        <button
          onClick={onClose}
          className="w-full mt-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          취소
        </button>
      </div>
    </div>
  );
}

// ─── BabyInfoForm ─────────────────────────────────────────────────────────────

interface BabyInfoFormProps {
  initial: Omit<BabyProfile, "id">;
  onSave: (info: Omit<BabyProfile, "id">, file?: File | null) => void;
  onCancel?: () => void;
  title?: string;
  saveLabel?: string;
  saving?: boolean;
}

export function BabyInfoForm({
  initial,
  onSave,
  onCancel,
  title = "아기 정보를 입력해주세요",
  saveLabel = "등록 완료",
  saving = false,
}: BabyInfoFormProps) {
  const [form, setForm] = useState<Omit<BabyProfile, "id">>(initial);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showBirthPicker, setShowBirthPicker] = useState(false);
  const [birthPickerStep, setBirthPickerStep] = useState<"month" | "day">("month");
  const [showFeedingPicker, setShowFeedingPicker] = useState(false);
  const [feedingPickerStep, setFeedingPickerStep] = useState<"month" | "day">("month");
  const [showHeightPicker, setShowHeightPicker] = useState(false);
  const [heightPickerStep, setHeightPickerStep] = useState<"month" | "day">("month");
  const [heightYearOpen, setHeightYearOpen] = useState(false);
  const [showWeightPicker, setShowWeightPicker] = useState(false);
  const [weightPickerStep, setWeightPickerStep] = useState<"month" | "day">("month");
  const [weightYearOpen, setWeightYearOpen] = useState(false);
  const [yearOpen, setYearOpen] = useState(false);
  const [feedingYearOpen, setFeedingYearOpen] = useState(false);
  // 몸무게 측정일을 사용자가 직접 수정했는지 여부 — 수정 전까지는 키 측정일을 따라간다.
  // 기존 프로필에서 두 날짜가 이미 다르면 의도된 값으로 보고 연동하지 않는다.
  const [weightDateTouched, setWeightDateTouched] = useState(
    initial.weightDate !== null && initial.weightDate !== initial.heightDate,
  );
  const [allergenWarning, setAllergenWarning] = useState<string | null>(null);
  const [safeWarning, setSafeWarning] = useState<string | null>(null);
  const [allergenStageFilter, setAllergenStageFilter] = useState<StageFilter>("all");
  const [safeStageFilter, setSafeStageFilter] = useState<StageFilter>("all");
  const allergenChipsRef = useRef<HTMLDivElement>(null);
  const safeChipsRef = useRef<HTMLDivElement>(null);
  const [allergenChipsExpanded, setAllergenChipsExpanded] = useState(false);
  const [safeChipsExpanded, setSafeChipsExpanded] = useState(false);
  const [allergenChipsNeedsToggle, setAllergenChipsNeedsToggle] = useState(false);
  const [safeChipsNeedsToggle, setSafeChipsNeedsToggle] = useState(false);
  const allergenWarningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safeWarningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [allergySearch, setAllergySearch] = useState("");
  const [allergyDropdownOpen, setAllergyDropdownOpen] = useState(false);
  const [allergyResults, setAllergyResults] = useState<IngredientResponse[]>([]);
  const [allIngredients, setAllIngredients] = useState<IngredientResponse[]>([]);
  const [safeIngPage, setSafeIngPage] = useState(0);
  const [allergenIngPage, setAllergenIngPage] = useState(0);
  const [safeSearch, setSafeSearch] = useState("");
  const [safeDropdownOpen, setSafeDropdownOpen] = useState(false);
  const SAFE_ITEMS_PER_PAGE = 20;
  const ALLERGEN_ITEMS_PER_PAGE = 20;

  useEffect(() => {
    if (!allergySearch.trim()) { setAllergyResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const results = await listIngredients({ search: allergySearch });
        setAllergyResults(results.slice(0, 8));
      } catch {
        setAllergyResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [allergySearch]);

  useEffect(() => {
    listIngredients().then(setAllIngredients).catch(() => {});
  }, []);

  const allergenIdSet = useMemo(
    () => new Set((form.allergens ?? []).map((a) => a.id)),
    [form.allergens],
  );
  const safeDisplayIngredients = useMemo(
    () =>
      allIngredients
        .filter((ing) => !allergenIdSet.has(ing.id))
        .sort(compareIngredientByMonth),
    [allIngredients, allergenIdSet],
  );
  const safeDropdownResults = useMemo(
    () =>
      safeSearch.trim() === ""
        ? []
        : allIngredients
            .filter((ing) =>
              ing.name.toLowerCase().includes(safeSearch.trim().toLowerCase()),
            )
            .sort(compareIngredientByMonth)
            .slice(0, 8),
    [allIngredients, safeSearch],
  );
  const ingredientMonthById = useMemo(
    () => new Map(allIngredients.map((ing) => [ing.id, ing.recommended_month])),
    [allIngredients],
  );
  const safeFilteredIngredients = useMemo(
    () => safeDisplayIngredients.filter((ing) => matchesStageFilter(ing.recommended_month, safeStageFilter)),
    [safeDisplayIngredients, safeStageFilter],
  );
  const safeTotalPages = Math.ceil(safeFilteredIngredients.length / SAFE_ITEMS_PER_PAGE);
  const safePageItems = safeFilteredIngredients.slice(
    safeIngPage * SAFE_ITEMS_PER_PAGE,
    (safeIngPage + 1) * SAFE_ITEMS_PER_PAGE,
  );
  const safeIdSet = useMemo(
    () => new Set((form.safeIngredients ?? []).map((s) => s.id)),
    [form.safeIngredients],
  );
  const standardAllergenItems = useMemo(
    () =>
      STANDARD_KOREAN_ALLERGENS.map((allergen) => {
        const dbMatch = allIngredients.find((ing) => ing.name === allergen.name);
        return { id: dbMatch?.id ?? null, name: allergen.name, emoji: dbMatch?.emoji ?? null, recommended_month: dbMatch?.recommended_month ?? null };
      }),
    [allIngredients],
  );
  const additionalAllergenItems = useMemo(() => {
    const standardNames = new Set(STANDARD_KOREAN_ALLERGENS.map((allergen) => allergen.name));
    return allIngredients
      .filter((ing) => !standardNames.has(ing.name))
      .sort(compareIngredientByMonth);
  }, [allIngredients]);
  const filteredStandardAllergenItems = useMemo(
    () => standardAllergenItems.filter(
      (item) => item.id !== null && !safeIdSet.has(item.id!) && matchesStageFilter(item.recommended_month, allergenStageFilter)
    ),
    [standardAllergenItems, allergenStageFilter, safeIdSet],
  );
  const filteredAdditionalAllergenItems = useMemo(
    () => additionalAllergenItems.filter(
      (item) => !safeIdSet.has(item.id) && matchesStageFilter(item.recommended_month, allergenStageFilter)
    ),
    [additionalAllergenItems, allergenStageFilter, safeIdSet],
  );
  const standardAllergenCount = filteredStandardAllergenItems.length;
  const allergenFirstPageAdditionalSize = Math.max(
    0,
    ALLERGEN_ITEMS_PER_PAGE - standardAllergenCount,
  );
  const additionalAllergenRemainingCount = Math.max(
    0,
    filteredAdditionalAllergenItems.length - allergenFirstPageAdditionalSize,
  );
  const allergenTotalPages = Math.max(
    1,
    1 + Math.ceil(additionalAllergenRemainingCount / ALLERGEN_ITEMS_PER_PAGE),
  );
  const additionalAllergenPageItems = allergenIngPage === 0
    ? filteredAdditionalAllergenItems.slice(0, allergenFirstPageAdditionalSize)
    : filteredAdditionalAllergenItems.slice(
        allergenFirstPageAdditionalSize + (allergenIngPage - 1) * ALLERGEN_ITEMS_PER_PAGE,
        allergenFirstPageAdditionalSize + allergenIngPage * ALLERGEN_ITEMS_PER_PAGE,
      );
  const showStandardAllergenItems = allergenIngPage === 0;
  const allergyGridUsedCount = (showStandardAllergenItems ? standardAllergenCount : 0) + additionalAllergenPageItems.length;
  const allergyGridEmptyCount = Math.max(0, ALLERGEN_ITEMS_PER_PAGE - allergyGridUsedCount);

  useEffect(() => {
    setAllergenIngPage((page) => Math.min(page, allergenTotalPages - 1));
  }, [allergenTotalPages]);

  useEffect(() => {
    setAllergenIngPage(0);
  }, [allergenStageFilter]);

  useEffect(() => {
    setSafeIngPage(0);
  }, [safeStageFilter]);

  useLayoutEffect(() => {
    if (allergenChipsExpanded) return;
    const el = allergenChipsRef.current;
    if (!el) { setAllergenChipsNeedsToggle(false); return; }
    setAllergenChipsNeedsToggle(el.scrollHeight > el.clientHeight);
  }, [form.allergens, allergenChipsExpanded]);

  useLayoutEffect(() => {
    if (safeChipsExpanded) return;
    const el = safeChipsRef.current;
    if (!el) { setSafeChipsNeedsToggle(false); return; }
    setSafeChipsNeedsToggle(el.scrollHeight > el.clientHeight);
  }, [form.safeIngredients, safeChipsExpanded]);

  const today = new Date();
  const parseDate = (d: string | null) => ({
    year: d ? parseInt(d.split("-")[0]) : today.getFullYear(),
    month: d ? parseInt(d.split("-")[1]) : today.getMonth() + 1,
    day: d ? parseInt(d.split("-")[2]) : today.getDate(),
  });
  const hd = parseDate(form.heightDate);
  const wd = parseDate(form.weightDate);
  const toIso = (y: number, m: number, d: number) =>
    `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const fileRef = useRef<HTMLInputElement>(null);

  const update = useCallback(
    <K extends keyof Omit<BabyProfile, "id">>(
      key: K,
      val: Omit<BabyProfile, "id">[K],
    ) => {
      setForm((f) => ({ ...f, [key]: val }));
    },
    [],
  );

  const showAllergenWarning = useCallback((msg: string) => {
    if (allergenWarningTimerRef.current) clearTimeout(allergenWarningTimerRef.current);
    setAllergenWarning(msg);
    allergenWarningTimerRef.current = setTimeout(() => setAllergenWarning(null), 3000);
  }, []);

  const showSafeWarning = useCallback((msg: string) => {
    if (safeWarningTimerRef.current) clearTimeout(safeWarningTimerRef.current);
    setSafeWarning(msg);
    safeWarningTimerRef.current = setTimeout(() => setSafeWarning(null), 3000);
  }, []);

  const toggleSafe = useCallback(
    (ing: IngredientResponse) => {
      setForm((f) => {
        const current = f.safeIngredients ?? [];
        const exists = current.some((s) => s.id === ing.id);
        return {
          ...f,
          safeIngredients: exists
            ? current.filter((s) => s.id !== ing.id)
            : [...current, { id: ing.id, name: ing.name, emoji: ing.emoji }],
        };
      });
    },
    [],
  );

  const handleBirthTypeChange = (t: "born" | "expected") => {
    if (t === "expected") {
      const todayYear = today.getFullYear();
      const todayMonth = today.getMonth() + 1;
      const todayDay = today.getDate();
      const initYear = EXPECTED_BIRTH_YEARS.includes(todayYear) ? todayYear : EXPECTED_BIRTH_YEARS[0];
      setForm((f) => ({
        ...f,
        birthType: t,
        birthYear: initYear,
        birthMonth: todayMonth,
        birthDay: todayDay,
        gender: null,
        feedingStatus: "undecided",
        height: "",
        weight: "",
      }));
    } else {
      setForm((f) => ({
        ...f,
        birthType: t,
        birthYear: BIRTH_YEARS[0],
        birthMonth: 1,
        birthDay: 1,
      }));
    }
  };

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    // 미리보기용 data URL — 서버 전송은 pendingFile(File 객체)로 한다
    const reader = new FileReader();
    reader.onload = (ev) => update("photo", ev.target?.result as string);
    reader.readAsDataURL(file);
    // reset input so same file can be re-selected
    e.target.value = "";
  };

  const handleHeightChange = (v: string) => {
    if (v === "") { update("height", ""); return; }
    if (!/^\d*\.?\d{0,1}$/.test(v)) return;
    const n = parseFloat(v);
    if (!isNaN(n) && n > 140) return;
    update("height", v);
  };

  const handleWeightChange = (v: string) => {
    if (v === "") { update("weight", ""); return; }
    if (!/^\d*\.?\d{0,1}$/.test(v)) return;
    const n = parseFloat(v);
    if (!isNaN(n) && n > 140) return;
    update("weight", v);
  };

  const updateHeightDate = (iso: string) => {
    setForm((f) => ({
      ...f,
      heightDate: iso,
      ...(weightDateTouched ? {} : { weightDate: iso }),
    }));
  };
  const updateWeightDate = (iso: string) => {
    setWeightDateTouched(true);
    update("weightDate", iso);
  };

  const isExpected = form.birthType === "expected";
  const canSave = form.name.trim() && (isExpected || form.gender !== null);

  return (
    <div className="space-y-5">
      {title && (
        <div className="text-center">
          <h2
            className="text-xl font-bold text-foreground"
          >
            {title}
          </h2>
        </div>
      )}

      {/* ── 프로필 사진 ── */}
      <div className="flex flex-col items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-24 h-24 rounded-full bg-input-background border-2 border-dashed border-border flex items-center justify-center overflow-hidden hover:border-primary transition-colors"
          >
            {form.photo ? (
              <AuthImage
                src={form.photo}
                alt="baby"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                <Camera size={22} />
                <span className="text-base">사진 추가</span>
              </div>
            )}
          </button>
          {form.photo && (
            <button
              type="button"
              onClick={() => { update("photo", null); setPendingFile(null); }}
              className="absolute -top-1 -right-1 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shadow-sm hover:opacity-80 transition-opacity"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhoto}
        />
      </div>

      {/* ── 아기 이름 ── */}
      <div className="space-y-1.5 -mt-3">
        <label className="text-sm font-semibold text-foreground mb-1 block">아기 이름</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="이름을 입력하세요."
          className="w-full px-4 py-3 rounded-3xl border border-border bg-card focus:outline-none focus:ring-2 focus:ring-warm-surface-soft text-sm placeholder:text-muted-foreground font-semibold"
        />
      </div>

      {/* ── 생년월일 / 출생 예정일 ── */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground mb-1 block">
          아기가 찾아온 날을 알려주세요.
        </label>
        <div className="flex gap-2">
          {(["born", "expected"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => handleBirthTypeChange(t)}
              className={`flex-1 py-2 rounded-3xl text-sm font-semibold border transition-all ${
                form.birthType === t
                  ? "bg-[radial-gradient(ellipse_at_center,var(--warm-surface)_0%,var(--warm-surface-soft)_100%)] text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {t === "born" ? "생년월일" : "출생 예정일"}
            </button>
          ))}
        </div>

        {/* 연도 + 월/일 */}
        <div className="flex gap-2 items-center">
          <div className="relative flex-[1.5]">
            <button
              type="button"
              onClick={() => setYearOpen(!yearOpen)}
              className="w-full px-4 py-2 rounded-3xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-warm-surface-soft text-left"
            >
              {form.birthYear}
            </button>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />

            {yearOpen && (
              <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                {(isExpected ? EXPECTED_BIRTH_YEARS : BIRTH_YEARS).filter((y) => isExpected || y <= today.getFullYear()).map((y) => (
                  <div
                    key={y}
                    onClick={() => {
                      if (isExpected) {
                        const todayMonth = today.getMonth() + 1;
                        const todayDay = today.getDate();
                        const needsReset = y === today.getFullYear() &&
                          (form.birthMonth < todayMonth ||
                            (form.birthMonth === todayMonth && form.birthDay < todayDay));
                        setForm((f) => ({
                          ...f,
                          birthYear: y,
                          ...(needsReset ? { birthMonth: todayMonth, birthDay: todayDay } : {}),
                        }));
                      } else {
                        update("birthYear", y);
                      }
                      setYearOpen(false);
                      setBirthPickerStep("month");
                      setShowBirthPicker(true);
                    }}
                    className="px-4 py-2 text-sm hover:bg-primary/10 cursor-pointer"
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
            onClick={() => { setBirthPickerStep("month"); setShowBirthPicker(true); }}
            className="flex-1 px-4 py-2 rounded-3xl border border-border bg-card text-sm text-left hover:border-primary/50 transition-colors text-foreground"
          >
            {form.birthMonth}
          </button>
          <span className="text-sm shrink-0">월</span>

          <button
            type="button"
            onClick={() => { setBirthPickerStep("day"); setShowBirthPicker(true); }}
            className="flex-1 px-4 py-2 rounded-3xl border border-border bg-card text-sm text-left hover:border-primary/50 transition-colors text-foreground"
          >
            {form.birthDay}
          </button>
          <span className="text-sm shrink-0">일</span>
        </div>
      </div>

      {/* ── 생년월일일 때만 표시 ── */}
      {!isExpected && (
        <>
          {/* 성별 */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground mb-1 block">아기 성별</label>
            <div className="flex gap-3">
              {(["girl", "boy"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => update("gender", g)}
                  className={`flex-1 py-2 rounded-3xl text-base font-semibold border transition-all flex items-center justify-center gap-2 ${
                    form.gender === g
                      ? "bg-[radial-gradient(ellipse_at_center,var(--warm-surface)_0%,var(--warm-surface-soft)_100%)] text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {g === "girl" ? <Venus size={18} /> : <Mars size={18} />}
                  {g === "girl" ? "여아" : "남아"}
                </button>
              ))}
            </div>
          </div>

          {/* 이유식 현황 */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground mb-1 block">
              이유식을 시작하셨나요?
            </label>
            <div className="flex gap-2">
              {(
                [
                  ["started", "이유식 진행 중"],
                  ["planned", "이유식 시작 예정"],
                  ["undecided", "아직 모르겠어요"],
                ] as const
              ).map(([s, label]) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => update("feedingStatus", s)}
                  className={`flex-1 py-2 rounded-3xl text-sm font-semibold border transition-all ${
                    form.feedingStatus === s
                      ? "bg-[radial-gradient(ellipse_at_center,var(--warm-surface)_0%,var(--warm-surface-soft)_100%)] text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {form.feedingStatus !== "undecided" && (
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">
                  {form.feedingStatus === "started"
                    ? "이유식 시작일"
                    : "이유식 시작 예정일"}
                </label>
                <div className="flex gap-2 items-center">
                  <div className="relative flex-[1.5]">
                    <button
                      type="button"
                      onClick={() => setFeedingYearOpen(!feedingYearOpen)}
                      className="w-full px-4 py-2 rounded-3xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-warm-surface-soft text-left"
                    >
                      {form.feedingYear}
                    </button>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />

                    {feedingYearOpen && (
                      <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                        {(form.feedingStatus === "planned" ? FEEDING_PLANNED_YEARS : FEEDING_STARTED_YEARS).filter((y) => form.feedingStatus !== "planned" || y >= today.getFullYear()).map((y) => (
                          <div
                            key={y}
                            onClick={() => { update("feedingYear", y); setFeedingYearOpen(false); setFeedingPickerStep("month"); setShowFeedingPicker(true); }}
                            className="px-4 py-2 text-sm hover:bg-primary/10 cursor-pointer"
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
                    onClick={() => { setFeedingPickerStep("month"); setShowFeedingPicker(true); }}
                    className="flex-1 px-4 py-2 rounded-3xl border border-border bg-card text-sm text-left hover:border-primary/50 transition-colors text-foreground"
                  >
                    {form.feedingMonth}
                  </button>
                  <span className="text-sm shrink-0">월</span>

                  <button
                    type="button"
                    onClick={() => { setFeedingPickerStep("day"); setShowFeedingPicker(true); }}
                    className="flex-1 px-4 py-2 rounded-3xl border border-border bg-card text-sm text-left hover:border-primary/50 transition-colors text-foreground"
                  >
                    {form.feedingDay}
                  </button>
                  <span className="text-sm shrink-0">일</span>
                </div>
              </div>
            )}
          </div>

          {/* 알레르기 확정 목록 */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground mb-1 flex items-baseline gap-1">
              알레르기 확정된 재료 등록
              <span className="relative group ml-0.5 inline-flex items-center self-center">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-muted-foreground/50 text-muted-foreground cursor-help text-[10px] font-bold leading-none select-none">?</span>
                <div className="absolute left-0 top-full mt-2 w-64 p-3 rounded-2xl bg-white border border-border shadow-md text-xs text-foreground font-normal leading-relaxed hidden group-hover:block z-50 pointer-events-none">
                  검사나 진료를 통해 알레르기로 확정된 재료를 등록하세요. 등록된 재료는 이유식 레시피 추천 시 자동으로 제외되어, 아이가 위험한 성분에 노출되지 않도록 보호합니다.
                </div>
              </span>
              <p className="text-xs font-medium text-muted-foreground block">(입력 생략 가능)</p>
            </label>
            <div className="relative">
              <input
                type="text"
                value={allergySearch}
                onChange={(e) => { setAllergySearch(e.target.value); setAllergyDropdownOpen(true); }}
                onFocus={() => setAllergyDropdownOpen(true)}
                onBlur={() => setTimeout(() => setAllergyDropdownOpen(false), 150)}
                placeholder="재료를 검색하세요."
                className="w-full px-4 py-2 rounded-3xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-warm-surface-soft placeholder:text-muted-foreground"
              />
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />

              {allergyDropdownOpen && allergySearch.trim() && (
                <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-3xl border border-border bg-card shadow-lg">
                  {allergyResults.filter((r) => !(form.allergens ?? []).some((a) => a.id === r.id)).length > 0 ? (
                    allergyResults
                      .filter((r) => !(form.allergens ?? []).some((a) => a.id === r.id))
                      .map((ingredient) => {
                        const inSafe = safeIdSet.has(ingredient.id);
                        return (
                          <div
                            key={ingredient.id}
                            onMouseDown={() => {
                              if (inSafe) {
                                showAllergenWarning(`'${ingredient.name}'은(는) 알레르기 안전 목록에 이미 등록된 재료입니다.`);
                                setAllergySearch("");
                                setAllergyResults([]);
                                setAllergyDropdownOpen(false);
                                return;
                              }
                              update("allergens", [...(form.allergens ?? []), { id: ingredient.id, name: ingredient.name, emoji: ingredient.emoji }]);
                              setAllergySearch("");
                              setAllergyResults([]);
                              setAllergyDropdownOpen(false);
                            }}
                            className={`px-4 py-2 text-sm cursor-pointer flex items-center gap-2 ${
                              inSafe ? "text-red-500 hover:bg-orange-50" : "hover:bg-primary/10"
                            }`}
                          >
                            <IngredientIcon name={ingredient.name} emoji={ingredient.emoji} size={17} />
                            <span className="flex-1">{ingredient.name}</span>
                            {inSafe && <span className="text-xs font-semibold text-red-400">안전 목록</span>}
                          </div>
                        );
                      })
                  ) : (
                    <div className="px-4 py-2 text-sm text-muted-foreground">
                      검색 결과가 없습니다
                    </div>
                  )}
                </div>
              )}
            </div>

            {(form.allergens ?? []).length > 0 && (
              <div className="mt-1">
                <div
                  ref={allergenChipsRef}
                  className={`flex flex-wrap gap-1.5 overflow-hidden transition-all duration-200 ${allergenChipsExpanded ? "" : "max-h-[3.75rem]"}`}
                >
                  {(form.allergens ?? []).map((allergen) => (
                    <span
                      key={allergen.id}
                      className="flex items-center gap-1 pl-3 pr-3 py-1 rounded-full bg-[radial-gradient(ellipse_at_center,var(--warm-surface)_0%,var(--terracotta-50)_100%)] border border-terracotta/50 text-xs font-semibold text-primary-foreground"
                    >
                      <IngredientIcon name={allergen.name} emoji={allergen.emoji} size={17} />
                      {allergen.name}
                      <button
                        type="button"
                        onClick={() => update("allergens", (form.allergens ?? []).filter((a) => a.id !== allergen.id))}
                        className="hover:opacity-70 transition-opacity"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                {allergenChipsNeedsToggle && (
                  <button
                    type="button"
                    onClick={() => setAllergenChipsExpanded((v) => !v)}
                    className="mt-1 text-sm w-full flex items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {allergenChipsExpanded ? "접기" : "더보기"}
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${allergenChipsExpanded ? "rotate-180" : ""}`}
                    />
                  </button>
                )}
              </div>
            )}

            {allergenWarning && (
              <div className="px-4 py-2.5 rounded-3xl bg-orange-50 border border-orange-200 text-sm text-orange-700 font-medium flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" />
                {allergenWarning}
              </div>
            )}

            {/* 이유식 단계 탭 */}
            <div className="flex gap-1 mt-3">
              {STAGE_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setAllergenStageFilter(tab.key)}
                  className={`flex-1 py-1 text-xs font-semibold rounded-t-sm border border-b-0 transition-all ${
                    allergenStageFilter === tab.key
                      ? "bg-muted/80 text-primary-foreground"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 5×4 그리드 — 가로 배치(이모지 + 이름) */}
            <div className="grid grid-cols-5 gap-1 -mt-1">
              {showStandardAllergenItems && filteredStandardAllergenItems.map((item) => {
                const selected = allergenIdSet.has(item.id!);
                return (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => {
                      if (selected) {
                        update("allergens", (form.allergens ?? []).filter((a) => a.id !== item.id));
                      } else {
                        update("allergens", [...(form.allergens ?? []), { id: item.id!, name: item.name, emoji: item.emoji }]);
                      }
                    }}
                    className={`flex flex-row items-center gap-1 px-1.5 py-1 rounded-xl border text-xs font-semibold transition-all ${
                      selected
                        ? "border border-terracotta/20 bg-[radial-gradient(ellipse_at_center,var(--warm-surface)_0%,var(--terracotta-50)_100%)] text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-primary/60 hover:bg-input-background"
                    }`}
                  >
                    <IngredientIcon name={item.name} emoji={item.emoji} size={18} />
                    <span className="leading-tight line-clamp-1 min-w-0">{item.name}</span>
                  </button>
                );
              })}
              {additionalAllergenPageItems.map((item) => {
                    const selected = allergenIdSet.has(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (selected) {
                            update("allergens", (form.allergens ?? []).filter((a) => a.id !== item.id));
                          } else {
                            update("allergens", [...(form.allergens ?? []), { id: item.id, name: item.name, emoji: item.emoji }]);
                          }
                        }}
                        className={`flex flex-row items-center gap-1 px-1.5 py-1 rounded-xl border text-xs font-semibold transition-all ${
                          selected
                            ? "bg-[radial-gradient(ellipse_at_center,var(--warm-surface)_0%,var(--terracotta-50)_100%)] text-primary-foreground"
                            : "border-border bg-card text-muted-foreground hover:border-primary/60 hover:bg-input-background"
                        }`}
                      >
                        <IngredientIcon name={item.name} emoji={item.emoji} size={18} />
                        <span className="leading-tight line-clamp-1 min-w-0">{item.name}</span>
                      </button>
                    );
                  })}
              {Array.from({ length: allergyGridEmptyCount }).map((_, i) => (
                <div key={`allergen-empty-${i}`} />
              ))}
            </div>
            {allergenTotalPages > 1 && (
              <div className="flex items-center justify-center gap-1 pt-1">
                <button
                  type="button"
                  onClick={() => setAllergenIngPage((p) => Math.max(0, p - 1))}
                  disabled={allergenIngPage === 0}
                  className="px-2 py-1 text-xs text-muted-foreground rounded-lg disabled:opacity-30 hover:bg-muted transition-colors"
                >
                  &lt;
                </button>
                {(() => {
                  const SHOW = 5;
                  let start = Math.max(0, allergenIngPage - Math.floor(SHOW / 2));
                  const end = Math.min(allergenTotalPages - 1, start + SHOW - 1);
                  if (end - start < SHOW - 1) start = Math.max(0, end - SHOW + 1);
                  return Array.from({ length: end - start + 1 }, (_, i) => start + i).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setAllergenIngPage(p)}
                      className={`w-7 h-7 text-xs rounded-lg transition-colors ${
                        p === allergenIngPage
                          ? "bg-muted font-bold text-primary-foreground"
                          : "hover:bg-muted text-muted-foreground"
                      }`}
                    >
                      {p + 1}
                    </button>
                  ));
                })()}
                <button
                  type="button"
                  onClick={() => setAllergenIngPage((p) => Math.min(allergenTotalPages - 1, p + 1))}
                  disabled={allergenIngPage === allergenTotalPages - 1}
                  className="px-2 py-1 text-xs text-muted-foreground rounded-lg disabled:opacity-30 hover:bg-muted transition-colors"
                >
                  &gt;
                </button>
              </div>
            )}
          </div>

          {/* 알레르기 안전 목록 */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground mb-1 flex items-baseline gap-1">
              알레르기 안전한 재료 등록
              <span className="relative group ml-0.5 inline-flex items-center self-center">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-muted-foreground/50 text-muted-foreground cursor-help text-[10px] font-bold leading-none select-none">?</span>
                <div className="absolute left-0 top-full mt-2 w-64 p-3 rounded-2xl bg-white border border-border shadow-md text-xs text-foreground font-normal leading-relaxed hidden group-hover:block z-50 pointer-events-none">
                  아기가 먹어본 재료를 미리 등록해주세요. 이미 먹은 재료가 기록되어야 알레르기 관리와 맞춤 이유식 추천을 더 정확하게 사용할 수 있어요.
                </div>
              </span>
              <p className="text-xs font-medium text-muted-foreground block">(입력 생략 가능)</p>
            </label>

            {/* 검색창 + 드롭다운 */}
            <div className="relative">
              <input
                type="text"
                value={safeSearch}
                onChange={(e) => { setSafeSearch(e.target.value); setSafeDropdownOpen(true); }}
                onFocus={() => setSafeDropdownOpen(true)}
                onBlur={() => setTimeout(() => setSafeDropdownOpen(false), 150)}
                placeholder="재료를 검색하세요."
                className="w-full px-4 py-2 rounded-3xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-warm-surface-soft placeholder:text-muted-foreground"
              />
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />

              {safeDropdownOpen && safeDropdownResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                  {safeDropdownResults.map((ing) => {
                    const selected = safeIdSet.has(ing.id);
                    const inAllergen = allergenIdSet.has(ing.id);
                    return (
                      <div
                        key={ing.id}
                        onMouseDown={() => {
                          if (inAllergen) {
                            showSafeWarning(`'${ing.name}'은(는) 알레르기 확정 목록에 이미 등록된 재료입니다.`);
                            setSafeSearch("");
                            setSafeDropdownOpen(false);
                            return;
                          }
                          toggleSafe(ing);
                          setSafeSearch("");
                          setSafeDropdownOpen(false);
                        }}
                        className={`px-4 py-2 text-sm cursor-pointer flex items-center gap-2 ${
                          inAllergen
                            ? "text-red-500 hover:bg-orange-50"
                            : selected
                              ? "bg-safe-bg text-foreground"
                              : "hover:bg-primary/10"
                        }`}
                      >
                        <IngredientIcon name={ing.name} emoji={ing.emoji} size={17} />
                        <span className="flex-1">{ing.name}</span>
                        {inAllergen && <span className="text-xs font-semibold text-red-400">확정 목록</span>}
                        {!inAllergen && selected && <Check size={13} className="text-warm-brand shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 선택된 안전 재료 칩 */}
            {(form.safeIngredients ?? []).length > 0 && (
              <div>
                <div
                  ref={safeChipsRef}
                  className={`flex flex-wrap gap-1.5 overflow-hidden transition-all duration-200 ${safeChipsExpanded ? "" : "max-h-[3.75rem]"}`}
                >
                  {[...(form.safeIngredients ?? [])].sort((a, b) =>
                    compareIngredientByMonth(
                      { ...a, recommended_month: ingredientMonthById.get(a.id) ?? null },
                      { ...b, recommended_month: ingredientMonthById.get(b.id) ?? null },
                    ),
                  ).map((s) => (
                    <span
                      key={s.id}
                      className="flex items-center gap-1 pl-3 pr-2 py-1 rounded-full bg-[radial-gradient(ellipse_at_center,var(--warm-surface)_0%,var(--safe-bg)_100%)] border border-secondary/70 text-xs font-semibold text-foreground"
                    >
                      <IngredientIcon name={s.name} emoji={s.emoji} size={17} />
                      {s.name}
                      <button
                        type="button"
                        onClick={() => update("safeIngredients", (form.safeIngredients ?? []).filter((x) => x.id !== s.id))}
                        className="hover:opacity-70 transition-opacity ml-0.5"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                {safeChipsNeedsToggle && (
                <button
                  type="button"
                  onClick={() => setSafeChipsExpanded((v) => !v)}
                  className="mt-1 text-xs w-full flex items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {safeChipsExpanded ? "접기" : "더보기"}
                  <ChevronDown
                    size={13}
                    className={`transition-transform ${safeChipsExpanded ? "rotate-180" : ""}`}
                  />
                </button>
                )}
              </div>
            )}

            {safeWarning && (
              <div className="px-4 py-2.5 rounded-3xl bg-orange-50 border border-orange-200 text-sm text-orange-700 font-medium flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" />
                {safeWarning}
              </div>
            )}

            {allIngredients.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">재료 목록 로딩 중...</div>
            ) : (
              <>
                {/* 이유식 단계 탭 */}
                <div className="flex gap-1 mt-3">
                  {STAGE_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setSafeStageFilter(tab.key)}
                      className={`flex-1 py-1 text-xs font-semibold rounded-t-sm border border-b-0 transition-all ${
                        safeStageFilter === tab.key
                          ? "bg-muted/80 text-primary-foreground"
                          : "border-border text-muted-foreground hover:border-secondary/50"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* 5×3 그리드 — 가로 배치(이모지 + 이름) */}
                <div className="grid grid-cols-5 gap-1 -mt-1">
                  {safePageItems.map((ing) => {
                    const selected = safeIdSet.has(ing.id);
                    return (
                      <button
                        key={ing.id}
                        type="button"
                        onClick={() => toggleSafe(ing)}
                        className={`flex flex-row items-center gap-1 px-1.5 py-1 rounded-xl border text-xs font-semibold transition-all ${
                          selected
                            ? "border border-secondary/20 bg-[radial-gradient(ellipse_at_center,var(--warm-surface)_0%,var(--safe-bg)_100%)] text-foreground"
                            : "border-border bg-card text-muted-foreground hover:border-secondary/60 hover:bg-safe-bg"
                        }`}
                      >
                        <IngredientIcon name={ing.name} emoji={ing.emoji} size={17} />
                        <span className="leading-tight line-clamp-1 min-w-0">{ing.name}</span>
                        {selected}
                      </button>
                    );
                  })}
                  {/* 빈 셀 채우기 */}
                  {Array.from({ length: SAFE_ITEMS_PER_PAGE - safePageItems.length }).map((_, i) => (
                    <div key={`empty-${i}`} />
                  ))}
                </div>

                {/* 페이지 네비게이션 */}
                {safeTotalPages > 1 && (
                  <div className="flex items-center justify-center gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => setSafeIngPage((p) => Math.max(0, p - 1))}
                      disabled={safeIngPage === 0}
                      className="px-2 py-1 text-xs text-muted-foreground rounded-lg disabled:opacity-30 hover:bg-muted transition-colors"
                    >
                      &lt;
                    </button>
                    {(() => {
                      const SHOW = 5;
                      let start = Math.max(0, safeIngPage - Math.floor(SHOW / 2));
                      const end = Math.min(safeTotalPages - 1, start + SHOW - 1);
                      if (end - start < SHOW - 1) start = Math.max(0, end - SHOW + 1);
                      return Array.from({ length: end - start + 1 }, (_, i) => start + i).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setSafeIngPage(p)}
                          className={`w-7 h-7 text-xs rounded-lg transition-colors ${
                            p === safeIngPage
                              ? "bg-muted font-bold text-primary-foreground"
                              : "hover:bg-muted text-muted-foreground"
                          }`}
                        >
                          {p + 1}
                        </button>
                      ));
                    })()}
                    <button
                      type="button"
                      onClick={() => setSafeIngPage((p) => Math.min(safeTotalPages - 1, p + 1))}
                      disabled={safeIngPage === safeTotalPages - 1}
                      className="px-2 py-1 text-xs text-muted-foreground rounded-lg disabled:opacity-30 hover:bg-muted transition-colors"
                    >
                      &gt;
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 신체 정보 */}
          <div className="space-y-3">
            <label className="flex items-end text-sm font-semibold text-foreground block gap-2">신체 정보
              <p className="text-xs font-medium text-muted-foreground block">(입력 생략 가능)</p>
            </label>

          {/* 키 */}
          <div className="flex items-center gap-3">
            <span className="text-sm shrink-0 w-10">키</span>
            <div className="flex items-center gap-1.5 w-[140px] shrink-0">
              <input
                type="number"
                value={form.height}
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
                    <button type="button" onClick={() => setHeightYearOpen(!heightYearOpen)}
                      className="w-full px-3 py-1.5 rounded-3xl border border-border bg-card text-sm text-left focus:outline-none focus:ring-2 focus:ring-warm-surface-soft">
                      {hd.year}
                    </button>
                    <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    {heightYearOpen && (
                      <div className="absolute z-10 mt-1 w-full max-h-40 overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                        {GROWTH_YEARS.map((y) => (
                          <div key={y} onClick={() => { updateHeightDate(toIso(y, hd.month, hd.day)); setHeightYearOpen(false); setHeightPickerStep("month"); setShowHeightPicker(true); }}
                            className="px-3 py-1.5 text-sm hover:bg-primary/10 cursor-pointer">{y}</div>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-sm shrink-0">년</span>
                  <button type="button" onClick={() => { setHeightPickerStep("month"); setShowHeightPicker(true); }}
                    className="flex-[2] px-3 py-1.5 rounded-3xl border border-border bg-card text-sm text-left hover:border-primary/50 transition-colors">
                    {hd.month}
                  </button>
                  <span className="text-sm shrink-0">월</span>
                  <button type="button" onClick={() => { setHeightPickerStep("day"); setShowHeightPicker(true); }}
                    className="flex-[2] px-3 py-1.5 rounded-3xl border border-border bg-card text-sm text-left hover:border-primary/50 transition-colors">
                    {hd.day}
                  </button>
                  <span className="text-sm shrink-0">일</span>
                </div>
              </div>
          </div>

          {/* 몸무게 */}
          <div className="flex items-center gap-3">
            <span className="text-sm shrink-0 w-10">몸무게</span>
            <div className="flex items-center gap-1.5 w-[140px] shrink-0">
              <input
                type="number"
                value={form.weight}
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
                    <button type="button" onClick={() => setWeightYearOpen(!weightYearOpen)}
                      className="w-full px-3 py-1.5 rounded-3xl border border-border bg-card text-sm text-left focus:outline-none focus:ring-2 focus:ring-warm-surface-soft">
                      {wd.year}
                    </button>
                    <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    {weightYearOpen && (
                      <div className="absolute z-10 mt-1 w-full max-h-40 overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                        {GROWTH_YEARS.map((y) => (
                          <div key={y} onClick={() => { updateWeightDate(toIso(y, wd.month, wd.day)); setWeightYearOpen(false); setWeightPickerStep("month"); setShowWeightPicker(true); }}
                            className="px-3 py-1.5 text-sm hover:bg-primary/10 cursor-pointer">{y}</div>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-sm shrink-0">년</span>
                  <button type="button" onClick={() => { setWeightPickerStep("month"); setShowWeightPicker(true); }}
                    className="flex-[2] px-3 py-1.5 rounded-3xl border border-border bg-card text-sm text-left hover:border-primary/50 transition-colors">
                    {wd.month}
                  </button>
                  <span className="text-sm shrink-0">월</span>
                  <button type="button" onClick={() => { setWeightPickerStep("day"); setShowWeightPicker(true); }}
                    className="flex-[2] px-3 py-1.5 rounded-3xl border border-border bg-card text-sm text-left hover:border-primary/50 transition-colors">
                    {wd.day}
                  </button>
                  <span className="text-sm shrink-0">일</span>
                </div>
              </div>
          </div>
          </div>
        </>
      )}

      {/* ── 버튼 ── */}
      <div className="pt-1 space-y-2">
        <button
          type="button"
          onClick={() => !saving && canSave && onSave(form, pendingFile)}
          disabled={!canSave || saving}
          className="w-full py-3.5 text-warm-fg text-base font-bold rounded-3xl
          bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--sage-100)_100%)]
          hover:bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--sage-200)_100%)]
          shadow-sm transition-all duration-300
          disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Check size={16} /> {saving ? "저장 중..." : saveLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            취소
          </button>
        )}
      </div>

      {/* ── 날짜 선택 팝업 ── */}
      {showBirthPicker && (
        <MonthDayPicker
          year={form.birthYear}
          value={{ month: form.birthMonth, day: form.birthDay }}
          onChange={({ month, day }) => {
            update("birthMonth", month);
            update("birthDay", day);
          }}
          onClose={() => setShowBirthPicker(false)}
          initialStep={birthPickerStep}
          minDate={
            isExpected && form.birthYear === today.getFullYear()
              ? { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() }
              : undefined
          }
          maxDate={
            !isExpected && form.birthYear === today.getFullYear()
              ? { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() }
              : undefined
          }
        />
      )}
      {showFeedingPicker && (
        <MonthDayPicker
          year={form.feedingYear}
          value={{ month: form.feedingMonth, day: form.feedingDay }}
          onChange={({ month, day }) => {
            update("feedingMonth", month);
            update("feedingDay", day);
          }}
          onClose={() => setShowFeedingPicker(false)}
          initialStep={feedingPickerStep}
          minDate={
            form.feedingStatus === "planned" && form.feedingYear === today.getFullYear()
              ? { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() }
              : undefined
          }
        />
      )}
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
  );
}
