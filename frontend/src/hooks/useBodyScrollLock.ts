import { useEffect } from "react";

let lockCount = 0;
let savedScrollTop = 0;

export function useBodyScrollLock(locked: boolean = true) {
  useEffect(() => {
    if (!locked) return;

    const html = document.documentElement;

    if (lockCount === 0) {
      savedScrollTop = html.scrollTop;          // 현재 스크롤 위치 저장
      html.style.overflow = "hidden";
      html.style.scrollBehavior = "auto";       // 복원 시 부드러운 스크롤 방지
    }
    lockCount += 1;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        html.style.overflow = "";
        html.scrollTop = savedScrollTop;         // 닫을 때 원위치 복원
        html.style.scrollBehavior = "";
      }
    };
  }, [locked]);
}