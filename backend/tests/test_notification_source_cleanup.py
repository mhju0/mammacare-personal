import asyncio
import importlib
import uuid

from sqlalchemy.dialects import postgresql

from app.crud.crud_notification import delete_notifications_for_ingredient_testing

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


def test_delete_notifications_for_ingredient_testing_matches_exact_allergy_check() -> None:
    testing_id = uuid.UUID("22222222-2222-2222-2222-222222222222")
    db = _RecordingDb()

    deleted = asyncio.run(delete_notifications_for_ingredient_testing(db, testing_id))

    assert deleted == 1
    sql = _compile(db.statements[0])
    assert "notification.type = 'allergy_check'" in sql
    assert "notification.data ->> 'ingredient_testing_id'" in sql
    assert str(testing_id) in sql


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
