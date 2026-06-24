import { apiFetch } from "./client";

export interface AuthResponse {
  access_token: string;
  user: {
    id: string;
    username: string;
    email: string;
    name: string;
    nickname: string;
    phone: string | null;
    address: string | null;
    auth_provider: string;
    is_admin: boolean;
    notify_meal_time?: boolean;
    notify_allergy_check?: boolean;
    notify_community?: boolean;
  };
}

export type ParentUserResponse = AuthResponse["user"];

export interface LoginDevice {
  id: string;
  device_type: "pc" | "tablet" | "phone" | "unknown";
  device_name: string;
  last_login_at: string;
  is_current: boolean;
}

export async function loginApi(
  username: string,
  password: string,
): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function signupApi(payload: {
  username: string;
  password: string;
  name: string;
  nickname: string;
  email: string;
  phone?: string;
  address?: string;
  oauth_signup_token?: string;
}): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ ...payload, email: payload.email.trim().toLowerCase() }),
  });
}

export async function getMeApi(token: string): Promise<ParentUserResponse> {
  return apiFetch<ParentUserResponse>("/users/me", {}, token);
}

export async function findUsernameApi(identifier: string): Promise<string> {
  const res = await apiFetch<{ success: boolean; data: { masked_username: string } }>(
    "/auth/find-username",
    {
      method: "POST",
      body: JSON.stringify({ identifier }),
    },
  );
  return res.data.masked_username;
}

export async function resetPasswordApi(payload: {
  username: string;
  email: string;
  new_password: string;
}): Promise<string> {
  const res = await apiFetch<{ success: boolean; data: { message: string } }>(
    "/auth/reset-password",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  return res.data.message;
}

export async function updateMeApi(
  token: string,
  payload: {
    name?: string;
    nickname?: string;
    phone?: string | null;
    email?: string;
    address?: string | null;
    notify_meal_time?: boolean;
    notify_allergy_check?: boolean;
    notify_community?: boolean;
  },
): Promise<ParentUserResponse> {
  return apiFetch<ParentUserResponse>(
    "/users/me",
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token,
  );
}

export async function changePasswordApi(
  token: string,
  payload: {
    current_password: string;
    new_password: string;
  },
): Promise<string> {
  const res = await apiFetch<{ success: boolean; data: { message: string } }>(
    "/users/me/password",
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token,
  );
  return res.data.message;
}

export async function deleteAccountApi(token: string): Promise<void> {
  await apiFetch<unknown>(
    "/users/me",
    {
      method: "DELETE",
    },
    token,
  );
}

export async function listLoginDevicesApi(token: string): Promise<LoginDevice[]> {
  const res = await apiFetch<{ success: boolean; data: { devices: LoginDevice[] } }>(
    "/users/me/devices",
    {},
    token,
  );
  return res.data.devices;
}

export async function checkUsernameApi(username: string): Promise<boolean> {
  const res = await apiFetch<{ available: boolean }>(
    `/auth/check-username?username=${encodeURIComponent(username)}`,
  );
  return res.available;
}

export async function checkNicknameApi(nickname: string): Promise<boolean> {
  const res = await apiFetch<{ available: boolean }>(
    `/auth/check-nickname?nickname=${encodeURIComponent(nickname)}`,
  );
  return res.available;
}

export async function checkEmailApi(email: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  const res = await apiFetch<{ available: boolean }>(
    `/auth/check-email?email=${encodeURIComponent(normalizedEmail)}`,
  );
  return res.available;
}
