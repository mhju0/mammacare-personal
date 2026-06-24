/**
 * 커뮤니티 API 클라이언트
 *
 * 백엔드 /api/community/* 엔드포인트에 대응하는 함수 모음.
 * apiFetch를 통해 Authorization 헤더와 에러 처리가 자동으로 적용됩니다.
 */

import { apiFetch } from "./client";

const API_BASE = `${(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")}/api`;

// ─── 타입 정의 ────────────────────────────────────────────────────────────────

export interface CommunityCategory {
  id: string;
  name: string;
  sort_order: number;
  is_admin_only: boolean;
  is_active: boolean;
}

export interface CommunityPost {
  id: string;
  category_id: string;
  category_name: string;
  title: string;
  content: string;
  nickname: string;
  is_anonymous: boolean;
  is_notice: boolean;
  like_count: number;
  comment_count: number;
  is_mine: boolean;
  is_liked: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string | null;
  images?: CommunityPostImage[];
}

export interface CommunityPostImage {
  id: string;
  post_id: string;
  image_url: string;
  sas_url: string | null;
  created_at: string;
}

export interface CommunityComment {
  id: string;
  post_id: string;
  content: string;
  nickname: string;
  is_mine: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string | null;
}

// ─── 카테고리 ─────────────────────────────────────────────────────────────────

export const listCategoriesApi = (token?: string | null) =>
  apiFetch<CommunityCategory[]>("/community/categories", {}, token);

// ─── 게시글 ───────────────────────────────────────────────────────────────────

export const listPostsApi = (
  params: {
    category_id?: string;
    sort_by?: "recent" | "likes";
    skip?: number;
    limit?: number;
  },
  token?: string | null,
) => {
  const qs = new URLSearchParams();
  if (params.category_id) qs.set("category_id", params.category_id);
  if (params.sort_by) qs.set("sort_by", params.sort_by);
  if (params.skip !== undefined) qs.set("skip", String(params.skip));
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  const query = qs.toString();
  return apiFetch<CommunityPost[]>(`/community/posts${query ? `?${query}` : ""}`, {}, token);
};

export const getPostApi = (postId: string, token?: string | null) =>
  apiFetch<CommunityPost>(`/community/posts/${postId}`, {}, token);

export const createPostApi = (
  data: { category_id: string; title: string; content: string; is_anonymous?: boolean; is_notice?: boolean },
  token: string,
) =>
  apiFetch<CommunityPost>("/community/posts", {
    method: "POST",
    body: JSON.stringify(data),
  }, token);

export async function uploadPostImageApi(
  postId: string,
  file: File,
  token: string,
): Promise<CommunityPostImage> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/community/posts/${postId}/images`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      body?.error?.message ??
      body?.message ??
      body?.detail ??
      "이미지 업로드에 실패했습니다.";
    throw new Error(Array.isArray(message) ? "이미지 업로드에 실패했습니다." : message);
  }

  return res.json();
}

export const updatePostApi = (
  postId: string,
  data: { title?: string; content?: string; category_id?: string; is_anonymous?: boolean },
  token: string,
) =>
  apiFetch<CommunityPost>(`/community/posts/${postId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  }, token);

export const deletePostApi = (postId: string, token: string) =>
  apiFetch<void>(`/community/posts/${postId}`, { method: "DELETE" }, token);

export const deletePostImageApi = (postId: string, imageId: string, token: string) =>
  apiFetch<void>(`/community/posts/${postId}/images/${imageId}`, { method: "DELETE" }, token);

// ─── 좋아요 ───────────────────────────────────────────────────────────────────

export const toggleLikeApi = (postId: string, token: string) =>
  apiFetch<{ liked: boolean; like_count: number }>(
    `/community/posts/${postId}/like`,
    { method: "POST" },
    token,
  );

// ─── 댓글 ─────────────────────────────────────────────────────────────────────

export const listCommentsApi = (postId: string, token?: string | null) =>
  apiFetch<CommunityComment[]>(`/community/posts/${postId}/comments`, {}, token);

export const createCommentApi = (postId: string, content: string, token: string) =>
  apiFetch<CommunityComment>(`/community/posts/${postId}/comments`, {
    method: "POST",
    body: JSON.stringify({ content }),
  }, token);

export const deleteCommentApi = (postId: string, commentId: string, token: string) =>
  apiFetch<void>(`/community/posts/${postId}/comments/${commentId}`, { method: "DELETE" }, token);

// ─── 신고 ─────────────────────────────────────────────────────────────────────

export const reportPostApi = (postId: string, reason: string, token: string) =>
  apiFetch<{ message: string }>(`/community/posts/${postId}/report`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  }, token);

export const reportCommentApi = (
  postId: string,
  commentId: string,
  reason: string,
  token: string,
) =>
  apiFetch<{ message: string }>(`/community/posts/${postId}/comments/${commentId}/report`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  }, token);
