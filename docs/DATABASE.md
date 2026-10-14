# Database Model

SQLite with registered users and any number of named board JSON snapshots per user.

## Why this design

- It keeps implementation simple for MVP while still supporting multiple users.
- It allows fast delivery of board persistence before introducing complex relational models.
- It includes optimistic versioning fields to support safe updates as API complexity grows.

## Database location

- Default path: /data/pm.db
- Configurable with environment variable: DB_PATH
- In Docker, /data is backed by a named volume in compose for persistence across container restarts.

## Tables

## users

Purpose: user identity and future multi-user support.

Columns:

- id: INTEGER PRIMARY KEY AUTOINCREMENT
- username: TEXT NOT NULL UNIQUE
- password_hash: TEXT, `scrypt$salt$digest` (hashlib.scrypt); the demo user `user` is seeded with password `password`
- created_at: TEXT NOT NULL default datetime('now')

## boards

Purpose: named board snapshots, many per user.

Columns:

- id: INTEGER PRIMARY KEY AUTOINCREMENT
- user_id: INTEGER NOT NULL, foreign key to users.id, indexed
- name: TEXT NOT NULL default 'My Board'
- board_json: TEXT NOT NULL (serialized board payload)
- version: INTEGER NOT NULL DEFAULT 1
- updated_at, created_at: TEXT NOT NULL default datetime('now')

Constraints:

- FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE (deleting a user deletes their boards)
- `init_db` migrates the older single-board schema (UNIQUE user_id, no name) in place; existing boards are named 'My Board'.

## Startup behavior

On backend startup:

1. Initialize schema if database is missing.
2. Ensure demo user exists (username: user).
3. Ensure that user has at least one board (seeded with demo content).

New boards created through the API start empty with the five fixed columns.

## Access paths

- Auth: `POST /auth/register`, `/auth/login`, `/auth/logout`, `/auth/change-password`, `DELETE /auth/account`, `GET /auth/me`. Usernames are 3-32 chars of `[A-Za-z0-9_-]`, passwords 6-128 chars.
- Boards: `GET/POST /api/boards`, `GET/PUT/PATCH/DELETE /api/boards/{id}`, `POST /api/boards/{id}/ai/chat`. Every query is scoped to the signed-in user, so another user's board id returns 404. The last remaining board cannot be deleted (409).
- `/api/board` and `/api/ai/chat` remain as aliases for the user's oldest board.
- `PUT` must send `expected_version`. The write is a single `UPDATE ... WHERE id = ? AND user_id = ? AND version = ?`, so a stale or concurrent write is rejected with HTTP 409.
- The AI chat saves a validated board update using the same versioned write.
