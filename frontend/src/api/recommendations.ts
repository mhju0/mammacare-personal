import { apiFetch } from "./client";
import type { IngredientResponse } from "./ingredients";

export async function getRecommendations(
  babyId: string,
  token: string,
): Promise<IngredientResponse[]> {
  return apiFetch<IngredientResponse[]>(`/babies/${babyId}/recommendations`, {}, token);
}
