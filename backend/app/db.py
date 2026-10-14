import hashlib
import hmac
import json
import os
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


EMPTY_BOARD_DATA: dict[str, Any] = {
    "columns": [
        {"id": "col-backlog", "title": "Backlog", "cardIds": []},
        {"id": "col-discovery", "title": "Discovery", "cardIds": []},
        {"id": "col-progress", "title": "In Progress", "cardIds": []},
        {"id": "col-review", "title": "Review", "cardIds": []},
        {"id": "col-done", "title": "Done", "cardIds": []},
    ],
    "cards": {},
}


def connect_db(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def check_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        _, salt_hex, digest_hex = stored.split("$")
    except ValueError:
        return False
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1
    )
    return hmac.compare_digest(digest.hex(), digest_hex)


def _create_boards_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS boards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL DEFAULT 'My Board',
            board_json TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    connection.execute("CREATE INDEX IF NOT EXISTS idx_boards_user ON boards(user_id)")


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
        existing_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(boards)")
        }
        if existing_columns and "name" not in existing_columns:
            # Single-board-per-user schema: rebuild without the UNIQUE(user_id) constraint.
            connection.execute("ALTER TABLE boards RENAME TO boards_old")
            _create_boards_table(connection)
            connection.execute(
                """
                INSERT INTO boards (id, user_id, name, board_json, version, updated_at, created_at)
                SELECT id, user_id, 'My Board', board_json, version, updated_at, created_at
                FROM boards_old
                """
            )
            connection.execute("DROP TABLE boards_old")
        else:
            _create_boards_table(connection)


def ensure_user(db_path: Path, username: str, password: str | None = None) -> int:
    """Return the user's id, creating the user if missing. A password is applied only
    when the user has none yet."""
    with connect_db(db_path) as connection:
        existing = connection.execute(
            "SELECT id, password_hash FROM users WHERE username = ?", (username,)
        ).fetchone()
        if existing:
            if password and not existing["password_hash"]:
                connection.execute(
                    "UPDATE users SET password_hash = ? WHERE id = ?",
                    (hash_password(password), existing["id"]),
                )
                connection.commit()
            return int(existing["id"])

        cursor = connection.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, hash_password(password) if password else None),
        )
        connection.commit()
        return int(cursor.lastrowid)


def create_user(db_path: Path, username: str, password: str) -> int:
    with connect_db(db_path) as connection:
        try:
            cursor = connection.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (username, hash_password(password)),
            )
        except sqlite3.IntegrityError as exc:
            raise ValueError("Username already taken") from exc
        connection.commit()
        return int(cursor.lastrowid)


def get_user_id(db_path: Path, username: str) -> int | None:
    with connect_db(db_path) as connection:
        row = connection.execute(
            "SELECT id FROM users WHERE username = ?", (username,)
        ).fetchone()
        return int(row["id"]) if row else None


def verify_user(db_path: Path, username: str, password: str) -> int | None:
    with connect_db(db_path) as connection:
        row = connection.execute(
            "SELECT id, password_hash FROM users WHERE username = ?", (username,)
        ).fetchone()
    if row and check_password(password, row["password_hash"]):
        return int(row["id"])
    return None


def check_user_password(db_path: Path, user_id: int, password: str) -> bool:
    with connect_db(db_path) as connection:
        row = connection.execute(
            "SELECT password_hash FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    return bool(row) and check_password(password, row["password_hash"])


def change_password(db_path: Path, user_id: int, new_password: str) -> None:
    with connect_db(db_path) as connection:
        connection.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(new_password), user_id),
        )
        connection.commit()


def delete_user(db_path: Path, user_id: int) -> None:
    with connect_db(db_path) as connection:
        connection.execute("DELETE FROM users WHERE id = ?", (user_id,))
        connection.commit()


def ensure_board(db_path: Path, user_id: int) -> None:
    """Make sure the user has at least one board (seeded with the demo content)."""
    with connect_db(db_path) as connection:
        existing = connection.execute(
            "SELECT 1 FROM boards WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        if existing:
            return

        connection.execute(
            "INSERT INTO boards (user_id, board_json, version) VALUES (?, ?, 1)",
            (user_id, json.dumps(DEFAULT_BOARD_DATA)),
        )
        connection.commit()


def create_board(
    db_path: Path, user_id: int, name: str, board_data: dict[str, Any] | None = None
) -> int:
    with connect_db(db_path) as connection:
        cursor = connection.execute(
            "INSERT INTO boards (user_id, name, board_json, version) VALUES (?, ?, ?, 1)",
            (user_id, name, json.dumps(board_data or EMPTY_BOARD_DATA)),
        )
        connection.commit()
        return int(cursor.lastrowid)


def list_boards(db_path: Path, user_id: int) -> list[dict[str, Any]]:
    with connect_db(db_path) as connection:
        rows = connection.execute(
            "SELECT id, name, updated_at FROM boards WHERE user_id = ? ORDER BY id",
            (user_id,),
        ).fetchall()
    return [
        {"id": int(r["id"]), "name": str(r["name"]), "updated_at": str(r["updated_at"])}
        for r in rows
    ]


def get_board_snapshot(
    db_path: Path, user_id: int, board_id: int | None = None
) -> dict[str, Any] | None:
    """Fetch a board owned by the user; with no board_id, the user's oldest board."""
    query = "SELECT id, name, board_json, version, updated_at FROM boards WHERE user_id = ?"
    params: tuple[Any, ...] = (user_id,)
    if board_id is not None:
        query += " AND id = ?"
        params += (board_id,)
    with connect_db(db_path) as connection:
        row = connection.execute(query + " ORDER BY id LIMIT 1", params).fetchone()
    if not row:
        return None

    return {
        "id": int(row["id"]),
        "name": str(row["name"]),
        "board": json.loads(str(row["board_json"])),
        "version": int(row["version"]),
        "updated_at": str(row["updated_at"]),
    }


def save_board_snapshot(
    db_path: Path,
    user_id: int,
    board_data: dict[str, Any],
    expected_version: int,
    board_id: int | None = None,
) -> dict[str, Any]:
    if board_id is None:
        snapshot = get_board_snapshot(db_path, user_id)
        if snapshot is None:
            raise LookupError("Board not found")
        board_id = snapshot["id"]

    with connect_db(db_path) as connection:
        cursor = connection.execute(
            """
            UPDATE boards
            SET board_json = ?, version = version + 1, updated_at = datetime('now')
            WHERE id = ? AND user_id = ? AND version = ?
            """,
            (json.dumps(board_data), board_id, user_id, expected_version),
        )
        if cursor.rowcount == 0:
            raise ValueError(
                f"Version mismatch. Expected version {expected_version} is not current."
            )
        connection.commit()

        row = connection.execute(
            "SELECT version, updated_at FROM boards WHERE id = ?",
            (board_id,),
        ).fetchone()
        return {"version": int(row["version"]), "updated_at": str(row["updated_at"])}


def rename_board(db_path: Path, user_id: int, board_id: int, name: str) -> bool:
    with connect_db(db_path) as connection:
        cursor = connection.execute(
            "UPDATE boards SET name = ? WHERE id = ? AND user_id = ?",
            (name, board_id, user_id),
        )
        connection.commit()
        return cursor.rowcount > 0


def delete_board(db_path: Path, user_id: int, board_id: int) -> bool:
    with connect_db(db_path) as connection:
        cursor = connection.execute(
            "DELETE FROM boards WHERE id = ? AND user_id = ?", (board_id, user_id)
        )
        connection.commit()
        return cursor.rowcount > 0
