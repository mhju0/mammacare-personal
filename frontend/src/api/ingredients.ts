import { apiFetch } from "./client";

export interface IngredientResponse {
  id: number;
  name: string;
  emoji: string | null;
  recommended_month: number | null;
}

export async function listIngredients(params?: {
  search?: string;
  max_month?: number;
}): Promise<IngredientResponse[]> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.max_month != null) query.set("max_month", String(params.max_month));
  const qs = query.toString();
  return apiFetch<IngredientResponse[]>(`/ingredients${qs ? `?${qs}` : ""}`);
}
