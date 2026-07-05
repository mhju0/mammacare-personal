import { useEffect, useState } from "react";
import type { ImgHTMLAttributes } from "react";
import { getApiBase } from "../api/base";

const API_ORIGIN = getApiBase();

/**
 * src를 해석한다.
 * - data:/blob:/http(s) → 그대로 사용 (외부·미리보기·정적)
 * - /api/media/... → 서빙 URL (인증 fetch)
 * - /로 시작하는 그 외 경로 → 정적 자산 (그대로 사용)
 * - 그 외 상대경로(babies/..., symptom-photos/... 등 raw blob_path) → 보호 미디어 (인증 fetch)
 */
function resolveMedia(src: string): { url: string; auth: boolean } {
  if (/^(data:|blob:|https?:\/\/)/.test(src)) return { url: src, auth: false };
  if (src.startsWith("/api/media/")) return { url: `${API_ORIGIN}${src}`, auth: true };
  if (src.startsWith("/")) return { url: src, auth: false };
  return { url: `${API_ORIGIN}/api/media/${src}`, auth: true };
}

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string | null;
};

/**
 * 로그인 사용자만 접근 가능한 /api/media/* 보호 이미지를 Authorization 헤더와 함께
 * fetch하여 object URL로 렌더링한다. <img>는 헤더를 못 보내므로 필요한 래퍼.
 * 외부·미리보기·정적 src는 인증 없이 그대로 렌더링한다.
 */
export function AuthImage({ src, alt = "", ...rest }: Props) {
  const initial = src ? resolveMedia(src) : null;
  const [resolved, setResolved] = useState<string | undefined>(
    initial && !initial.auth ? initial.url : undefined,
  );

  useEffect(() => {
    if (!src) {
      setResolved(undefined);
      return;
    }
    const { url, auth } = resolveMedia(src);
    if (!auth) {
      setResolved(url);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    const token = localStorage.getItem("access_token");
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((res) => (res.ok ? res.blob() : Promise.reject(res.status)))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setResolved(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setResolved(undefined);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  return <img src={resolved} alt={alt} {...rest} />;
}
