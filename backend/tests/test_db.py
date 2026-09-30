import sqlite3
from pathlib import Path

from app import db


def test_init_db_creates_schema(tmp_path: Path) -> None:
    db_path = tmp_path / "pm.db"

    db.init_db(db_path)

    with sqlite3.connect(db_path) as connection:
        names = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
        }

    assert "users" in names
    assert "boards" in names


def test_board_snapshot_round_trip(tmp_path: Path) -> None:
    db_path = tmp_path / "pm.db"

    db.init_db(db_path)
    user_id = db.ensure_user(db_path, "user")
    db.ensure_board(db_path, user_id)

    first_read = db.get_board_snapshot(db_path, user_id)
    assert first_read is not None
    assert first_read["version"] == 1
    assert "columns" in first_read["board"]
    assert "cards" in first_read["board"]

    modified_board = first_read["board"]
    modified_board["columns"][0]["title"] = "Now"

    write_result = db.save_board_snapshot(
        db_path,
        user_id,
        modified_board,
        expected_version=first_read["version"],
    )
    assert write_result["version"] == 2

    second_read = db.get_board_snapshot(db_path, user_id)
    assert second_read is not None
    assert second_read["version"] == 2
    assert second_read["board"]["columns"][0]["title"] == "Now"


def test_version_mismatch_rejected(tmp_path: Path) -> None:
    db_path = tmp_path / "pm.db"

    db.init_db(db_path)
    user_id = db.ensure_user(db_path, "user")
    db.ensure_board(db_path, user_id)

    snapshot = db.get_board_snapshot(db_path, user_id)
    assert snapshot is not None

    try:
        db.save_board_snapshot(
            db_path,
            user_id,
            snapshot["board"],
            expected_version=999,
        )
        assert False, "Expected ValueError for mismatched version"
    except ValueError:
        pass
