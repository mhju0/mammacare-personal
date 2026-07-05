import { Capacitor } from "@capacitor/core";

/**
 * API 서버 origin(스킴+호스트, trailing slash 제거)을 반환한다. `/api` 접미는 붙지 않는다.
 *
 * - 웹: `(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")` — 기존 각 호출부 계산과 byte-identical.
 * - 네이티브(Capacitor 웹뷰): vite proxy가 없어 상대경로 `/api` fetch가 실패하므로 백엔드 절대주소를 사용.
 *
 * 각 호출부는 필요하면 이 값 뒤에 자신의 접미(`/api`, `/api/media/...` 등)를 그대로 붙인다.
 */
export function getApiBase(): string {
  if (Capacitor.isNativePlatform()) return "http://localhost:8000";
  return (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
}
