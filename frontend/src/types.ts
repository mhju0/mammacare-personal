export interface BabyProfile {
  id: string;
  photo: string | null;
  name: string;
  birthType: "born" | "expected";
  birthYear: number;
  birthMonth: number;
  birthDay: number;
  gender: "girl" | "boy" | null;
  feedingStatus: "started" | "planned" | "undecided";
  feedingYear: number;
  feedingMonth: number;
  feedingDay: number;
  height: string;
  heightDate: string | null;
  weight: string;
  weightDate: string | null;
  allergens: { id: number; name: string; emoji: string | null }[];
  safeIngredients: { id: number; name: string; emoji: string | null }[];
  isComplete: boolean;
}

export interface ParentUser {
  id: string;
  name: string;
  nickname: string;
  email: string;
  username: string;
  phone: string | null;
  address: string | null;
  auth_provider: string;
  isAdmin?: boolean;
  notify_meal_time?: boolean;
  notify_allergy_check?: boolean;
  notify_community?: boolean;
}
