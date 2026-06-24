import { apiFetch } from "./client";

const API_BASE = `${(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")}/api`;

export interface AdminUserOut {
  id: string;
  username: string;
  email: string;
  name: string;
  nickname: string;
  auth_provider: string;
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
}

export interface AdminUserListOut {
  users: AdminUserOut[];
  total: number;
}

export interface AdminStatsOut {
  total_users: number;
  active_users: number;
  admin_users: number;
  total_babies: number;
}

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export async function getAdminStats(token: string): Promise<AdminStatsOut> {
  const res = await apiFetch<ApiResponse<AdminStatsOut>>("/admin/stats", {}, token);
  return res.data;
}

export async function listAdminUsers(
  token: string,
  params?: { search?: string; provider?: string; date_from?: string; date_to?: string; skip?: number; limit?: number },
): Promise<AdminUserListOut> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.provider && params.provider !== "all") query.set("provider", params.provider);
  if (params?.date_from) query.set("date_from", params.date_from);
  if (params?.date_to) query.set("date_to", params.date_to);
  if (params?.skip != null) query.set("skip", String(params.skip));
  if (params?.limit != null) query.set("limit", String(params.limit));
  const qs = query.toString();
  const res = await apiFetch<ApiResponse<AdminUserListOut>>(
    `/admin/users${qs ? `?${qs}` : ""}`,
    {},
    token,
  );
  return res.data;
}

export interface AdminBabyInfoOut {
  id: string;
  name: string;
  birth_date: string;
  age_months: number;
  gender: string | null;
}

export interface AdminLoginSessionOut {
  created_at: string;
  user_agent: string | null;
  ip_address: string | null;
  is_revoked: boolean;
}

export interface AdminUserActivityOut {
  testing_count: number;
  schedule_count: number;
  growth_count: number;
}

export interface AdminUserDetailOut {
  user: AdminUserOut;
  babies: AdminBabyInfoOut[];
  activity: AdminUserActivityOut;
  login_sessions: AdminLoginSessionOut[];
  last_login_at: string | null;
}

export async function getAdminUserDetail(token: string, userId: string): Promise<AdminUserDetailOut> {
  const res = await apiFetch<ApiResponse<AdminUserDetailOut>>(`/admin/users/${userId}`, {}, token);
  return res.data;
}

export async function updateAdminUser(
  token: string,
  userId: string,
  body: { is_admin?: boolean; is_active?: boolean },
): Promise<AdminUserOut> {
  const res = await apiFetch<ApiResponse<AdminUserOut>>(
    `/admin/users/${userId}`,
    { method: "PATCH", body: JSON.stringify(body) },
    token,
  );
  return res.data;
}

export async function deleteAdminUser(token: string, userId: string): Promise<void> {
  await apiFetch<ApiResponse<null>>(
    `/admin/users/${userId}`,
    { method: "DELETE" },
    token,
  );
}

// --- 데이터 관리 ---

export interface AdminDataStatsOut {
  total_babies: number;
  total_meals: number;
  avg_meals_per_baby: number;
  total_tested_ingredients: number;
  total_active_tests: number;
  total_reaction_tests: number;
  total_recipes: number;
  total_ingredients: number;
}

export interface AdminBabyDataOut {
  id: string;
  name: string;
  age_months: number;
  meal_count: number;
  last_updated: string | null;
}

export interface AdminBabyDataListOut {
  babies: AdminBabyDataOut[];
  total: number;
}

export interface AdminAllergyDataOut {
  ingredient_id: number;
  ingredient_name: string;
  testing_count: number;
  confirmed_count: number;
}

export interface AdminAllergyDataListOut {
  allergies: AdminAllergyDataOut[];
  total: number;
}

export type RecipeStage = "early" | "middle" | "late" | "complete" | "toddler" | "general";

export interface AdminRecipeDataOut {
  id: string;
  title: string;
  description: string | null;
  source: string | null;
  stage: RecipeStage | null;
  ingredient_count: number;
  created_at: string;
}

export interface AdminRecipeDataListOut {
  recipes: AdminRecipeDataOut[];
  total: number;
}

export async function getAdminDataStats(token: string): Promise<AdminDataStatsOut> {
  const res = await apiFetch<ApiResponse<AdminDataStatsOut>>("/admin/data/stats", {}, token);
  return res.data;
}

export async function getAdminBabyData(
  token: string,
  params?: { skip?: number; limit?: number },
): Promise<AdminBabyDataListOut> {
  const query = new URLSearchParams();
  if (params?.skip != null) query.set("skip", String(params.skip));
  if (params?.limit != null) query.set("limit", String(params.limit));
  const qs = query.toString();
  const res = await apiFetch<ApiResponse<AdminBabyDataListOut>>(
    `/admin/data/babies${qs ? `?${qs}` : ""}`,
    {},
    token,
  );
  return res.data;
}

export async function getAdminAllergyData(
  token: string,
  params?: { skip?: number; limit?: number },
): Promise<AdminAllergyDataListOut> {
  const query = new URLSearchParams();
  if (params?.skip != null) query.set("skip", String(params.skip));
  if (params?.limit != null) query.set("limit", String(params.limit));
  const qs = query.toString();
  const res = await apiFetch<ApiResponse<AdminAllergyDataListOut>>(
    `/admin/data/allergies${qs ? `?${qs}` : ""}`,
    {},
    token,
  );
  return res.data;
}

export async function getAdminRecipeData(
  token: string,
  params?: { skip?: number; limit?: number; search?: string },
): Promise<AdminRecipeDataListOut> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.skip != null) query.set("skip", String(params.skip));
  if (params?.limit != null) query.set("limit", String(params.limit));
  const qs = query.toString();
  const res = await apiFetch<ApiResponse<AdminRecipeDataListOut>>(
    `/admin/data/recipes${qs ? `?${qs}` : ""}`,
    {},
    token,
  );
  return res.data;
}

export async function deleteAdminRecipes(
  token: string,
  recipeIds: string[],
): Promise<void> {
  await apiFetch<ApiResponse<null>>(
    "/admin/data/recipes",
    { method: "DELETE", body: JSON.stringify({ recipe_ids: recipeIds }) },
    token,
  );
}

export interface AdminRecipeCreateIn {
  title: string;
  description?: string;
  source?: string;
  stage?: RecipeStage;
  ingredients: { ingredient_id: number; amount: number }[];
}

export async function createAdminRecipe(
  token: string,
  body: AdminRecipeCreateIn,
): Promise<AdminRecipeDataOut> {
  const res = await apiFetch<ApiResponse<AdminRecipeDataOut>>(
    "/admin/data/recipes",
    { method: "POST", body: JSON.stringify(body) },
    token,
  );
  return res.data;
}

// --- 식재료 관리 ---

export interface AdminIngredientDataOut {
  id: number;
  name: string;
  emoji: string | null;
  recommended_month: number | null;
  created_at: string;
}

export interface AdminIngredientDataListOut {
  ingredients: AdminIngredientDataOut[];
  total: number;
}

export async function getAdminIngredientData(
  token: string,
  params?: { skip?: number; limit?: number; search?: string },
): Promise<AdminIngredientDataListOut> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.skip != null) query.set("skip", String(params.skip));
  if (params?.limit != null) query.set("limit", String(params.limit));
  const qs = query.toString();
  const res = await apiFetch<ApiResponse<AdminIngredientDataListOut>>(
    `/admin/data/ingredients${qs ? `?${qs}` : ""}`,
    {},
    token,
  );
  return res.data;
}

export async function uploadIngredientImage(token: string, file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/admin/data/ingredients/image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? "이미지 업로드에 실패했습니다.");
  }
  const json = await res.json();
  return json.data.url as string;
}

export interface AdminIngredientCreateIn {
  name: string;
  image_url?: string;
  recommended_month?: number;
  nutrient_carb?: string;
  nutrient_protein?: string;
  nutrient_fat?: string;
  nutrient_iron?: string;
  nutrient_vitamin?: string;
  nutrient_mineral?: string;
}

export async function createAdminIngredient(
  token: string,
  body: AdminIngredientCreateIn,
): Promise<AdminIngredientDataOut> {
  const res = await apiFetch<ApiResponse<AdminIngredientDataOut>>(
    "/admin/data/ingredients",
    { method: "POST", body: JSON.stringify(body) },
    token,
  );
  return res.data;
}

export async function deleteAdminIngredients(
  token: string,
  ingredientIds: number[],
): Promise<void> {
  await apiFetch<ApiResponse<null>>(
    "/admin/data/ingredients",
    { method: "DELETE", body: JSON.stringify({ ingredient_ids: ingredientIds }) },
    token,
  );
}

// ── 대시보드 ──

export interface TrendItem { period_label: string; count: number; }
export interface ProviderItem { provider: string; count: number; percentage: number; }
export interface TestingTrendItem { period_label: string; created: number; completed: number; }
export interface TopAllergyItem { name: string; count: number; }
export interface SeverityItem { severity: string; count: number; }
export interface ScheduleStatusItem { status: string; count: number; }
export interface BabyAgeItem { age_group: string; count: number; }
export interface GrowthItem { age_group: string; avg_weight: number | null; avg_height: number | null; }

export interface AdminDashboardOut {
  new_users_trend: TrendItem[];
  provider_distribution: ProviderItem[];
  dau: number;
  mau: number;
  total_users: number;
  testing_trend: TestingTrendItem[];
  testing_completion_rate: number;
  top_allergy_ingredients: TopAllergyItem[];
  symptom_severity_dist: SeverityItem[];
  schedule_completion_rate: number;
  schedule_status_dist: ScheduleStatusItem[];
  baby_age_distribution: BabyAgeItem[];
  avg_baby_food_start_month: number | null;
  monthly_avg_growth: GrowthItem[];
  total_babies: number;
}

export async function getAdminDashboard(
  token: string,
  params?: { period?: string; provider?: string; age_group?: string },
): Promise<AdminDashboardOut> {
  const query = new URLSearchParams();
  if (params?.period) query.set("period", params.period);
  if (params?.provider) query.set("provider", params.provider);
  if (params?.age_group) query.set("age_group", params.age_group);
  const qs = query.toString();
  const res = await apiFetch<ApiResponse<AdminDashboardOut>>(
    `/admin/dashboard${qs ? `?${qs}` : ""}`,
    {},
    token,
  );
  return res.data;
}

// ── 보안 & 권한 ──

export interface AdminLoginLogOut {
  token_id: string;
  parent_id: string;
  name: string;
  email: string;
  created_at: string;
  ip_address: string | null;
  user_agent: string | null;
  is_revoked: boolean;
}

export interface AdminLoginLogsOut {
  logs: AdminLoginLogOut[];
  total: number;
}

export interface AdminSuspiciousSessionOut {
  parent_id: string;
  name: string;
  email: string;
  reason: string;
  created_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

export interface AdminSuspiciousListOut {
  sessions: AdminSuspiciousSessionOut[];
  total: number;
}

export interface AdminRevokeTokensOut {
  revoked_count: number;
}

export interface AdminToggleAdminOut {
  parent_id: string;
  is_admin: boolean;
  message: string;
}

export async function getAdminLoginLogs(
  token: string,
  params?: { skip?: number; limit?: number },
): Promise<AdminLoginLogsOut> {
  const query = new URLSearchParams();
  if (params?.skip != null) query.set("skip", String(params.skip));
  if (params?.limit != null) query.set("limit", String(params.limit));
  const qs = query.toString();
  const res = await apiFetch<ApiResponse<AdminLoginLogsOut>>(
    `/admin/security/login-logs${qs ? `?${qs}` : ""}`,
    {},
    token,
  );
  return res.data;
}

export async function getAdminSuspiciousSessions(
  token: string,
): Promise<AdminSuspiciousListOut> {
  const res = await apiFetch<ApiResponse<AdminSuspiciousListOut>>(
    "/admin/security/suspicious",
    {},
    token,
  );
  return res.data;
}

export async function revokeUserTokens(
  token: string,
  parentId: string,
): Promise<AdminRevokeTokensOut> {
  const res = await apiFetch<ApiResponse<AdminRevokeTokensOut>>(
    `/admin/security/revoke-tokens/${parentId}`,
    { method: "POST" },
    token,
  );
  return res.data;
}

export async function grantAdmin(
  token: string,
  parentId: string,
): Promise<AdminToggleAdminOut> {
  const res = await apiFetch<ApiResponse<AdminToggleAdminOut>>(
    `/admin/security/grant-admin/${parentId}`,
    { method: "POST" },
    token,
  );
  return res.data;
}

export async function revokeAdmin(
  token: string,
  parentId: string,
): Promise<AdminToggleAdminOut> {
  const res = await apiFetch<ApiResponse<AdminToggleAdminOut>>(
    `/admin/security/revoke-admin/${parentId}`,
    { method: "POST" },
    token,
  );
  return res.data;
}

// ── 문의 관리 ──

export interface AdminInquiryItem {
  id: string;
  email: string;
  subject: string;
  content: string;
  status: "pending" | "answered";
  nickname: string;
  created_at: string;
  answered_at: string | null;
}

export interface AdminInquiryListOut {
  inquiries: AdminInquiryItem[];
  total: number;
}

export async function getAdminInquiries(
  token: string,
  params?: { status?: string; skip?: number; limit?: number },
): Promise<AdminInquiryListOut> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.skip != null) query.set("skip", String(params.skip));
  if (params?.limit != null) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiFetch<AdminInquiryListOut>(`/admin/inquiries${qs ? `?${qs}` : ""}`, {}, token);
}

export async function replyAdminInquiry(token: string, inquiryId: string): Promise<void> {
  await apiFetch(`/admin/inquiries/${inquiryId}/reply`, { method: "POST" }, token);
}
