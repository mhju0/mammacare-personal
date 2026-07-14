"""PATCH /allergy/tests/{id} may only manually confirm a reaction.

`update_ingredient_testing` is a generic setattr; the schema is its guard. A
client must not be able to force `completed_safe` (marking a reacted test safe)
or `testing` (bypassing the retest purge + overlap guard) through PATCH. The one
legitimate manual transition is `completed_reaction` (the "add a past reaction"
flow). These tests pin that contract and would pass on the old unguarded schema
only for the allow cases — the reject cases discriminate.
"""
import pytest
from pydantic import ValidationError

from app.schemas.allergy.ingredient_testing import IngredientTestingUpdate


def test_patch_allows_completed_reaction():
    m = IngredientTestingUpdate(test_status="completed_reaction")
    assert m.test_status.value == "completed_reaction"


def test_patch_allows_memo_without_status():
    m = IngredientTestingUpdate(memo="관찰 메모")
    assert m.test_status is None
    assert m.memo == "관찰 메모"


def test_patch_allows_empty_payload():
    assert IngredientTestingUpdate().test_status is None


def test_patch_rejects_completed_safe():
    with pytest.raises(ValidationError):
        IngredientTestingUpdate(test_status="completed_safe")


def test_patch_rejects_testing():
    with pytest.raises(ValidationError):
        IngredientTestingUpdate(test_status="testing")
