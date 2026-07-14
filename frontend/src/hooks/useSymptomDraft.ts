import { useState } from "react";

// "반응 추가" 모달의 시간대별 증상 입력 초안(draft) 상태 머신.
// Allergy 페이지 본문에 흩어져 있던 symptomEntries 상태와 8개 핸들러를 한곳에 모은다.
// 배열 조작은 순수 함수(아래)로 두어 React 없이 단위 테스트할 수 있게 한다.

export interface SymptomItem {
  type: string;
  severity: string;
}

export interface SymptomEntry {
  id: string;
  date: string;
  time: string;
  symptoms: SymptomItem[];
}

export type EntryPatch = Partial<Pick<SymptomEntry, "date" | "time">>;

// ── 순수 리듀서 연산 (React 없음, 테스트 대상) ────────────────────────────────

export function removeEntryFrom(entries: SymptomEntry[], id: string): SymptomEntry[] {
  return entries.filter((e) => e.id !== id);
}

export function patchEntryIn(entries: SymptomEntry[], id: string, patch: EntryPatch): SymptomEntry[] {
  return entries.map((e) => (e.id === id ? { ...e, ...patch } : e));
}

/** 증상 type을 토글: 없으면 severity="mild"로 추가, 있으면 제거. */
export function toggleSymptom(entries: SymptomEntry[], id: string, type: string): SymptomEntry[] {
  return entries.map((e) => {
    if (e.id !== id) return e;
    const exists = e.symptoms.find((s) => s.type === type);
    return {
      ...e,
      symptoms: exists
        ? e.symptoms.filter((s) => s.type !== type)
        : [...e.symptoms, { type, severity: "mild" }],
    };
  });
}

export function setSymptomSeverity(
  entries: SymptomEntry[],
  id: string,
  type: string,
  severity: string,
): SymptomEntry[] {
  return entries.map((e) =>
    e.id !== id
      ? e
      : { ...e, symptoms: e.symptoms.map((s) => (s.type === type ? { ...s, severity } : s)) },
  );
}

function makeEntry(): SymptomEntry {
  const now = new Date();
  return {
    id: `${Date.now()}-${Math.random()}`,
    date: now.toISOString().split("T")[0],
    time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    symptoms: [],
  };
}

// ── 훅 ──────────────────────────────────────────────────────────────────────

export function useSymptomDraft() {
  const [symptomEntries, setSymptomEntries] = useState<SymptomEntry[]>([]);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  /** 모달 오픈 시: 첫 항목 1개로 시작하고 그 항목을 펼친다. */
  const startSymptomDraft = () => {
    const first = makeEntry();
    setSymptomEntries([first]);
    setExpandedEntryId(first.id);
  };
  const resetSymptomDraft = () => {
    setSymptomEntries([]);
    setExpandedEntryId(null);
  };
  const addEntry = () => {
    const entry = makeEntry();
    setSymptomEntries((prev) => [...prev, entry]);
    setExpandedEntryId(entry.id);
  };
  const removeEntry = (id: string) => setSymptomEntries((prev) => removeEntryFrom(prev, id));
  const updateEntry = (id: string, patch: EntryPatch) =>
    setSymptomEntries((prev) => patchEntryIn(prev, id, patch));
  const updateEntryDate = (id: string, y: number, m: number, d: number) => {
    const maxDay = new Date(y, m, 0).getDate();
    updateEntry(id, {
      date: `${y}-${String(m).padStart(2, "0")}-${String(Math.min(d, maxDay)).padStart(2, "0")}`,
    });
  };
  const updateEntryTime = (id: string, h: number, min: number) =>
    updateEntry(id, { time: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}` });
  const toggleEntrySymptom = (id: string, type: string) =>
    setSymptomEntries((prev) => toggleSymptom(prev, id, type));
  const setEntrySeverity = (id: string, type: string, severity: string) =>
    setSymptomEntries((prev) => setSymptomSeverity(prev, id, type, severity));

  return {
    symptomEntries,
    expandedEntryId,
    setExpandedEntryId,
    startSymptomDraft,
    resetSymptomDraft,
    addEntry,
    removeEntry,
    updateEntryDate,
    updateEntryTime,
    toggleEntrySymptom,
    setEntrySeverity,
  };
}
