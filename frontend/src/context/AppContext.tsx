import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type { ReactNode, Context } from "react";
import { loginApi, signupApi, getMeApi } from "../api/auth";
import { ApiError, apiFetch } from "../api/client";
import {
  listBabiesApi,
  createBabyApi,
  updateBabyApi,
  deleteBabyApi,
  uploadBabyPhotoApi,
  deleteBabyPhotoApi,
} from "../api/baby";
import { createConfirmedAllergy, createTesting } from "../api/allergy";
import type { ConfirmedAllergyResponse } from "../api/allergy";
import type { BabyProfile, ParentUser } from "../types";
import { dedupeRequest, readSessionCache, writeSessionCache } from "../utils/sessionCache";

const ALLERGY_CACHE_TTL_MS = 2 * 60 * 1000;

function allergyTestsCacheKey(babyId: string): string {
  return `mammacare:allergy:testings:v2:${babyId}`;
}

function confirmedAllergiesCacheKey(babyId: string): string {
  return `mammacare:allergy:confirmed:v2:${babyId}`;
}

// ── 알레르기 확정 목록 ────────────────────────────────────────────────────────
async function fetchConfirmedAllergies(token: string, babyId: string): Promise<ConfirmedAllergyResponse[]> {
  try {
    const cacheKey = confirmedAllergiesCacheKey(babyId);
    const cached = readSessionCache<ConfirmedAllergyResponse[]>(cacheKey);
    if (cached) return cached;

    const data = await dedupeRequest(cacheKey, async () => {
      const res = await apiFetch<{ data: ConfirmedAllergyResponse[] }>(
        `/allergy/confirmed?baby_id=${babyId}`,
        {},
        token,
      );
      return res.data ?? [];
    });
    writeSessionCache(cacheKey, data, ALLERGY_CACHE_TTL_MS);
    return data;
  } catch {
    return [];
  }
}

// ── 알레르기 테스트 진행 목록 ──────────────────────────────────────────────────
export interface IngredientTesting {
  id: string;
  baby_id: string;
  ingredient_id: number;
  ingredient_name: string;
  ingredient_emoji: string | null;
  test_start_date: string;
  test_end_date: string | null;
  test_status: "testing" | "completed_safe" | "completed_reaction" | null;
  has_reaction: boolean;
  memo: string | null;
}

async function fetchIngredientTestings(token: string, babyId: string): Promise<IngredientTesting[]> {
  try {
    const cacheKey = allergyTestsCacheKey(babyId);
    const cached = readSessionCache<IngredientTesting[]>(cacheKey);
    if (cached) return cached;

    const data = await dedupeRequest(cacheKey, async () => {
      const res = await apiFetch<{ data: IngredientTesting[] }>(
        `/allergy/tests?baby_id=${babyId}`,
        {},
        token,
      );
      return res.data ?? [];
    });
    writeSessionCache(cacheKey, data, ALLERGY_CACHE_TTL_MS);
    return data;
  } catch {
    return [];
  }
}

export type { BabyProfile, ParentUser };

export interface ParentInfo {
  name: string;
  phone: string;
  email: string;
  postcode: string;
  roadAddress: string;
  detailAddress: string;
}

interface AppContextType {
  user: ParentUser | null;
  set_user: (user: ParentUser | null) => void;
  authLoading: boolean;
  babies: BabyProfile[];
  activeBaby: BabyProfile | null;
  confirmedAllergyNames: string[];
  confirmedAllergies: ConfirmedAllergyResponse[];
  ingredientTestings: IngredientTesting[];
  refreshTestings: () => void;
  refreshConfirmedAllergies: () => void;
  token: string | null;
  darkMode: boolean;
  toggleDarkMode: () => void;
  parentInfo: ParentInfo | null;
  saveParentInfo: (info: ParentInfo) => void;
  login: (
    username: string,
    password: string,
    keep: boolean,
  ) => Promise<{ success: boolean; babyCount: number; isAdmin: boolean }>;
  loginWithToken: (token: string) => Promise<{ success: boolean; babyCount: number }>;
  registerAndLogin: (payload: {
    username: string;
    password: string;
    name: string;
    nickname: string;
    email: string;
    phone?: string;
    address?: string;
    oauth_signup_token?: string;
    baby_profile?: Omit<BabyProfile, "id">;
  }, babyFile?: File | null) => Promise<{ success: boolean; babyCount: number; error?: string; errorCode?: string }>;
  logout: () => void;
  addBaby: (baby: Omit<BabyProfile, "id">, file?: File | null) => Promise<string>;
  updateActiveBaby: (baby: BabyProfile, file?: File | null) => Promise<void>;
  selectBaby: (id: string) => void;
  removeBaby: (id: string) => Promise<void>;
  deleteBaby: (id: string) => void;
}

// HMR 재로드 시 context 객체가 교체되지 않도록 보존
const AppContext: Context<AppContextType | null> =
  (import.meta.hot?.data as { AppContext?: Context<AppContextType | null> })?.AppContext ??
  createContext<AppContextType | null>(null);
if (import.meta.hot) {
  (import.meta.hot.data as { AppContext?: Context<AppContextType | null> }).AppContext = AppContext;
}

function getStoredToken(): string | null {
  return (
    localStorage.getItem("access_token") ??
    sessionStorage.getItem("access_token")
  );
}

const CACHED_USER_KEY = "mammacare_cached_user";
const CACHED_BABIES_KEY = "mammacare_cached_babies";
const ACTIVE_BABY_ID_KEY = "mammacare_active_baby_id";

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function storeToken(token: string, keep: boolean) {
  if (keep) {
    localStorage.setItem("access_token", token);
    sessionStorage.removeItem("access_token");
  } else {
    sessionStorage.setItem("access_token", token);
    localStorage.removeItem("access_token");
  }
}

function clearStoredToken() {
  localStorage.removeItem("access_token");
  sessionStorage.removeItem("access_token");
}

function clearCachedAuthState() {
  localStorage.removeItem(CACHED_USER_KEY);
  localStorage.removeItem(CACHED_BABIES_KEY);
  localStorage.removeItem(ACTIVE_BABY_ID_KEY);
  Object.keys(sessionStorage)
    .filter(k => k.startsWith('mammacare:'))
    .forEach(k => sessionStorage.removeItem(k));
}

function isAuthFailure(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const hasStoredToken = getStoredToken() !== null;
  const [user, set_user] = useState<ParentUser | null>(() =>
    hasStoredToken ? readJson<ParentUser>(CACHED_USER_KEY) : null,
  );
  const [authLoading, set_auth_loading] = useState<boolean>(() => hasStoredToken && !readJson<ParentUser>(CACHED_USER_KEY));
  const [babies, set_babies] = useState<BabyProfile[]>(() =>
    hasStoredToken ? (readJson<BabyProfile[]>(CACHED_BABIES_KEY) ?? []) : [],
  );
  const [active_baby_id, set_active_baby_id] = useState<string | null>(() =>
    hasStoredToken ? localStorage.getItem(ACTIVE_BABY_ID_KEY) : null,
  );
  const [confirmedAllergies, set_confirmed_allergies] = useState<ConfirmedAllergyResponse[]>([]);
  const [ingredientTestings, set_ingredient_testings] = useState<IngredientTesting[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [token, set_token] = useState<string | null>(getStoredToken);
  const [darkMode, setDarkMode] = useState<boolean>(() => localStorage.getItem("darkMode") === "true");
  const [parentInfo, setParentInfo] = useState<ParentInfo | null>(
    () => readJson<ParentInfo>("parentInfo")
  );

  const activeBaby = babies.find((b) => b.id === active_baby_id) ?? null;

  const confirmedAllergyNames = confirmedAllergies.flatMap((a) => (a.ingredient_name ? [a.ingredient_name] : []));

  useEffect(() => {
    if (!token || !active_baby_id) {
      set_confirmed_allergies([]);
      return;
    }
    fetchConfirmedAllergies(token, active_baby_id).then(set_confirmed_allergies);
  }, [token, active_baby_id]);

  // 테스트 목록 초기 로드 + 1분 폴링 (스케줄러가 NULL→testing 전환 시 감지)
  useEffect(() => {
    if (!token || !active_baby_id) {
      set_ingredient_testings([]);
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }
    const load = () =>
      fetchIngredientTestings(token, active_baby_id).then(set_ingredient_testings);
    load();
    pollingRef.current = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60_000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [token, active_baby_id]);

  const refreshTestings = useCallback(() => {
    if (!token || !active_baby_id) return;
    sessionStorage.removeItem(allergyTestsCacheKey(active_baby_id));
    fetchIngredientTestings(token, active_baby_id).then(set_ingredient_testings);
  }, [token, active_baby_id]);

  const refreshConfirmedAllergies = useCallback(() => {
    if (!token || !active_baby_id) return;
    sessionStorage.removeItem(confirmedAllergiesCacheKey(active_baby_id));
    fetchConfirmedAllergies(token, active_baby_id).then(set_confirmed_allergies);
  }, [token, active_baby_id]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prev) => {
      const next = !prev;
      localStorage.setItem("darkMode", String(next));
      return next;
    });
  }, []);

  const saveParentInfo = useCallback((info: ParentInfo) => {
    setParentInfo(info);
    localStorage.setItem("parentInfo", JSON.stringify(info));
  }, []);

  // Restore session from stored token on app mount
  useEffect(() => {
    const stored = getStoredToken();
    if (!stored) return;

    getMeApi(stored)
      .then((me) => {
        const nextUser = {
          id: me.id,
          name: me.name,
          nickname: me.nickname,
          email: me.email,
          username: me.username,
          phone: me.phone,
          address: me.address,
          auth_provider: me.auth_provider,
          isAdmin: me.is_admin ?? false,
          notify_meal_time: me.notify_meal_time,
          notify_allergy_check: me.notify_allergy_check,
          notify_community: me.notify_community,
        };
        set_user(nextUser);
        localStorage.setItem(CACHED_USER_KEY, JSON.stringify(nextUser));
      })
      .catch((error) => {
        if (isAuthFailure(error)) {
          clearStoredToken();
          clearCachedAuthState();
          set_token(null);
          set_user(null);
          set_babies([]);
          set_active_baby_id(null);
        }
      })
      .finally(() => {
        set_auth_loading(false);
      });

    // getMeApi와 병렬 실행 — active_baby_id 설정 시 하단 useEffect가 알레르기/테스팅 데이터를 패치
    listBabiesApi(stored)
      .then((list) => {
        set_babies(list);
        localStorage.setItem(CACHED_BABIES_KEY, JSON.stringify(list));
        if (list.length > 0) {
          const storedBabyId = localStorage.getItem(ACTIVE_BABY_ID_KEY);
          const nextBabyId = list.some((baby) => baby.id === storedBabyId) ? storedBabyId! : list[0].id;
          set_active_baby_id(nextBabyId);
          localStorage.setItem(ACTIVE_BABY_ID_KEY, nextBabyId);
        }
      })
      .catch(() => {});
  }, []);

  const loginWithToken = useCallback(async (newToken: string) => {
    try {
      storeToken(newToken, true);
      set_token(newToken);
      const [userData, list] = await Promise.all([
        apiFetch<{
          id: string; username: string; email: string; name: string;
          nickname: string; phone: string | null; address: string | null;
          auth_provider: string; is_admin: boolean;
          notify_meal_time?: boolean; notify_allergy_check?: boolean; notify_community?: boolean;
        }>("/users/me", {}, newToken),
        listBabiesApi(newToken),
      ]);
      const nextUser = {
        id: userData.id,
        name: userData.name,
        nickname: userData.nickname,
        email: userData.email,
        username: userData.username,
        phone: userData.phone,
        address: userData.address,
        auth_provider: userData.auth_provider,
        isAdmin: userData.is_admin ?? false,
        notify_meal_time: userData.notify_meal_time,
        notify_allergy_check: userData.notify_allergy_check,
        notify_community: userData.notify_community,
      };
      set_user(nextUser);
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify(nextUser));
      set_babies(list);
      localStorage.setItem(CACHED_BABIES_KEY, JSON.stringify(list));
      if (list.length > 0) {
        set_active_baby_id(list[0].id);
        localStorage.setItem(ACTIVE_BABY_ID_KEY, list[0].id);
      }
      return { success: true, babyCount: list.length };
    } catch (error) {
      if (isAuthFailure(error)) {
        clearStoredToken();
        clearCachedAuthState();
        set_token(null);
        set_user(null);
        set_babies([]);
        set_active_baby_id(null);
      }
      return { success: false, babyCount: 0 };
    }
  }, []);

  const login = useCallback(
    async (username: string, password: string, keep: boolean) => {
      try {
        const data = await loginApi(username, password);
        const newToken = data.access_token;

        storeToken(newToken, keep);

        set_token(newToken);
        const nextUser = {
          id: data.user.id,
          name: data.user.name,
          nickname: data.user.nickname,
          email: data.user.email,
          username: data.user.username,
          phone: data.user.phone,
          address: data.user.address,
          auth_provider: data.user.auth_provider,
          isAdmin: data.user.is_admin ?? false,
          notify_meal_time: data.user.notify_meal_time,
          notify_allergy_check: data.user.notify_allergy_check,
          notify_community: data.user.notify_community,
        };
        set_user(nextUser);
        localStorage.setItem(CACHED_USER_KEY, JSON.stringify(nextUser));

        try {
          const list = await listBabiesApi(newToken);
          set_babies(list);
          localStorage.setItem(CACHED_BABIES_KEY, JSON.stringify(list));
          if (list.length > 0) {
            set_active_baby_id(list[0].id);
            localStorage.setItem(ACTIVE_BABY_ID_KEY, list[0].id);
          }
          return { success: true, babyCount: list.length, isAdmin: nextUser.isAdmin };
        } catch {
          return { success: true, babyCount: 0, isAdmin: nextUser.isAdmin };
        }
      } catch {
        return { success: false, babyCount: 0, isAdmin: false };
      }
    },
    [],
  );

  const registerAndLogin = useCallback(
    async (payload: {
      username: string;
      password: string;
      name: string;
      nickname: string;
      email: string;
      phone?: string;
      address?: string;
      oauth_signup_token?: string;
      baby_profile?: Omit<BabyProfile, "id">;
    }, babyFile?: File | null) => {
      try {
        const { baby_profile, ...signupPayload } = payload;

        // 1) 부모 계정 생성 (baby_profile 제외)
        const data = await signupApi(signupPayload);
        const newToken = data.access_token;
        storeToken(newToken, true);
        set_token(newToken);
        const nextUser = {
          id: data.user.id,
          name: data.user.name,
          nickname: data.user.nickname,
          email: data.user.email,
          username: data.user.username,
          phone: data.user.phone,
          address: data.user.address,
          auth_provider: data.user.auth_provider,
          isAdmin: data.user.is_admin ?? false,
        };
        set_user(nextUser);
        localStorage.setItem(CACHED_USER_KEY, JSON.stringify(nextUser));

        // 2) 아기 프로필이 있으면 별도 API로 생성
        if (baby_profile && baby_profile.name.trim()) {
          try {
            let newBaby = await createBabyApi(newToken, baby_profile);
            if (babyFile) {
              try {
                newBaby = await uploadBabyPhotoApi(newToken, newBaby.id, babyFile);
              } catch {
                // 사진 업로드 실패는 가입 자체를 막지 않는다 — 프로필에서 다시 등록 가능
              }
            }
            // 알레르기 확정 목록 저장
            const today = new Date().toISOString().split("T")[0];
            const safeStartDate = new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString();
            await Promise.allSettled([
              ...(baby_profile.allergens ?? []).map((a) =>
                createConfirmedAllergy({ baby_id: newBaby.id, ingredient_id: a.id, confirmed_date: today }, newToken),
              ),
              ...(baby_profile.safeIngredients ?? []).map((s) =>
                createTesting({ baby_id: newBaby.id, ingredient_id: s.id, test_start_date: safeStartDate, test_status: "completed_safe" }, newToken),
              ),
            ]);
            set_babies([newBaby]);
            set_active_baby_id(newBaby.id);
            localStorage.setItem(CACHED_BABIES_KEY, JSON.stringify([newBaby]));
            localStorage.setItem(ACTIVE_BABY_ID_KEY, newBaby.id);
            return { success: true, babyCount: 1 };
          } catch (babyError) {
            // 아기 등록 실패 → 방금 생성한 부모 계정 삭제(롤백)
            try {
              await apiFetch("/users/me", { method: "DELETE" }, newToken);
            } catch {
              // 삭제 실패해도 아래 로그아웃 처리
            }
            clearStoredToken();
            clearCachedAuthState();
            set_token(null);
            set_user(null);
            const msg = babyError instanceof Error ? babyError.message : "아기 정보 등록에 실패했습니다.";
            return { success: false, babyCount: 0, error: msg };
          }
        }
        return { success: true, babyCount: 0 };
      } catch (error) {
        if (error instanceof ApiError) {
          return {
            success: false,
            babyCount: 0,
            error: error.message,
            errorCode: error.code ?? "",
          };
        }
        return {
          success: false,
          babyCount: 0,
          error: "회원가입에 실패했습니다. 다시 시도해주세요.",
        };
      }
    },
    [],
  );

  const logout = useCallback(() => {
    clearStoredToken();
    clearCachedAuthState();
    set_token(null);
    set_user(null);
    set_babies([]);
    set_active_baby_id(null);
    set_confirmed_allergies([]);
  }, []);

  const addBaby = useCallback(
    async (baby: Omit<BabyProfile, "id">, file?: File | null): Promise<string> => {
      if (!token) throw new Error("로그인이 필요합니다.");
      let created = await createBabyApi(token, baby);
      if (file) {
        try {
          created = await uploadBabyPhotoApi(token, created.id, file);
        } catch {
          // 사진 업로드 실패가 등록 자체를 막지 않는다 — 아기는 이미 생성되었으므로
          // 실패로 처리하면 재시도 시 중복 등록됨. 사진은 프로필 수정에서 재등록 가능.
        }
      }
      // 알레르기 확정 목록 + 안전 재료 저장
      const today = new Date().toISOString().split("T")[0];
      const safeStartDate = new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString();
      await Promise.allSettled([
        ...(baby.allergens ?? []).map((a) =>
          createConfirmedAllergy({ baby_id: created.id, ingredient_id: a.id, confirmed_date: today }, token),
        ),
        ...(baby.safeIngredients ?? []).map((s) =>
          createTesting({ baby_id: created.id, ingredient_id: s.id, test_start_date: safeStartDate, test_status: "completed_safe" }, token),
        ),
      ]);
      set_babies((prev) => {
        const next = [...prev, created];
        localStorage.setItem(CACHED_BABIES_KEY, JSON.stringify(next));
        return next;
      });
      return created.id;
    },
    [token],
  );

  const updateActiveBaby = useCallback(
    async (baby: BabyProfile, file?: File | null): Promise<void> => {
      if (token) {
        let updated = await updateBabyApi(token, baby.id, baby);
        if (file) {
          // 새로 선택한 사진 업로드 (기존 blob은 서버가 교체 시 삭제)
          updated = await uploadBabyPhotoApi(token, baby.id, file);
        } else if (baby.photo === null && updated.photo !== null) {
          // 사용자가 사진을 제거한 경우 서버에서도 삭제
          await deleteBabyPhotoApi(token, baby.id);
          updated = { ...updated, photo: null };
        }
        set_babies((prev) => {
          const next = prev.map((b) => (b.id === baby.id ? updated : b));
          localStorage.setItem(CACHED_BABIES_KEY, JSON.stringify(next));
          return next;
        });
      } else {
        set_babies((prev) => {
          const next = prev.map((b) => (b.id === baby.id ? baby : b));
          localStorage.setItem(CACHED_BABIES_KEY, JSON.stringify(next));
          return next;
        });
      }
    },
    [token],
  );

  const selectBaby = useCallback((id: string) => {
    set_active_baby_id(id);
    localStorage.setItem(ACTIVE_BABY_ID_KEY, id);
  }, []);

  const removeBaby = useCallback(
    async (id: string): Promise<void> => {
      if (token) await deleteBabyApi(token, id);
      set_babies((prev) => {
        const next = prev.filter((b) => b.id !== id);
        localStorage.setItem(CACHED_BABIES_KEY, JSON.stringify(next));
        return next;
      });
      if (active_baby_id === id) {
        set_active_baby_id(null);
        localStorage.removeItem(ACTIVE_BABY_ID_KEY);
      }
    },
    [token, active_baby_id],
  );

  const deleteBaby = useCallback(
    (id: string): void => {
      set_babies((prev) => {
        const next = prev.filter((b) => b.id !== id);
        localStorage.setItem(CACHED_BABIES_KEY, JSON.stringify(next));
        return next;
      });
      if (active_baby_id === id) {
        set_active_baby_id(null);
        localStorage.removeItem(ACTIVE_BABY_ID_KEY);
      }
      if (token) deleteBabyApi(token, id).catch(() => {});
    },
    [token, active_baby_id],
  );

  return (
    <AppContext.Provider
      value={{
        user,
        set_user,
        authLoading,
        babies,
        activeBaby,
        confirmedAllergyNames,
        confirmedAllergies,
        ingredientTestings,
        refreshTestings,
        refreshConfirmedAllergies,
        token,
        darkMode,
        toggleDarkMode,
        parentInfo,
        saveParentInfo,
        login,
        loginWithToken,
        registerAndLogin,
        logout,
        addBaby,
        updateActiveBaby,
        selectBaby,
        removeBaby,
        deleteBaby,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("AppProvider 외부에서 사용 불가");
  return ctx;
}
