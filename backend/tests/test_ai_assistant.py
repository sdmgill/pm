import json
from types import SimpleNamespace

import pytest

from app import ai, db


def fake_client(output: dict[str, object], calls: list[dict[str, object]]) -> object:
    class FakeResponses:
        @staticmethod
        def create(**kwargs: object) -> object:
            calls.append(kwargs)
            return SimpleNamespace(output_text=json.dumps(output))

    return SimpleNamespace(responses=FakeResponses())


def test_run_kanban_assistant_uses_strict_schema_and_converts_cards(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    board = db.DEFAULT_BOARD_DATA
    ai_board = {"columns": board["columns"], "cards": list(board["cards"].values())}
    calls: list[dict[str, object]] = []
    monkeypatch.setattr(
        ai,
        "get_openai_client",
        lambda: fake_client({"assistant_message": "Ok", "board_update": ai_board}, calls),
    )

    result = ai.run_kanban_assistant(board=board, user_message="Hi", conversation_history=[])

    text_format = calls[0]["text"]["format"]
    assert text_format["type"] == "json_schema"
    assert text_format["strict"] is True
    assert text_format["schema"] == ai._structured_output_schema()
    assert result["board_update"] == board


def test_run_kanban_assistant_rejects_duplicate_card_ids(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    board = db.DEFAULT_BOARD_DATA
    first_card = next(iter(board["cards"].values()))
    ai_board = {"columns": board["columns"], "cards": [first_card, first_card]}
    monkeypatch.setattr(
        ai,
        "get_openai_client",
        lambda: fake_client({"assistant_message": "Ok", "board_update": ai_board}, []),
    )

    with pytest.raises(ai.AIResponseFormatError):
        ai.run_kanban_assistant(board=board, user_message="Hi", conversation_history=[])
