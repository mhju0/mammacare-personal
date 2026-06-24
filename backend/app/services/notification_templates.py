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


def meal_reminder_message(
    *,
    baby_name: str,
    recipe_title: str,
    meal_time: str,
    schedule_id: str,
) -> NotificationMessage:
    options = [
        NotificationMessage(
            title="🥄 맘마 시간이 왔어요",
            body=f"{meal_time} {baby_name}의 {recipe_title} 시간이에요. 오늘 한 입도 살짝 기록해볼까요?",
        ),
        NotificationMessage(
            title="🥣 오늘의 한 입 시간이에요",
            body=f"{baby_name}이(가) 만난 음식과 재료를 남겨두면 식단 흐름을 더 잘 볼 수 있어요.",
        ),
        NotificationMessage(
            title="🍚 따뜻한 맘마 시간이에요",
            body=f"{recipe_title} 먹는 시간이에요. 작은 기록이 나중에 든든한 힌트가 돼요.",
        ),
        NotificationMessage(
            title="🐣 오늘도 맘마 기록 이어가요",
            body=f"{baby_name}의 식단 기록이 차곡차곡 쌓이고 있어요. 오늘 한 끼도 남겨볼까요?",
        ),
        NotificationMessage(
            title="🌱 이번 주 맘마 흐름이 좋아요",
            body="오늘 먹은 재료를 적어두면 아기에게 맞는 식단 패턴을 더 쉽게 볼 수 있어요.",
        ),
    ]
    return _pick(options, schedule_id)


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


def community_comment_message(comment_id: str) -> NotificationMessage:
    options = [
        NotificationMessage(
            title="💬 새 댓글이 도착했어요",
            body="내 글에 부모님의 답변이 달렸어요.",
        ),
        NotificationMessage(
            title="🧡 따뜻한 답글이 도착했어요",
            body="다른 부모님이 내 이야기에 댓글을 남겼어요.",
        ),
        NotificationMessage(
            title="🌱 이야기가 이어지고 있어요",
            body="내 게시글에 새 댓글이 달렸어요.",
        ),
    ]
    return _pick(options, comment_id)


def community_report_post_message() -> NotificationMessage:
    return NotificationMessage(
        title="📋 게시글에 신고가 접수됐어요",
        body="신고된 내용을 관리자가 검토하고 있어요.",
    )


def community_report_comment_message() -> NotificationMessage:
    return NotificationMessage(
        title="📋 댓글에 신고가 접수됐어요",
        body="신고된 내용을 관리자가 검토하고 있어요.",
    )


def community_like_message(dedup_key: str) -> NotificationMessage:
    options = [
        NotificationMessage(
            title="🧡 공감이 도착했어요",
            body="다른 부모님이 내 글에 좋아요를 눌렀어요.",
        ),
        NotificationMessage(
            title="🌱 내 이야기에 공감이 생겼어요",
            body="부모님 한 분이 내 게시글에 마음을 남겼어요.",
        ),
        NotificationMessage(
            title="💬 글에 따뜻한 반응이 왔어요",
            body="내 게시글에 좋아요가 추가됐어요.",
        ),
    ]
    return _pick(options, dedup_key)
