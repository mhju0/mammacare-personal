import type { SymptomCheckResponse } from "../../api/allergy";

// ── Kakao Maps 타입 ───────────────────────────────────────────────────────────

declare global {
  interface Window {
    kakao: {
      maps: {
        load: (callback: () => void) => void;
        LatLng: new (lat: number, lng: number) => object;
        services: {
          Places: new () => {
            keywordSearch: (
              keyword: string,
              callback: (data: KakaoPlace[], status: string) => void,
              options?: object,
            ) => void;
          };
          Geocoder: new () => {
            coord2RegionCode: (
              lng: number,
              lat: number,
              callback: (data: { region_type: string; region_1depth_name: string; region_2depth_name: string }[], status: string) => void,
            ) => void;
          };
          Status: { OK: string; ZERO_RESULT: string; ERROR: string };
          SortBy: { DISTANCE: string; ACCURACY: string };
        };
      };
    };
  }
}

export interface KakaoPlace {
  id: string;
  place_name: string;
  address_name: string;
  road_address_name: string;
  phone: string;
  distance: string;
  place_url: string;
  x: string;
  y: string;
}

// ── 상수 ─────────────────────────────────────────────────────────────────────

export const TIME_MILESTONES = [
  { label: "30m", hours: 0.5, position: 0,   appPosition: 0    },
  { label: "1h",  hours: 1,   position: 8,   appPosition: 12.5 },
  { label: "2h",  hours: 2,   position: 15,  appPosition: 25   },
  { label: "4h",  hours: 4,   position: 24,  appPosition: 37.5 },
  { label: "6h",  hours: 6,   position: 34,  appPosition: 50   },
  { label: "12h", hours: 12,  position: 48,  appPosition: 62.5 },
  { label: "24h", hours: 24,  position: 63,  appPosition: 75   },
  { label: "48h", hours: 48,  position: 80,  appPosition: 87.5 },
  { label: "72h", hours: 72,  position: 100, appPosition: 100  },
];

export const SYMPTOM_PRESETS = [
  { type: "피부 발진" },
  { type: "두드러기" },
  { type: "구토" },
  { type: "설사" },
  { type: "복통" },
  { type: "눈 부종" },
  { type: "입술 부종" },
  { type: "호흡 곤란" },
  { type: "콧물·재채기" },
  { type: "기침" },
];

export const SEVERITY_OPTIONS = [
  { value: "mild", label: "가벼움" },
  { value: "moderate", label: "보통" },
  { value: "severe", label: "심함" },
];

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

export function getElapsedHours(startDate: string): number {
  return (Date.now() - new Date(startDate).getTime()) / (1000 * 60 * 60);
}

export function getProgressPercentage(elapsedHours: number): number {
  const n = TIME_MILESTONES.length;
  if (elapsedHours <= 0) return 0;
  if (elapsedHours >= TIME_MILESTONES[n - 1].hours) return 100;

  // 첫 마일스톤 이전 구간 (position이 0이므로 항상 0 반환)
  if (elapsedHours < TIME_MILESTONES[0].hours) return 0;

  // 두 마일스톤 사이를 선형 보간하여 도트의 커스텀 position과 일치시킴
  for (let i = 0; i < n - 1; i++) {
    const curr = TIME_MILESTONES[i].hours;
    const next = TIME_MILESTONES[i + 1].hours;
    if (elapsedHours >= curr && elapsedHours < next) {
      const fraction = (elapsedHours - curr) / (next - curr);
      return TIME_MILESTONES[i].position + fraction * (TIME_MILESTONES[i + 1].position - TIME_MILESTONES[i].position);
    }
  }

  return 100;
}

export function getCurrentMilestone(elapsedHours: number): number {
  for (let i = TIME_MILESTONES.length - 1; i >= 0; i--) {
    if (elapsedHours >= TIME_MILESTONES[i].hours) return i;
  }
  return -1;
}

export function formatDistance(meters: string): string {
  const m = parseInt(meters, 10);
  if (isNaN(m)) return "";
  return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`;
}

// DB가 TIMESTAMP WITHOUT TIME ZONE(UTC)로 저장하지만 'Z' 없이 반환할 수 있으므로
// timezone 정보가 없으면 UTC로 강제 해석
export function parseCheckedAt(str: string): Date {
  if (/Z$|[+-]\d{2}:\d{2}$/.test(str)) return new Date(str);
  return new Date(str + "Z");
}

// Voronoi 방식: 각 check를 가장 가까운 milestone에 배정
// → 딱 맞는 시간이 아니어도 가장 인접한 체크포인트에서 기록 확인 가능
export function buildMilestoneMap(
  checks: SymptomCheckResponse[],
  startDate: string,
): Map<number, SymptomCheckResponse[]> {
  const startMs = new Date(startDate).getTime();
  const result = new Map<number, SymptomCheckResponse[]>();
  TIME_MILESTONES.forEach((_, i) => result.set(i, []));

  for (const check of checks) {
    const checkHours = (parseCheckedAt(check.checked_at).getTime() - startMs) / 3600000;
    let nearestIdx = 0;
    let minDiff = Infinity;
    TIME_MILESTONES.forEach((m, i) => {
      const diff = Math.abs(checkHours - m.hours);
      if (diff < minDiff) { minDiff = diff; nearestIdx = i; }
    });
    result.get(nearestIdx)!.push(check);
  }

  return result;
}
