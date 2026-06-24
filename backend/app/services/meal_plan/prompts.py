from __future__ import annotations

from datetime import date, timedelta

from app.services.meal_plan.constants import STAGE_COOKING_GUIDE


def _join_or_none(items: list[str]) -> str:
    return ", ".join(items) if items else "없음"


def _format_schedule_lines(date_list: list[str], meal_times: list[str]) -> str:
    return "\n".join(
        f"- {d}: " + ", ".join(f"{t}에 이유식 1끼" for t in meal_times)
        for d in date_list
    )


def _build_recipe_reference_section(db_recipes: list[dict]) -> str:
    if not db_recipes:
        return ""

    lines = [
        f"- {r['title']} ({', '.join(r['ingredients'])})"
        for r in db_recipes[:20]
    ]
    return (
        "\n[참고 레시피 목록]\n"
        + "\n".join(lines)
        + "\n가능하면 위 레시피에서 선택하거나, 같은 형식과 재료 조합으로 만드세요\n"
    )


def _build_approved_candidate_section(approved_candidates: list[dict] | None) -> str:
    if not approved_candidates:
        return ""

    lines = ["\n[사용 가능한 식단 목록 — 이 목록 안에서만 선택]"]
    for candidate in approved_candidates:
        ingredients = ", ".join(
            f"{item['name']} {item.get('amount', '')}".strip()
            for item in candidate["ingredients"]
        )
        allowed_dates = candidate.get("allowed_dates") or ["전체"]
        tags = candidate.get("tags") or ["safe"]
        lines.append(
            "- "
            f"id={candidate['candidate_id']} | "
            f"source={candidate['source']} | "
            f"tags={','.join(tags)} | "
            f"recipe_name={candidate['recipe_name']} | "
            f"ingredients={ingredients} | "
            f"allowed_dates={', '.join(allowed_dates)}"
        )
    return "\n".join(lines) + "\n"


def _build_cooking_guide_section(stage_key: str) -> str:
    cooking_guide = STAGE_COOKING_GUIDE.get(stage_key, "")
    return (
        f"\n[이 단계 조리 지침 — description에 반드시 반영]\n"
        f"- {cooking_guide}\n"
        f"- 위 질감·묽기를 description 조리 단계에 구체적으로 명시하세요 (recipe_name에는 포함하지 마세요)\n"
    ) if cooking_guide else ""


def _build_ongoing_test_section(ongoing_test_infos: list[dict] | None) -> str:
    if not ongoing_test_infos:
        return ""

    lines = ["\n[진행 중인 알레르기 테스트 이어서 생성]"]
    for info in ongoing_test_infos:
        name = info["name"]
        full_dates = _join_or_none(info.get("test_dates", []))
        confirmed_dates = _join_or_none(info.get("confirmed_dates", []))
        missing_dates = _join_or_none(info.get("missing_dates", []))
        missing_slots_by_date = info.get("missing_slots_by_date", {})
        missing_slots = [
            f"{d} ({', '.join(times)})"
            for d, times in missing_slots_by_date.items()
            if times
        ]
        missing_slots_str = _join_or_none(missing_slots)
        lines.extend([
            f"- 진행 중 재료: {name}",
            f"- 전체 테스트 식사 날짜: {full_dates}",
            f"- 이미 기존 식단에서 확인된 날짜: {confirmed_dates}",
            f"- 새로 생성해야 할 날짜: {missing_dates}",
            f"- 새로 생성해야 할 날짜/시간: {missing_slots_str}",
            f"- 새로 생성하는 위 날짜/시간에는 {name}을(를) 반드시 포함하세요",
            f"- 전체 테스트 식사 날짜 외에는 {name}을(를) 절대 포함하지 마세요",
        ])
    return "\n".join(lines) + "\n"


_MAIN_RECIPE_NAME_RULES = """5. recipe_name 작성 규칙:
   - 반드시 ingredients 목록을 먼저 확인한 후 이름을 결정하세요
   - 이름에 곡물류(쌀·오트밀 등)를 굳이 포함하지 않아도 됩니다. 메인 재료 위주로 작성하세요
   - 곡물류(쌀·오트밀·보리·귀리)가 ingredients에 있으면 → 미음·죽·진밥·밥 사용
   - 곡물류가 ingredients에 없으면 → 퓨레·으깸·수프 사용 (미음·죽·진밥·밥 절대 금지)
   - [일관성 필수] 퓨레·으깸·수프를 recipe_name에 사용하는 경우 ingredients에 쌀·오트밀·보리·귀리를 절대 포함하지 마세요
   - [일관성 필수] ingredients에 곡물류가 있는데 recipe_name을 퓨레·으깸·수프로 짓는 것을 절대 금지합니다
  """


_MAIN_DESCRIPTION_RULES = """6. description은 단계별 조리법으로 작성하세요:
   - 반드시 각 단계를 \n으로 구분하세요 (줄바꿈 없이 이어 쓰지 마세요)
   - 숫자 번호(1. 2. 3.)는 붙이지 마세요
   - 3~5단계로 구성 (재료 손질 → 조리 → 완성)
   - 각 단계는 한 문장으로 간결하게
   - [필수] "[이 단계 조리 지침]"의 질감·묽기를 description에 반드시 구체적으로 명시하세요"""


_MAIN_JSON_SCHEMA = """{
  "meals": [
    {
      "date": "YYYY-MM-DD",
      "meal_time": "HH:MM",
      "recipe_name": "식단명",
      "ingredients": [
        {"name": "재료1", "amount": "30g"},
        {"name": "재료2", "amount": "1스푼"}
      ],
      "description": "조리 설명"
    }
  ],
  "cautions": ["주의사항"]
}"""


def build_prompt(
    stage_label: str,
    stage_key: str,
    db_recipes: list[dict],
    meal_times: list[str],
    allergy_names: list[str],
    tested_names: list[str],
    reaction_names: list[str],
    pending_names: list[str],
    test_infos: list[tuple[str, list[str]]],
    known_ingredients: list[str],
    days: int,
    start: date,
    schedule_lines_override: str | None = None,
    ongoing_test_infos: list[dict] | None = None,
    approved_candidates: list[dict] | None = None,
) -> str:
    date_list = [str(start + timedelta(days=i)) for i in range(days)]
    schedule_lines = (
        schedule_lines_override
        if schedule_lines_override is not None
        else _format_schedule_lines(date_list, meal_times)
    )

    allergies_str = _join_or_none(allergy_names)
    reaction_str = _join_or_none(reaction_names)
    pending_str = _join_or_none(pending_names)
    tested_str = _join_or_none(tested_names)
    new_str = ", ".join(name for name, _ in test_infos) if test_infos else "없음"
    known_str = _join_or_none(known_ingredients)

    pending_rule = ""
    if pending_names:
        pending_rule = f"""
[테스트 중/예정 재료 — 완전 사용 금지]
- 해당 재료: {pending_str}
- 위 재료는 아직 알레르기 반응 여부가 미확정 상태입니다
- 모든 날짜, 모든 끼니에서 절대 포함하지 마세요
- 확정 알레르기 재료와 동일하게 취급하세요
"""

    safe_only_rule = ""
    if not test_infos:
        if tested_names:
            safe_only_rule = f"""
[안전 재료 전용 식단]
- 현재 도입할 새 재료가 없습니다
- 이미 안전이 확인된 재료({tested_str})만 사용하세요
- 아직 테스트하지 않은 재료나 테스트 결과 미확정 재료는 절대 포함하지 마세요
"""
        else:
            safe_only_rule = f"""
[안전 재료 전용 식단]
- 현재 안전이 확인된 재료가 없습니다
- 이유식 단계에 맞는 재료를 사용하세요
- 새로운 재료는 한 번에 하나씩만 도입하세요 (여러 미테스트 재료를 동시에 사용하지 마세요)
- 확정 알레르기 재료({allergies_str}) 및 미확정 재료({pending_str})는 절대 포함하지 마세요
"""

    new_rules = ""
    if test_infos:
        for i, (name, dates) in enumerate(test_infos):
            num = f" {i + 1}" if len(test_infos) > 1 else ""
            if not tested_names:
                only_rule = f"\n- 테스트 기간에는 {name} 외 다른 재료는 절대 포함하지 마세요 (안전이 확인된 다른 재료가 없으므로)"
            else:
                only_rule = f"\n- 테스트 기간에는 {name}과(와) 이미 안전이 확인된 재료({tested_str})만 사용하세요. 미테스트 재료는 절대 포함하지 마세요"
            recipe_name_rule = (
                "- 레시피 이름은 달라도 되지만 해당 재료는 반드시 매 끼니에 들어가야 합니다"
                if approved_candidates is None
                else "- 제공된 목록의 recipe_name만 사용하고 목록 밖 recipe_name은 만들지 마세요"
            )
            new_rules += f"""
[처음 도입 재료 규칙{num}]
- 도입 재료: {name}
- 테스트 기간: {dates[0]} ~ {dates[-1]}
- 위 기간 매 끼니마다 {name}을(를) 반드시 포함하세요
{recipe_name_rule}
- 위 기간 외 날짜에는 {name}을(를) 절대 포함하지 마세요{only_rule}
"""
        if tested_names:
            new_rules += f"""
[공통 규칙]
- 각 테스트 기간에는 해당 테스트 재료 외 다른 새 재료를 도입하지 마세요
- 테스트 기간이 아닌 날짜에는 이미 안전이 확인된 재료({tested_str})만 사용하세요
"""
        else:
            new_rules += """
[공통 규칙]
- 각 테스트 기간에는 해당 테스트 재료 외 다른 새 재료를 도입하지 마세요
- 테스트 기간이 아닌 날짜에는 이유식 단계에 맞는 재료를 사용하세요 (확정 알레르기 재료 및 미확정 재료 제외)
- 새로운 재료는 한 번에 하나씩만 도입하세요
"""

    cooking_guide_section = _build_cooking_guide_section(stage_key)
    recipe_ref_section = (
        _build_approved_candidate_section(approved_candidates)
        if approved_candidates is not None
        else _build_recipe_reference_section(db_recipes)
    )
    ongoing_test_section = _build_ongoing_test_section(ongoing_test_infos)
    output_rules = (
        f"""[출력 규칙]
1. [Hard safety] 확정 알레르기, 알레르기 반응, 테스트 결과 미확정 재료는 절대 포함하지 마세요
2. [식단 목록 선택] 반드시 [사용 가능한 식단 목록]의 항목 중 하나만 선택하세요
   - source=db_recipe 항목을 우선 선택하고, source=custom_fallback 항목은 DB 항목이 부족한 날짜에만 사용하세요
   - 목록 밖 recipe_name이나 재료를 만들지 마세요
   - DB 레시피를 선택하면 recipe_name과 ingredients를 선택한 항목과 정확히 동일하게 사용하세요
   - source=custom_fallback 항목을 선택해도 ingredients는 목록 그대로만 사용하세요
   - recipe_name에는 테스트, 후보, 승인 후보, fallback, repair, 정규화, 보완 같은 내부 용어를 절대 쓰지 마세요
   - cautions에는 보호자에게 필요한 알레르기·관찰 안내만 쓰고 누락, 보정, 후보, fallback 같은 내부 처리 과정을 쓰지 마세요
3. [날짜/테스트 기간] allowed_dates가 전체이 아니면 해당 날짜에만 사용하세요
   - 진행 중인 테스트 날짜에는 active test 재료가 포함된 후보를 선택하세요
   - active_test/new_test 재료는 allowed_dates 밖에서 사용하지 마세요
4. [레시피/재료 일관성]
   - description에 후보 ingredients 밖 숨은 재료를 넣지 마세요
   - DB 레시피에 재료를 추가하거나 빼지 마세요
   - 실용적으로 같은 base grain이나 채소 큐브는 반복해도 됩니다
   - 정확히 같은 recipe_name만 과도하게 반복하지 마세요
5. description은 단계별 조리법으로 작성하세요:
   - 반드시 각 단계를 \\n으로 구분하세요 (줄바꿈 없이 이어 쓰지 마세요)
   - 숫자 번호(1. 2. 3.)는 붙이지 마세요
   - 3~5단계로 구성 (재료 손질 → 조리 → 완성)
   - 각 단계는 한 문장으로 간결하게
   - [필수] "[이 단계 조리 지침]"의 질감·묽기를 description에 반드시 구체적으로 명시하세요
6. 반드시 아래 JSON 형식으로만 응답하세요 (JSON 외 텍스트 금지)

{_MAIN_JSON_SCHEMA}"""
        if approved_candidates is not None
        else f"""[출력 규칙]
1. 확정 알레르기 재료, 알레르기 반응 재료, 테스트 결과 미확정 재료는 절대 포함하지 마세요
2. 새 도입 재료가 없는 경우 이미 안전이 확인된 재료만 사용하세요
3. 이유식 단계에 맞는 재료와 질감(묽기)을 사용하세요
4. 모든 날짜와 모든 식사 시간에 맞게 빠짐없이 생성하세요
{_MAIN_RECIPE_NAME_RULES}
{_MAIN_DESCRIPTION_RULES}
7. 영양 균형 (탄수화물·단백질·채소·철분)을 고려해주세요
8. 레시피 종류는 2~3가지로 단순하게 유지하고 같은 레시피를 여러 날 반복해도 됩니다
9. 한 끼에 사용하는 재료는 2~3가지로 제한하세요 (단, 처음 도입 재료 테스트 중 안전이 확인된 재료가 없는 경우 테스트 재료 1가지만 사용하세요)
10. 반드시 아래 JSON 형식으로만 응답하세요 (JSON 외 텍스트 금지)

{_MAIN_JSON_SCHEMA}"""
    )

    return f"""소아 영양 전문가로서 아기 이유식 식단을 만들어주세요.

[아기 이유식 단계]
{stage_label}
{cooking_guide_section}{recipe_ref_section}
[제약 조건]
- 절대 사용 금지 재료 (확정 알레르기): {allergies_str}
- 알레르기 반응 재료 (완전 금지): {reaction_str}
- 테스트 결과 미확정 재료 (사용 금지): {pending_str}
- 이미 테스트한 재료 (자유롭게 사용 가능): {tested_str}
- 사용자가 원하는 새 재료 (처음 도입): {new_str}
- 사용자가 원하는 기존 재료 (이미 테스트됨): {known_str}
{pending_rule}{safe_only_rule}{ongoing_test_section}{new_rules}
[생성할 날짜와 식사 시간]
{schedule_lines}

{output_rules}""".strip()
