import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { ChevronLeft, ChevronRight, Clock, Sparkles, Soup } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import ProtectedPage from "../../components/ProtectedPage";
import { useApp } from "../../context/AppContext";
import { apiFetch } from "../../api/client";
import type { MealEntry, ApiDaySchedule, ApiMealItem, DayMeals } from "./types";
import {
  weekDays,
  today,
  getMonthDays,
  formatDateKey,
  isToday,
  calculateBabyAgeMonths,
} from "./types";
import { AIMealPlanningModal } from "./Modals";
import { MealDetailPanel } from "./MealDetailPanel";
import { IngredientIcon } from "../../components/IngredientIcon";
import TutorialModal from "../../components/TutorialModal";
import { scheduleSlides } from "./tutorialSlides";

const SCHEDULE_UI_STATE_KEY = "mammacare_schedule_ui_state";
const SCHEDULE_MONTH_CACHE_PREFIX = "mammacare_schedule_month";

function readScheduleUiState(): { viewMonth: number; viewYear: number } | null {
  try {
    const raw = sessionStorage.getItem(SCHEDULE_UI_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { viewMonth?: unknown; viewYear?: unknown };
    if (typeof parsed.viewMonth !== "number" || typeof parsed.viewYear !== "number") {
      return null;
    }
    if (parsed.viewMonth < 0 || parsed.viewMonth > 11) return null;
    return { viewMonth: parsed.viewMonth, viewYear: parsed.viewYear };
  } catch {
    return null;
  }
}

function getScheduleMonthCacheKey(babyId: string, year: number, month: number): string {
  return `${SCHEDULE_MONTH_CACHE_PREFIX}:${babyId}:${year}-${month + 1}`;
}

function readCachedMonth(key: string): DayMeals | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as DayMeals) : null;
  } catch {
    return null;
  }
}

function ScheduleInner() {
  const { activeBaby, token, confirmedAllergyNames } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const initialUiState = readScheduleUiState();
  const [viewMonth, setViewMonth] = useState(initialUiState?.viewMonth ?? today.getMonth());
  const [viewYear, setViewYear] = useState(initialUiState?.viewYear ?? today.getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [dayMeals, setDayMeals] = useState<DayMeals>({});
  const [showAIMealPlanning, setShowAIMealPlanning] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchMonthlySchedules = useCallback(async () => {
    if (!activeBaby || !token) return;

    const cacheKey = getScheduleMonthCacheKey(activeBaby.id, viewYear, viewMonth);
    const cached = readCachedMonth(cacheKey);
    if (cached) setDayMeals(cached);

    try {
      const data = await apiFetch<Record<string, ApiDaySchedule>>(
        `/schedules?baby_id=${activeBaby.id}&year=${viewYear}&month=${viewMonth + 1}`,
        {},
        token,
      );

      const converted: DayMeals = {};

      for (const [dateKey, daySchedule] of Object.entries(data)) {
        converted[dateKey] = daySchedule.meals.map((meal: ApiMealItem) => {
          const [h, m] = meal.time.split(":").map(Number);

          return {
            id: meal.id,
            name: meal.name ?? "",
            hour: h,
            minute: m,
            ingredients: meal.ingredients?.length
              ? meal.ingredients.map((ing) => ({
                  id: ing.id,
                  emoji: ing.emoji ?? "",
                  name: ing.name,
                  hasAllergy: confirmedAllergyNames.includes(ing.name),
                  amount: ing.amount,
                }))
              : meal.first_ingredient_emoji && meal.first_ingredient_name
                ? [{ emoji: meal.first_ingredient_emoji, name: meal.first_ingredient_name }]
                : [],
            memo: meal.memo ?? "",
            status: meal.status,
            recipe_id: meal.recipe_id,
            recipe_description: meal.recipe_description,
          };
        });
      }

      setDayMeals(converted);
      sessionStorage.setItem(cacheKey, JSON.stringify(converted));
    } catch {
      // Keep the current or cached calendar visible if a refresh fails.
    }
  }, [activeBaby?.id, token, viewYear, viewMonth, confirmedAllergyNames]);

  useEffect(() => {
    sessionStorage.setItem(SCHEDULE_UI_STATE_KEY, JSON.stringify({ viewMonth, viewYear }));
  }, [viewMonth, viewYear]);

  useEffect(() => {
    fetchMonthlySchedules();
  }, [fetchMonthlySchedules]);

  // Chatbot STT에서 AI 식단 구성 이벤트 수신
  useEffect(() => {
    const handler = () => setShowAIMealPlanning(true);
    window.addEventListener("global-stt-mealplan", handler);
    return () => window.removeEventListener("global-stt-mealplan", handler);
  }, []);

  // GlobalSTT로 재료/식단 등록 완료 시 달력 갱신
  useEffect(() => {
    window.addEventListener("global-stt-schedule-saved", fetchMonthlySchedules);
    return () => window.removeEventListener("global-stt-schedule-saved", fetchMonthlySchedules);
  }, [fetchMonthlySchedules]);

  useEffect(() => {
    if (selectedDay !== null && panelRef.current && window.innerWidth < 1024) {
      panelRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedDay]);

  // 챗봇 → 이유식 일정 이동 시 해당 날짜 패널 자동 열기
  useEffect(() => {
    const state = location.state as { openDate?: string } | null;
    const openDate = state?.openDate;
    if (!openDate) return;

    const d = new Date(openDate + "T00:00:00");
    if (isNaN(d.getTime())) return;

    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelectedDay(d.getDate());

    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  const { firstDay, daysInMonth } = getMonthDays(viewYear, viewMonth);
  const allergies = confirmedAllergyNames;

  const babyAgeMonths = activeBaby
    ? calculateBabyAgeMonths(activeBaby.birthYear, activeBaby.birthMonth, activeBaby.birthDay)
    : 6;

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }

    setSelectedDay(null);
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }

    setSelectedDay(null);
  };

  const handleSaveMeals = (day: number, meals: MealEntry[]) => {
    const key = formatDateKey(viewYear, viewMonth, day);
    setDayMeals((prev) => ({ ...prev, [key]: meals }));
  };

  const getMealsForDay = (day: number): MealEntry[] => {
    const meals = dayMeals[formatDateKey(viewYear, viewMonth, day)] || [];
    return [...meals].sort((a, b) => a.hour !== b.hour ? a.hour - b.hour : a.minute - b.minute);
  };

  const getSelectedWeekDays = (): (number | null)[] => {
    if (selectedDay === null) return [];
    const gridPos = firstDay + selectedDay - 1;
    const weekIdx = Math.floor(gridPos / 7);
    return Array.from({ length: 7 }, (_, i) => {
      const pos = weekIdx * 7 + i;
      if (pos < firstDay || pos >= firstDay + daysInMonth) return null;
      return pos - firstDay + 1;
    });
  };

  const isApp = Capacitor.isNativePlatform();

  return (
    <div className={`max-w-7xl mx-auto ${isApp ? "px-3 py-4" : "px-4 py-5"}`}>
      {isApp ? (
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ fontFamily: "'Paperlogic'", fontWeight: 600 }}>
            <Soup className="w-4 h-4 sm:w-5 sm:h-5" /> 이유식 일정
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAIMealPlanning(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full font-bold
              shadow-sm transition-all duration-300 whitespace-nowrap
              bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)]
              hover:bg-[radial-gradient(ellipse_at_center,#FEF5CC_0%,#FFEFAB_100%)]"
            >
              <Sparkles size={14} />
              AI 식단 구성
            </button>
            <button
              onClick={() => setShowTutorial(true)}
              className="px-3 py-1.5 text-sm rounded-full font-bold whitespace-nowrap
              bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#C7E9FF_100%)]
              hover:bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#B8E2FF_100%)]
              shadow-sm transition-all duration-300"
            >
              사용법
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: "'Paperlogic'", fontWeight: 600 }}>
              <Soup className="w-5 h-5 sm:w-6 sm:h-6" /> 이유식 일정
            </h1>
            <p className="text-base text-muted-foreground mt-1">아기의 식사 스케줄을 관리하세요</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAIMealPlanning(true)}
              className="flex items-center gap-2 px-5 py-2.5 from-primary to-accent text-primary-foreground font-bold rounded-full
              whitespace-nowrap transition-all duration-300 shadow-sm bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)]
              hover:bg-[radial-gradient(ellipse_at_center,#FEF5CC_0%,#FFEFAB_100%)]"
            >
              <Sparkles size={18} />
              AI 식단 구성
            </button>
            <button
              onClick={() => setShowTutorial(true)}
              className="px-4 py-2.5 rounded-full font-bold whitespace-nowrap
              bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#C7E9FF_100%)]
              hover:bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#B8E2FF_100%)]
              shadow-sm transition-all duration-300"
            >
              사용법
            </button>
          </div>
        </div>
      )}

      <div className={isApp ? "flex flex-col gap-4" : "flex flex-col lg:flex-row gap-4 lg:gap-6 items-start"}>
        <div className={isApp ? "w-full" : `${selectedDay ? "w-full lg:flex-1 lg:min-w-0" : "w-full max-w-5xl mx-auto"}`}>
          <div className={`bg-card border border-border rounded-3xl ${isApp ? "p-3" : "p-4 sm:p-6 lg:p-8"}`}>
            <div className={`flex items-center justify-between ${isApp ? "mb-3" : "mb-4 lg:mb-6"}`}>
              <button onClick={prevMonth} className="p-2 lg:p-2.5 rounded-full hover:bg-primary/20 transition-colors flex-shrink-0">
                <ChevronLeft size={isApp ? 18 : 20} />
              </button>
              <span className={`font-bold whitespace-nowrap ${isApp ? "text-lg" : "text-lg lg:text-2xl"}`}>
                {viewYear}년 {viewMonth + 1}월
              </span>
              <button onClick={nextMonth} className="p-2 lg:p-2.5 rounded-full hover:bg-primary/20 transition-colors flex-shrink-0">
                <ChevronRight size={isApp ? 18 : 20} />
              </button>
            </div>

            <div className={`grid grid-cols-7 text-center ${isApp ? "mb-2" : "mb-2 lg:mb-4"}`}>
              {weekDays.map((d, i) => (
                <div
                  key={d}
                  className={`${isApp ? "text-xs" : "text-xs sm:text-sm lg:text-base"} font-bold ${isApp ? "py-1" : "py-1.5 lg:py-3"} ${
                    i === 0 ? "text-destructive" : i === 6 ? "text-blue-500" : "text-muted-foreground"
                  }`}
                >
                  {d}
                </div>
              ))}
            </div>

            <div className={`grid grid-cols-7 ${isApp ? "gap-1" : "gap-1 sm:gap-2 lg:gap-3"}`}>
              {isApp && selectedDay !== null ? (
                getSelectedWeekDays().map((day, i) => {
                  if (day === null) return <div key={`ew-${i}`} />;
                  const isTodayDate = isToday(viewYear, viewMonth, day);
                  const isSelected = day === selectedDay;
                  const meals = getMealsForDay(day);
                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDay(day)}
                      className={`relative aspect-square flex flex-col items-center justify-center rounded-xl transition-all overflow-hidden ${
                        isSelected
                          ? "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_100%)] text-primary-foreground font-bold ring-2 ring-[#FEF5CC] shadow-lg"
                          : "hover:bg-[#FEF5CC]/40"
                      } ${isTodayDate && !isSelected ? "font-bold" : ""}`}
                    >
                      <span className="text-xs leading-none font-semibold">{day}</span>
                      {meals.length > 0 && (
                        <div className="flex gap-0.5 mt-0.5">
                          {meals.slice(0, 2).map((_, idx) => (
                            <span key={idx} className="w-1.5 h-1.5 rounded-full bg-[#C7E9FF]" />
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })
              ) : (
                <>
                  {Array.from({ length: firstDay }).map((_, i) => (
                    <div key={`e-${i}`} />
                  ))}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const isTodayDate = isToday(viewYear, viewMonth, day);
                    const isSelected = day === selectedDay;
                    const meals = getMealsForDay(day);
                    return (
                      <button
                        key={day}
                        onClick={() => setSelectedDay(day)}
                        className={`relative aspect-square flex flex-col ${isApp ? "items-center justify-center" : "items-start justify-start p-1 sm:p-1.5 lg:p-2.5"} rounded-xl lg:rounded-2xl transition-all overflow-hidden ${
                          isSelected
                            ? "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_100%)] text-primary-foreground font-bold ring-2 ring-[#FEF5CC] shadow-lg"
                            : ""
                        } ${isTodayDate && !isSelected ? "font-bold" : ""} ${
                          !isSelected && !isApp
                            ? "hover:bg-[#FEF5CC]/40 border border-border hover:shadow-md"
                            : !isSelected
                              ? "hover:bg-[#FEF5CC]/40"
                              : ""
                        }`}
                      >
                        <span className={`${isApp ? "text-xs leading-none" : "mb-0.5 text-xs sm:text-sm lg:text-base lg:mb-1.5"} font-semibold`}>{day}</span>
                        {isApp ? (
                          meals.length > 0 && (
                            <div className="flex gap-0.5 mt-0.5">
                              {meals.slice(0, 2).map((_, idx) => (
                                <span key={idx} className="w-1.5 h-1.5 rounded-full bg-[#C7E9FF]" />
                              ))}
                            </div>
                          )
                        ) : (
                          <div className="flex flex-col gap-1 items-start w-full text-[11px] leading-tight">
                            {meals.slice(0, 2).map((meal, idx) => (
                              <div key={idx} className="flex items-center gap-1 overflow-hidden w-full">
                                <Clock size={10} className="flex-shrink-0" />
                                <span className="text-xs font-semibold flex-shrink-0">
                                  {String(meal.hour).padStart(2, "0")}:{String(meal.minute).padStart(2, "0")}
                                </span>
                                {meal.ingredients[0] && (
                                  <span className={`text-sm flex-shrink-0 ${meal.ingredients[0].hasAllergy ? "bg-white border-2 border-red-300 rounded-full" : ""}`}>
                                    <IngredientIcon name={meal.ingredients[0].name} emoji={meal.ingredients[0].emoji} size={18} />
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>

        {selectedDay && (
          <div
            ref={panelRef}
            className={isApp ? "w-full" : "w-full lg:w-[360px] xl:w-[400px] lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-2rem)] overflow-auto scrollbar-hide z-30"}
          >
            <MealDetailPanel
              key={`${viewYear}-${viewMonth}-${selectedDay}`}
              year={viewYear}
              month={viewMonth}
              day={selectedDay}
              daysInMonth={daysInMonth}
              meals={getMealsForDay(selectedDay)}
              onSave={(meals) => handleSaveMeals(selectedDay, meals)}
              onClose={() => setSelectedDay(null)}
              onPrevDay={() => setSelectedDay((d) => Math.max(1, (d ?? 1) - 1))}
              onNextDay={() => setSelectedDay((d) => Math.min(daysInMonth, (d ?? 1) + 1))}
              allergies={allergies}
              babyAgeMonths={babyAgeMonths}
            />
          </div>
        )}
      </div>

      {showAIMealPlanning && (
        <AIMealPlanningModal
          onClose={() => setShowAIMealPlanning(false)}
          onApplied={fetchMonthlySchedules}
        />
      )}

      <TutorialModal open={showTutorial} onClose={() => setShowTutorial(false)}
        slides={scheduleSlides} title="이유식 일정 사용법" />
    </div>
  );
}

export default function Schedule() {
  return (
    <ProtectedPage>
      <ScheduleInner />
    </ProtectedPage>
  );
}
