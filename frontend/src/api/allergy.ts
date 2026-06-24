import { apiFetch } from "./client";

export type TestStatus = "testing" | "completed_safe" | "completed_reaction";

export interface IngredientTestingResponse {
  id: string;
  baby_id: string;
  ingredient_id: number;
  ingredient_name: string;
  ingredient_emoji: string | null;
  test_start_date: string;
  test_end_date: string | null;
  test_status: TestStatus | null;
  has_reaction: boolean;
  memo: string | null;
}

export interface SymptomItemResponse {
  id: string;
  check_id: string;
  symptom_type: string;
  severity: string | null;
}

export interface SymptomPhotoInCheckResponse {
  id: string;
  photo_url: string;
  taken_at: string;
  sort_order: number;
}

export interface SymptomCheckResponse {
  id: string;
  testing_id: string;
  checked_at: string;
  has_reaction: boolean;
  description: string | null;
  symptom_items: SymptomItemResponse[];
  symptom_photos: SymptomPhotoInCheckResponse[];
}

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

// ── ingredient testing ────────────────────────────────────────────────────────

export async function listTestings(
  babyId: string,
  token: string,
): Promise<IngredientTestingResponse[]> {
  const res = await apiFetch<ApiResponse<IngredientTestingResponse[]>>(
    `/allergy/tests?baby_id=${babyId}`,
    {},
    token,
  );
  return res.data ?? [];
}

export async function createTesting(
  payload: {
    baby_id: string;
    ingredient_id: number;
    test_start_date: string;
    test_status?: TestStatus;
    memo?: string;
  },
  token: string,
): Promise<IngredientTestingResponse> {
  const res = await apiFetch<ApiResponse<IngredientTestingResponse>>(
    "/allergy/tests",
    { method: "POST", body: JSON.stringify(payload) },
    token,
  );
  return res.data;
}

export async function updateTesting(
  testingId: string,
  payload: { test_status?: TestStatus; memo?: string; ingredient_id?: number; test_start_date?: string },
  token: string,
): Promise<IngredientTestingResponse> {
  const res = await apiFetch<ApiResponse<IngredientTestingResponse>>(
    `/allergy/tests/${testingId}`,
    { method: "PATCH", body: JSON.stringify(payload) },
    token,
  );
  return res.data;
}

// ── symptom check ─────────────────────────────────────────────────────────────

export async function listSymptomChecks(
  testingId: string,
  token: string,
): Promise<SymptomCheckResponse[]> {
  const res = await apiFetch<ApiResponse<SymptomCheckResponse[]>>(
    `/allergy/tests/${testingId}/symptoms`,
    {},
    token,
  );
  return res.data ?? [];
}

export async function createSymptomCheck(
  testingId: string,
  payload: {
    checked_at: string;
    has_reaction: boolean;
    description?: string;
    symptom_items?: { symptom_type: string; severity?: string }[];
  },
  token: string,
): Promise<SymptomCheckResponse> {
  const res = await apiFetch<ApiResponse<SymptomCheckResponse>>(
    `/allergy/tests/${testingId}/symptoms`,
    { method: "POST", body: JSON.stringify({ ...payload, symptom_items: payload.symptom_items ?? [] }) },
    token,
  );
  return res.data;
}

export async function deleteSymptomCheck(
  checkId: string,
  token: string,
): Promise<void> {
  await apiFetch<void>(
    `/allergy/symptoms/${checkId}`,
    { method: "DELETE" },
    token,
  );
}

export async function fetchReportBlob(
  babyId: string,
  token: string,
  days: number = 7,
  format: "pdf" | "jpeg" = "pdf",
): Promise<string> {
  const blob = await fetchReportFile(babyId, token, days, format);
  return URL.createObjectURL(blob);
}

export async function fetchReportFile(
  babyId: string,
  token: string,
  days: number = 7,
  format: "pdf" | "jpeg" = "pdf",
): Promise<Blob> {
  const BASE = `${(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")}/api`;
  const res = await fetch(`${BASE}/babies/${babyId}/report?days=${days}&format=${format}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      (body as { detail?: string }).detail ??
      "리포트 생성에 실패했습니다.";
    throw new Error(msg);
  }
  return res.blob();
}

export async function fetchReportImage(
  babyId: string,
  token: string,
  days: number = 7,
): Promise<{ previewUrl: string; blob: Blob }> {
  const blob = await fetchReportFile(babyId, token, days, "jpeg");
  return { previewUrl: URL.createObjectURL(blob), blob };
}

export async function deleteTesting(
  testingId: string,
  token: string,
  withSchedules = false,
): Promise<void> {
  const qs = withSchedules ? "?with_schedules=true" : "";
  await apiFetch<void>(
    `/allergy/tests/${testingId}${qs}`,
    { method: "DELETE" },
    token,
  );
}

// ── confirmed allergy ─────────────────────────────────────────────────────────

export interface ConfirmedAllergyResponse {
  id: string;
  baby_id: string;
  ingredient_id: number;
  ingredient_name: string | null;
  ingredient_emoji: string | null;
  confirmed_date: string;
  note: string | null;
}

export async function listConfirmedAllergies(
  babyId: string,
  token: string,
): Promise<ConfirmedAllergyResponse[]> {
  const res = await apiFetch<ApiResponse<ConfirmedAllergyResponse[]>>(
    `/allergy/confirmed?baby_id=${babyId}`,
    {},
    token,
  );
  return res.data ?? [];
}

export async function createConfirmedAllergy(
  payload: {
    baby_id: string;
    ingredient_id: number;
    confirmed_date: string;
    notes?: string;
  },
  token: string,
): Promise<ConfirmedAllergyResponse> {
  const res = await apiFetch<ApiResponse<ConfirmedAllergyResponse>>(
    "/allergy/confirmed",
    { method: "POST", body: JSON.stringify(payload) },
    token,
  );
  return res.data;
}

export async function updateConfirmedAllergy(
  allergyId: string,
  payload: { confirmed_date?: string; note?: string },
  token: string,
): Promise<ConfirmedAllergyResponse> {
  const res = await apiFetch<ApiResponse<ConfirmedAllergyResponse>>(
    `/allergy/confirmed/${allergyId}`,
    { method: "PATCH", body: JSON.stringify(payload) },
    token,
  );
  return res.data;
}

export async function deleteConfirmedAllergy(
  allergyId: string,
  token: string,
): Promise<void> {
  await apiFetch<void>(
    `/allergy/confirmed/${allergyId}`,
    { method: "DELETE" },
    token,
  );
}

export async function uploadSymptomPhoto(
  checkId: string,
  file: File,
  sortOrder: number,
  token: string,
): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(
    `${(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")}/api/allergy/symptoms/${checkId}/photos?sort_order=${sortOrder}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = (body as { message?: string; detail?: string }).message
      ?? (body as { detail?: string }).detail
      ?? "사진 업로드에 실패했습니다.";
    throw new Error(msg);
  }
}
