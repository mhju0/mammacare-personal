from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class NotificationMessage:
    title: str
    body: str


def _pick(options: list[NotificationMessage], key: str) -> NotificationMessage:
    if not options:
        raise ValueError("notification template options must not be empty")
    index = sum(ord(ch) for ch in key) % len(options)
    return options[index]


def allergy_check_message(
    *,
    baby_name: str,
    ingredient_name: str,
    ingredient_emoji: str,
    interval_label: str,
    dedup_key: str,
) -> NotificationMessage:
    display_interval = {
        "30min": "30분",
        "1h": "1시간",
        "2h": "2시간",
        "4h": "4시간",
        "6h": "6시간",
        "12h": "12시간",
        "24h": "24시간",
        "48h": "48시간",
        "72h": "72시간",
    }.get(interval_label, interval_label)
    ingredient = f"{ingredient_emoji}{ingredient_name}" if ingredient_emoji else ingredient_name
    options = [
        NotificationMessage(
            title=f"👀 {display_interval} 체크 시간이에요",
            body=f"{ingredient}을(를) 먹은 뒤 {baby_name}의 피부, 입 주변, 컨디션을 살짝 확인해주세요.",
        ),
        NotificationMessage(
            title="🔍 아기 반응을 확인해볼까요?",
            body=f"새 재료를 먹은 지 {display_interval}이 지났어요. 편안했는지 기록해두면 좋아요.",
        ),
        NotificationMessage(
            title="🧡 새 재료 후 컨디션 체크",
            body=f"{baby_name}에게 이상이 없었다면 안전한 기록으로 남길 수 있어요.",
        ),
        NotificationMessage(
            title="🐣 우리 아기 괜찮은지 살펴봐요",
            body=f"{display_interval} 체크예요. 피부 변화나 구토, 설사 같은 반응이 있었는지 확인해주세요.",
        ),
        NotificationMessage(
            title="🥄 처음 만난 재료 체크",
            body=f"{ingredient}이(가) {baby_name}에게 잘 맞는지 한 번만 살펴봐요.",
        ),
    ]
    return _pick(options, dedup_key)
