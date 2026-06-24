import asyncio
import importlib
import uuid

from sqlalchemy.dialects import postgresql

from app.crud.crud_notification import (
    delete_notifications_for_ingredient_testing,
    delete_notifications_for_schedule,
)
from app.services import schedule_service

ingredient_testing_crud = importlib.import_module("app.crud.allergy.ingredient_testing")


class _ExecuteResult:
    rowcount = 1

    def scalars(self):
        return self

    def all(self):
        return []


class _RecordingDb:
    def __init__(self):
        self.calls = []
        self.statements = []

    async def execute(self, stmt):
        self.calls.append("execute")
        self.statements.append(stmt)
        return _ExecuteResult()

    async def delete(self, obj):
        self.calls.append(("delete", obj.id))

    async def flush(self):
        self.calls.append("flush")

    async def commit(self):
        self.calls.append("commit")


class _Row:
    def __init__(self, id_: uuid.UUID):
        self.id = id_


def _compile(stmt) -> str:
    return str(
        stmt.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )


def test_delete_notifications_for_schedule_matches_legacy_meal_reminder_without_dedup() -> None:
    schedule_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    db = _RecordingDb()

    deleted = asyncio.run(delete_notifications_for_schedule(db, schedule_id))

    assert deleted == 1
    sql = _compile(db.statements[0])
    assert "notification.type = 'meal_reminder'" in sql
    assert "notification.data ->> 'schedule_id'" in sql
    assert str(schedule_id) in sql
    assert "dedup_key" not in sql


def test_delete_notifications_for_schedule_keeps_other_schedule_ids() -> None:
    schedule_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    other_schedule_id = uuid.UUID("22222222-2222-2222-2222-222222222222")
    db = _RecordingDb()

    asyncio.run(delete_notifications_for_schedule(db, schedule_id))

    sql = _compile(db.statements[0])
    assert str(schedule_id) in sql
    assert str(other_schedule_id) not in sql


def test_delete_notifications_for_schedule_keeps_other_notification_types() -> None:
    schedule_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    db = _RecordingDb()

    asyncio.run(delete_notifications_for_schedule(db, schedule_id))

    sql = _compile(db.statements[0])
    assert "notification.type = 'meal_reminder'" in sql
    assert "allergy_check" not in sql
    assert "community_comment" not in sql
    assert "community_like" not in sql


def test_delete_notifications_for_ingredient_testing_matches_exact_allergy_check() -> None:
    testing_id = uuid.UUID("22222222-2222-2222-2222-222222222222")
    db = _RecordingDb()

    deleted = asyncio.run(delete_notifications_for_ingredient_testing(db, testing_id))

    assert deleted == 1
    sql = _compile(db.statements[0])
    assert "notification.type = 'allergy_check'" in sql
    assert "notification.data ->> 'ingredient_testing_id'" in sql
    assert str(testing_id) in sql


def test_delete_schedule_removes_notification_before_source_row(monkeypatch) -> None:
    parent_id = uuid.uuid4()
    baby_id = uuid.uuid4()
    schedule_id = uuid.uuid4()
    schedule = _Row(schedule_id)
    db = _RecordingDb()

    async def fake_get_owned_schedule(db_arg, parent_id_arg, baby_id_arg, schedule_id_arg):
        assert db_arg is db
        assert parent_id_arg == parent_id
        assert baby_id_arg == baby_id
        assert schedule_id_arg == schedule_id
        db.calls.append("get_schedule")
        return schedule

    async def fake_delete_notifications(db_arg, schedule_id_arg):
        assert db_arg is db
        assert schedule_id_arg == schedule_id
        db.calls.append(("delete_notifications", schedule_id_arg))
        return 1

    async def fake_reconcile(db_arg, baby_id_arg):
        assert db_arg is db
        assert baby_id_arg == baby_id
        db.calls.append(("reconcile", baby_id_arg))

    monkeypatch.setattr(schedule_service, "_get_owned_schedule", fake_get_owned_schedule)
    monkeypatch.setattr(
        schedule_service, "delete_notifications_for_schedule", fake_delete_notifications
    )
    monkeypatch.setattr(schedule_service, "reconcile_pending_testings", fake_reconcile)

    asyncio.run(schedule_service.delete_schedule(db, parent_id, baby_id, schedule_id))

    assert db.calls == [
        "get_schedule",
        ("delete_notifications", schedule_id),
        ("delete", schedule_id),
        "flush",
        ("reconcile", baby_id),
        "commit",
    ]


def test_delete_ingredient_testing_removes_notification_before_source_row(monkeypatch) -> None:
    testing_id = uuid.uuid4()
    testing = _Row(testing_id)
    db = _RecordingDb()

    async def fake_get_ingredient_testing(db_arg, testing_id_arg):
        assert db_arg is db
        assert testing_id_arg == testing_id
        db.calls.append("get_testing")
        return testing

    async def fake_delete_notifications(db_arg, testing_id_arg):
        assert db_arg is db
        assert testing_id_arg == testing_id
        db.calls.append(("delete_notifications", testing_id_arg))
        return 1

    monkeypatch.setattr(
        ingredient_testing_crud, "get_ingredient_testing", fake_get_ingredient_testing
    )
    monkeypatch.setattr(
        ingredient_testing_crud,
        "delete_notifications_for_ingredient_testing",
        fake_delete_notifications,
    )

    deleted = asyncio.run(ingredient_testing_crud.delete_ingredient_testing(db, testing_id))

    assert deleted is True
    assert db.calls == [
        "get_testing",
        "execute",
        ("delete_notifications", testing_id),
        ("delete", testing_id),
        "flush",
    ]
