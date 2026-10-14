# Database Model

This MVP uses SQLite with one board JSON snapshot per user.

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
- password_hash: TEXT nullable (reserved for future non-demo auth)
- created_at: TEXT NOT NULL default datetime('now')

## boards

Purpose: one persisted board snapshot per user.

Columns:

- id: INTEGER PRIMARY KEY AUTOINCREMENT
- user_id: INTEGER NOT NULL UNIQUE, foreign key to users.id
- board_json: TEXT NOT NULL (serialized board payload)
- version: INTEGER NOT NULL DEFAULT 1
- updated_at: TEXT NOT NULL default datetime('now')
- created_at: TEXT NOT NULL default datetime('now')

Constraints:

- FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
- UNIQUE(user_id) ensures one board per user for MVP

## Startup behavior

On backend startup:

1. Initialize schema if database is missing.
2. Ensure demo user exists (username: user).
3. Ensure that user has one board row initialized with default board JSON.

## Access paths

- `GET /api/board` and `PUT /api/board` read and replace the board snapshot.
- `PUT` must send `expected_version`. The write is a single `UPDATE ... WHERE user_id = ? AND version = ?`, so a stale or concurrent write is rejected with HTTP 409.
- `POST /api/ai/chat` saves a validated AI board update using the same versioned write.
