import { apiFetch } from "./client";

export type SocialProvider = "google" | "kakao" | "naver";

export interface SocialAccount {
  provider: SocialProvider;
  provider_email: string | null;
  created_at: string;
}

export interface ConnectedSocialAccountsResponse {
  connected: SocialAccount[];
  available: SocialProvider[];
}

export interface SocialDisconnectResponse {
  provider: SocialProvider;
  disconnected: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export async function listSocialAccounts(
  token: string,
): Promise<ConnectedSocialAccountsResponse> {
  return apiFetch<ConnectedSocialAccountsResponse>("/users/me/social-accounts", {}, token);
}

export async function startSocialConnect(
  token: string,
  provider: SocialProvider,
): Promise<string> {
  const res = await apiFetch<ApiResponse<{ authorize_url: string }>>(
    `/users/me/social-connect/${provider}`,
    {},
    token,
  );
  return res.data.authorize_url;
}

export async function disconnectSocialAccount(
  token: string,
  provider: SocialProvider,
): Promise<SocialDisconnectResponse> {
  const res = await apiFetch<ApiResponse<SocialDisconnectResponse>>(
    `/users/me/social-accounts/${provider}`,
    { method: "DELETE" },
    token,
  );
  return res.data;
}
