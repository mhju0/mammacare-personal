from app.services.global_stt_service import _category_ingredient_names


def test_expands_yachae_to_common_baby_food_vegetables() -> None:
    assert _category_ingredient_names("닭고기야채죽") == [
        "당근",
        "애호박",
        "브로콜리",
        "양배추",
        "양파",
    ]


def test_expands_chaeso_synonym() -> None:
    assert _category_ingredient_names("소고기 채소 진밥") == [
        "당근",
        "애호박",
        "브로콜리",
        "양배추",
        "양파",
    ]


def test_does_not_add_vegetables_without_category_word() -> None:
    assert _category_ingredient_names("닭고기죽") == []
