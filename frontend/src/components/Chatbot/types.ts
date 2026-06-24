export type GlobalSttStatus = "completed" | "needs_info" | "needs_ingredient_confirm" | "needs_schedule_confirm";
export type GlobalSttIntent = "schedule_allergy" | "schedule_delete" | "chatbot" | "recipe_search" | "meal_plan" | "growth_record" | "unknown";
export type SttModalState = "idle" | "processing" | "ingredient_confirm" | "result";

export interface SuggestedIngredient {
  id: number;
  name: string;
  emoji: string | null;
}

export interface GlobalSttResult {
  intent: GlobalSttIntent;
  status: GlobalSttStatus;
  message: string;
  missing_fields?: string[];
  food_name?: string;
  suggested_ingredients?: SuggestedIngredient[];
  exact_ingredient_ids?: number[];
  new_ingredient_ids?: number[];
  pending_date?: string;
  pending_reaction_date?: string;
  pending_meal_time?: string;
  pending_spoken_at?: string;
  pending_has_reaction?: boolean;
  pending_symptom?: string | null;
  pending_schedules?: { id: string; meal_at: string; name: string | null }[];
  // completed 결과
  schedule?: { schedule_id: string; name: string; meal_at: string; ingredient_names: string[]; action?: "created" | "existing_used" };
  allergy?: { testing_id: string; check_id: string; ingredient_name: string; action: string; test_status: string | null };
  testing?: { testing_id: string; ingredient_name: string; test_status: string | null; test_end_date: string | null };
  recipes?: { recipe_id: string; title: string; stage: string | null }[];
  chatbot_answer?: string;
  query?: string;
  recipe_ingredients?: string[];
  growth?: { log_date: string; height_cm: number | null; weight_kg: number | null };
  _errorMsg?: string;
}

export interface ApiRecipeDetail {
  id: string;
  title: string;
  description: string | null;
  ingredients: {
    amount: number;
    ingredient: { id: number; name: string; emoji: string | null; recommended_month: number | null };
  }[];
}
