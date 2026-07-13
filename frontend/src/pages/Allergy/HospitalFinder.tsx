import { useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { ApiError, apiFetch } from "../../api/client";
import { useApp } from "../../context/AppContext";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { MapPin, Navigation, Phone, X, Plus } from "lucide-react";
import type { KakaoPlace } from "./types";
import { formatDistance } from "./types";

const HOSPITAL_CATEGORIES = [
  { key: "소아과" },
  { key: "소화기내과" },
  { key: "피부과의원" },
  { key: "병원 응급실" },
] as const;

const FEATURED_KEYS = ["소아과", "피부과의원", "병원 응급실"] as const;

// 모든 실패 경로에서 로딩이 영구 지속되지 않도록 한국어 에러 문구를 표준화한다.
const ERR_GENERIC = "주변 병원 정보를 불러오지 못했어요";
const ERR_LOCATION_DENIED = "위치 권한을 허용하면 주변 병원을 안내해 드려요";

// 응답이 없는 Promise가 로딩을 영구 고착시키지 않도록 타임아웃으로 감싼다.
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function getCoords(): Promise<{ latitude: number; longitude: number }> {
  if (Capacitor.isNativePlatform()) {
    let perm = await Geolocation.checkPermissions();
    if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
      // Info.plist 사용목적 키 누락 등으로 권한 콜백이 영구 대기하는 경우를 15s로 끊는다.
      perm = await withTimeout(Geolocation.requestPermissions(), 15000, "위치 권한 요청이 응답하지 않습니다.");
    }
    if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
      throw Object.assign(new Error("위치 권한이 거부되었습니다."), { code: 1 });
    }
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: perm.location === "granted",
      timeout: 15000,
      maximumAge: 30000,
    });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  }

  if (!navigator.geolocation) {
    throw new Error("이 브라우저는 위치 서비스를 지원하지 않습니다.");
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => reject(err),
      { timeout: 10000, maximumAge: 60000 },
    );
  });
}

export function HospitalFinder() {
  const { token } = useApp();
  const [featuredHospitals, setFeaturedHospitals] = useState<{ label: string; place: KakaoPlace }[]>([]);
  const [allHospitals, setAllHospitals] = useState<{ category: string; place: KakaoPlace }[]>([]);
  const [hospitalLoading, setHospitalLoading] = useState(false);
  const [hospitalError, setHospitalError] = useState("");
  const [hospitalSearched, setHospitalSearched] = useState(false);
  const [showHospitalMore, setShowHospitalMore] = useState(false);
  const [userAddress, setUserAddress] = useState("");
  const isApp = Capacitor.isNativePlatform();

  useBodyScrollLock(showHospitalMore);

  const handleFindHospitals = async () => {
    setHospitalLoading(true);
    setHospitalError("");
    setFeaturedHospitals([]);
    setAllHospitals([]);
    setHospitalSearched(false);

    if (!isApp && !window.kakao?.maps?.load) {
      setHospitalError(ERR_GENERIC);
      setHospitalLoading(false);
      return;
    }

    let latitude: number;
    let longitude: number;
    try {
      ({ latitude, longitude } = await getCoords());
    } catch (err: unknown) {
      setHospitalLoading(false);
      const code = (err as { code?: number }).code;
      setHospitalError(code === 1 ? ERR_LOCATION_DENIED : ERR_GENERIC);
      return;
    }

    if (isApp) {
      try {
        const result = await apiFetch<{
          address: string;
          hospitals: { category: string; place: KakaoPlace }[];
        }>(
          `/hospitals/nearby?latitude=${latitude}&longitude=${longitude}`,
          {},
          token,
        );
        const featured = FEATURED_KEYS.flatMap((category) => {
          const match = result.hospitals.find((item) => item.category === category);
          return match ? [{ label: category, place: match.place }] : [];
        });
        const seen = new Set<string>();
        const uniqueHospitals = result.hospitals.filter(({ place }) => {
          if (seen.has(place.id)) return false;
          seen.add(place.id);
          return true;
        });
        setUserAddress(result.address);
        setFeaturedHospitals(featured);
        setAllHospitals(uniqueHospitals);
        setHospitalSearched(true);
        setHospitalLoading(false);
        return;
      } catch (err) {
        const canFallbackToSdk = err instanceof ApiError && [404, 502, 503].includes(err.status);
        if (!canFallbackToSdk) {
          setHospitalError(ERR_GENERIC);
          setHospitalLoading(false);
          return;
        }
      }
    }

    if (!window.kakao?.maps?.load) {
      setHospitalLoading(false);
      setHospitalError(ERR_GENERIC);
      return;
    }

    // 웹·네이티브 공통: kakao.maps.load / keywordSearch 콜백이 미도달해도 12s 후 로딩을 끊는다.
    const searchTimeout = window.setTimeout(() => {
      setHospitalLoading(false);
      setHospitalError(ERR_GENERIC);
    }, 12000);

    window.kakao.maps.load(() => {
      try {
        const loc = new window.kakao.maps.LatLng(latitude, longitude);
        const ps = new window.kakao.maps.services.Places();

        const geocoder = new window.kakao.maps.services.Geocoder();
        geocoder.coord2RegionCode(longitude, latitude, (data, status) => {
          if (status === window.kakao.maps.services.Status.OK && data.length > 0) {
            const region = data.find((d) => d.region_type === "H") ?? data[0];
            const city = region.region_1depth_name
              .replace("특별시", "시")
              .replace("광역시", "시")
              .replace("특별자치시", "시")
              .replace("특별자치도", "도");
            setUserAddress(`${city} ${region.region_2depth_name}`);
          }
        });

        const resultsMap: Record<string, KakaoPlace[]> = {};
        let completed = 0;

        HOSPITAL_CATEGORIES.forEach(({ key }) => {
          ps.keywordSearch(
            key,
            (data: KakaoPlace[], status: string) => {
              resultsMap[key] = status === window.kakao.maps.services.Status.OK ? data : [];
              completed++;

              if (completed === HOSPITAL_CATEGORIES.length) {
                window.clearTimeout(searchTimeout);
                const featured: { label: string; place: KakaoPlace }[] = [];
                FEATURED_KEYS.forEach((cat) => {
                  const place = resultsMap[cat]?.[0];
                  if (place) featured.push({ label: cat, place });
                });

                const seen = new Set<string>();
                const all: { category: string; place: KakaoPlace }[] = [];
                HOSPITAL_CATEGORIES.forEach(({ key: cat }) => {
                  (resultsMap[cat] ?? []).forEach((p) => {
                    if (!seen.has(p.id)) {
                      seen.add(p.id);
                      all.push({ category: cat, place: p });
                    }
                  });
                });
                all.sort((a, b) => parseInt(a.place.distance) - parseInt(b.place.distance));

                setFeaturedHospitals(featured);
                setAllHospitals(all);
                setHospitalLoading(false);
                setHospitalSearched(true);
                setHospitalError(""); // 12s 타임아웃이 먼저 뜬 뒤 늦게 성공한 경우 에러+결과 동시 노출 방지

              }
            },
            { location: loc, radius: 2000, sort: window.kakao.maps.services.SortBy.DISTANCE },
          );
        });
      } catch {
        window.clearTimeout(searchTimeout);
        setHospitalLoading(false);
        setHospitalError(ERR_GENERIC);
      }
    });
  };

  useEffect(() => {
    handleFindHospitals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="bg-warm-surface shadow-warm rounded-3xl py-3 px-5 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className={`font-bold ${isApp ? "text-base" : "text-lg sm:text-lg"} flex items-center gap-1.5`}>
              <MapPin size={18} />
              내 위치 기반 병원 안내
            </h2>
            {isApp && userAddress && (
              <div className="mt-1 text-xs text-primary-foreground font-semibold">
                {userAddress} 기준
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {userAddress && !isApp && (
              <span className={` ${isApp ? "text-xs" : "text-base"} text-primary-foreground font-semibold`}>
                {userAddress} 기준
              </span>
            )}
            {hospitalSearched && allHospitals.length > 0 && (
              <button
                onClick={() => setShowHospitalMore(true)}
                className={` ${isApp ? "text-sm" : "text-base"} flex items-center gap-1 px-3 py-1 rounded-3xl text-warm-brand
                bg-warm-surface-soft hover:opacity-70 font-semibold transition-colors`}>
              
                <Plus size={18} /> 더보기
              </button>
            )}
            {(!hospitalSearched && !hospitalLoading && !hospitalError) && (
              <button
                onClick={handleFindHospitals}
                className={`flex items-center gap-1.5 px-4 py-2
                bg-warm-brand hover:bg-warm-brand-hover
                text-warm-brand-fg shadow-sm ${isApp ? "text-sm" : "text-base"} font-bold rounded-full`}
              >
                주변 병원 찾기
              </button>
            )}
            {hospitalError && !hospitalLoading && (
              <button
                onClick={handleFindHospitals}
                className={`flex items-center gap-1.5 px-4 py-2
                bg-warm-brand hover:bg-warm-brand-hover
                text-warm-brand-fg shadow-sm ${isApp ? "text-sm" : "text-base"} font-bold rounded-full`}
              >
                다시 시도
              </button>
            )}
          </div>
        </div>

        {!hospitalSearched && !hospitalLoading && !hospitalError && (
          <p className={`text-center ${isApp ? "text-xs" : "text-base"} text-muted-foreground mt-3`}>
            {isApp ? (
              <>내 위치를 기반으로 <br/>가까운 소아과·알레르기 전문 병원을 찾아 안내해 드립니다</>
            ) : (
              <>내 위치를 기반으로 가까운 소아과·알레르기 전문 병원을 찾아 안내해 드립니다</>
            )}
          </p>
        )}

        {hospitalLoading && (
          <div className="text-center py-8 text-muted-foreground text-base">검색 중...</div>
        )}

        {hospitalError && (
          <div className="mt-2 px-4 py-3 bg-destructive/10 border border-destructive/30 rounded-2xl text-base text-destructive">
            {hospitalError}
          </div>
        )}

        {hospitalSearched && !hospitalError && featuredHospitals.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-base">
            주변 2km 이내에 병원이 없습니다
          </div>
        )}

        {featuredHospitals.length > 0 && (
          <div className={`grid ${isApp ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-3"} gap-4 mt-2`}>
            {featuredHospitals.map(({ label, place: h }) => {
              const isEmergency = label === "병원 응급실";
              if (isEmergency) label = "응급실";
              if (label === "피부과의원") label = "피부과";
              return (
                <div
                  key={h.id}
                  className={`bg-background border border-warm-border rounded-2xl p-4 flex flex-col ${isApp ? "gap-1" : "gap-2.5"}`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-base font-bold px-2.5 py-1 rounded-full ${isApp ? "mb-1" : "mb-2"} ${
                        isEmergency ? "bg-reaction-bg text-reaction-fg" : "bg-muted/40 text-muted-foreground"
                      }`}
                    >
                      {label}
                    </span>
                    {h.distance && (
                      <span className="flex items-center gap-1 text-base text-muted-foreground">
                        <MapPin size={16} />
                        {formatDistance(h.distance)}
                      </span>
                    )}
                  </div>

                  <p className="font-bold text-base leading-snug">{h.place_name}</p>

                  <p className={`text-sm text-muted-foreground leading-relaxed line-clamp-2`}>
                    {h.road_address_name || h.address_name}
                  </p>

                  <div className="flex gap-2 mt-auto pt-0.5">
                    <a
                      href={`https://map.kakao.com/link/to/${encodeURIComponent(h.place_name)},${h.y},${h.x}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`bg-warm-surface-soft text-warm-brand
                      hover:bg-warm-border/60 flex-1 flex items-center justify-center gap-1 py-2
                      rounded-xl border border-warm-border text-base font-semibold transition-colors`}
                    >
                      <Navigation size={16} />
                      길찾기
                    </a>
                    {h.phone ? (
                      <a
                        href={`tel:${h.phone}`}
                        className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-base font-bold transition-colors ${
                          isEmergency
                            ? "bg-reaction-fg text-white hover:brightness-90"
                            : "bg-warm-surface-soft text-warm-brand hover:bg-warm-border/60"
                        }`}
                      >
                        <Phone size={16} />
                        전화
                      </a>
                    ) : (
                      <span className="flex-1 flex items-center justify-center py-2 rounded-xl border border-warm-border text-base text-muted-foreground bg-warm-bg">
                        번호 없음
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 더보기 팝업 */}
      {showHospitalMore && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center pt-16 justify-center px-4"
          onClick={() => setShowHospitalMore(false)}
        >
          <div
            className={`bg-warm-surface border border-warm-border rounded-3xl w-full max-w-sm shadow-2xl flex flex-col ${isApp ? "max-h-[65dvh] py-6 px-3" : "max-h-[calc(100dvh-9rem)] sm:max-h-[80vh] p-6"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1 flex-shrink-0">
              <h3 className="font-bold text-lg">주변 2km 내 병원</h3>
              <button onClick={() => setShowHospitalMore(false)} className="p-1.5 rounded-full hover:bg-muted">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-3 flex-shrink-0">
              소아과 · 소화기내과 · 피부과 · 응급실 추천
            </p>
            <div className={`overflow-y-auto flex-1 space-y-2 pr-2 ${isApp ? "pb-24" : ""}
                [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar-track]:bg-white [&::-webkit-scrollbar-track]:rounded-full
                [&::-webkit-scrollbar-thumb]:bg-warm-border [&::-webkit-scrollbar-thumb]:rounded-full`}
            >
              {allHospitals.map(({ category, place: h }) => (
                <div
                  key={h.id}
                  className="flex items-start gap-3 p-3 rounded-2xl border border-warm-border bg-background"
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-base">{h.place_name}</span>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`${isApp ? "text-xs" : "text-sm"} font-semibold text-muted-foreground`}>{category === "병원 응급실" ? "응급실" : category === "피부과의원" ? "피부과" : category}</span>
                      {h.distance && (
                        <span className={`${isApp ? "text-xs" : "text-sm"} px-2 py-0.5 bg-warm-surface-soft text-muted-foreground rounded-full font-semibold`}>
                          {formatDistance(h.distance)}
                        </span>
                      )}
                    </div>
                    {h.phone && (
                      <a href={`tel:${h.phone}`} className="flex items-center gap-1.5 text-sm text-muted-foreground font-semibold mt-1 hover:underline">
                        <Phone size={14} /> {h.phone}
                      </a>
                    )}
                  </div>
                  <a
                    href={`https://map.kakao.com/link/to/${encodeURIComponent(h.place_name)},${h.y},${h.x}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl
                    bg-warm-surface-soft text-warm-brand hover:bg-warm-border/60
                    border border-warm-border text-base font-semibold transition-colors${isApp ? " self-center" : ""}`}
                  >
                    <Navigation size={12} />
                    길찾기
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
