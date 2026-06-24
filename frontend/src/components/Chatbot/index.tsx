import { useState, useRef, useEffect, useCallback } from "react";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { createPortal } from "react-dom";
import { CalendarPlus, X, Send, Mic, MicOff } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { sendChatMessage, type ChatMessage as ApiChatMessage, type SourceDocument } from "../../api/chatbot";
import { useApp } from "../../context/AppContext";
import { SttLoadingOverlay, IngredientConfirmModal, SttResultModal } from "./STTModals";
import { RecipeScheduleModal } from "../RecipeScheduleModal";
import type { GlobalSttResult, SttModalState } from "./types";
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition as NativeSpeechRecognition } from "@capacitor-community/speech-recognition";

const BASE = `${(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")}/api`;
const isApp = Capacitor.isNativePlatform();
const bottomPos = isApp ? "bottom-24" : "bottom-6";
const STT_MAX_DURATION_MS = 12_000;
const STT_SILENCE_COMMIT_MS = 2_500;

const SUGGESTED_QUESTIONS = [
  "챗봇은 무엇을 할 수 있나요?",
  "우리 아이 개월 수에 맞는 재료 추천해 주세요",
  "지금 알레르기 테스트 중인 재료 있나요?",
  "어제 달걀 먹였는데 오늘 두드러기가 났어요",
  "당근으로 만들 수 있는 이유식 알려주세요",
  "이번 주 식단 짜주세요",
];

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isFallback?: boolean;
  sources?: SourceDocument[];
}

function formatMealAt(isoStr: string): string {
  try {
    return new Date(isoStr).toLocaleString("ko-KR", {
      month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
      hour12: false, timeZone: "Asia/Seoul",
    });
  } catch {
    return isoStr;
  }
}

const SYMPTOM_WORDS = [
  "알러지", "알레르기", "반응", "발열", "고열", "미열", "열나", "열이", "열 난",
  "두드러기", "발진", "붉은", "빨갛", "빨개", "반점", "가려움",
  "부었", "부어", "부음", "부기", "붓기",
  "구토", "토했", "토해", "토함", "설사", "묽은변", "혈변",
  "기침", "호흡", "호흡곤란", "숨쉬기", "숨막", "쌕쌕", "헐떡",
  "처짐", "쳐짐", "축 처", "무기력", "보챔", "보채", "울음",
  "복통", "배앓이", "아파",
];

const QUESTION_WORDS = [
  "어떻게", "어쩌", "해야", "해도", "괜찮", "병원", "응급",
  "무슨", "뭔가", "뭐가", "뭐 때문", "왜 그런", "왜 이",
  "가야", "될까", "되나요", "되나", "하나요", "할까요", "일까요",
  "인가요", "나요", "?",
];

const RECORD_REQUEST_WORDS = ["기록", "등록", "저장", "남겨", "추가"];

function looksLikeSymptomQuestion(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  const hasSymptom = SYMPTOM_WORDS.some((word) => normalized.includes(word));
  const hasQuestion = QUESTION_WORDS.some((word) => normalized.includes(word));
  const explicitlyRequestsRecord = RECORD_REQUEST_WORDS.some((word) => normalized.includes(word));
  return hasSymptom && hasQuestion && !explicitlyRequestsRecord;
}

function normalizeVoiceTranscript(text: string): string {
  // 울음 패턴 전체 제거
  let result = text.replace(/응애|으앙|와앙|엉엉|흐엉|히잉/g, " ");
  // 단독 '앙' 제거 (앞뒤 공백 또는 문장 경계)
  result = result.replace(/(^|\s)앙(?=\s|$)/g, " ");
  result = result.replace(/\s+/g, " ").trim();

  // 추임새가 독립된 토큰일 때만 제거한다. "어제", "그제", "먹었어"처럼
  // 정상 단어에 포함된 한 글자까지 부분 일치로 잘라내면 안 된다.
  const START_FILLER = /^(어+|음+|아+|에+|저기|그러니까|그니까|그|저|뭐)(?=\s|[,.!?~]|$)[\s,.!?~]*/;
  const END_FILLER = /(?:^|\s)(어+|음+|아+|에+|저기|그러니까|그니까|그|저|뭐)[,.!?~]*$/;
  let prev = "";
  while (prev !== result) { prev = result; result = result.replace(START_FILLER, "").trim(); }
  prev = "";
  while (prev !== result) { prev = result; result = result.replace(END_FILLER, "").trim(); }

  return result;
}

export default function Chatbot() {
  const { token, activeBaby } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => { setIsOpen(false); }, [location.pathname]);

  useEffect(() => {
    const handler = () => setIsOpen(false);
    window.addEventListener("global-chatbot-close", handler);
    return () => window.removeEventListener("global-chatbot-close", handler);
  }, []);

  useEffect(() => {
    const handler = () => {
      setIsOpen(true);
      setShowSuggestions(false);
    };
    window.addEventListener("chatbot-open", handler);
    return () => window.removeEventListener("chatbot-open", handler);
  }, []);

  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", role: "assistant", content: "안녕하세요. 무엇을 도와드릴까요?", timestamp: new Date() },
  ]);
  const [inputText, setInputText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRouting, setIsRouting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [pendingRecord, setPendingRecord] = useState<{ data: GlobalSttResult; todayStr: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ schedules: { id: string; meal_at: string; name: string | null }[] } | null>(null);
  const [deleteSelectedIds, setDeleteSelectedIds] = useState<Set<string>>(new Set());

  // STT 결과 모달 상태
  const [sttModalState, setSttModalState] = useState<SttModalState>("idle");
  const [sttResult, setSttResult] = useState<GlobalSttResult | null>(null);
  const [selectedSttRecipe, setSelectedSttRecipe] = useState<{ recipe_id: string; title: string } | null>(null);
  const sttTodayRef = useRef<string>("");

  const isBusy = isLoading || isRouting;
  useBodyScrollLock(isListening);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textQueueRef = useRef<string>("");
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamingMsgIdRef = useRef<string | null>(null);
  const streamDoneRef = useRef<boolean>(false);
  const routeAndSendRef = useRef<((text: string) => Promise<void>) | null>(null);
  const toggleVoiceInputRef = useRef<(() => void) | null>(null);
  const commitAndSendRef = useRef<(() => void) | null>(null);
  const [listeningTranscript, setListeningTranscript] = useState("");
  const finalTranscriptRef = useRef<string>("");
  const finalSegmentsRef = useRef<Map<number, string>>(new Map());
  const isCommittingVoiceRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: isOpen ? "instant" : "smooth" });
    }
  }, [messages, showSuggestions, isBusy, isOpen]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (tickerRef.current) clearInterval(tickerRef.current);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (maxTimeTimerRef.current) clearTimeout(maxTimeTimerRef.current);
      textQueueRef.current = "";
      finalTranscriptRef.current = "";
      finalSegmentsRef.current.clear();
      isCommittingVoiceRef.current = true;
    };
  }, []);

  useEffect(() => {
    const handler = () => {
      setIsOpen(true);
      setShowSuggestions(false);
      setTimeout(() => toggleVoiceInputRef.current?.(), 300);
    };
    window.addEventListener("chatbot-mic-trigger", handler);
    return () => window.removeEventListener("chatbot-mic-trigger", handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const { text } = (e as CustomEvent<{ text: string }>).detail;
      if (!text || isBusy || !token) return;

      setIsOpen(true);
      setShowSuggestions(false);

      const userMessage: Message = { id: `user-${Date.now()}`, role: "user", content: text, timestamp: new Date() };
      const aiMessageId = `ai-${Date.now()}`;
      const aiMessage: Message = { id: aiMessageId, role: "assistant", content: "", timestamp: new Date(), isFallback: false };

      setMessages((prev) => {
        const history: ApiChatMessage[] = prev.filter((m) => m.id !== "welcome").slice(-10).map((m) => ({ role: m.role, content: m.content }));
        abortRef.current = new AbortController();
        textQueueRef.current = "";
        streamDoneRef.current = false;
        streamingMsgIdRef.current = aiMessageId;
        setIsLoading(true);

        sendChatMessage(text, history, token, activeBaby?.id,
          (chunk) => { textQueueRef.current += chunk; startTicker(aiMessageId); },
          (meta) => { setMessages((p) => p.map((m) => m.id === aiMessageId ? { ...m, isFallback: meta.used_fallback, sources: meta.sources } : m)); },
          abortRef.current.signal,
        ).then(() => { streamDoneRef.current = true; }).catch((err) => {
          abortTicker();
          streamingMsgIdRef.current = null;
          if ((err as Error).name === "AbortError") return;
          setMessages((p) => p.map((m) => m.id === aiMessageId ? { ...m, content: "죄송합니다. 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요." } : m));
          setIsLoading(false);
        });

        return [...prev, userMessage, aiMessage];
      });
    };
    window.addEventListener("global-stt-chatbot", handler);
    return () => window.removeEventListener("global-stt-chatbot", handler);
  }, [isBusy, token, activeBaby]);

  // STT 결과 처리 (재료확인·결과 모달)
  useEffect(() => {
    const handler = (e: Event) => {
      const { data, todayStr, autoConfirm, autoConfirmIds } = (e as CustomEvent<{
        data: GlobalSttResult; todayStr: string; autoConfirm?: boolean; autoConfirmIds?: number[];
      }>).detail;
      if (!token || !activeBaby) return;
      sttTodayRef.current = todayStr;

      if (data.status === "needs_ingredient_confirm" && autoConfirm && autoConfirmIds && autoConfirmIds.length > 0) {
        setSttResult(data);
        setSttModalState("processing");
        fetch(`${BASE}/ai/global-stt/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            baby_id: activeBaby.id, today: todayStr, food_name: data.food_name ?? null,
            ingredient_ids: autoConfirmIds, date: data.pending_date ?? todayStr,
            reaction_date: data.pending_reaction_date ?? null, meal_time: data.pending_meal_time ?? null,
            spoken_at: data.pending_spoken_at ?? null,
            has_reaction: data.pending_has_reaction ?? false, symptom_description: data.pending_symptom ?? null,
          }),
        })
          .then((res) => res.ok ? res.json() : res.json().then((e: { detail?: string }) => Promise.reject(e.detail || "등록에 실패했습니다.")))
          .then((json: { data: GlobalSttResult }) => {
            setSttResult(json.data);
            setSttModalState("result");
            window.dispatchEvent(new CustomEvent("global-stt-schedule-saved"));
          })
          .catch((errMsg) => {
            // 차단(확진 알레르기 등) 사유를 재료 확인 모달에 노출
            setSttResult((prev) => prev ? { ...prev, _errorMsg: typeof errMsg === "string" ? errMsg : "저장 중 오류가 발생했습니다." } : prev);
            setSttModalState("ingredient_confirm");
          });
        return;
      }

      if (data.status === "needs_ingredient_confirm") {
        setSttResult(data);
        setSttModalState("ingredient_confirm");
      } else if (data.intent === "meal_plan") {
        navigate("/schedule");
        setTimeout(() => window.dispatchEvent(new CustomEvent("global-stt-mealplan")), 300);
      } else {
        setSttResult(data);
        setSttModalState("result");
      }
    };
    window.addEventListener("global-stt-result-ready", handler);
    return () => window.removeEventListener("global-stt-result-ready", handler);
  }, [token, activeBaby, navigate]);

  const handleIngredientConfirm = useCallback(async (selectedIds: number[]) => {
    if (!token || !activeBaby || !sttResult) return;
    setSttModalState("processing");
    try {
      const res = await fetch(`${BASE}/ai/global-stt/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          baby_id: activeBaby.id, today: sttTodayRef.current, food_name: sttResult.food_name ?? null,
          ingredient_ids: selectedIds, date: sttResult.pending_date ?? sttTodayRef.current,
          reaction_date: sttResult.pending_reaction_date ?? null, meal_time: sttResult.pending_meal_time ?? null,
          spoken_at: sttResult.pending_spoken_at ?? null,
          has_reaction: sttResult.pending_has_reaction ?? false, symptom_description: sttResult.pending_symptom ?? null,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({})) as { message?: string; detail?: string };
        setSttResult((prev) => prev ? { ...prev, _errorMsg: errJson.message ?? errJson.detail ?? "저장 중 오류가 발생했습니다." } : prev);
        setSttModalState("ingredient_confirm");
        return;
      }
      const json = await res.json() as { data: GlobalSttResult };
      setSttResult(json.data);
      setSttModalState("result");
      window.dispatchEvent(new CustomEvent("global-stt-schedule-saved"));
    } catch {
      setSttResult((prev) => prev ? { ...prev, _errorMsg: "네트워크 오류가 발생했습니다. 다시 시도해주세요." } : prev);
      setSttModalState("ingredient_confirm");
    }
  }, [token, activeBaby, sttResult]);

  const handlePhotoUpload = useCallback(async (checkId: string, file: File) => {
    if (!token) throw new Error("로그인이 필요합니다.");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BASE}/allergy/symptoms/${checkId}/photos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    if (!res.ok) throw new Error("업로드 실패");
  }, [token]);

  const closeSttModal = () => { setSttModalState("idle"); setSttResult(null); };
  const handleGoRecipes = (query: string) => navigate("/recipes", { state: { search: query } });
  const handleGoMealPlan = () => { navigate("/schedule"); setTimeout(() => window.dispatchEvent(new CustomEvent("global-stt-mealplan")), 300); };
  const handleGoSchedule = (date?: string) => {
    window.dispatchEvent(new CustomEvent("global-chatbot-close"));
    if (date) {
      const d = new Date(date);
      navigate("/schedule", { state: { openDate: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` } });
    } else {
      navigate("/schedule");
    }
  };
  const handleOpenChatbot = (text: string) => { setIsOpen(true); routeAndSendRef.current?.(text); };

  const startTicker = (messageId: string) => {
    if (tickerRef.current) return;
    tickerRef.current = setInterval(() => {
      if (textQueueRef.current.length > 0) {
        const slice = textQueueRef.current.slice(0, 2);
        textQueueRef.current = textQueueRef.current.slice(2);
        setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, content: m.content + slice } : m));
      } else if (streamDoneRef.current) {
        clearInterval(tickerRef.current!);
        tickerRef.current = null;
        streamDoneRef.current = false;
        setIsLoading(false);
      }
    }, 20);
  };

  const abortTicker = () => {
    if (tickerRef.current) { clearInterval(tickerRef.current); tickerRef.current = null; }
    textQueueRef.current = "";
    streamDoneRef.current = false;
  };

  useEffect(() => {
    if (isApp) return;
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) return;
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = "ko-KR";

    recognitionRef.current.onresult = (event: any) => {
      if (isCommittingVoiceRef.current) return;

      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalSegmentsRef.current.set(i, result[0].transcript);
        else interim += result[0].transcript;
      }
      finalTranscriptRef.current = [...finalSegmentsRef.current.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, transcript]) => transcript)
        .join(" ")
        .trim();
      // interim 없을 땐 누적 final을 보여줌
      setListeningTranscript(interim || finalTranscriptRef.current);
      // final/interim 수신 때마다 디바운스 타이머 리셋
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => commitAndSendRef.current?.(), STT_SILENCE_COMMIT_MS);
    };

    recognitionRef.current.onerror = () => {
      if (debounceTimerRef.current) { clearTimeout(debounceTimerRef.current); debounceTimerRef.current = null; }
      if (maxTimeTimerRef.current) { clearTimeout(maxTimeTimerRef.current); maxTimeTimerRef.current = null; }
      finalTranscriptRef.current = "";
      finalSegmentsRef.current.clear();
      setIsListening(false);
      setListeningTranscript("");
    };

    // 브라우저가 강제로 종료했을 때 누적분이 있으면 전송
    recognitionRef.current.onend = () => {
      if (isCommittingVoiceRef.current) return;

      const raw = finalTranscriptRef.current.trim();
      if (raw) {
        commitAndSendRef.current?.();
      } else {
        if (debounceTimerRef.current) { clearTimeout(debounceTimerRef.current); debounceTimerRef.current = null; }
        if (maxTimeTimerRef.current) { clearTimeout(maxTimeTimerRef.current); maxTimeTimerRef.current = null; }
        setIsListening(false);
        setListeningTranscript("");
      }
    };
  }, []);

  const commitAndSend = () => {
    if (isCommittingVoiceRef.current) return;
    isCommittingVoiceRef.current = true;

    const raw = finalTranscriptRef.current.trim();
    finalTranscriptRef.current = "";
    finalSegmentsRef.current.clear();
    if (debounceTimerRef.current) { clearTimeout(debounceTimerRef.current); debounceTimerRef.current = null; }
    if (maxTimeTimerRef.current) { clearTimeout(maxTimeTimerRef.current); maxTimeTimerRef.current = null; }
    setIsListening(false);
    setListeningTranscript("");
    try { recognitionRef.current?.stop(); } catch {}

    const normalized = normalizeVoiceTranscript(raw);
    if (normalized.length > 1) routeAndSendRef.current?.(normalized);
  };
  commitAndSendRef.current = commitAndSend;

  const startNativeRecognition = async () => {
    try {
      const perm = await NativeSpeechRecognition.requestPermissions();
      if ((perm as any).speechRecognition !== "granted" && (perm as any).microphone !== "granted") {
        alert("마이크 권한을 허용해주세요. 설정 > 앱 > 맘마케어 > 권한에서 마이크를 허용해 주세요.");
        return;
      }
      finalTranscriptRef.current = "";
      setIsListening(true);

      await NativeSpeechRecognition.removeAllListeners();

      NativeSpeechRecognition.addListener("partialResults", (data: { matches: string[] }) => {
        const text = data.matches?.[0] ?? "";
        setListeningTranscript(text);
        finalTranscriptRef.current = text;
      });

      NativeSpeechRecognition.addListener("listeningState", (data: { status: string }) => {
        if (data.status !== "stopped") return;
        if (maxTimeTimerRef.current) { clearTimeout(maxTimeTimerRef.current); maxTimeTimerRef.current = null; }
        const raw = finalTranscriptRef.current.trim();
        finalTranscriptRef.current = "";
        setIsListening(false);
        setListeningTranscript("");
        NativeSpeechRecognition.removeAllListeners();
        const normalized = normalizeVoiceTranscript(raw);
        if (normalized.length > 1) routeAndSendRef.current?.(normalized);
      });

      await NativeSpeechRecognition.start({
        language: "ko-KR",
        maxResults: 1,
        partialResults: true,
        popup: false,
      });

      maxTimeTimerRef.current = setTimeout(async () => {
        const raw = finalTranscriptRef.current.trim();
        await NativeSpeechRecognition.removeAllListeners();
        try { await NativeSpeechRecognition.stop(); } catch {}
        finalTranscriptRef.current = "";
        setIsListening(false);
        setListeningTranscript("");
        const normalized = normalizeVoiceTranscript(raw);
        if (normalized.length > 1) routeAndSendRef.current?.(normalized);
      }, STT_MAX_DURATION_MS);
    } catch {
      setIsListening(false);
      setListeningTranscript("");
      alert("음성 인식을 시작할 수 없습니다. 마이크 권한을 확인해주세요.");
    }
  };

  const stopNativeRecognition = async () => {
    if (maxTimeTimerRef.current) { clearTimeout(maxTimeTimerRef.current); maxTimeTimerRef.current = null; }
    const raw = finalTranscriptRef.current.trim();
    try { await NativeSpeechRecognition.stop(); } catch {}
    await NativeSpeechRecognition.removeAllListeners();
    finalTranscriptRef.current = "";
    setIsListening(false);
    setListeningTranscript("");
    const normalized = normalizeVoiceTranscript(raw);
    if (normalized.length > 1) routeAndSendRef.current?.(normalized);
  };

  const toggleVoiceInput = () => {
    if (isApp) {
      if (isListening) { stopNativeRecognition(); } else { startNativeRecognition(); }
      return;
    }
    if (!recognitionRef.current) { alert("음성 인식이 지원되지 않는 브라우저입니다."); return; }
    if (isListening) {
      if (finalTranscriptRef.current.trim()) {
        commitAndSendRef.current?.();
      } else {
        isCommittingVoiceRef.current = true;
        if (debounceTimerRef.current) { clearTimeout(debounceTimerRef.current); debounceTimerRef.current = null; }
        if (maxTimeTimerRef.current) { clearTimeout(maxTimeTimerRef.current); maxTimeTimerRef.current = null; }
        finalTranscriptRef.current = "";
        finalSegmentsRef.current.clear();
        try { recognitionRef.current.stop(); } catch {}
        setIsListening(false);
        setListeningTranscript("");
      }
    } else {
      isCommittingVoiceRef.current = false;
      finalTranscriptRef.current = "";
      finalSegmentsRef.current.clear();
      recognitionRef.current.start();
      setIsListening(true);
      maxTimeTimerRef.current = setTimeout(() => commitAndSendRef.current?.(), STT_MAX_DURATION_MS);
    }
  };

  const routeAndSend = async (text: string) => {
    setShowSuggestions(false);
    setPendingRecord(null);
    setPendingDelete(null);
    setDeleteSelectedIds(new Set());

    const userMessage: Message = { id: `user-${Date.now()}`, role: "user", content: text, timestamp: new Date() };
    const aiMessageId = `ai-${Date.now()}`;
    const aiMessage: Message = { id: aiMessageId, role: "assistant", content: "", timestamp: new Date(), isFallback: false };
    setMessages((prev) => [...prev, userMessage, aiMessage]);

    if (activeBaby) {
      const today = new Date();
      const spokenAt = today.toISOString();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

      let sttData: GlobalSttResult | null = null;
      setIsRouting(true);
      try {
        const res = await fetch(`${BASE}/ai/global-stt`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text, baby_id: activeBaby.id, today: todayStr, spoken_at: spokenAt }),
        });
        if (res.ok) sttData = (await res.json() as { data: GlobalSttResult }).data;
      } catch {
        // 의도 파악 실패 시 챗봇으로 폴백
      } finally {
        setIsRouting(false);
      }

      const isChatbotIntent = !sttData || sttData.intent === "chatbot" || sttData.intent === "unknown";
      const shouldAnswerBeforeRecord =
        sttData?.intent === "schedule_allergy" &&
        sttData?.status === "needs_ingredient_confirm" &&
        looksLikeSymptomQuestion(text);

      if (shouldAnswerBeforeRecord && sttData) {
        setPendingRecord({ data: sttData, todayStr });
      } else if (!isChatbotIntent && sttData) {
        if (sttData.status === "needs_info") {
          setMessages((prev) => prev.map((m) => m.id === aiMessageId ? { ...m, content: sttData!.message || "날짜나 재료 정보를 좀 더 구체적으로 입력해주세요." } : m));
          return;
        }
        if (sttData.intent === "schedule_delete" && sttData.status === "needs_schedule_confirm") {
          setMessages((prev) => prev.map((m) => m.id === aiMessageId ? { ...m, content: sttData!.message } : m));
          setPendingDelete({ schedules: sttData.pending_schedules ?? [] });
          return;
        }
        setMessages((prev) => prev.filter((m) => m.id !== aiMessageId));
        window.dispatchEvent(new CustomEvent("global-stt-result-ready", { detail: { data: sttData, todayStr } }));
        return;
      }
    }

    setIsOpen(true);
    setIsLoading(true);

    const history: ApiChatMessage[] = messages.filter((m) => m.id !== "welcome").slice(-10).map((m) => ({ role: m.role, content: m.content }));
    abortRef.current = new AbortController();
    textQueueRef.current = "";
    streamDoneRef.current = false;
    streamingMsgIdRef.current = aiMessageId;

    try {
      await sendChatMessage(text, history, token!, activeBaby?.id,
        (chunk) => { textQueueRef.current += chunk; startTicker(aiMessageId); },
        (meta) => { setMessages((prev) => prev.map((m) => m.id === aiMessageId ? { ...m, isFallback: meta.used_fallback, sources: meta.sources } : m)); },
        abortRef.current.signal,
      );
      streamDoneRef.current = true;
    } catch (err) {
      abortTicker();
      streamingMsgIdRef.current = null;
      if ((err as Error).name === "AbortError") return;
      setMessages((prev) => prev.map((m) => m.id === aiMessageId ? { ...m, content: "죄송합니다. 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요." } : m));
      setIsLoading(false);
    }
  };

  routeAndSendRef.current = routeAndSend;
  toggleVoiceInputRef.current = toggleVoiceInput;

  const handleSendMessage = async () => {
    if (!inputText.trim() || isBusy || !token) return;
    const text = inputText.trim();
    setInputText("");
    await routeAndSend(text);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
  };

  const handleOpenRecordConfirm = () => {
    if (!pendingRecord) return;
    const { data, todayStr } = pendingRecord;
    const suggested = data.suggested_ingredients ?? [];
    const defaultIds = data.food_name ? suggested.map((i) => i.id) : (data.exact_ingredient_ids ?? []);
    window.dispatchEvent(new CustomEvent("global-stt-result-ready", {
      detail: { data, todayStr, autoConfirm: defaultIds.length > 0, autoConfirmIds: defaultIds },
    }));
    setPendingRecord(null);
  };

  const handleDeleteConfirm = async (scheduleIds: string[]) => {
    if (!activeBaby || !token || scheduleIds.length === 0) return;
    setPendingDelete(null);
    setDeleteSelectedIds(new Set());
    const aiMessageId = `ai-${Date.now()}`;
    setMessages((prev) => [...prev, { id: aiMessageId, role: "assistant", content: "", timestamp: new Date(), isFallback: false }]);
    setIsRouting(true);
    try {
      let successCount = 0;
      for (const id of scheduleIds) {
        const res = await fetch(`${BASE}/ai/global-stt/delete-confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ baby_id: activeBaby.id, schedule_id: id }),
        });
        if (res.ok) successCount++;
      }
      const msg = successCount === scheduleIds.length
        ? `식단 ${successCount}개를 삭제했습니다.`
        : `${scheduleIds.length}개 중 ${successCount}개만 삭제되었습니다.`;
      setMessages((prev) => prev.map((m) => m.id === aiMessageId ? { ...m, content: msg } : m));
      if (successCount > 0) window.dispatchEvent(new CustomEvent("global-stt-schedule-saved"));
    } catch {
      setMessages((prev) => prev.map((m) => m.id === aiMessageId ? { ...m, content: "삭제 중 오류가 발생했습니다." } : m));
    } finally {
      setIsRouting(false);
    }
  };

  const showInitialSuggestions = messages.length <= 1 && !isBusy;
  const showSuggestionTrigger = messages.length > 1 && !isBusy && !showSuggestions;

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={`fixed ${bottomPos} right-6 w-14 h-14 bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFE78A_100%)]
          text-primary-foreground rounded-full shadow-lg hover:scale-110 transition-transform z-[30] flex items-center justify-center`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/>
            <path d="M8 12h.01"/><path d="M12 12h.01"/><path d="M16 12h.01"/>
          </svg>
        </button>
      )}

      {isOpen && (
        <div
  className={`fixed ${bottomPos} ${
    isApp
      ? "left-3 right-3 h-[min(600px,calc(100vh-8rem))]"
      : "right-4 sm:right-6 w-[calc(100vw-2rem)] max-w-sm sm:max-w-[384px]"
          } h-[min(600px,calc(100dvh-12rem))] bg-card rounded-3xl shadow-2xl z-[45] flex flex-col overflow-hidden`}
        >
          <div className="bg-[#EBF7FF] px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/40 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#7A7A7A]">
                  <path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/>
                  <path d="M8 12h.01"/><path d="M12 12h.01"/><path d="M16 12h.01"/>
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-foreground text-base">맘마케어 AI 챗봇</h3>
                <p className="text-sm text-muted-foreground">24시간 언제든 도와드릴게요</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-2 rounded-full hover:bg-white/40 transition-colors">
              <X size={20} className="text-[#7A7A7A]" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4
            bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFFBE8_100%)]
            [&::-webkit-scrollbar]:w-3
            [&::-webkit-scrollbar-track]:bg-white [&::-webkit-scrollbar-track]:rounded-full
            [&::-webkit-scrollbar-thumb]:bg-[#D9F0FF] [&::-webkit-scrollbar-thumb]:rounded-full">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] px-4 py-3 rounded-3xl ${
                  msg.role === "user"
                    ? "bg-[#D4EEFF] text-primary-foreground rounded-br-xs"
                    : msg.isFallback
                    ? "bg-[#FFF9DB] border border-amber-300 rounded-bl-xs"
                    : "bg-[#FFF9DB] border border-border rounded-bl-xs"
                }`}>
                  {msg.role === "assistant" && msg.content === "" && isBusy ? (
                    <div className="flex gap-1 py-1">
                      <div className="w-2 h-2 rounded-full bg-[#D4EEFF] animate-bounce" />
                      <div className="w-2 h-2 rounded-full bg-[#D4EEFF] animate-bounce [animation-delay:0.2s]" />
                      <div className="w-2 h-2 rounded-full bg-[#D4EEFF] animate-bounce [animation-delay:0.4s]" />
                    </div>
                  ) : msg.role === "user" ? (
                    <p className="text-lg sm:text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => <p className="text-lg sm:text-sm leading-relaxed mb-1 last:mb-0">{children}</p>,
                        ul: ({ children }) => <ul className="text-lg sm:text-sm list-disc pl-4 mb-1 space-y-0.5">{children}</ul>,
                        ol: ({ children }) => <ul className="text-lg sm:text-sm list-disc pl-4 mb-1 space-y-0.5">{children}</ul>,
                        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        code: ({ children }) => <code className="text-base sm:text-xs bg-black/10 px-1 py-0.5 rounded">{children}</code>,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  )}
                  <p className={`text-sm mt-1 ${msg.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {msg.timestamp.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}

            {showSuggestionTrigger && (
              <div className="flex justify-center px-1 pt-1">
                <button type="button" onClick={() => setShowSuggestions(true)}
                  className="text-sm px-3 py-2 rounded-full border border-[#D4EEFF] bg-white
                    text-muted-foreground hover:bg-[#D4EEFF] hover:border-[#B3DAF5] transition-colors font-medium shadow-sm">
                  질문 예시 보기
                </button>
              </div>
            )}

            {(showInitialSuggestions || showSuggestions) && (
              <div className="flex flex-col gap-2 px-1 pt-1 items-end">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button key={q} onClick={() => { setShowSuggestions(false); if (!isBusy && token) routeAndSend(q); }}
                    className="text-sm px-3 py-2 rounded-2xl border border-[#D4EEFF] bg-white w-fit
                      text-muted-foreground hover:bg-[#D4EEFF] hover:border-[#B3DAF5] transition-colors text-left leading-snug">
                    {q}
                  </button>
                ))}
              </div>
            )}

            {pendingDelete && !isBusy && (
              <div className="flex justify-start">
                <div className="max-w-[85%] px-4 py-3 rounded-3xl rounded-bl-xs bg-white border border-[#D4EEFF] shadow-sm">
                  <p className="text-sm text-muted-foreground mb-2">삭제할 식단을 선택해주세요.</p>
                  <div className="flex flex-col gap-2">
                    {pendingDelete.schedules.map((s) => {
                      const checked = deleteSelectedIds.has(s.id);
                      return (
                        <button key={s.id} type="button"
                          onClick={() => setDeleteSelectedIds((prev) => { const next = new Set(prev); checked ? next.delete(s.id) : next.add(s.id); return next; })}
                          className={`flex items-center gap-2 text-left text-sm px-3 py-2 rounded-3xl border transition-colors ${
                            checked ? "border-[#B3DAF5] bg-[#D4EEFF]" : "border-[#D4EEFF] bg-[#F5FBFF] hover:bg-[#EBF7FF]"
                          }`}>
                          <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${checked ? "bg-[#5A9CBF] border-[#5A9CBF]" : "border-[#B3DAF5] bg-white"}`}>
                            {checked && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </span>
                          <span className="font-medium">{s.name || "이유식"}</span>
                          <span className="text-xs text-muted-foreground">{formatMealAt(s.meal_at)}</span>
                        </button>
                      );
                    })}
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => handleDeleteConfirm([...deleteSelectedIds])} disabled={deleteSelectedIds.size === 0}
                        className="flex-1 py-2 rounded-full bg-[#D4EEFF] text-xs font-semibold text-muted-foreground hover:bg-[#B3DAF5] transition-colors disabled:opacity-40">
                        삭제 ({deleteSelectedIds.size})
                      </button>
                      <button type="button" onClick={() => handleDeleteConfirm(pendingDelete.schedules.map((s) => s.id))}
                        className="flex-1 py-2 rounded-full bg-[#FFE4E4] text-xs font-semibold text-[#C0726F] hover:bg-[#FFC8C8] transition-colors">
                        전체삭제
                      </button>
                      <button type="button" onClick={() => { setPendingDelete(null); setDeleteSelectedIds(new Set()); }}
                        className="px-3 py-2 rounded-full text-xs text-muted-foreground hover:text-foreground transition-colors">
                        취소
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {pendingRecord && !isBusy && (
              <div className="flex justify-start">
                <div className="max-w-[80%] px-4 py-3 rounded-3xl rounded-bl-xs bg-white border border-[#D4EEFF] shadow-sm">
                  <p className="text-sm leading-relaxed text-foreground">방금 이야기한 내용도 식단/알레르기 기록에 남길까요?</p>
                  <div className="mt-3 flex items-center gap-2">
                    <button type="button" onClick={handleOpenRecordConfirm}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#D4EEFF] px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-[#B3DAF5] transition-colors">
                      <CalendarPlus size={14} />
                      기록하기
                    </button>
                    <button type="button" onClick={() => setPendingRecord(null)}
                      className="rounded-full border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
                      괜찮아요
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className={`${isApp ? "px-4 py-3" : "p-4"} bg-[#EBF7FF] border-t border-border`}>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 flex items-center gap-1 px-3 rounded-3xl border border-[#D4EEFF] bg-background focus-within:ring-2 focus-within:ring-[#D4EEFF]">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="메시지를 입력하세요..."
                  className="flex-1 min-w-0 py-3 bg-transparent focus:outline-none text-sm resize-none"
                  rows={1}
                  style={{ maxHeight: "100px" }}
                />
                <button onClick={toggleVoiceInput}
                  className={`flex-shrink-0 p-1.5 rounded-full transition-colors ${isListening ? "bg-destructive text-destructive-foreground" : "hover:bg-[#D4EEFF] text-muted-foreground"}`}>
                  {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
              </div>
              <button onClick={handleSendMessage} disabled={!inputText.trim() || isBusy}
                className="flex-shrink-0 px-4 py-4 bg-[radial-gradient(ellipse_at_center,#B3DAF5_0%,#EBF7FF_100%)]
                text-muted-foreground rounded-3xl font-semibold
                hover:bg-[radial-gradient(ellipse_at_center,#B3DAF5_0%,#D9F1FF_100%)] flex items-center shadow-sm">
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {isListening && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[46] flex items-center justify-center px-4">
          <div className="bg-card rounded-3xl shadow-2xl w-full max-w-[320px] flex flex-col overflow-hidden">
            <div className="bg-[#EBF7FF] px-3 py-3 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="relative flex items-center justify-center h-10">
                  <span className="absolute inset-0 rounded-full bg-[#D4EEFF] animate-ping opacity-60" />
                  <span className="relative flex items-center justify-center">
                    <Mic size={26} className="text-[#5A9CBF]" />
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-base leading-tight">음성 인식 중</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">말씀이 끝나면 자동으로 분석해요</p>
                </div>
              </div>
              <button type="button" onClick={toggleVoiceInput} className="p-2 rounded-full hover:bg-white/50 transition-colors">
                <X size={20} className="text-[#7A7A7A]" />
              </button>
            </div>
            <div className="min-h-[130px] px-[18px] pt-5 pb-4 bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFFBE8_100%)]
            flex flex-col items-center justify-center gap-[14px]">
              <div className="flex items-center justify-center gap-[7px]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#B3DAF5] animate-bounce [animation-delay:-0.3s]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#B3DAF5] animate-bounce [animation-delay:-0.15s]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#B3DAF5] animate-bounce" />
              </div>
              {listeningTranscript ? (
                <div className="bg-[#D4EEFF] rounded-2xl rounded-br-xs px-4 py-3 w-full">
                  <p className="text-sm leading-relaxed text-primary-foreground">{listeningTranscript}</p>
                </div>
              ) : (
                <p className="text-base text-muted-foreground">말씀해 주세요</p>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {sttModalState === "processing" && <SttLoadingOverlay />}
      {sttModalState === "ingredient_confirm" && sttResult && (
        <IngredientConfirmModal sttResult={sttResult} onConfirm={handleIngredientConfirm} onBack={closeSttModal} />
      )}
      {sttModalState === "result" && sttResult && (
        <SttResultModal
          result={sttResult}
          onClose={closeSttModal}
          onOpenChatbot={handleOpenChatbot}
          onGoRecipes={handleGoRecipes}
          onGoMealPlan={handleGoMealPlan}
          onGoSchedule={handleGoSchedule}
          onPhotoUpload={handlePhotoUpload}
          onRecipeClick={(recipe) => { setSelectedSttRecipe(recipe); setSttModalState("idle"); }}
        />
      )}
      {selectedSttRecipe && (
        <RecipeScheduleModal
          recipe={selectedSttRecipe}
          onClose={() => setSelectedSttRecipe(null)}
          onBack={() => { setSelectedSttRecipe(null); setSttModalState("result"); }}
          onAdded={(date) => { setSelectedSttRecipe(null); window.dispatchEvent(new CustomEvent("global-chatbot-close")); handleGoSchedule(date); }}
        />
      )}
    </>
  );
}
