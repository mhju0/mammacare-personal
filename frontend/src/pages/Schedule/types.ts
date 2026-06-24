export interface Ingredient {
  id?: number;
  emoji: string;
  name: string;
  hasAllergy?: boolean;
  amount?: number;
}

export interface MealEntry {
  id?: string;
  name: string;
  hour: number;
  minute: number;
  ingredients: Ingredient[];
  memo: string;
  status?: string;
  recipe_id?: string | null;
  recipe_description?: string | null;
}

export interface ApiMealItem {
  id: string;
  time: string;
  name: string | null;
  status: string;
  recipe_id: string | null;
  recipe_description: string | null;
  memo: string | null;
  ingredients?: ApiMealIngredient[];
  first_ingredient_emoji: string | null;
  first_ingredient_name: string | null;
}

export interface ApiMealIngredient {
  id: number;
  name: string;
  emoji: string | null;
  amount: number;
}

export interface ApiDaySchedule {
  meals: ApiMealItem[];
  memo: string | null;
}

export interface ScheduleCreateOut {
  id: string;
  meal_at: string;
  name: string | null;
  recipe_id: string | null;
  memo: string | null;
  status: string;
}

export interface DayMeals {
  [key: string]: MealEntry[];
}

export interface ApiIngredient {
  id: number;
  name: string;
  emoji: string | null;
  recommended_month: number | null;
}

export interface ApiRecipeIngredient {
  id: string;
  amount: number;
  ingredient: ApiIngredient;
}

export interface ApiRecipe {
  id: string;
  title: string;
  description: string | null;
  ingredients: ApiRecipeIngredient[];
  steps?: string[];
}

// ── STT 타입 ──────────────────────────────────────────────────────────────────

export interface SttIngredient {
  ingredient_id: number;
  name: string;
  amount: number;
}

export interface SttMatchedRecipe {
  recipe_id: string;
  title: string;
  ingredients: SttIngredient[];
}

export interface SttParseResult {
  matched: SttMatchedRecipe[];
  meal_date: string;
  meal_time: string | null;
  unmatched: boolean;
  message: string;
}

export const weekDays = ["일", "월", "화", "수", "목", "금", "토"];

export const today = new Date();
today.setHours(0, 0, 0, 0);

export function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return { firstDay, daysInMonth };
}

export function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatMealAt(year: number, month: number, day: number, hour: number, minute: number): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${year}-${p(month + 1)}-${p(day)}T${p(hour)}:${p(minute)}:00+09:00`;
}

export function isToday(year: number, month: number, day: number): boolean {
  const date = new Date(year, month, day);
  date.setHours(0, 0, 0, 0);
  return date.getTime() === today.getTime();
}

export function calculateBabyAgeMonths(birthYear: number, birthMonth: number, birthDay: number): number {
  const birthDate = new Date(birthYear, birthMonth - 1, birthDay);
  const now = new Date();
  const diffMs = now.getTime() - birthDate.getTime();
  const months = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44));
  return Math.max(months, 5);
}

export function toIngredients(recipe: ApiRecipe, allergies: string[]): Ingredient[] {
  return recipe.ingredients.map((ri) => ({
    id: ri.ingredient.id,
    emoji: ri.ingredient.emoji ?? "",
    name: ri.ingredient.name,
    hasAllergy: allergies.includes(ri.ingredient.name),
  }));
}
