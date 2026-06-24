from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))

PERIOD_DAYS: dict[str, int] = {"today": 1, "3days": 3, "week": 7}
PERIOD_LABEL: dict[str, str] = {"today": "하루치", "3days": "3일치", "week": "일주일치"}

STAGE_INFO: dict[str, tuple[str, int, list[str]]] = {
    'early1': ('초기 1단계 (생후 5개월)', 1, ['10:00']),
    'early2': ('초기 2단계 (생후 6개월)', 1, ['10:00']),
    'mid': ('중기 (생후 7~9개월)', 2, ['10:00', '16:00']),
    'late': ('후기 (생후 10~12개월)', 2, ['10:00', '16:00']),
    'finish': ('완료기 (생후 12개월 이후)', 2, ['10:00', '16:00']),
}

STAGE_COOKING_GUIDE: dict[str, str] = {
    'early1': '재료는 완전히 갈아 묽은 퓨레 형태로 조리하세요. 모유나 물로 희석해 숟가락에서 흘러내릴 정도로 만드세요.',
    'early2': '재료는 곱게 갈아 퓨레 형태로 조리하세요. 약간 걸쭉해도 되지만 덩어리가 없어야 합니다.',
    'mid': '재료는 부드럽게 으깨거나 잘게 다져서 덩어리 없이 조리하세요.',
    'late': '재료는 잘게 다진 형태로 조리하세요. 부드러운 손가락 음식도 가능합니다.',
    'finish': '재료는 작게 썰어 무른 형태로 조리하세요. 진밥이나 무른밥 형태로 제공 가능합니다.',
}


def safe_month_date(d: date, year: int, month: int) -> date:
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(d.day, last_day))


def calculate_age_months(birth_date: date, on_date: date) -> int:
    age_months = (on_date.year - birth_date.year) * 12 + (on_date.month - birth_date.month)
    if on_date < safe_month_date(birth_date, on_date.year, on_date.month):
        age_months -= 1
    return age_months


def date_range(start: date, days: int) -> list[date]:
    return [start + timedelta(days=i) for i in range(days)]


def kst_day_bounds_utc(d: date) -> tuple[datetime, datetime]:
    start_kst = datetime(d.year, d.month, d.day, tzinfo=KST)
    end_kst = start_kst + timedelta(days=1)
    return start_kst.astimezone(timezone.utc), end_kst.astimezone(timezone.utc)


def get_stage_key(age_months: int) -> str:
    if age_months < 5:
        return "early1"
    if age_months < 7:
        return "early2"
    if age_months < 10:
        return "mid"
    if age_months < 13:
        return "late"
    return "finish"


def stage_key_to_recipe_stage(stage_key: str) -> str:
    return {
        "early1": "early",
        "early2": "early",
        "mid":    "middle",
        "late":   "late",
        "finish": "complete",
    }.get(stage_key, "early")


def find_valid_test_windows(
    start: date,
    plan_end: date,
    max_count: int = 1,
    exclude_dates: set[date] | None = None,
) -> list[list[date]]:
    """플랜 기간 내에서 일요일 없는 연속 3일 구간을 최대 max_count개 반환."""
    excluded = exclude_dates or set()
    windows: list[list[date]] = []
    d = start
    while d + timedelta(days=2) <= plan_end and len(windows) < max_count:
        window = date_range(d, 3)
        if (
            not any(x.weekday() == 6 for x in window)
            and not any(x in excluded for x in window)
        ):
            windows.append(window)
            d = window[-1] + timedelta(days=1)
        else:
            d += timedelta(days=1)
    return windows
