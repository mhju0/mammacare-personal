/**
 * 커뮤니티 API 클라이언트
 *
 * 백엔드 /api/community/* 엔드포인트에 대응하는 함수 모음.
 * apiFetch를 통해 Authorization 헤더와 에러 처리가 자동으로 적용됩니다.
 * (현재 소비처: 관리자 공지 화면 AdminCommunity. 게시글 상세·좋아요·댓글·신고
 *  클라이언트는 사용자 커뮤니티 화면 제거와 함께 삭제됨.)
 */

import { apiFetch } from "./client";

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

export const createPostApi = (
  data: { category_id: string; title: string; content: string; is_anonymous?: boolean; is_notice?: boolean },
  token: string,
) =>
  apiFetch<CommunityPost>("/community/posts", {
    method: "POST",
    body: JSON.stringify(data),
  }, token);

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
