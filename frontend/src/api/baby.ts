import { apiFetch } from "./client";
import type { BabyProfile } from "../types";

interface BabyApiOut {
  id: string;
  name: string;
  birth_type: boolean;
  birth_year: number;
  birth_month: number;
  birth_day: number;
  gender: string | null;
  feeding_status: string;
  feeding_year: number;
  feeding_month: number;
  feeding_day: number;
  height: string;
  height_date: string | null;
  weight: string;
  weight_date: string | null;
  is_complete: boolean;
  photo: string | null;
}

function fromApi(b: BabyApiOut): BabyProfile {
  return {
    id: b.id,
    photo: b.photo ?? null,
    name: b.name,
    birthType: b.birth_type ? "born" : "expected",
    birthYear: b.birth_year,
    birthMonth: b.birth_month,
    birthDay: b.birth_day,
    gender: (b.gender as "girl" | "boy") ?? null,
    feedingStatus: b.feeding_status as "started" | "planned" | "undecided",
    feedingYear: b.feeding_year,
    feedingMonth: b.feeding_month,
    feedingDay: b.feeding_day,
    height: b.height,
    heightDate: b.height_date ?? null,
    weight: b.weight,
    weightDate: b.weight_date ?? null,
    allergens: [],
    safeIngredients: [],
    isComplete: b.is_complete,
  };
}

function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function toPayload(baby: Omit<BabyProfile, "id">) {
  const height_cm = baby.height !== "" ? parseFloat(baby.height) : null;
  const weight_kg = baby.weight !== "" ? parseFloat(baby.weight) : null;
  const baby_food_start_date =
    baby.feedingStatus !== "undecided"
      ? toDateStr(baby.feedingYear, baby.feedingMonth, baby.feedingDay)
      : null;
  const log_date = baby.heightDate ?? baby.weightDate ?? null;

  // 사진은 본문에 포함하지 않는다 — 등록/교체는 POST /babies/{id}/photo,
  // 삭제는 DELETE /babies/{id}/photo 전용 엔드포인트를 사용한다.
  return {
    name: baby.name,
    birth_type: baby.birthType === "born",
    birth_date: toDateStr(baby.birthYear, baby.birthMonth, baby.birthDay),
    gender: baby.gender,
    baby_food_start_date,
    height_cm,
    weight_kg,
    log_date,
  };
}

export async function listBabiesApi(token: string): Promise<BabyProfile[]> {
  const data = await apiFetch<BabyApiOut[]>("/babies", {}, token);
  return data.map(fromApi);
}

export async function createBabyApi(
  token: string,
  baby: Omit<BabyProfile, "id">,
): Promise<BabyProfile> {
  const data = await apiFetch<BabyApiOut>(
    "/babies",
    { method: "POST", body: JSON.stringify(toPayload(baby)) },
    token,
  );
  return fromApi(data);
}

export async function updateBabyApi(
  token: string,
  id: string,
  baby: BabyProfile,
): Promise<BabyProfile> {
  const data = await apiFetch<BabyApiOut>(
    `/babies/${id}`,
    { method: "PATCH", body: JSON.stringify(toPayload(baby)) },
    token,
  );
  return fromApi(data);
}

export async function deleteBabyApi(token: string, id: string): Promise<void> {
  await apiFetch<void>(`/babies/${id}`, { method: "DELETE" }, token);
}

export async function uploadBabyPhotoApi(
  token: string,
  babyId: string,
  file: File,
): Promise<BabyProfile> {
  const formData = new FormData();
  formData.append("file", file);
  const BASE = `${(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")}/api`;
  const res = await fetch(`${BASE}/babies/${babyId}/photo`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      (body as { message?: string }).message ??
      (body as { detail?: string }).detail ??
      "사진 업로드에 실패했습니다.";
    throw new Error(msg);
  }
  const data = (await res.json()) as BabyApiOut;
  return fromApi(data);
}

export async function deleteBabyPhotoApi(token: string, babyId: string): Promise<void> {
  await apiFetch<void>(`/babies/${babyId}/photo`, { method: "DELETE" }, token);
}

// ─── Growth Records ───────────────────────────────────────────────────────────

export interface GrowthRecord {
  id: string;
  logDate: string; // ISO date: YYYY-MM-DD
  heightCm: number | null;
  weightKg: number | null;
}

interface GrowthApiOut {
  id: string;
  log_date: string;
  height_cm: number | null;
  weight_kg: number | null;
}

function growthFromApi(g: GrowthApiOut): GrowthRecord {
  return { id: String(g.id), logDate: g.log_date, heightCm: g.height_cm, weightKg: g.weight_kg };
}

export async function listGrowthApi(token: string, babyId: string): Promise<GrowthRecord[]> {
  const data = await apiFetch<GrowthApiOut[]>(`/babies/${babyId}/growth`, {}, token);
  return data.map(growthFromApi);
}

export async function addGrowthApi(
  token: string,
  babyId: string,
  payload: { heightCm: number | null; weightKg: number | null; logDate: string },
): Promise<GrowthRecord> {
  const data = await apiFetch<GrowthApiOut>(
    `/babies/${babyId}/growth`,
    { method: "POST", body: JSON.stringify({ height_cm: payload.heightCm, weight_kg: payload.weightKg, log_date: payload.logDate }) },
    token,
  );
  return growthFromApi(data);
}

export async function addGrowthEntriesApi(
  token: string,
  babyId: string,
  payload: {
    heightCm: number | null;
    heightLogDate: string | null;
    weightKg: number | null;
    weightLogDate: string | null;
  },
): Promise<GrowthRecord[]> {
  const data = await apiFetch<GrowthApiOut[]>(
    `/babies/${babyId}/growth/entries`,
    {
      method: "POST",
      body: JSON.stringify({
        height_cm: payload.heightCm,
        height_log_date: payload.heightLogDate,
        weight_kg: payload.weightKg,
        weight_log_date: payload.weightLogDate,
      }),
    },
    token,
  );
  return data.map(growthFromApi);
}

export async function updateGrowthApi(
  token: string,
  babyId: string,
  growthId: string,
  payload: { heightCm?: number | null; weightKg?: number | null; logDate?: string },
): Promise<GrowthRecord> {
  const body: Record<string, unknown> = {};
  if (payload.heightCm !== undefined) body.height_cm = payload.heightCm;
  if (payload.weightKg !== undefined) body.weight_kg = payload.weightKg;
  if (payload.logDate !== undefined) body.log_date = payload.logDate;
  const data = await apiFetch<GrowthApiOut>(
    `/babies/${babyId}/growth/${growthId}`,
    { method: "PATCH", body: JSON.stringify(body) },
    token,
  );
  return growthFromApi(data);
}

export async function deleteGrowthApi(token: string, babyId: string, growthId: string): Promise<void> {
  await apiFetch<void>(`/babies/${babyId}/growth/${growthId}`, { method: "DELETE" }, token);
}
