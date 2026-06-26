import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import {
  AlertTriangle,
  CheckCircle,
  Check,
  Plus,
  X,
  Sparkles,
  FileText,
  Download,
  CircleAlert,
  ShieldAlert,
  CirclePlus,
  ChevronLeft,
  ChevronDown,
  Search,
} from "lucide-react";
import ProtectedPage from "../../components/ProtectedPage";
import { useApp } from "../../context/AppContext";
import {
  listTestings,
  createTesting,
  updateTesting,
  deleteTesting,
  createSymptomCheck,
  fetchReportBlob,
  fetchReportFile,
  fetchReportImage,
  listConfirmedAllergies,
  createConfirmedAllergy,
  updateConfirmedAllergy,
  deleteConfirmedAllergy,
  type IngredientTestingResponse,
  type ConfirmedAllergyResponse,
} from "../../api/allergy";
import { SYMPTOM_PRESETS, SEVERITY_OPTIONS } from "./types";
import {
  getSuspectedIngredientsPrioritized,
  STANDARD_KOREAN_ALLERGENS,
} from "../../data/crossReactivity";
import { listIngredients, type IngredientResponse } from "../../api/ingredients";
import { ApiError } from "../../api/client";
import { IngredientIcon } from "../../components/IngredientIcon";
import { TestingCard } from "./TestingCard";
import { IngredientHistoryPopup } from "./TestingModals";
import { HospitalFinder } from "./HospitalFinder";
import { TimeDropdown } from "../Schedule/TimeDropdown";
import { dedupeRequest, readSessionCache, writeSessionCache } from "../../utils/sessionCache";
import TutorialModal from "../../components/TutorialModal";
import { allergySlides } from "./tutorialSlides";


const FIXED_YEAR = new Date().getFullYear();

type SafeStageFilter = "all" | "early" | "mid" | "late" | "final";
const SAFE_STAGE_TABS: { key: SafeStageFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "early", label: "초기" },
  { key: "mid", label: "중기" },
  { key: "late", label: "후기" },
  { key: "final", label: "완료기" },
];
const SAFE_MODAL_PER_PAGE = 20;

function safeStageFromMonth(m: number | null): Exclude<SafeStageFilter, "all"> | null {
  if (m === null) return null;
  if (m <= 6) return "early";
  if (m <= 8) return "mid";
  if (m <= 11) return "late";
  return "final";
}
function matchesSafeStageFilter(m: number | null, filter: SafeStageFilter): boolean {
  if (filter === "all") return true;
  return safeStageFromMonth(m) === filter;
}
function compareIngByMonth(
  a: Pick<IngredientResponse, "name" | "recommended_month">,
  b: Pick<IngredientResponse, "name" | "recommended_month">,
): number {
  const ma = a.recommended_month ?? Number.MAX_SAFE_INTEGER;
  const mb = b.recommended_month ?? Number.MAX_SAFE_INTEGER;
  if (ma !== mb) return ma - mb;
  return a.name.localeCompare(b.name, "ko");
}
const ALLERGY_CACHE_TTL_MS = 2 * 60 * 1000;
const INGREDIENT_EMOJI_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("파일을 읽지 못했습니다."));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("파일을 변환하지 못했습니다."));
        return;
      }
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

function allergyTestsCacheKey(babyId: string): string {
  return `mammacare:allergy:testings:v2:${babyId}`;
}

function confirmedAllergiesCacheKey(babyId: string): string {
  return `mammacare:allergy:confirmed:${babyId}`;
}

function clearAllergyListCaches(babyId: string): void {
  sessionStorage.removeItem(allergyTestsCacheKey(babyId));
  sessionStorage.removeItem(confirmedAllergiesCacheKey(babyId));
}

function ingredientEmojiCacheKey(names: string[]): string {
  return `mammacare:ingredient-emojis:${names.slice().sort().join("|")}`;
}


function EntryDatePicker({
  entry,
  initialStep,
  onUpdate,
  onClose,
}: {
  entry: { id: string; date: string };
  initialStep: "month" | "day";
  onUpdate: (id: string, y: number, m: number, d: number) => void;
  onClose: () => void;
}) {
  useBodyScrollLock();
  const parts = entry.date.split("-").map(Number);
  const [step, setStep] = useState<"month" | "day">(initialStep);
  const [selMonth, setSelMonth] = useState(parts[1]);
  const numDays = new Date(FIXED_YEAR, selMonth, 0).getDate();

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center px-4">
      <div className="bg-card rounded-3xl p-5 w-72 shadow-xl border border-border">
        {step === "month" && (
          <>
            <div className="text-sm font-bold mb-4 text-center text-foreground">반응 날짜 기록</div>
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setSelMonth(m); setStep("day"); }}
                  className={`py-2 rounded-xl text-sm font-semibold transition-colors ${m === parts[1] ? "bg-[#C5E5FA] text-primary-foreground" : "hover:bg-[#C5E5FA]/20 text-foreground"
                    }`}
                >
                  {m}월
                </button>
              ))}
            </div>
          </>
        )}
        {step === "day" && (
          <>
            <div className="relative flex items-center mb-4">
              <button
                type="button"
                onClick={() => setStep("month")}
                className="absolute left-0 text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1"
              >
                <ChevronLeft size={13} /> 월
              </button>
              <span className="w-full text-center text-sm font-bold text-foreground">{FIXED_YEAR}년 {selMonth}월</span>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: numDays }, (_, i) => i + 1).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => { onUpdate(entry.id, FIXED_YEAR, selMonth, d); onClose(); }}
                  className={`aspect-square text-xs rounded-lg transition-colors flex items-center justify-center ${d === parts[2] && selMonth === parts[1]
                    ? "bg-[#C5E5FA] text-primary-foreground font-bold"
                    : "hover:bg-[#C5E5FA]/20 text-foreground"
                    }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </>
        )}
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          취소
        </button>
      </div>
    </div>
  );
}

function AllergyInner() {
  const { activeBaby, token, refreshTestings: refreshGlobalTestings, refreshConfirmedAllergies: refreshGlobalConfirmedAllergies } = useApp();
  const initialTestings = activeBaby
    ? readSessionCache<IngredientTestingResponse[]>(allergyTestsCacheKey(activeBaby.id))
    : null;
  const initialConfirmedAllergies = activeBaby
    ? readSessionCache<ConfirmedAllergyResponse[]>(confirmedAllergiesCacheKey(activeBaby.id))
    : null;

  const [testings, setTestings] = useState<IngredientTestingResponse[]>(initialTestings ?? []);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const testingsLengthRef = useRef(testings.length);

  const [showAddModal, setShowAddModal] = useState(false);
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [searchResults, setSearchResults] = useState<IngredientResponse[]>([]);
  const [selectedIngredient, setSelectedIngredient] = useState<IngredientResponse | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const [confirmedAllergies, setConfirmedAllergies] = useState<ConfirmedAllergyResponse[]>(initialConfirmedAllergies ?? []);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState("");

  const [showAddConfirmedModal, setShowAddConfirmedModal] = useState(false);
  const [confirmedSearch, setConfirmedSearch] = useState("");
  const [confirmedSearchResults, setConfirmedSearchResults] = useState<IngredientResponse[]>([]);
  const [addingConfirmed, setAddingConfirmed] = useState(false);
  const [addConfirmedError, setAddConfirmedError] = useState("");
  // 확정 재료 추가 — 다중선택 + 그리드
  const [allIngredientsForConfirmedModal, setAllIngredientsForConfirmedModal] = useState<IngredientResponse[]>([]);
  const [confirmedModalStageFilter, setConfirmedModalStageFilter] = useState<SafeStageFilter>("all");
  const [confirmedModalPage, setConfirmedModalPage] = useState(0);
  const [confirmedModalMultiSelected, setConfirmedModalMultiSelected] = useState<{ id: number; name: string; emoji: string | null }[]>([]);
  const [confirmedModalDropdownOpen, setConfirmedModalDropdownOpen] = useState(false);

  // 안전/반응 직접 추가 모달
  const [addTestingTarget, setAddTestingTarget] = useState<null | "safe" | "reaction">(null);
  const [addTestingSearch, setAddTestingSearch] = useState("");
  const [addTestingResults, setAddTestingResults] = useState<IngredientResponse[]>([]);
  const [addTestingSelected, setAddTestingSelected] = useState<IngredientResponse | null>(null);
  const [addingTesting, setAddingTesting] = useState(false);
  const [addTestingError, setAddTestingError] = useState("");
  // 안전 재료 추가 — 다중선택 + 그리드
  const [allIngredientsForSafeModal, setAllIngredientsForSafeModal] = useState<IngredientResponse[]>([]);
  const [safeModalStageFilter, setSafeModalStageFilter] = useState<SafeStageFilter>("all");
  const [safeModalPage, setSafeModalPage] = useState(0);
  const [safeModalMultiSelected, setSafeModalMultiSelected] = useState<IngredientResponse[]>([]);
  const [safeModalDropdownOpen, setSafeModalDropdownOpen] = useState(false);
  // 반응 추가 — 시간대별 증상 항목
  const [symptomEntries, setSymptomEntries] = useState<{
    id: string; date: string; time: string;
    symptoms: { type: string; severity: string }[];
  }[]>([]);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [reactionDescription, setReactionDescription] = useState("");
  // 삭제 중인 testing id
  const [deletingTestingId, setDeletingTestingId] = useState<string | null>(null);

  // 확정 재료 수정 모달
  const [editingConfirmed, setEditingConfirmed] = useState<ConfirmedAllergyResponse | null>(null);
  const [editConfirmedDate, setEditConfirmedDate] = useState("");
  const [editConfirmedNote, setEditConfirmedNote] = useState("");
  const [savingConfirmedEdit, setSavingConfirmedEdit] = useState(false);
  const [editConfirmedError, setEditConfirmedError] = useState("");
  const [deletingConfirmedId, setDeletingConfirmedId] = useState<string | null>(null);
  const [editConfirmedDatePicker, setEditConfirmedDatePicker] = useState<"month" | "day" | null>(null);

  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictMessage, setConflictMessage] = useState("");
  const [showAddSuccessInfo, setShowAddSuccessInfo] = useState(false);
  const [addSuccessInfoMessage, setAddSuccessInfoMessage] = useState("");

  // 튜토리얼 연결
  const [showTutorial, setShowTutorial] = useState(false);

  const [activeDatePicker, setActiveDatePicker] = useState<{
    entryId: string;
    initialStep: "month" | "day";
  } | null>(null);

  const [reportLoading, setReportLoading] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [jpgDownloading, setJpgDownloading] = useState(false);
  const [ingredientEmojiMap, setIngredientEmojiMap] = useState<Record<string, string | null>>({});
  const [suspectedPopup, setSuspectedPopup] = useState<{
    name: string;
    emoji: string | null;
    severity: string;
    confirmed: string[];
    reaction: string[];
  } | null>(null);
  const [reportError, setReportError] = useState("");
  const [reportPreviewUrl, setReportPreviewUrl] = useState<string | null>(null);
  const [reportBlob, setReportBlob] = useState<Blob | null>(null);

  const [historyTarget, setHistoryTarget] = useState<{
    ingredientId: number;
    ingredientName: string;
    ingredientEmoji: string | null;
  } | null>(null);

  const anyModalOpen = !!(
    showAddModal || addTestingTarget || editingConfirmed || showAddConfirmedModal ||
    showConflictModal || showAddSuccessInfo || reportPreviewUrl || activeDatePicker ||
    historyTarget || showTutorial || editConfirmedDatePicker || suspectedPopup
  );
    useBodyScrollLock(anyModalOpen);

  useEffect(() => {
    testingsLengthRef.current = testings.length;
  }, [testings.length]);

  const handleOpenReportModal = async () => {
    if (!activeBaby || !token) return;
    setReportLoading(true);
    setReportError("");
    try {
      if (useImagePreview) {
        const { previewUrl, blob } = await fetchReportImage(activeBaby.id, token);
        setReportPreviewUrl(previewUrl);
        setReportBlob(blob);
      } else {
        const url = await fetchReportBlob(activeBaby.id, token);
        setReportPreviewUrl(url);
      }
    } catch (e) {
      setReportError(e instanceof Error ? e.message : "리포트 생성에 실패했습니다.");
    } finally {
      setReportLoading(false);
    }
  };

  const handleCloseReportModal = () => {
    if (!useImagePreview && reportPreviewUrl) URL.revokeObjectURL(reportPreviewUrl);
    setReportPreviewUrl(null);
    setReportBlob(null);
  };

  const handleDownloadReport = () => {
    if (!reportPreviewUrl) return;
    const a = document.createElement("a");
    a.href = reportPreviewUrl;
    a.download = "allergy_report.pdf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const saveReportFileApp = async (blob: Blob, filename: string, title: string) => {
    try {
      const permission = await Filesystem.checkPermissions();
      if (permission.publicStorage !== "granted") {
        const requested = await Filesystem.requestPermissions();
        if (requested.publicStorage !== "granted") {
          throw new Error("파일 저장 권한이 필요합니다.");
        }
      }
      const data = await blobToBase64(blob);
      const saved = await Filesystem.writeFile({
        path: `MammaCare/${filename}`,
        data,
        directory: Directory.Documents,
        recursive: true,
      });
      await Share.share({
        title,
        files: [saved.uri],
        dialogTitle: `${title} 저장`,
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        throw e;
      }
    }
  };

  const handleDownloadReportPdfApp = async () => {
    if (!activeBaby || !token) return;
    setPdfDownloading(true);
    setReportError("");
    try {
      const blob = await fetchReportFile(activeBaby.id, token, 7, "pdf");
      await saveReportFileApp(blob, "allergy_report.pdf", "알레르기 리포트 PDF");
    } catch (e) {
      setReportError(e instanceof Error ? e.message : "PDF 다운로드에 실패했습니다.");
    } finally {
      setPdfDownloading(false);
    }
  };

  const handleDownloadReportJpg = async () => {
    if (!activeBaby || !token) return;
    setJpgDownloading(true);
    setReportError("");
    try {
      if (isApp) {
        const blob = reportBlob ?? await fetchReportFile(activeBaby.id, token, 7, "jpeg");
        await saveReportFileApp(blob, "allergy_report.jpg", "알레르기 리포트 JPG");
      } else {
        const url = await fetchReportBlob(activeBaby.id, token, 7, "jpeg");
        const a = document.createElement("a");
        a.href = url;
        a.download = "allergy_report.jpg";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setReportError(e instanceof Error ? e.message : "JPG 생성에 실패했습니다.");
    } finally {
      setJpgDownloading(false);
    }
  };

  const fetchConfirmedAllergies = useCallback(async () => {
    if (!activeBaby || !token) return;
    const cacheKey = confirmedAllergiesCacheKey(activeBaby.id);
    const cached = readSessionCache<ConfirmedAllergyResponse[]>(cacheKey);
    if (cached) setConfirmedAllergies(cached);
    try {
      const data = await dedupeRequest(cacheKey, () => listConfirmedAllergies(activeBaby.id, token));
      setConfirmedAllergies(data);
      writeSessionCache(cacheKey, data, ALLERGY_CACHE_TTL_MS);
    } catch {
      // 무시
    }
  }, [activeBaby?.id, token]);

  const handleConfirmAllergy = async (item: IngredientTestingResponse) => {
    if (!activeBaby || !token) return;
    setConfirmingId(item.id);
    setConfirmError("");
    try {
      await createConfirmedAllergy(
        {
          baby_id: activeBaby.id,
          ingredient_id: item.ingredient_id,
          confirmed_date: new Date().toISOString().split("T")[0],
        },
        token,
      );
      clearAllergyListCaches(activeBaby.id);
      setTestings((prev) => prev.filter((t) => t.ingredient_id !== item.ingredient_id));
      await Promise.all([fetchConfirmedAllergies(), fetchTestings()]);
      refreshGlobalTestings();
      refreshGlobalConfirmedAllergies();
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : "확정 등록에 실패했습니다.");
    } finally {
      setConfirmingId(null);
    }
  };

  const fetchTestings = useCallback(async () => {
    if (!activeBaby || !token) return;
    const cacheKey = allergyTestsCacheKey(activeBaby.id);
    const cached = readSessionCache<IngredientTestingResponse[]>(cacheKey);
    if (cached) setTestings(cached);
    setLoading(!cached && testingsLengthRef.current === 0);
    setRefreshing(Boolean(cached || testingsLengthRef.current > 0));
    try {
      const data = await dedupeRequest(cacheKey, () => listTestings(activeBaby.id, token));
      setTestings(data);
      writeSessionCache(cacheKey, data, ALLERGY_CACHE_TTL_MS);
    } catch {
      // 에러는 무시하고 빈 목록 유지
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeBaby?.id, token]);

  useEffect(() => {
    fetchTestings();
  }, [fetchTestings]);

  useEffect(() => {
    fetchConfirmedAllergies();
  }, [fetchConfirmedAllergies]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchTestings();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchTestings]);

  useEffect(() => {
    if (!ingredientSearch.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await listIngredients({ search: ingredientSearch });
        setSearchResults(results.slice(0, 5));
      } catch {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [ingredientSearch]);

  useEffect(() => {
    if (!addTestingSearch.trim()) {
      setAddTestingResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await listIngredients({ search: addTestingSearch });
        setAddTestingResults(results.slice(0, 8));
      } catch {
        setAddTestingResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [addTestingSearch]);

  useEffect(() => {
    if (addTestingTarget === "safe") {
      listIngredients().then(setAllIngredientsForSafeModal).catch(() => {});
    }
  }, [addTestingTarget]);

  useEffect(() => {
    setSafeModalPage(0);
  }, [safeModalStageFilter]);

  useEffect(() => {
    if (!confirmedSearch.trim()) {
      setConfirmedSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await listIngredients({ search: confirmedSearch });
        setConfirmedSearchResults(results.slice(0, 8));
      } catch {
        setConfirmedSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [confirmedSearch]);

  useEffect(() => {
    if (showAddConfirmedModal) {
      listIngredients().then(setAllIngredientsForConfirmedModal).catch(() => {});
    }
  }, [showAddConfirmedModal]);

  useEffect(() => {
    setConfirmedModalPage(0);
  }, [confirmedModalStageFilter]);


  const handleAddIngredient = async () => {
    if (!selectedIngredient || !activeBaby || !token) return;
    setAdding(true);
    setAddError("");
    try {
      const now = new Date();
      const newTestEnd = new Date(now.getTime() + 72 * 60 * 60 * 1000);

      const conflict = testings.find((t) => {
        const tStart = new Date(t.test_start_date);
        const tEnd = t.test_end_date
          ? new Date(t.test_end_date)
          : new Date(tStart.getTime() + 72 * 60 * 60 * 1000);
        if (tEnd <= now) return false;
        return now < tEnd && newTestEnd > tStart;
      });

      if (conflict) {
        const tStart = new Date(conflict.test_start_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startDay = new Date(tStart);
        startDay.setHours(0, 0, 0, 0);
        const diffDays = Math.round((startDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const dayLabel = diffDays === 0 ? "오늘" : diffDays === 1 ? "내일" : diffDays === 2 ? "모레" : `${tStart.getMonth() + 1}월 ${tStart.getDate()}일`;
        setConflictMessage(`'${conflict.ingredient_name}' 테스트가 ${dayLabel}부터 시작됩니다.\n재료를 교체하려면 일정을 수정해주세요.`);
        setShowConflictModal(true);
        return;
      }

      await createTesting(
        {
          baby_id: activeBaby.id,
          ingredient_id: selectedIngredient.id,
          test_start_date: now.toISOString(),
        },
        token,
      );

      const fmt = (d: Date) => `${d.getMonth() + 1}월 ${d.getDate()}일`;
      setAddSuccessInfoMessage(`식단에 꼭 테스트 재료가 포함되게 해주세요! (${fmt(now)} ~${fmt(newTestEnd)})`);
      setShowAddSuccessInfo(true);

      setShowAddModal(false);
      setIngredientSearch("");
      setSelectedIngredient(null);
      await fetchTestings();
      refreshGlobalTestings();
    } catch (e) {
      setAddError(e instanceof ApiError ? e.message : "재료 추가에 실패했습니다.");
    } finally {
      setAdding(false);
    }
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setIngredientSearch("");
    setSelectedIngredient(null);
    setAddError("");
  };

  const handleConflictConfirm = () => {
    setShowConflictModal(false);
    setConflictMessage("");
    setShowAddModal(false);
    setIngredientSearch("");
    setSelectedIngredient(null);
    setAddError("");
  };

  const makeEntry = () => {
    const now = new Date();
    return {
      id: `${Date.now()}-${Math.random()}`,
      date: now.toISOString().split("T")[0],
      time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      symptoms: [] as { type: string; severity: string }[],
    };
  };

  const updateEntryDate = (id: string, y: number, m: number, d: number) => {
    const maxDay = new Date(y, m, 0).getDate();
    updateEntry(id, {
      date: `${y}-${String(m).padStart(2, "0")}-${String(Math.min(d, maxDay)).padStart(2, "0")}`,
    });
  };

  const updateEntryTime = (id: string, h: number, min: number) => {
    updateEntry(id, { time: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}` });
  };

  const closeAddTestingModal = () => {
    setAddTestingTarget(null);
    setAddTestingSearch("");
    setAddTestingResults([]);
    setAddTestingSelected(null);
    setAddTestingError("");
    setSymptomEntries([]);
    setExpandedEntryId(null);
    setReactionDescription("");
    setActiveDatePicker(null);
    setSafeModalMultiSelected([]);
    setSafeModalStageFilter("all");
    setSafeModalPage(0);
    setSafeModalDropdownOpen(false);
  };

  const openAddTestingModal = (target: "safe" | "reaction") => {
    if (target === "reaction") {
      const first = makeEntry();
      setSymptomEntries([first]);
      setExpandedEntryId(first.id);
    }
    setAddTestingTarget(target);
  };

  const addEntry = () => {
    const entry = makeEntry();
    setSymptomEntries((prev) => [...prev, entry]);
    setExpandedEntryId(entry.id);
  };

  const removeEntry = (id: string) =>
    setSymptomEntries((prev) => prev.filter((e) => e.id !== id));

  const updateEntry = (id: string, patch: Partial<{ date: string; time: string }>) =>
    setSymptomEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const toggleEntrySymptom = (id: string, type: string) =>
    setSymptomEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        const exists = e.symptoms.find((s) => s.type === type);
        return {
          ...e,
          symptoms: exists
            ? e.symptoms.filter((s) => s.type !== type)
            : [...e.symptoms, { type, severity: "mild" }],
        };
      }),
    );

  const setEntrySeverity = (id: string, type: string, severity: string) =>
    setSymptomEntries((prev) =>
      prev.map((e) =>
        e.id !== id
          ? e
          : { ...e, symptoms: e.symptoms.map((s) => (s.type === type ? { ...s, severity } : s)) },
      ),
    );

  const existingSafeIngredientIdSet = useMemo(
    () => new Set(testings.filter((t) => t.test_status === "completed_safe").map((t) => t.ingredient_id)),
    [testings],
  );

  const safeModalFilteredIngredients = useMemo(
    () =>
      allIngredientsForSafeModal
        .filter(
          (ing) =>
            matchesSafeStageFilter(ing.recommended_month, safeModalStageFilter) &&
            !existingSafeIngredientIdSet.has(ing.id),
        )
        .sort(compareIngByMonth),
    [allIngredientsForSafeModal, safeModalStageFilter, existingSafeIngredientIdSet],
  );
  const safeModalTotalPages = Math.ceil(safeModalFilteredIngredients.length / SAFE_MODAL_PER_PAGE);
  const safeModalPageItems = safeModalFilteredIngredients.slice(
    safeModalPage * SAFE_MODAL_PER_PAGE,
    (safeModalPage + 1) * SAFE_MODAL_PER_PAGE,
  );
  const safeModalSelectedIdSet = useMemo(
    () => new Set(safeModalMultiSelected.map((i) => i.id)),
    [safeModalMultiSelected],
  );

  const CONFIRMED_MODAL_PER_PAGE = 20;

  const existingConfirmedIdSet = useMemo(
    () => new Set(confirmedAllergies.map((c) => c.ingredient_id)),
    [confirmedAllergies],
  );

  const confirmedModalStandardAllergenItems = useMemo(
    () =>
      STANDARD_KOREAN_ALLERGENS.map((allergen) => {
        const dbMatch = allIngredientsForConfirmedModal.find((ing) => ing.name === allergen.name);
        return {
          id: dbMatch?.id ?? null,
          name: allergen.name,
          emoji: dbMatch?.emoji ?? null,
          recommended_month: dbMatch?.recommended_month ?? null,
        };
      }),
    [allIngredientsForConfirmedModal],
  );

  const confirmedModalAdditionalItems = useMemo(() => {
    const standardNames = new Set(STANDARD_KOREAN_ALLERGENS.map((a) => a.name));
    return allIngredientsForConfirmedModal
      .filter((ing) => !standardNames.has(ing.name))
      .sort(compareIngByMonth);
  }, [allIngredientsForConfirmedModal]);

  const confirmedModalFilteredStandard = useMemo(
    () =>
      confirmedModalStandardAllergenItems.filter(
        (item) =>
          item.id !== null &&
          matchesSafeStageFilter(item.recommended_month, confirmedModalStageFilter) &&
          !existingConfirmedIdSet.has(item.id),
      ),
    [confirmedModalStandardAllergenItems, confirmedModalStageFilter, existingConfirmedIdSet],
  );

  const confirmedModalFilteredAdditional = useMemo(
    () =>
      confirmedModalAdditionalItems.filter(
        (item) =>
          matchesSafeStageFilter(item.recommended_month, confirmedModalStageFilter) &&
          !existingConfirmedIdSet.has(item.id),
      ),
    [confirmedModalAdditionalItems, confirmedModalStageFilter, existingConfirmedIdSet],
  );

  const confirmedModalStandardCount = confirmedModalFilteredStandard.length;
  const confirmedModalFirstPageAdditionalSize = Math.max(0, CONFIRMED_MODAL_PER_PAGE - confirmedModalStandardCount);
  const confirmedModalAdditionalRemainingCount = Math.max(
    0,
    confirmedModalFilteredAdditional.length - confirmedModalFirstPageAdditionalSize,
  );
  const confirmedModalTotalPages = Math.max(
    1,
    1 + Math.ceil(confirmedModalAdditionalRemainingCount / CONFIRMED_MODAL_PER_PAGE),
  );
  const confirmedModalAdditionalPageItems =
    confirmedModalPage === 0
      ? confirmedModalFilteredAdditional.slice(0, confirmedModalFirstPageAdditionalSize)
      : confirmedModalFilteredAdditional.slice(
          confirmedModalFirstPageAdditionalSize + (confirmedModalPage - 1) * CONFIRMED_MODAL_PER_PAGE,
          confirmedModalFirstPageAdditionalSize + confirmedModalPage * CONFIRMED_MODAL_PER_PAGE,
        );
  const confirmedModalShowStandard = confirmedModalPage === 0;
  const confirmedModalGridUsedCount =
    (confirmedModalShowStandard ? confirmedModalStandardCount : 0) + confirmedModalAdditionalPageItems.length;
  const confirmedModalGridEmptyCount = Math.max(0, CONFIRMED_MODAL_PER_PAGE - confirmedModalGridUsedCount);

  const confirmedModalSelectedIdSet = useMemo(
    () => new Set(confirmedModalMultiSelected.map((i) => i.id)),
    [confirmedModalMultiSelected],
  );

  const handleAddTestingWithStatus = async () => {
    if (!activeBaby || !token || !addTestingTarget) return;

    if (addTestingTarget === "safe") {
      if (safeModalMultiSelected.length === 0) return;
      setAddingTesting(true);
      setAddTestingError("");
      const startDate = new Date(Date.now() - 96 * 60 * 60 * 1000);
      try {
        for (const ing of safeModalMultiSelected) {
          await createTesting(
            {
              baby_id: activeBaby.id,
              ingredient_id: ing.id,
              test_start_date: startDate.toISOString(),
              test_status: "completed_safe" as const,
            },
            token,
          );
        }
        closeAddTestingModal();
        await fetchTestings();
        refreshGlobalTestings();
      } catch (e) {
        setAddTestingError(e instanceof ApiError ? e.message : "재료 추가에 실패했습니다.");
      } finally {
        setAddingTesting(false);
      }
      return;
    }

    // 반응 재료 추가
    if (!addTestingSelected) return;
    setAddingTesting(true);
    setAddTestingError("");
    const validEntries = symptomEntries.filter((e) => e.date && e.time);
    const earliestMs =
      validEntries.length > 0
        ? Math.min(...validEntries.map((e) => new Date(`${e.date}T${e.time}:00`).getTime()))
        : Date.now();
    const startDate = new Date(earliestMs - 30 * 60 * 1000);

    try {
      const existingSafe = testings.find(
        (t) =>
          t.ingredient_id === addTestingSelected.id &&
          t.test_status === "completed_safe",
      );
      const targetId = existingSafe
        ? existingSafe.id
        : (
            await createTesting(
              {
                baby_id: activeBaby.id,
                ingredient_id: addTestingSelected.id,
                test_start_date: startDate.toISOString(),
              },
              token,
            )
          ).id;

      let firstCheck = true;
      for (const entry of validEntries) {
        if (entry.symptoms.length === 0 && !(firstCheck && reactionDescription)) continue;
        await createSymptomCheck(
          targetId,
          {
            checked_at: new Date(`${entry.date}T${entry.time}:00`).toISOString(),
            has_reaction: true,
            description: firstCheck && reactionDescription ? reactionDescription : undefined,
            symptom_items: entry.symptoms.map((s) => ({ symptom_type: s.type, severity: s.severity })),
          },
          token,
        );
        firstCheck = false;
      }
      await updateTesting(targetId, { test_status: "completed_reaction" }, token);
      closeAddTestingModal();
      await fetchTestings();
      refreshGlobalTestings();
    } catch (e) {
      setAddTestingError(e instanceof ApiError ? e.message : "재료 추가에 실패했습니다.");
    } finally {
      setAddingTesting(false);
    }
  };

  const handleDeleteTesting = async (id: string) => {
    if (!token) return;
    setDeletingTestingId(id);
    try {
      await deleteTesting(id, token);
      await fetchTestings();
      refreshGlobalTestings();
    } catch {
      // 무시
    } finally {
      setDeletingTestingId(null);
    }
  };

  const handleSaveConfirmedEdit = async () => {
    if (!editingConfirmed || !token) return;
    setSavingConfirmedEdit(true);
    setEditConfirmedError("");
    try {
      await updateConfirmedAllergy(
        editingConfirmed.id,
        {
          confirmed_date: editConfirmedDate || undefined,
          note: editConfirmedNote || undefined,
        },
        token,
      );
      setEditingConfirmed(null);
      await fetchConfirmedAllergies();
    } catch (e) {
      setEditConfirmedError(e instanceof Error ? e.message : "수정에 실패했습니다.");
    } finally {
      setSavingConfirmedEdit(false);
    }
  };

  const handleDeleteConfirmed = async (id: string) => {
    if (!token) return;
    setDeletingConfirmedId(id);
    try {
      await deleteConfirmedAllergy(id, token);
      await fetchConfirmedAllergies();
      refreshGlobalConfirmedAllergies();
    } catch {
      // 무시
    } finally {
      setDeletingConfirmedId(null);
    }
  };

  const closeAddConfirmedModal = () => {
    setShowAddConfirmedModal(false);
    setConfirmedSearch("");
    setConfirmedSearchResults([]);
    setAddConfirmedError("");
    setConfirmedModalMultiSelected([]);
    setConfirmedModalStageFilter("all");
    setConfirmedModalPage(0);
    setConfirmedModalDropdownOpen(false);
  };

  const handleAddConfirmedAllergy = async () => {
    if (confirmedModalMultiSelected.length === 0 || !activeBaby || !token) return;
    setAddingConfirmed(true);
    setAddConfirmedError("");
    try {
      for (const ing of confirmedModalMultiSelected) {
        await createConfirmedAllergy(
          {
            baby_id: activeBaby.id,
            ingredient_id: ing.id,
            confirmed_date: new Date().toISOString().split("T")[0],
          },
          token,
        );
      }
      closeAddConfirmedModal();
      await fetchConfirmedAllergies();
      refreshGlobalConfirmedAllergies();
    } catch (e) {
      setAddConfirmedError(e instanceof Error ? e.message : "확정 재료 추가에 실패했습니다.");
    } finally {
      setAddingConfirmed(false);
    }
  };

  const testing = testings.filter(
    (t) => t.test_status === "testing" && !existingConfirmedIdSet.has(t.ingredient_id),
  );

  const deduplicateByIngredient = (list: IngredientTestingResponse[]) => {
    const map = new Map<number, IngredientTestingResponse>();
    for (const item of list) {
      const existing = map.get(item.ingredient_id);
      if (!existing || item.test_start_date > existing.test_start_date) {
        map.set(item.ingredient_id, item);
      }
    }
    return Array.from(map.values());
  };

  const reactionIngredientIds = new Set(
    testings
      .filter((t) => t.test_status === "completed_reaction" || t.has_reaction)
      .map((t) => t.ingredient_id),
  );

  const safe = deduplicateByIngredient(
    testings.filter(
      (t) =>
        t.test_status === "completed_safe" &&
        !reactionIngredientIds.has(t.ingredient_id),
    ),
  ).sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name, "ko"));
  const reaction = deduplicateByIngredient(
    testings.filter(
      (t) =>
        (t.test_status === "completed_reaction" || t.has_reaction) &&
        !existingConfirmedIdSet.has(t.ingredient_id),
    ),
  ).sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name, "ko"));

  const reactionIngredientNames = reaction.map((r) => r.ingredient_name);
  const confirmedAllergenNames = confirmedAllergies.map((c) => c.ingredient_name).filter((n): n is string => n !== null);
  const suspectedIngredients = getSuspectedIngredientsPrioritized(
    confirmedAllergenNames,
    reactionIngredientNames,
  );

  // 표준 알레르겐 이모지 최초 1회 fetch
  useEffect(() => {
    const names = STANDARD_KOREAN_ALLERGENS.map((a) => a.name);
    const cacheKey = ingredientEmojiCacheKey(names);
    const cached = readSessionCache<Record<string, string | null>>(cacheKey);
    if (cached) {
      setIngredientEmojiMap((prev) => ({ ...prev, ...cached }));
      return;
    }
    dedupeRequest(cacheKey, async () => {
      const map: Record<string, string | null> = {};
      await Promise.all(
        names.map((name) =>
          listIngredients({ search: name })
            .then((results) => {
              map[name] = results.find((r) => r.name === name)?.emoji ?? null;
            })
            .catch(() => {
              map[name] = null;
            }),
        ),
      );
      return map;
    }).then((map) => {
      setIngredientEmojiMap((prev) => ({ ...prev, ...map }));
      writeSessionCache(cacheKey, map, INGREDIENT_EMOJI_CACHE_TTL_MS);
    });
  }, []);

  // 의심 재료 목록이 바뀔 때마다 DB에서 이모지 일괄 fetch
  useEffect(() => {
    if (suspectedIngredients.length === 0) return;
    const names = suspectedIngredients.map((s) => s.suspectedName);
    const cacheKey = ingredientEmojiCacheKey(names);
    const cached = readSessionCache<Record<string, string | null>>(cacheKey);
    if (cached) {
      setIngredientEmojiMap((prev) => ({ ...prev, ...cached }));
      return;
    }
    dedupeRequest(cacheKey, async () => {
      const map: Record<string, string | null> = {};
      await Promise.all(
        names.map((name) =>
          listIngredients({ search: name })
            .then((results) => {
              map[name] = results.find((r) => r.name === name)?.emoji ?? null;
            })
            .catch(() => {
              map[name] = null;
            }),
        ),
      );
      return map;
    }).then((map) => {
      setIngredientEmojiMap((prev) => ({ ...prev, ...map }));
      writeSessionCache(cacheKey, map, INGREDIENT_EMOJI_CACHE_TTL_MS);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suspectedIngredients.map((s) => s.suspectedName).join(",")]);

    const isApp = Capacitor.isNativePlatform();
    const isMobileWeb = !isApp && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const useImagePreview = isApp || isMobileWeb;

  return (
    <div className={isApp ? "px-3 py-4" : "max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5"}>
      {isApp ? (
        <div className="flex items-center justify-between mb-4">
          <h1
            className="text-xl font-bold flex items-center gap-2"
            style={{ fontFamily: "'Paperlogic'", fontWeight: 600 }}>
            <CircleAlert className="w-4 h-4" />
            알레르기 관리
          </h1>
          <button
            onClick={() => setShowTutorial(true)}
            className="text-sm px-3 py-1.5 rounded-full font-bold whitespace-nowrap
              bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#C7E9FF_100%)]
              hover:bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#B8E2FF_100%)]
              shadow-sm transition-all duration-300"
          >
            사용법
          </button>
        </div>
      ) : (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1
              className="text-2xl font-bold flex items-center gap-2"
              style={{ fontFamily: "'Paperlogic'", fontWeight: 600 }}>
              <CircleAlert className="w-5 h-5 sm:w-6 sm:h-6" />
              알레르기 관리
            </h1>
            <p className="text-base text-muted-foreground mt-1">아기의 알레르기 반응을 체계적으로 관리하세요</p>
          </div>
          <button
            onClick={() => setShowTutorial(true)}
            className="px-4 py-2 rounded-full font-bold whitespace-nowrap
              bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#C7E9FF_100%)]
              hover:bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#B8E2FF_100%)]
              shadow-sm transition-all duration-300"
          >
            사용법
          </button>
        </div>
      )}

      {/* 1. 현재 테스트 중인 재료 */}
      <div
        className={`bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFFBE8_100%)] border border-border rounded-3xl py-3 mb-6 ${
          isApp ? "px-3" : "px-5"
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className={`font-bold ${isApp ? "text-base" : "text-lg"} flex items-center gap-1.5`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 14v2.2l1.6 1" /><path d="M16 4h2a2 2 0 0 1 2 2v.832" /><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h2" /><circle cx="16" cy="16" r="6" /><rect x="8" y="2" width="8" height="4" rx="1" />
            </svg>
            현재 테스트 중인 재료
            {refreshing && !loading && (
              <span className="text-sm font-medium text-muted-foreground">업데이트 중입니다</span>
            )}
          </h2>
          {testing.length === 0 && (
            <button
              onClick={() => setShowAddModal(true)}
              className="hidden flex items-center gap-1.5 px-4 py-2
              bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#DBF2FF_50%,#D1EDFF_100%)]
              hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#DBF2FF_100%)]
              text-primary-foreground shadow-sm text-base font-bold rounded-full"
            >
              <Plus className="w-4 h-4 sm:w-[18px] sm:h-[18px]" /> 새 재료 추가
            </button>
          )}
        </div>

        {loading && testing.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-base">불러오는 중</div>
        ) : testing.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="text-4xl mb-3">🍽️</div>
            <p className="text-xl">아직 테스트 중인 재료가 없어요</p>
            <p className="mt-2 text-sm">새로운 재료를 추가하면 여기에서 관찰을 시작할 수 있어요.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {testing.map((item) => (
              <TestingCard
                key={item.id}
                item={item}
                token={token!}
                onRefresh={fetchTestings}
              />
            ))}
          </div>
        )}
      </div>

      {/* 2. AI 의심 재료 분석 */}
      <div className="bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFFBE8_100%)] border border-border rounded-3xl py-3 mb-6">
        <div className="flex items-center gap-1.5 mb-1 px-5">
          <Sparkles size={18} />
          <h2 className={`font-bold ${isApp ? "text-base" : "text-lg"}`}>AI 의심 재료 분석</h2>
        </div>

        {reactionIngredientNames.length === 0 && confirmedAllergenNames.length === 0 ? (
          <>
            <p className="text-base font-semibold text-muted-foreground mb-1 leading-relaxed px-5">
              아직 알레르기 반응·확정 재료가 없어요.
            </p>
            <p className="text-sm text-muted-foreground mb-3 leading-relaxed px-5">
              아래는 식품의약품안전처가 지정한 표시대상 알레르기 유발물질이에요. 
              <br /> 이유식 재료로 처음 먹이는 경우 특히 주의하세요.
            </p>
              <div className="overflow-x-auto pb-4 
                [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-track]:bg-white [&::-webkit-scrollbar-track]:mx-4             
                [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#D9F0FF] [&::-webkit-scrollbar-thumb]:rounded-full">
                <div className="grid grid-flow-col grid-rows-2 gap-3 px-5 w-max">
                {STANDARD_KOREAN_ALLERGENS.map((allergen) => (
                  <div
                    key={allergen.name}
                    className={`shrink-0 flex flex-col items-center gap-1.5 ${isApp ? "px-2 py-2 w-[68px]" : "px-4 py-3 w-24"}
                    bg-white border border-border rounded-2xl text-center`}
                  >
                    <IngredientIcon
                      name={allergen.name}
                      emoji={ingredientEmojiMap[allergen.name]}
                      className="w-8 h-8 sm:w-10 sm:h-10"
                    />
                    <span className={`${isApp ? "text-xs" : "text-sm"} font-bold leading-tight`}>{allergen.name}</span>
                    {allergen.note && (
                      <span className="text-[10px] text-muted-foreground leading-tight">{allergen.note}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-[#7A7A7A]/30 -mb-2 text-right px-5">
              출처: 식품의약품안전처 표시대상 알레르기 유발물질 (2023)
            </p>
          </>
        ) : (
          <>
            <div className="px-5">
              <p className={`${isApp ? "text-xs" : "text-base"} font-semibold text-muted-foreground mb-2 leading-relaxed`}>
                {isApp ? (
              <>단백질 구조가 유사한 의심 재료를 분석했어요.<br/>식단 추가 시 주의하세요.</>
            ) : (
              <>단백질 구조가 유사한 의심 재료를 분석했어요. 식단 추가 시 주의하세요.</>
            )}
              </p>

              {/* 반응 재료 + 확정 재료 요약 */}
              <div className="flex flex-col gap-2 mb-4">
                {/* 확정 알레르기 행 */}
                {confirmedAllergenNames.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`flex items-center ${isApp ? "text-sm" : "text-base"} font-medium text-[#5C5B58] mr-1`}>
                      <Check size={16} className="mr-1" />알레르기 확정</span>
                    {confirmedAllergenNames.map((name) => (
                      <span
                        key={`confirmed-${name}`}
                        className="flex items-center gap-1 px-2.5 bg-[#FFEEE8] border border-[#FF8763]/50 rounded-full 
                        text-sm font-bold text-destructive"
                      >
                        <AlertTriangle size={18} /> {name}
                      </span>
                    ))}
                  </div>
                )}

                {/* 반응 재료 행 */}
                {reactionIngredientNames.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`flex items-center ${isApp ? "text-sm" : "text-base"} font-medium text-[#5C5B58] mr-1`}>
                      <Check size={16} className="mr-1" />알레르기 반응</span>
                    {reactionIngredientNames.map((name) => (
                      <span
                        key={`reaction-${name}`}
                        className="flex items-center gap-1 px-2.5 bg-[#FFF5D4] 
                        border border-[#FF8763]/30 rounded-full text-sm font-bold text-destructive"
                      >
                        <AlertTriangle size={18} /> {name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {suspectedIngredients.length === 0 ? (
              <>
                <p className="text-base text-muted-foreground mb-3 leading-relaxed px-5">
                  교차반응 재료를 찾지 못했어요. 표시 대상 알레르기 유발물질 리스트 정보입니다.
                </p>
                <div className="overflow-x-auto pb-2 [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-track]:bg-white 
                [&::-webkit-scrollbar-thumb]:bg-[#D9F0FF] [&::-webkit-scrollbar-thumb]:rounded-full">
                  <div className="grid grid-flow-col grid-rows-2 gap-3 px-5 w-max">
                    {STANDARD_KOREAN_ALLERGENS.map((allergen) => (
                      <div
                        key={allergen.name}
                        className={`shrink-0 flex flex-col items-center gap-1.5 ${isApp ? "px-2 py-2 w-[68px]" : "px-4 py-3 w-32"} bg-white
                        border border-border rounded-2xl text-center`}
                      >
                        <IngredientIcon
                          name={allergen.name}
                          emoji={ingredientEmojiMap[allergen.name]}
                          className={isApp ? "w-6 h-6" : "w-8 h-8 sm:w-10 sm:h-10"}
                        />
                        <span className={`${isApp ? "text-xs" : "text-sm"} font-bold leading-tight`}>{allergen.name}</span>
                        {allergen.note && (
                          <span className="text-[10px] text-muted-foreground leading-tight">{allergen.note}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-[#7A7A7A]/30 -mb-2 text-right px-5">
                  출처: 식품의약품안전처 표시대상 알레르기 유발물질 (2023)
                </p>
              </>
            ) : (
              <div className="overflow-x-auto pb-4 
                [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-track]:bg-white [&::-webkit-scrollbar-track]:mx-4             
                [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#D9F0FF] [&::-webkit-scrollbar-thumb]:rounded-full">
                <div className="grid grid-flow-col grid-rows-2 gap-3 px-5 w-max">
                  {(() => {
                    // suspectedName 기준으로 그룹화 — 확정·반응 출처를 각각 수집
                    const groupMap = new Map<string, { confirmed: string[]; reaction: string[]; severity: string }>();
                    for (const item of suspectedIngredients) {
                      if (!groupMap.has(item.suspectedName)) {
                        groupMap.set(item.suspectedName, { confirmed: [], reaction: [], severity: item.severity });
                      }
                      const group = groupMap.get(item.suspectedName)!;
                      const isConfirmedBased = confirmedAllergenNames.includes(item.sourceAllergen);
                      const isReactionBased = reactionIngredientNames.includes(item.sourceAllergen);
                      if (isConfirmedBased && !group.confirmed.includes(item.sourceAllergen)) group.confirmed.push(item.sourceAllergen);
                      if (isReactionBased && !group.reaction.includes(item.sourceAllergen)) group.reaction.push(item.sourceAllergen);
                      if (!isConfirmedBased && !isReactionBased && !group.reaction.includes(item.sourceAllergen)) group.reaction.push(item.sourceAllergen);
                      // 더 높은 severity로 업데이트
                      const sOrd: Record<string, number> = { high: 0, medium: 1, low: 2 };
                      if ((sOrd[item.severity] ?? 2) < (sOrd[group.severity] ?? 2)) group.severity = item.severity;
                    }

                    const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
                    const sorted = Array.from(groupMap.entries()).sort(([, a], [, b]) => {
                      // 확정 알레르기 기반 재료 우선
                      const aConfirmed = a.confirmed.length > 0 ? 0 : 1;
                      const bConfirmed = b.confirmed.length > 0 ? 0 : 1;
                      if (aConfirmed !== bConfirmed) return aConfirmed - bConfirmed;
                      // 같은 확정 여부면 severity 높은 순
                      const aOrder = severityOrder[a.severity] ?? 2;
                      const bOrder = severityOrder[b.severity] ?? 2;
                      return aOrder - bOrder;
                    });

                    return sorted.map(([suspectedName, group]) => {
                      const isConfirmedBased = group.confirmed.length > 0;
                      const severityStyle =
                        group.severity === "high"
                          ? { badge: "bg-reaction-bg text-reaction-fg", label: "높음" }
                          : group.severity === "medium"
                            ? { badge: "bg-testing-bg text-testing-fg", label: "중간" }
                            : { badge: "bg-safe-bg text-safe-fg", label: "낮음" };
                      const cardStyle = isConfirmedBased
                        ? "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFEEE8_100%)] border-[#FF8763]/30"
                        : "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFF5D4_100%)] border-[#FF8763]/30";

                      if (isApp) {
                        return (
                          <button
                            key={suspectedName}
                            type="button"
                            onClick={() => setSuspectedPopup({
                              name: suspectedName,
                              emoji: ingredientEmojiMap[suspectedName] ?? null,
                              severity: group.severity,
                              confirmed: group.confirmed,
                              reaction: group.reaction,
                            })}
                            className={`shrink-0 flex flex-col items-center gap-1.5 px-2 py-2 w-[68px]
                              border rounded-2xl text-center hover:opacity-80 transition-opacity ${cardStyle}`}
                          >
                            <IngredientIcon
                              name={suspectedName}
                              emoji={ingredientEmojiMap[suspectedName] ?? null}
                              className={isApp ? "w-6 h-6" : "w-8 h-8 sm:w-10 sm:h-10"}
                            />
                            <span className="text-xs font-bold leading-tight">{suspectedName}</span>
                          </button>
                        );
                      }

                      return (
                        <div
                          key={suspectedName}
                          className={`shrink-0 flex flex-row items-center border rounded-2xl ${cardStyle} gap-3 pl-4 pr-2 py-2 w-40.5`}
                        >
                          <div className="flex flex-col items-center gap-1 shrink-0 w-14">
                            <IngredientIcon
                              name={suspectedName}
                              emoji={ingredientEmojiMap[suspectedName] ?? null}
                              className="w-6 h-6 sm:w-[30px] sm:h-[30px]"
                            />
                            <span className="font-bold text-sm text-center leading-tight">{suspectedName}</span>
                          </div>
                          <div className="flex flex-col items-start min-w-0 gap-1">
                            <span className={`px-2 rounded-full text-xs font-medium border ${severityStyle.badge}`}>
                              {severityStyle.label}
                            </span>
                            <div className="flex flex-col items-start">
                              {group.confirmed.map((source) => (
                                <p key={`c-${source}`} className="text-xs text-left font-medium -mb-0.3">
                                  <span className="font-bold text-primary-foreground">{source}</span>
                                  <span className="text-[#5C5B58]"> 확정</span>
                                </p>
                              ))}
                              {group.reaction.map((source) => (
                                <p key={`r-${source}`} className="text-xs text-left font-medium">
                                  <span className="font-bold text-primary-foreground">{source}</span>
                                  <span className="text-[#5C5B58]"> 반응</span>
                                </p>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
            {suspectedIngredients.length > 0 && (
              <p className="text-xs text-[#7A7A7A]/30 -mb-2 text-right px-5">
                출처: SDAP 2.0 · WHO/IUIS Allergen Nomenclature DB
              </p>
            )}
          </>
        )}
      </div>

      {/* 3·4. 안전하게 통과한 재료 / 알레르기 반응 재료 */}
      <div className={isApp ? "flex flex-col" : "grid md:grid-cols-2 gap-6"}>
        <div className="bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFFBE8_100%)] border border-border rounded-3xl py-3 px-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className={`font-bold ${isApp ? "text-base" : "text-lg"} flex items-center gap-1.5`}>
              <CheckCircle size={18} />
              안전하게 통과한 재료
            </h2>
            <button
              onClick={() => openAddTestingModal("safe")}
              className={`flex items-center gap-1 px-3 py-1 rounded-3xl ${isApp ? "text-sm" : "text-base"} text-primary-foreground
              bg-[#FEF5CC] hover:opacity-70 font-semibold transition-colors`}
            >
              <Plus className="w-4 h-4 sm:w-[18px] sm:h-[18px]" /> 추가
            </button>
          </div>
          {safe.length === 0 ? (
            <div className="flex items-center justify-center min-h-[60px] text-center text-muted-foreground text-base">
              안전 통과 재료가 없습니다
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 mb-2">
              {safe.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-1 pl-1.5 pr-0.5 py-1 rounded-full bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#E3FFF1_100%)] 
                  border border-[#9AC6AF]">
                  <div className="flex items-center gap-2">
                    <IngredientIcon name={item.ingredient_name} emoji={item.ingredient_emoji} size={17} />
                    <span className="text-sm font-semibold">{item.ingredient_name}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteTesting(item.id)}
                    disabled={deletingTestingId === item.id}
                    className="px-1 py-1 rounded-full hover:bg-[#9AC6AF]/40 text-muted-foreground disabled:opacity-40"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFFBE8_100%)] border border-border rounded-3xl py-3 px-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className={`font-bold ${isApp ? "text-base" : "text-lg"} flex items-center gap-1.5`}>
              <AlertTriangle size={18} />
              알레르기 반응 재료
            </h2>
            <button
              onClick={() => openAddTestingModal("reaction")}
              className={`flex items-center gap-1 px-3 py-1 rounded-3xl ${isApp ? "text-sm" : "text-base"} text-primary-foreground
              bg-[#FEF5CC] hover:opacity-70 font-semibold transition-colors`}
            >
              <Plus className="w-4 h-4 sm:w-[18px] sm:h-[18px]" /> 추가
            </button>
          </div>
          {reaction.length === 0 ? (
            <div className="flex items-center justify-center min-h-[60px] text-center text-muted-foreground text-base">
              반응한 재료가 없습니다
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-2">
                {reaction.map((item) => {
                  const alreadyConfirmed = confirmedAllergies.some(
                    (c) => c.ingredient_id === item.ingredient_id,
                  );
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-1 pr-0.5 py-1 rounded-full bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFF5D4_100%)] 
                      border border-[#FF8763]/50"
                    >
                      {alreadyConfirmed ? null : (
                        <button
                          onClick={() => handleConfirmAllergy(item)}
                          disabled={confirmingId === item.id}
                          className="text-xs px-2 rounded-full bg-destructive/10 border border-destructive/30 text-destructive 
                          font-semibold hover:bg-destructive/30 transition-colors disabled:opacity-40 ml-1"
                        >
                          {confirmingId === item.id ? "저장 중" : "확정하기"}
                        </button>
                      )}
                      <button
                        onClick={() =>
                          setHistoryTarget({
                            ingredientId: item.ingredient_id,
                            ingredientName: item.ingredient_name,
                            ingredientEmoji: item.ingredient_emoji,
                          })
                        }
                        className="flex items-center gap-2 hover:opacity-80 pl-1 transition-opacity"
                      >
                        <IngredientIcon name={item.ingredient_name} emoji={item.ingredient_emoji} size={17} />
                        <span className="text-sm font-semibold">{item.ingredient_name}</span>
                      </button>
                      <button
                        onClick={() => handleDeleteTesting(item.id)}
                        disabled={deletingTestingId === item.id}
                        className="px-1 py-1 rounded-full hover:bg-[#FF8763]/20 text-muted-foreground disabled:opacity-40"
                      >
                        <X size={10} />
                      </button>

                    </div>
                  );
                })}
              </div>
              {confirmError && (
                <p className="m-2 text-base text-destructive font-semibold text-center">{confirmError}</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* 4. 알레르기 확정 재료 */}
      <div className="bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFFBE8_100%)] 
      border border-border rounded-3xl py-3 px-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className={`font-bold ${isApp ? "text-base" : "text-lg"} flex items-center gap-1.5`}>
            <ShieldAlert size={18} className="text-destructive" />
            알레르기 확정 재료
          </h2>
          <button
            onClick={() => setShowAddConfirmedModal(true)}
            className={`flex items-center gap-1 px-3 py-1 rounded-3xl ${isApp ? "text-sm" : "text-base"} text-primary-foreground
            bg-[#FEF5CC] hover:opacity-70 font-semibold transition-colors`}
          >
            <Plus className="w-4 h-4 sm:w-[18px] sm:h-[18px]" /> 추가
          </button>
        </div>
        {confirmedAllergies.length === 0 ? (
          <div className="flex items-center justify-center text-center text-muted-foreground text-base">
            확정된 알레르기 재료가 없습니다
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 mb-2">
            {[...confirmedAllergies].sort((a, b) => (a.ingredient_name ?? "").localeCompare(b.ingredient_name ?? "", "ko")).map((item) => (
              <div
                key={item.id}
                className="flex flex-nowrap items-center gap-1 pl-3 py-1 bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFEEE8_100%)]
                border border-[#FF8763]/50 rounded-xl"
              >
                <div className="flex shrink-0 items-center gap-2">
                  <IngredientIcon name={item.ingredient_name ?? ""} emoji={item.ingredient_emoji} size={17} />
                  <span className="text-sm font-semibold whitespace-nowrap">{item.ingredient_name}</span>
                </div>

                <button
                  onClick={() => handleDeleteConfirmed(item.id)}
                  disabled={deletingConfirmedId === item.id}
                  className="px-1 py-1 mr-2 rounded-full hover:bg-[#FF8763]/20 text-muted-foreground disabled:opacity-40"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. 이상 반응 자동 리포트 생성 */}
      <div className="bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFFBE8_100%)] border border-border rounded-3xl py-3 px-5 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className={`font-bold ${isApp ? "text-base" : "text-lg"} flex items-center gap-1.5`}>
            <FileText size={18} />
            알레르기 리포트 생성
          </h2>
          <button
            onClick={handleOpenReportModal}
            disabled={reportLoading || !activeBaby}
            className={`flex items-center gap-1.5 px-4 py-2 whitespace-nowrap
            bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#DBF2FF_50%,#D1EDFF_100%)]
            hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#DBF2FF_100%)]
            text-primary-foreground shadow-sm ${isApp ? "text-sm" : "text-base"} font-bold rounded-full`}
          >
            {reportLoading ? "생성 중" : "리포트 생성하기"}
          </button>
        </div>
        <p className={`text-center ${isApp ? "text-xs" : "text-base"} text-muted-foreground mt-3`}>
          {isApp ? (
            <>알레르기 반응 기록을 종합하여<br/>소아과 진료 시 활용할 수 있는 리포트를 자동으로 생성합니다</>
          ) : (
            <>알레르기 반응 기록을 종합하여 소아과 진료 시 활용할 수 있는 리포트를 자동으로 생성합니다</>
          )}
        </p>
        {reportError && (
          <p className="m-2 text-base text-destructive font-semibold text-center">{reportError}</p>
        )}
      </div>

      {/* 6. 위치 기반 병원 안내 */}
      <HospitalFinder />

      {/* 리포트 미리보기 모달 */}
      {reportPreviewUrl && (
        <div
          className={`fixed inset-0 bg-black/50 z-50 flex justify-center ${
            isApp
              ? "p-0 items-center"
              : useImagePreview
                ? "px-4 pb-8 items-start pt-[calc(env(safe-area-inset-top)+10rem)]"
                : "px-4 pt-20 pb-8 items-start"
          }`}
          onClick={handleCloseReportModal}
        >
          <div
            className={`bg-card border border-border rounded-3xl shadow-2xl flex flex-col overflow-hidden 
            ${isApp
              ? "fixed bottom-24 left-3 right-3 h-[min(600px,calc(100dvh-12rem))]"
              : useImagePreview
                ? "w-full max-w-2xl max-h-[calc(100dvh-12rem-env(safe-area-inset-top))]"
                : "w-full max-w-2xl h-[calc(100vh-7rem)]"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`flex items-center justify-between px-5 mt-2 mb-2 flex-shrink-0 ${
                isApp ? "pt-1 pb-2" : "py-1"
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText size={18} />
                <h3 className="font-bold text-base">알레르기 리포트 미리보기</h3>
              </div>
              <button onClick={handleCloseReportModal} className="p-1.5 rounded-full hover:bg-muted">
                <X className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
              </button>
            </div>

            {isApp ? (
              <div className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar-track]:bg-white [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#D9F0FF] [&::-webkit-scrollbar-thumb]:rounded-full">
                <div className="px-5 pb-3 flex flex-wrap items-center justify-end gap-3">
                  <button
                    onClick={handleDownloadReportPdfApp}
                    disabled={pdfDownloading}
                    className="flex items-center gap-2 px-4 py-2 bg-[#FEF5CC] text-primary-foreground
                    rounded-3xl font-bold text-sm hover:bg-[#FFEFAB] transition-opacity disabled:opacity-50"
                  >
                    <Download size={15} />
                    {pdfDownloading ? "생성 중" : "PDF 다운로드"}
                  </button>
                  <button
                    onClick={handleDownloadReportJpg}
                    disabled={jpgDownloading}
                    className="flex items-center gap-2 px-4 py-2 bg-[#FEF5CC] text-primary-foreground
                    rounded-3xl font-bold text-sm hover:bg-[#FFEFAB] transition-opacity disabled:opacity-50"
                  >
                    <Download size={15} />
                    {jpgDownloading ? "생성 중" : "JPG 다운로드"}
                  </button>
                </div>
                {reportError && (
                  <p className="mx-5 mb-2 text-sm text-destructive font-semibold text-center">
                    {reportError}
                  </p>
                )}
                <div className="p-4">
                  <img
                    src={reportPreviewUrl}
                    className="w-full h-auto rounded-xl border border-border"
                    alt="알레르기 리포트 미리보기"
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="px-5 flex-shrink-0 flex flex-wrap items-center justify-end gap-3">
                  <button
                    onClick={handleDownloadReport}
                    disabled={pdfDownloading}
                    className="flex items-center gap-2 px-4 py-2 bg-[#FEF5CC] text-primary-foreground
                    rounded-3xl font-bold text-sm hover:bg-[#FFEFAB] transition-opacity disabled:opacity-50"
                  >
                    <Download size={15} />
                    {pdfDownloading ? "생성 중" : "PDF 다운로드"}
                  </button>
                  <button
                    onClick={handleDownloadReportJpg}
                    disabled={jpgDownloading}
                    className="flex items-center gap-2 px-4 py-2 bg-[#FEF5CC] text-primary-foreground
                    rounded-3xl font-bold text-sm hover:bg-[#FFEFAB] transition-opacity disabled:opacity-50"
                  >
                    <Download size={15} />
                    {jpgDownloading ? "생성 중" : "JPG 다운로드"}
                  </button>
                </div>
                  
                <div className={`flex-1 p-4 min-h-0 ${useImagePreview ? "overflow-y-auto" : ""}`}>
              {useImagePreview ? (
                <img
                  src={reportPreviewUrl}
                  className="w-full h-auto rounded-xl border border-border"
                  alt="알레르기 리포트 미리보기"
                />
              ) : (
                <iframe
                  src={reportPreviewUrl}
                  className="w-full h-full rounded-xl border border-border"
                  title="알레르기 리포트 미리보기"
                />
              )}
            </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 재료 테스트 이력 팝업 */}
      {historyTarget && token && (
        <IngredientHistoryPopup
          ingredientId={historyTarget.ingredientId}
          ingredientName={historyTarget.ingredientName}
          ingredientEmoji={historyTarget.ingredientEmoji}
          allTestings={testings}
          token={token}
          onClose={() => setHistoryTarget(null)}
        />
      )}

      {/* 안전 재료 추가 모달 */}
      {addTestingTarget === "safe" && (
        <div
          className={`fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4 ${isApp ? "py-2" : "py-6"}`}
          onClick={closeAddTestingModal}
        >
          <div
            className={`bg-card border border-border rounded-3xl w-full max-w-lg shadow-2xl flex flex-col gap-3 ${isApp ? "max-h-[96vh]" : "max-h-[88vh]"} overflow-hidden`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`px-5 py-3 flex flex-col gap-3 overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden`}>
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 font-bold text-base">
                <CirclePlus size={18} className="shrink-0" />
                안전하게 통과한 재료 추가하기
              </h3>
              <button onClick={closeAddTestingModal} className="p-1.5 rounded-full hover:bg-muted">
                <X className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
              </button>
            </div>

            {/* 검색창 */}
            <div className="relative">
              <input
                type="text"
                value={addTestingSearch}
                onChange={(e) => { setAddTestingSearch(e.target.value); setSafeModalDropdownOpen(true); setAddTestingError(""); }}
                onFocus={() => setSafeModalDropdownOpen(true)}
                onBlur={() => setTimeout(() => setSafeModalDropdownOpen(false), 150)}
                placeholder="재료를 검색하세요."
                className="w-full px-4 py-2 rounded-3xl border border-border bg-card text-sm
                focus:outline-none focus:ring-2 focus:ring-[#E3FFF1] placeholder:text-muted-foreground"
              />
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />

              {safeModalDropdownOpen && addTestingResults.filter((ing) => !existingSafeIngredientIdSet.has(ing.id)).length > 0 && (
                <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                  {addTestingResults.filter((ing) => !existingSafeIngredientIdSet.has(ing.id)).map((ing) => {
                    const alreadySelected = safeModalSelectedIdSet.has(ing.id);
                    return (
                      <div
                        key={ing.id}
                        onMouseDown={() => {
                          if (alreadySelected) {
                            setSafeModalMultiSelected((prev) => prev.filter((i) => i.id !== ing.id));
                          } else {
                            setSafeModalMultiSelected((prev) => [...prev, ing]);
                          }
                          setAddTestingSearch("");
                          setSafeModalDropdownOpen(false);
                        }}
                        className={`px-4 py-2 text-sm cursor-pointer flex items-center gap-2 ${
                          alreadySelected ? "bg-[#E3FFF1] text-foreground" : "hover:bg-primary/10"
                        }`}
                      >
                        <IngredientIcon name={ing.name} emoji={ing.emoji} size={17} />
                        <span className="flex-1">{ing.name}</span>
                        {alreadySelected && <Check size={13} className="text-[#3E8260] shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 선택된 재료 칩 */}
            {safeModalMultiSelected.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {safeModalMultiSelected.map((ing) => (
                  <span
                    key={ing.id}
                    className="flex items-center gap-1 pl-3 pr-2 py-1 rounded-full
                    bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#E3FFF1_100%)] border border-[#9AC6AF]/70
                    text-xs font-semibold text-foreground"
                  >
                    <IngredientIcon name={ing.name} emoji={ing.emoji} size={15} />
                    {ing.name}
                    <button
                      type="button"
                      onClick={() => setSafeModalMultiSelected((prev) => prev.filter((i) => i.id !== ing.id))}
                      className="hover:opacity-70 transition-opacity ml-0.5"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* 이유식 단계 탭 */}
            <div className="flex gap-1">
              {SAFE_STAGE_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setSafeModalStageFilter(tab.key)}
                  className={`flex-1 py-1 text-xs font-semibold rounded-t-sm border border-b-0 transition-all ${
                    safeModalStageFilter === tab.key
                      ? "bg-muted/80 text-primary-foreground"
                      : "border-border text-muted-foreground hover:border-[#9AC6AF]/50"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 재료 그리드 */}
            {allIngredientsForSafeModal.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">재료 목록 로딩 중</div>
            ) : (
              <>
                <div className={`grid ${isApp ? "grid-cols-4" : "grid-cols-5"} gap-1 -mt-1`}>
                  {safeModalPageItems.map((ing) => {
                    const selected = safeModalSelectedIdSet.has(ing.id);
                    return (
                      <button
                        key={ing.id}
                        type="button"
                        onClick={() => {
                          if (selected) {
                            setSafeModalMultiSelected((prev) => prev.filter((i) => i.id !== ing.id));
                          } else {
                            setSafeModalMultiSelected((prev) => [...prev, ing]);
                          }
                        }}
                        className={`flex flex-row items-center gap-1 px-1.5 py-1 rounded-xl border text-xs font-semibold transition-all ${
                          selected
                            ? "border border-[#9AC6AF]/20 bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#E3FFF1_100%)] text-foreground"
                            : "border-border bg-card text-muted-foreground hover:border-[#9AC6AF]/60 hover:bg-[#F0FFF8]"
                        }`}
                      >
                        <IngredientIcon name={ing.name} emoji={ing.emoji} size={17} />
                        <span className="leading-tight line-clamp-1 min-w-0">{ing.name}</span>
                      </button>
                    );
                  })}
                  {Array.from({ length: SAFE_MODAL_PER_PAGE - safeModalPageItems.length }).map((_, i) => (
                    <div key={`empty-${i}`} />
                  ))}
                </div>

                {safeModalTotalPages > 1 && (
                  <div className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSafeModalPage((p) => Math.max(0, p - 1))}
                      disabled={safeModalPage === 0}
                      className="px-2 py-1 text-xs text-muted-foreground rounded-lg disabled:opacity-30 hover:bg-muted transition-colors"
                    >
                      &lt;
                    </button>
                    {(() => {
                      const SHOW = 5;
                      let start = Math.max(0, safeModalPage - Math.floor(SHOW / 2));
                      const end = Math.min(safeModalTotalPages - 1, start + SHOW - 1);
                      if (end - start < SHOW - 1) start = Math.max(0, end - SHOW + 1);
                      return Array.from({ length: end - start + 1 }, (_, i) => start + i).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setSafeModalPage(p)}
                          className={`w-7 h-7 text-xs rounded-lg transition-colors ${
                            p === safeModalPage
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
                      onClick={() => setSafeModalPage((p) => Math.min(safeModalTotalPages - 1, p + 1))}
                      disabled={safeModalPage === safeModalTotalPages - 1}
                      className="px-2 py-1 text-xs text-muted-foreground rounded-lg disabled:opacity-30 hover:bg-muted transition-colors"
                    >
                      &gt;
                    </button>
                  </div>
                )}
              </>
            )}

            {addTestingError && (
              <div className="px-4 py-2.5 bg-destructive/10 border border-destructive/30 rounded-3xl text-sm text-destructive font-semibold">
                {addTestingError}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={closeAddTestingModal}
                className="flex-1 py-3 rounded-full border border-border text-sm font-semibold
                hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#DBF2FF_100%)] transition-opacity"
              >
                취소
              </button>
              <button
                onClick={handleAddTestingWithStatus}
                disabled={safeModalMultiSelected.length === 0 || addingTesting}
                className="flex-1 py-3 rounded-full text-primary-foreground text-sm font-bold
                bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#DBF2FF_50%,#D1EDFF_100%)]
                hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#DBF2FF_100%)] transition-opacity disabled:opacity-40"
              >
                {addingTesting
                  ? "추가 중"
                  : safeModalMultiSelected.length > 0
                    ? `추가하기 (${safeModalMultiSelected.length})`
                    : "추가하기"}
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* 반응 재료 추가 모달 */}
      {addTestingTarget === "reaction" && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center pt-16 justify-center px-4"
          onClick={closeAddTestingModal}
        >
          <div
            className="bg-card border border-border rounded-3xl px-5 py-3 w-full max-w-md shadow-2xl flex flex-col gap-4 max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 font-bold text-base">
                <CirclePlus size={18} className="shrink-0" />
                반응 보인 재료 추가하기
              </h3>
              <button onClick={closeAddTestingModal} className="p-1.5 rounded-full hover:bg-muted">
                <X className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-2 pr-2
                [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar-track]:bg-white [&::-webkit-scrollbar-track]:rounded-full
                [&::-webkit-scrollbar-thumb]:bg-[#D9F0FF] [&::-webkit-scrollbar-thumb]:rounded-full"
            >
              {addTestingSelected ? (
                <div className="flex items-center gap-3 px-4 py-1 rounded-full
                bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFE8E0_100%)] border border-[#FF8763]/70">
                  <IngredientIcon name={addTestingSelected.name} emoji={addTestingSelected.emoji} className="w-7 h-7 sm:w-8 sm:h-8" />
                  <span className="font-semibold text-lg flex-1">{addTestingSelected.name}</span>
                  <button onClick={() => setAddTestingSelected(null)} className="text-muted-foreground hover:text-foreground">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    type="text"
                    value={addTestingSearch}
                    onChange={(e) => { setAddTestingSearch(e.target.value); setAddTestingError(""); }}
                    placeholder="재료 이름 검색"
                    className="w-full px-4 py-3 rounded-3xl border border-[#C5E5FA] bg-[#FAFAFA]/80 
                    focus:outline-none focus:ring-2 focus:ring-[#EBF7FF] text-base font-semibold"
                  />
                  {addTestingResults.filter((ing) => !existingConfirmedIdSet.has(ing.id)).length > 0 && (
                    <div className="border border-[#EBF7FF] rounded-3xl overflow-hidden mt-2">
                      {addTestingResults.filter((ing) => !existingConfirmedIdSet.has(ing.id)).map((ing) => (
                        <button
                          key={ing.id}
                          onClick={() => { setAddTestingSelected(ing); setAddTestingResults([]); setAddTestingError(""); }}
                          className="w-full flex items-center gap-3 px-4 py-2 rounded-3xl
                        hover:bg-[#EBF7FF] text-base text-left border border-[#EBF7FF]"
                        >
                          <IngredientIcon name={ing.name} emoji={ing.emoji} className="w-4 h-4 sm:w-5 sm:h-5" />
                          <span className="font-semibold">{ing.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {addTestingSelected && (
                <>
                  <div className="flex flex-col gap-2">
                    {symptomEntries.map((entry, idx) => {
                      const isExpanded = expandedEntryId === entry.id;
                      return (
                        <div
                          key={entry.id}
                          className="border border-[#C5E5FA] rounded-3xl overflow-hidden bg-[#FAFAFA]/50"
                        >
                          <button
                            type="button"
                            onClick={() => setExpandedEntryId(isExpanded ? null : entry.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#EBF7FF]/60 transition-colors text-left"
                          >
                            <span className="flex items-center justify-center w-7 h-7 shrink-0 rounded-full
                                  bg-[#EBF7FF] text-sm font-semibold text-primary-foreground border border-[#C5E5FA]">
                              {idx + 1}
                            </span>

                            {!isExpanded ? (
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className="text-sm font-semibold shrink-0">
                                  {entry.date || "날짜"} {entry.time || "시간"}
                                </span>
                                <div className="flex flex-wrap items-center gap-1 min-w-0">
                                  {entry.symptoms.slice(0, 1).map((sym) => (
                                    <span
                                      key={sym.type}
                                      className="text-xs px-1.5 py-0.5 rounded-full shrink-0 font-semibold
                                      bg-[#D47D7F]/10 text-[#D47D7F] border border-[#D47D7F]/30"
                                    >
                                      {sym.type}
                                    </span>
                                  ))}
                                  {entry.symptoms.length > 1 && (
                                    <span className="text-xs text-muted-foreground">
                                      +{entry.symptoms.length - 1}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="flex-1" />
                            )}

                            {symptomEntries.length > 1 && (
                              <span
                                role="button"
                                onClick={(e) => { e.stopPropagation(); removeEntry(entry.id); }}
                                className="p-1 rounded-full hover:bg-[#EBF7FF] text-muted-foreground shrink-0"
                              >
                                <X size={13} />
                              </span>
                            )}

                            <ChevronDown
                              size={15}
                              className={`shrink-0 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                            />
                          </button>

                          {isExpanded && (
                            <div className="px-3 pb-3 pt-2.5 flex flex-col gap-3 border-t border-[#C5E5FA]/60 bg-card">

                              <div className="flex items-center gap-1.5 flex-wrap">
                                <div className="inline-flex items-center rounded-xl border border-[#C5E5FA] bg-[#FAFAFA]/80 overflow-hidden">
                                  {/* entry.date가 빈 문자열일 때 안전하게 처리 */}
                                  <span className="px-2.5 py-1 text-sm font-semibold text-foreground">
                                    {entry.date ? +entry.date.split("-")[0] : FIXED_YEAR}년
                                  </span>
                                  <span className="w-px self-stretch bg-[#C5E5FA]" />
                                  <button
                                    type="button"
                                    onClick={() => setActiveDatePicker({ entryId: entry.id, initialStep: "month" })}
                                    className="px-2.5 py-1 text-sm font-semibold hover:bg-[#EBF7FF] transition-colors"
                                  >
                                    {+entry.date.split("-")[1]}월
                                  </button>
                                  <span className="w-px self-stretch bg-[#C5E5FA]" />
                                  <button
                                    type="button"
                                    onClick={() => setActiveDatePicker({ entryId: entry.id, initialStep: "day" })}
                                    className="px-2.5 py-1 text-sm font-semibold hover:bg-[#EBF7FF] transition-colors"
                                  >
                                    {+entry.date.split("-")[2]}일
                                  </button>
                                </div>

                                <TimeDropdown
                                  className="!text-sm !py-1 !pl-2 !pr-1 !w-auto !min-w-[52px] !justify-between whitespace-nowrap shrink-0"
                                  value={+entry.time.split(":")[0]}
                                  onChange={(h) => updateEntryTime(entry.id, h, +entry.time.split(":")[1])}
                                  length={24}
                                  suffix="시"
                                />
                                <TimeDropdown
                                  className="!text-sm !py-1 !pl-2 !pr-1 !w-auto !min-w-[52px] !justify-between whitespace-nowrap shrink-0"
                                  value={+entry.time.split(":")[1]}
                                  onChange={(m) => updateEntryTime(entry.id, +entry.time.split(":")[0], m)}
                                  length={12}
                                  step={5}
                                  suffix="분"
                                />
                              </div>

                              {entry.date && entry.time && (
                                <>
                                  <div className="flex flex-wrap gap-1.5">
                                    {SYMPTOM_PRESETS.map((s) => {
                                      const isSelected = entry.symptoms.some((sym) => sym.type === s.type);
                                      return (
                                        <button
                                          key={s.type}
                                          type="button"
                                          onClick={() => toggleEntrySymptom(entry.id, s.type)}
                                          className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${isSelected
                                            ? "bg-[#D47D7F] text-white border-[#D47D7F]"
                                            : "bg-muted text-muted-foreground border-border hover:bg-[#D47D7F]/10 hover:border-[#D47D7F]/40"
                                            }`}
                                        >
                                          {s.type}
                                        </button>
                                      );
                                    })}
                                  </div>

                                  {entry.symptoms.length > 0 && (
                                    <div className="flex flex-col gap-2 bg-muted/40 rounded-lg px-3 py-2.5">
                                      {entry.symptoms.map((sym) => (
                                        <div key={sym.type} className="flex items-center gap-2">
                                          <span className="text-xs flex-1 font-medium">
                                            {sym.type}
                                          </span>
                                          <div className="flex gap-1">
                                            {SEVERITY_OPTIONS.map((sev) => (
                                              <button
                                                key={sev.value}
                                                type="button"
                                                onClick={() => setEntrySeverity(entry.id, sym.type, sev.value)}
                                                className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold border transition-colors ${sym.severity === sev.value
                                                  ? "bg-[#D47D7F] text-white border-[#D47D7F]"
                                                  : "bg-background text-muted-foreground border-border hover:bg-[#D47D7F]/10 hover:border-[#D47D7F]/40"
                                                  }`}
                                              >
                                                {sev.label}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )} {/* isExpanded 조건부 블록 닫힘 위치 수정 */}
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={addEntry}
                    className="w-full py-2.5 rounded-3xl border border-dashed border-border text-sm font-semibold text-muted-foreground 
                  hover:bg-muted/40 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Plus size={15} /> 다른 시간대 증상 추가
                  </button>

                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">메모</p>
                    <textarea
                      value={reactionDescription}
                      onChange={(e) => setReactionDescription(e.target.value)}
                      placeholder="전반적인 상황을 자유롭게 기록하세요"
                      rows={2}
                      className="w-full px-4 py-3 rounded-xl border border-[#C5E5FA] bg-[#FAFAFA]/80
                    focus:outline-none focus:ring-2 focus:ring-[#EBF7FF] text-sm resize-none"
                    />
                  </div>
                </>
              )}
            </div>

            {addTestingError && (
              <div className="px-4 py-2.5 bg-destructive/10 border border-destructive/30 rounded-xl text-sm text-destructive font-semibold">
                {addTestingError}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={closeAddTestingModal} className="flex-1 py-3 rounded-full border border-border text-base 
              font-semibold hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#DBF2FF_100%)] transition-colors">
                취소
              </button>
              <button
                onClick={handleAddTestingWithStatus}
                disabled={!addTestingSelected || addingTesting}
                className="flex-1 py-3 rounded-full text-primary-foreground text-base font-bold 
                bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#DBF2FF_50%,#D1EDFF_100%)] 
                hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#DBF2FF_100%)] transition-opacity disabled:opacity-40"
              >
                {addingTesting ? "추가 중" : "추가하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeDatePicker && (
        <EntryDatePicker
          entry={symptomEntries.find((e) => e.id === activeDatePicker.entryId)!}
          initialStep={activeDatePicker.initialStep}
          onUpdate={updateEntryDate}
          onClose={() => setActiveDatePicker(null)}
        />
      )}

      {editConfirmedDatePicker && editingConfirmed && (
        <EntryDatePicker
          entry={{ id: "edit-confirmed", date: editConfirmedDate || new Date().toISOString().split("T")[0] }}
          initialStep={editConfirmedDatePicker}
          onUpdate={(_id, y, m, d) => {
            setEditConfirmedDate(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
          }}
          onClose={() => setEditConfirmedDatePicker(null)}
        />
      )}

      {/* 확정 재료 수정 모달 */}
      {editingConfirmed && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4"
          onClick={() => setEditingConfirmed(null)}
        >
          <div
            className="bg-card border border-border rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-base">'{editingConfirmed.ingredient_name}' 관련 정보 수정</h3>
              <button onClick={() => setEditingConfirmed(null)} className="p-1.5 rounded-full hover:bg-muted">
                <X className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
              </button>
            </div>

            <label className="block text-sm font-medium text-muted-foreground mb-2">확정 날짜</label>
            <div className="inline-flex items-center rounded-xl border border-[#C5E5FA] bg-[#FAFAFA]/80 overflow-hidden mb-2">
              <span className="px-2.5 py-1 text-sm font-semibold text-foreground">
                {editConfirmedDate ? +editConfirmedDate.split("-")[0] : FIXED_YEAR}년
              </span>
              <span className="w-px self-stretch bg-[#C5E5FA]" />
              <button
                type="button"
                onClick={() => setEditConfirmedDatePicker("month")}
                className="px-2.5 py-1 text-sm font-semibold hover:bg-[#EBF7FF] transition-colors"
              >
                {editConfirmedDate ? +editConfirmedDate.split("-")[1] : new Date().getMonth() + 1}월
              </button>
              <span className="w-px self-stretch bg-[#C5E5FA]" />
              <button
                type="button"
                onClick={() => setEditConfirmedDatePicker("day")}
                className="px-2.5 py-1 text-sm font-semibold hover:bg-[#EBF7FF] transition-colors"
              >
                {editConfirmedDate ? +editConfirmedDate.split("-")[2] : new Date().getDate()}일
              </button>
            </div>

            <label className="block text-sm font-medium text-muted-foreground mb-2">메모</label>
            <textarea
              value={editConfirmedNote}
              onChange={(e) => setEditConfirmedNote(e.target.value)}
              placeholder="메모를 입력하세요"
              rows={3}
              className="w-full px-4 py-3 mb-2 rounded-3xl border border-[#C5E5FA] bg-[#FAFAFA]/80 
              focus:outline-none focus:ring-2 focus:ring-[#EBF7FF] text-base font-semibold resize-none"
            />

            {editConfirmedError && (
              <div className="mb-3 px-4 py-2.5 bg-destructive/10 border border-destructive/30 rounded-xl text-sm text-destructive font-semibold">
                {editConfirmedError}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setEditingConfirmed(null)} className="flex-1 py-3 rounded-full border border-border text-sm font-semibold 
                hover:bg-[radial-gradient(ellipse_at_center,#FFEEE8_0%,#FFDCD1_100%)] transition-opacity">
                취소
              </button>
              <button
                onClick={handleSaveConfirmedEdit}
                disabled={savingConfirmedEdit}
                className="flex-1 py-3 rounded-full text-primary-foreground text-sm font-bold 
                bg-[radial-gradient(ellipse_at_center,#FFD9C9_0%,#FFC2B0_100%)] 
                hover:bg-[radial-gradient(ellipse_at_center,#FFEEE8_0%,#FFDCD1_100%)] transition-opacity disabled:opacity-40"
              >
                {savingConfirmedEdit ? "저장 중" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 확정 재료 직접 추가 모달 */}
      {showAddConfirmedModal && (
        <div
          className={`fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4 ${isApp ? "py-2" : "py-6"}`}
          onClick={closeAddConfirmedModal}
        >
          <div
            className={`bg-card border border-border rounded-3xl w-full max-w-lg shadow-2xl flex flex-col gap-3 ${isApp ? "max-h-[96vh]" : "max-h-[88vh]"} overflow-hidden`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 flex flex-col gap-3 overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 font-bold text-base">
                <CirclePlus size={18} className="shrink-0" />
                알레르기 확정 재료 추가하기
              </h3>
              <button onClick={closeAddConfirmedModal} className="p-1.5 rounded-full hover:bg-muted">
                <X className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
              </button>
            </div>

            {/* 검색창 */}
            <div className="relative">
              <input
                type="text"
                value={confirmedSearch}
                onChange={(e) => { setConfirmedSearch(e.target.value); setConfirmedModalDropdownOpen(true); setAddConfirmedError(""); }}
                onFocus={() => setConfirmedModalDropdownOpen(true)}
                onBlur={() => setTimeout(() => setConfirmedModalDropdownOpen(false), 150)}
                placeholder="재료를 검색하세요."
                className="w-full px-4 py-2 rounded-3xl border border-border bg-card text-sm
                focus:outline-none focus:ring-2 focus:ring-[#FFEEE8] placeholder:text-muted-foreground"
              />
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />

              {confirmedModalDropdownOpen && confirmedSearchResults.filter((ing) => !existingConfirmedIdSet.has(ing.id)).length > 0 && (
                <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                  {confirmedSearchResults.filter((ing) => !existingConfirmedIdSet.has(ing.id)).map((ing) => {
                    const alreadySelected = confirmedModalSelectedIdSet.has(ing.id);
                    return (
                      <div
                        key={ing.id}
                        onMouseDown={() => {
                          if (alreadySelected) {
                            setConfirmedModalMultiSelected((prev) => prev.filter((i) => i.id !== ing.id));
                          } else {
                            setConfirmedModalMultiSelected((prev) => [...prev, ing]);
                          }
                          setConfirmedSearch("");
                          setConfirmedModalDropdownOpen(false);
                        }}
                        className={`px-4 py-2 text-sm cursor-pointer flex items-center gap-2 ${
                          alreadySelected ? "bg-[#FFEEE8] text-foreground" : "hover:bg-primary/10"
                        }`}
                      >
                        <IngredientIcon name={ing.name} emoji={ing.emoji} size={17} />
                        <span className="flex-1">{ing.name}</span>
                        {alreadySelected && <Check size={13} className="text-destructive shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 선택된 재료 칩 */}
            {confirmedModalMultiSelected.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {confirmedModalMultiSelected.map((ing) => (
                  <span
                    key={ing.id}
                    className="flex items-center gap-1 pl-3 pr-2 py-1 rounded-full
                    bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFEEE8_100%)] border border-[#FF8763]/50
                    text-xs font-semibold text-foreground"
                  >
                    <IngredientIcon name={ing.name} emoji={ing.emoji} size={15} />
                    {ing.name}
                    <button
                      type="button"
                      onClick={() => setConfirmedModalMultiSelected((prev) => prev.filter((i) => i.id !== ing.id))}
                      className="hover:opacity-70 transition-opacity ml-0.5"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* 이유식 단계 탭 */}
            <div className="flex gap-1">
              {SAFE_STAGE_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setConfirmedModalStageFilter(tab.key)}
                  className={`flex-1 py-1 text-xs font-semibold rounded-t-sm border border-b-0 transition-all ${
                    confirmedModalStageFilter === tab.key
                      ? "bg-muted/80 text-primary-foreground"
                      : "border-border text-muted-foreground hover:border-[#FF8763]/50"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 재료 그리드 */}
            {allIngredientsForConfirmedModal.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">재료 목록 로딩 중</div>
            ) : (
              <>
                <div className={`grid ${isApp ? "grid-cols-4" : "grid-cols-5"} gap-1 -mt-1`}>
                  {/* 표준 알레르겐 (첫 페이지만) */}
                  {confirmedModalShowStandard && confirmedModalFilteredStandard.map((item) => {
                    const selected = confirmedModalSelectedIdSet.has(item.id!);
                    return (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => {
                          if (selected) {
                            setConfirmedModalMultiSelected((prev) => prev.filter((i) => i.id !== item.id));
                          } else {
                            setConfirmedModalMultiSelected((prev) => [...prev, { id: item.id!, name: item.name, emoji: item.emoji }]);
                          }
                        }}
                        className={`flex flex-row items-center gap-1 px-1.5 py-1 rounded-xl border text-xs font-semibold transition-all ${
                          selected
                            ? "border border-[#FF8763]/20 bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFEEE8_100%)] text-primary-foreground"
                            : "border-border bg-card text-muted-foreground hover:border-[#FF8763]/60 hover:bg-[#FFFBE8]"
                        }`}
                      >
                        <IngredientIcon name={item.name} emoji={item.emoji} size={17} />
                        <span className="leading-tight line-clamp-1 min-w-0">{item.name}</span>
                      </button>
                    );
                  })}
                  {/* 추가 알레르겐 */}
                  {confirmedModalAdditionalPageItems.map((item) => {
                    const selected = confirmedModalSelectedIdSet.has(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (selected) {
                            setConfirmedModalMultiSelected((prev) => prev.filter((i) => i.id !== item.id));
                          } else {
                            setConfirmedModalMultiSelected((prev) => [...prev, item]);
                          }
                        }}
                        className={`flex flex-row items-center gap-1 px-1.5 py-1 rounded-xl border text-xs font-semibold transition-all ${
                          selected
                            ? "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFEEE8_100%)] text-primary-foreground"
                            : "border-border bg-card text-muted-foreground hover:border-[#FF8763]/60 hover:bg-[#FFFBE8]"
                        }`}
                      >
                        <IngredientIcon name={item.name} emoji={item.emoji} size={17} />
                        <span className="leading-tight line-clamp-1 min-w-0">{item.name}</span>
                      </button>
                    );
                  })}
                  {Array.from({ length: confirmedModalGridEmptyCount }).map((_, i) => (
                    <div key={`confirmed-empty-${i}`} />
                  ))}
                </div>

                {confirmedModalTotalPages > 1 && (
                  <div className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => setConfirmedModalPage((p) => Math.max(0, p - 1))}
                      disabled={confirmedModalPage === 0}
                      className="px-2 py-1 text-xs text-muted-foreground rounded-lg disabled:opacity-30 hover:bg-muted transition-colors"
                    >
                      &lt;
                    </button>
                    {(() => {
                      const SHOW = 5;
                      let start = Math.max(0, confirmedModalPage - Math.floor(SHOW / 2));
                      const end = Math.min(confirmedModalTotalPages - 1, start + SHOW - 1);
                      if (end - start < SHOW - 1) start = Math.max(0, end - SHOW + 1);
                      return Array.from({ length: end - start + 1 }, (_, i) => start + i).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setConfirmedModalPage(p)}
                          className={`w-7 h-7 text-xs rounded-lg transition-colors ${
                            p === confirmedModalPage
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
                      onClick={() => setConfirmedModalPage((p) => Math.min(confirmedModalTotalPages - 1, p + 1))}
                      disabled={confirmedModalPage === confirmedModalTotalPages - 1}
                      className="px-2 py-1 text-xs text-muted-foreground rounded-lg disabled:opacity-30 hover:bg-muted transition-colors"
                    >
                      &gt;
                    </button>
                  </div>
                )}
              </>
            )}

            {addConfirmedError && (
              <div className="px-4 py-2.5 bg-destructive/10 border border-destructive/30 rounded-3xl text-sm text-destructive font-semibold">
                {addConfirmedError}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={closeAddConfirmedModal}
                className="flex-1 py-3 rounded-full border border-border text-sm font-semibold
                hover:bg-[radial-gradient(ellipse_at_center,#FFEEE8_0%,#FFDCD1_100%)] transition-opacity"
              >
                취소
              </button>
              <button
                onClick={handleAddConfirmedAllergy}
                disabled={confirmedModalMultiSelected.length === 0 || addingConfirmed}
                className="flex-1 py-3 rounded-full text-primary-foreground text-sm font-bold
                bg-[radial-gradient(ellipse_at_center,#FFD9C9_0%,#FFC2B0_100%)]
                hover:bg-[radial-gradient(ellipse_at_center,#FFEEE8_0%,#FFDCD1_100%)] transition-opacity disabled:opacity-40"
              >
                {addingConfirmed
                  ? "추가 중"
                  : confirmedModalMultiSelected.length > 0
                    ? `확정 추가 (${confirmedModalMultiSelected.length})`
                    : "확정 추가"}
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* 재료 겹침 경고 팝업 */}
      {showConflictModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-card border border-border rounded-3xl px-5 py-3 w-[340px] shadow-2xl flex flex-col gap-4">
            <div className="flex items-center gap-2 text-destructive font-bold text-base">
              <CircleAlert size={18} className="shrink-0" />
              테스트 일정 겹침
            </div>
            <p className="text-base text-foreground leading-none whitespace-pre-line">{conflictMessage}</p>
            <button
              onClick={handleConflictConfirm}
              className="flex-1 py-3 rounded-full text-primary-foreground text-base font-bold 
                bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#DBF2FF_50%,#D1EDFF_100%)] 
                hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#DBF2FF_100%)] transition-opacity disabled:opacity-40"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* 재료 추가 성공 안내 팝업 */}
      {showAddSuccessInfo && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-card border border-border rounded-3xl p-6 w-[340px] shadow-2xl flex flex-col gap-4">
            <div className="flex items-center gap-2 text-primary font-bold text-base">
              <CheckCircle size={18} className="shrink-0" />
              재료가 추가되었어요
            </div>
            <p className="text-sm text-foreground leading-relaxed">{addSuccessInfoMessage}</p>
            <button
              onClick={() => setShowAddSuccessInfo(false)}
              className="w-full py-3 rounded-full bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#DBF2FF_50%,#D1EDFF_100%)]
              text-primary-foreground font-bold text-sm"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* 의심 재료 상세 팝업 */}
      {suspectedPopup && (() => {
        const severityStyle =
          suspectedPopup.severity === "high"
            ? { badge: "bg-reaction-bg text-reaction-fg border-red-200", label: "높음" }
            : suspectedPopup.severity === "medium"
              ? { badge: "bg-testing-bg text-testing-fg border-amber-200", label: "중간" }
              : { badge: "bg-safe-bg text-safe-fg border-[#9AC6AF]", label: "낮음" };
        return (
          <div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4"
            onClick={() => setSuspectedPopup(null)}
          >
            <div
              className="bg-card border border-border rounded-3xl p-6 w-[320px] shadow-2xl flex flex-col gap-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <IngredientIcon name={suspectedPopup.name} emoji={suspectedPopup.emoji} className="w-8 h-8 sm:w-10 sm:h-10" />
                  <span className="font-bold text-xl">{suspectedPopup.name}</span>
                </div>
                <button onClick={() => setSuspectedPopup(null)} className="p-1.5 rounded-full hover:bg-muted">
                  <X className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                </button>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">반응 예상 단계</span>
                  <span className={`px-3 py-0.5 rounded-full text-sm font-bold border ${severityStyle.badge}`}>
                    {severityStyle.label}
                  </span>
                </div>

                <div className="flex flex-col gap-1 mt-1">
                  {suspectedPopup.confirmed.map((source) => (
                    <div
                      key={`c-${source}`}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-xl
                        bg-[#FFEEE8] border border-[#FF8763]/30"
                    >
                      <AlertTriangle size={14} className="text-destructive shrink-0" />
                      <span className="text-sm font-bold text-primary-foreground">{source}</span>
                      <span className="text-sm text-[#5C5B58]">알레르기 확정</span>
                    </div>
                  ))}
                  {suspectedPopup.reaction.map((source) => (
                    <div
                      key={`r-${source}`}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-xl
                        bg-[#FFF5D4] border border-[#FF8763]/30"
                    >
                      <AlertTriangle size={14} className="text-destructive shrink-0" />
                      <span className="text-sm font-bold text-primary-foreground">{source}</span>
                      <span className="text-sm text-[#5C5B58]">알레르기 반응</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setSuspectedPopup(null)}
                className="w-full py-3 rounded-full bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#DBF2FF_50%,#D1EDFF_100%)]
                  text-primary-foreground font-bold text-sm"
              >
                확인
              </button>
            </div>
          </div>
        );
      })()}

      {/* 새 재료 추가 모달 */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4 py-6"
          onClick={closeAddModal}
        >
          <div
            className="bg-card border border-border rounded-3xl px-5 py-3 w-[350px] shadow-2xl flex flex-col gap-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 font-bold text-base">
                <CirclePlus size={18} className="shrink-0" />
                새 재료 추가
              </h3>
              <button onClick={closeAddModal} className="p-1.5 rounded-full hover:bg-muted">
                <X className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
              </button>
            </div>

            {selectedIngredient ? (
              <div className="flex items-center gap-3 px-4 py-2 rounded-full 
                bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_100%)] border border-[#FFE78A]">
                <IngredientIcon name={selectedIngredient.name} emoji={selectedIngredient.emoji} className="w-6 h-6 sm:w-7 sm:h-7" />
                <span className="font-bold text-lg flex-1">{selectedIngredient.name}</span>
                <button
                  onClick={() => setSelectedIngredient(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  value={ingredientSearch}
                  onChange={(e) => { setIngredientSearch(e.target.value); setAddError(""); }}
                  placeholder="재료 이름 검색"
                  className="w-full px-4 py-3 rounded-3xl border border-[#C5E5FA] bg-[#FAFAFA]/80
                  focus:outline-none focus:ring-2 focus:ring-[#EBF7FF] text-base font-semibold"
                />
                {searchResults.length > 0 && (
                  <div className="border border-[#EBF7FF] rounded-3xl overflow-hidden mt-2">
                    {searchResults.map((ing) => (
                      <button
                        key={ing.id}
                        onClick={() => { setSelectedIngredient(ing); setSearchResults([]); setAddError(""); }}
                        className="w-full flex items-center gap-3 px-4 py-2 rounded-3xl 
                        hover:bg-[#EBF7FF] text-base text-left border border-[#EBF7FF]"
                      >
                        <IngredientIcon name={ing.name} emoji={ing.emoji} className="w-4 h-4 sm:w-5 sm:h-5" />
                        <span className="font-semibold">{ing.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {addError && (
              <div className="px-4 py-2.5 bg-destructive/10 border border-destructive/30 rounded-full
                  text-sm text-destructive font-semibold">
                {addError}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={closeAddModal}
                className="flex-1 py-3 rounded-full border border-border text-base 
                font-semibold hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#DBF2FF_100%)] transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleAddIngredient}
                disabled={!selectedIngredient || adding}
                className="flex-1 py-3 rounded-full text-primary-foreground text-base font-bold 
                bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#DBF2FF_50%,#D1EDFF_100%)] 
                hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#DBF2FF_100%)] transition-opacity disabled:opacity-40"
              >
                {adding ? "추가 중" : "추가하기"}
              </button>
            </div>
          </div>
        </div>
      )}
      <TutorialModal open={showTutorial} onClose={() => setShowTutorial(false)}
        slides={allergySlides} title="알레르기 관리 사용법" />
    </div>
  );
}

export default function Allergy() {
  return (
    <ProtectedPage>
      <AllergyInner />
    </ProtectedPage>
  );
}
