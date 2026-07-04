# app/services/report.py

import asyncio
import io
import logging
from pathlib import Path
from datetime import datetime, timedelta, timezone
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML
import pypdfium2 as pdfium
from PIL import Image

from app.models.allergy import IngredientTesting, ConfirmedAllergy
from app.models.baby_user import BabyUser
from app.schemas.allergy.report import (
    BabyAllergyReport,
    ReportTestingItem,
    ReportSymptomItem,
    ReportSymptomDetail,
    ReportPhotoItem,
    ReportReactedItem,
    ReportAllergyItem,
)

logger = logging.getLogger("mammacare")


TEMPLATE_DIR = Path(__file__).parent.parent.parent / "templates"
KST = timezone(timedelta(hours=9))

_jinja_env = Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)))


def _to_kst(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(KST)


def build_report(
    baby: BabyUser,
    testings: list[IngredientTesting],
    confirmed_allergies: list[ConfirmedAllergy],
    period_from,
    period_to,
    photo_sas_map: dict[str, str] | None = None,
) -> BabyAllergyReport:
    """DB 모델 → BabyAllergyReport 스키마로 조립"""

    testing_items = []
    reacted_items = []

    for testing in testings:
        symptom_items = []

        for check in testing.symptom_checks:
            symptom_items.append(
                ReportSymptomItem(
                    checked_at=_to_kst(check.checked_at),
                    description=check.description,
                    symptom_items=[
                        ReportSymptomDetail(
                            symptom_type=item.symptom_type,
                            severity=item.severity,
                        )
                        for item in check.symptom_items
                    ],
                    photos=[
                        ReportPhotoItem(
                            photo_url=(photo_sas_map or {}).get(photo.photo_url, photo.photo_url),
                            taken_at=_to_kst(photo.taken_at),
                        )
                        for photo in check.symptom_photos
                    ],
                )
            )

        # 전체 테스팅 목록
        testing_items.append(
            ReportTestingItem(
                ingredient_name=testing.ingredient.name,
                ingredient_emoji=testing.ingredient.emoji or "",
                test_start_date=_to_kst(testing.test_start_date),
                symptoms=symptom_items,
            )
        )

        # 반응 있었던 재료만 따로 수집
        if testing.test_status == "completed_reaction":
            all_symptoms = [
                ReportSymptomDetail(
                    symptom_type=item.symptom_type,
                    severity=item.severity,
                )
                for check in testing.symptom_checks
                for item in check.symptom_items
            ]
            # 반응 확인일시 = has_reaction=True로 기록된 가장 이른 증상 체크 시각.
            # (해당 체크가 test_status를 completed_reaction으로 확정시킨 시점 — crud/allergy/symptom_check.py)
            # has_reaction 체크가 하나도 없는 예외 경로(예: 수동 PATCH로 상태만 강제 설정된 경우)는
            # test_end_date로 폴백해 빈 값 대신 항상 날짜를 표시한다.
            reaction_checks = [c for c in testing.symptom_checks if c.has_reaction]
            reaction_checked_at = (
                _to_kst(min(reaction_checks, key=lambda c: c.checked_at).checked_at)
                if reaction_checks
                else _to_kst(testing.test_end_date)
            )
            reacted_items.append(
                ReportReactedItem(
                    ingredient_name=testing.ingredient.name,
                    test_end_date=_to_kst(testing.test_end_date),
                    reaction_checked_at=reaction_checked_at,
                    memo=testing.memo,
                    symptoms=all_symptoms,
                )
            )

    # 확정 알레르기 조립
    confirmed_items = [
        ReportAllergyItem(
            ingredient_name=allergy.ingredient.name,
            confirmed_date=allergy.confirmed_date,
            note=allergy.note,
        )
        for allergy in confirmed_allergies
    ]

    return BabyAllergyReport(
        baby_name=baby.name,
        baby_birth_date=baby.birth_date,
        period_from=_to_kst(period_from),
        period_to=_to_kst(period_to),
        testings=testing_items,
        reacted_ingredients=reacted_items,
        confirmed_allergies=confirmed_items,
    )


def generate_pdf(report: BabyAllergyReport) -> bytes:
    """BabyAllergyReport 스키마 → PDF bytes 변환"""

    template = _jinja_env.get_template("report.html")

    html_str = template.render(report=report)

    logger.debug("PDF 생성 시작 — baby_name=%s", report.baby_name)
    pdf_bytes = HTML(string=html_str).write_pdf()
    logger.debug("PDF 생성 완료")

    return pdf_bytes


async def generate_pdf_async(report: BabyAllergyReport) -> bytes:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, generate_pdf, report)


def generate_jpeg(report: BabyAllergyReport, scale: float = 2.0, quality: int = 90) -> bytes:
    """BabyAllergyReport → 전체 페이지를 세로로 이어붙인 JPEG bytes"""
    pdf_bytes = generate_pdf(report)

    doc = pdfium.PdfDocument(pdf_bytes)
    images: list[Image.Image] = []

    for i in range(len(doc)):
        page = doc[i]
        bitmap = page.render(scale=scale, rotation=0)
        images.append(bitmap.to_pil().convert("RGB"))

    if not images:
        img = Image.new("RGB", (595, 842), color="white")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality)
        return buf.getvalue()

    total_height = sum(img.height for img in images)
    max_width = max(img.width for img in images)

    combined = Image.new("RGB", (max_width, total_height), color="white")
    y_offset = 0
    for img in images:
        combined.paste(img, (0, y_offset))
        y_offset += img.height

    buf = io.BytesIO()
    combined.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


async def generate_jpeg_async(report: BabyAllergyReport) -> bytes:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, generate_jpeg, report)
