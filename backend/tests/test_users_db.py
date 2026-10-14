import sqlite3
from pathlib import Path

import pytest

from app import db


def test_password_hash_round_trip(tmp_path: Path) -> None:
    db_path = tmp_path / "pm.db"
    db.init_db(db_path)
    user_id = db.create_user(db_path, "zoe", "hunter22")

    assert db.verify_user(db_path, "zoe", "hunter22") == user_id
    assert db.verify_user(db_path, "zoe", "wrong") is None
    assert db.verify_user(db_path, "missing", "hunter22") is None
    assert db.check_password("x", None) is False
    assert db.check_password("x", "garbage") is False


def test_create_user_rejects_duplicates(tmp_path: Path) -> None:
    db_path = tmp_path / "pm.db"
    db.init_db(db_path)
    db.create_user(db_path, "zoe", "hunter22")

    with pytest.raises(ValueError):
        db.create_user(db_path, "zoe", "other-pass")


def test_ensure_user_sets_password_only_when_missing(tmp_path: Path) -> None:
    db_path = tmp_path / "pm.db"
    db.init_db(db_path)
    user_id = db.ensure_user(db_path, "user")
    assert db.verify_user(db_path, "user", "password") is None

    assert db.ensure_user(db_path, "user", "password") == user_id
    assert db.verify_user(db_path, "user", "password") == user_id

    db.ensure_user(db_path, "user", "different")
    assert db.verify_user(db_path, "user", "password") == user_id


def test_board_crud_is_scoped_to_owner(tmp_path: Path) -> None:
    db_path = tmp_path / "pm.db"
    db.init_db(db_path)
    owner = db.create_user(db_path, "owner", "secret1")
    other = db.create_user(db_path, "other", "secret1")
    board_id = db.create_board(db_path, owner, "Mine")

    assert db.get_board_snapshot(db_path, owner, board_id) is not None
    assert db.get_board_snapshot(db_path, other, board_id) is None
    assert db.rename_board(db_path, other, board_id, "Stolen") is False
    assert db.delete_board(db_path, other, board_id) is False
    snapshot = db.get_board_snapshot(db_path, owner, board_id)
    with pytest.raises(ValueError):
        db.save_board_snapshot(db_path, other, snapshot["board"], 1, board_id=board_id)
    assert db.delete_board(db_path, owner, board_id) is True


def test_deleting_user_cascades_to_boards(tmp_path: Path) -> None:
    db_path = tmp_path / "pm.db"
    db.init_db(db_path)
    user_id = db.create_user(db_path, "temp", "secret1")
    db.create_board(db_path, user_id, "One")

    db.delete_user(db_path, user_id)

    assert db.list_boards(db_path, user_id) == []
    assert db.get_user_id(db_path, "temp") is None


def test_init_db_migrates_single_board_schema(tmp_path: Path) -> None:
    db_path = tmp_path / "old.db"
    with sqlite3.connect(db_path) as connection:
        connection.executescript(
            """
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE boards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL UNIQUE,
                board_json TEXT NOT NULL,
                version INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            INSERT INTO users (username) VALUES ('user');
            INSERT INTO boards (user_id, board_json, version)
            VALUES (1, '{"columns": [], "cards": {}}', 7);
            """
        )

    db.init_db(db_path)
    db.init_db(db_path)

    boards = db.list_boards(db_path, 1)
    assert [b["name"] for b in boards] == ["My Board"]
    assert db.get_board_snapshot(db_path, 1)["version"] == 7
    db.create_board(db_path, 1, "Second board")
    assert len(db.list_boards(db_path, 1)) == 2
