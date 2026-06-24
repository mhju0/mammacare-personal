import { Capacitor } from "@capacitor/core";

const BASE = `${(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")}/api`;

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

function parseError(body: unknown): { message: string; code?: string } {
  if (!body || typeof body !== "object") {
    return { message: "오류가 발생했습니다." };
  }
  const data = body as {
    message?: unknown;
    detail?: unknown;
    data?: unknown;
    error?: { code?: unknown; message?: unknown };
  };
  if (data.error && typeof data.error.message === "string") {
    return {
      message: data.error.message,
      code: typeof data.error.code === "string" ? data.error.code : undefined,
    };
  }
  if (data.message && typeof data.message === "object") {
    const message = data.message as { code?: unknown; message?: unknown };
    if (typeof message.message === "string") {
      return {
        message: message.message,
        code: typeof message.code === "string" ? message.code : undefined,
      };
    }
  }
  if (data.detail && typeof data.detail === "object") {
    if (Array.isArray(data.detail)) {
      const first = data.detail[0] as { msg?: unknown } | undefined;
      if (typeof first?.msg === "string") {
        return {
          message: first.msg.replace(/^Value error,\s*/, ""),
          code: "VALIDATION_ERROR",
        };
      }
    }
    const detail = data.detail as { code?: unknown; message?: unknown };
    if (typeof detail.message === "string") {
      return {
        message: detail.message,
        code: typeof detail.code === "string" ? detail.code : undefined,
      };
    }
  }
  if (Array.isArray(data.data)) {
    const first = data.data[0] as { message?: unknown } | undefined;
    if (typeof first?.message === "string") {
      return { message: first.message, code: "VALIDATION_ERROR" };
    }
  }
  if (typeof data.message === "string") return { message: data.message };
  if (typeof data.detail === "string") return { message: data.detail };
  return { message: "오류가 발생했습니다." };
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = parseError(body);
    if (
      res.status === 401 &&
      path !== "/auth/login" &&
      path !== "/auth/signup"
    ) {
      ["access_token", "mammacare_cached_user", "mammacare_cached_babies", "mammacare_active_baby_id"]
        .forEach(k => { localStorage.removeItem(k); sessionStorage.removeItem(k); });
      Object.keys(sessionStorage)
        .filter(k => k.startsWith("mammacare:"))
        .forEach(k => sessionStorage.removeItem(k));
      window.location.href = Capacitor.isNativePlatform() ? "/#/login" : "/login";
    }
    throw new ApiError(res.status, error.message, error.code);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
