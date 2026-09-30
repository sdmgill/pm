import json
import sqlite3
from pathlib import Path
from typing import Any

DEFAULT_BOARD_DATA: dict[str, Any] = {
    "columns": [
        {"id": "col-backlog", "title": "Backlog", "cardIds": ["card-1", "card-2"]},
        {"id": "col-discovery", "title": "Discovery", "cardIds": ["card-3"]},
        {
            "id": "col-progress",
            "title": "In Progress",
            "cardIds": ["card-4", "card-5"],
        },
        {"id": "col-review", "title": "Review", "cardIds": ["card-6"]},
        {"id": "col-done", "title": "Done", "cardIds": ["card-7", "card-8"]},
    ],
    "cards": {
        "card-1": {
            "id": "card-1",
            "title": "Align roadmap themes",
            "details": "Draft quarterly themes with impact statements and metrics.",
        },
        "card-2": {
            "id": "card-2",
            "title": "Gather customer signals",
            "details": "Review support tags, sales notes, and churn feedback.",
        },
        "card-3": {
            "id": "card-3",
            "title": "Prototype analytics view",
            "details": "Sketch initial dashboard layout and key drill-downs.",
        },
        "card-4": {
            "id": "card-4",
            "title": "Refine status language",
            "details": "Standardize column labels and tone across the board.",
        },
        "card-5": {
            "id": "card-5",
            "title": "Design card layout",
            "details": "Add hierarchy and spacing for scanning dense lists.",
        },
        "card-6": {
            "id": "card-6",
            "title": "QA micro-interactions",
            "details": "Verify hover, focus, and loading states.",
        },
        "card-7": {
            "id": "card-7",
            "title": "Ship marketing page",
            "details": "Final copy approved and asset pack delivered.",
        },
        "card-8": {
            "id": "card-8",
            "title": "Close onboarding sprint",
            "details": "Document release notes and share internally.",
        },
    },
}


def connect_db(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db(db_path: Path) -> None:
    with connect_db(db_path) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS boards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL UNIQUE,
                board_json TEXT NOT NULL,
                version INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )


def ensure_user(db_path: Path, username: str) -> int:
    with connect_db(db_path) as connection:
        existing = connection.execute(
            "SELECT id FROM users WHERE username = ?", (username,)
        ).fetchone()
        if existing:
            return int(existing["id"])

        cursor = connection.execute(
            "INSERT INTO users (username) VALUES (?)",
            (username,),
        )
        connection.commit()
        return int(cursor.lastrowid)


def ensure_board(db_path: Path, user_id: int) -> None:
    with connect_db(db_path) as connection:
        existing = connection.execute(
            "SELECT 1 FROM boards WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        if existing:
            return

        connection.execute(
            "INSERT INTO boards (user_id, board_json, version) VALUES (?, ?, 1)",
            (user_id, json.dumps(DEFAULT_BOARD_DATA),),
        )
        connection.commit()


def get_board_snapshot(db_path: Path, user_id: int) -> dict[str, Any] | None:
    with connect_db(db_path) as connection:
        row = connection.execute(
            "SELECT board_json, version, updated_at FROM boards WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        if not row:
            return None

        return {
            "board": json.loads(str(row["board_json"])),
            "version": int(row["version"]),
            "updated_at": str(row["updated_at"]),
        }


def save_board_snapshot(
    db_path: Path,
    user_id: int,
    board_data: dict[str, Any],
    expected_version: int | None = None,
) -> dict[str, Any]:
    with connect_db(db_path) as connection:
        current = connection.execute(
            "SELECT version FROM boards WHERE user_id = ?",
            (user_id,),
        ).fetchone()

        if not current:
            connection.execute(
                "INSERT INTO boards (user_id, board_json, version) VALUES (?, ?, 1)",
                (user_id, json.dumps(board_data)),
            )
            connection.commit()
            return {
                "version": 1,
                "updated_at": connection.execute(
                    "SELECT updated_at FROM boards WHERE user_id = ?",
                    (user_id,),
                ).fetchone()["updated_at"],
            }

        current_version = int(current["version"])
        if expected_version is not None and expected_version != current_version:
            raise ValueError(
                f"Version mismatch. Expected {expected_version}, found {current_version}."
            )

        next_version = current_version + 1
        connection.execute(
            """
            UPDATE boards
            SET board_json = ?, version = ?, updated_at = datetime('now')
            WHERE user_id = ?
            """,
            (json.dumps(board_data), next_version, user_id),
        )
        connection.commit()

        updated_row = connection.execute(
            "SELECT updated_at FROM boards WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        return {"version": next_version, "updated_at": str(updated_row["updated_at"])}
