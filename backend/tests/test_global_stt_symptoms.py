from app.services.global_stt_service import _chatbot_symptom_items


def test_chatbot_symptom_leaves_severity_unspecified() -> None:
    items = _chatbot_symptom_items("두드러기")

    assert len(items) == 1
    assert items[0].symptom_type == "두드러기"
    assert items[0].severity is None


def test_chatbot_reaction_without_description_still_creates_symptom() -> None:
    items = _chatbot_symptom_items(None)

    assert items[0].symptom_type == "반응 있음"
    assert items[0].severity is None
