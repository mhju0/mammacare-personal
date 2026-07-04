from pydantic import BaseModel
from datetime import datetime, date
from typing import Optional



class ReportPhotoItem(BaseModel):
    photo_url: str
    taken_at: datetime

class ReportSymptomDetail(BaseModel):
    symptom_type: str
    severity: Optional[str] = None

class ReportSymptomItem(BaseModel):
    checked_at: datetime
    symptom_items: list[ReportSymptomDetail]
    description: Optional[str] = None
    photos: list[ReportPhotoItem]

class ReportTestingItem(BaseModel):
    ingredient_name: str
    ingredient_emoji: str
    test_start_date: datetime
    symptoms: list[ReportSymptomItem]

class ReportAllergyItem(BaseModel):
    ingredient_name: str
    confirmed_date: date
    note: Optional[str] = None

class ReportReactedItem(BaseModel):
    ingredient_name: str
    test_end_date: Optional[datetime] = None
    reaction_checked_at: Optional[datetime] = None
    memo: Optional[str] = None
    symptoms: list[ReportSymptomDetail]

class BabyAllergyReport(BaseModel):
    baby_name: str
    baby_birth_date: date
    period_from: datetime
    period_to: datetime
    testings: list[ReportTestingItem]
    reacted_ingredients: list[ReportReactedItem]
    confirmed_allergies: list[ReportAllergyItem]
