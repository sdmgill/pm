# Scripts

Start and stop scripts for running the app in Docker. Run from the project root; requires a `.env` (copy `.env.example`).

- `start.sh` (Mac/Linux), `start.ps1` / `start.bat` (Windows): `docker compose up --build -d`, then `docker compose ps`. App is served at http://localhost:8000.
- `stop.sh` (Mac/Linux), `stop.ps1` / `stop.bat` (Windows): `docker compose down --remove-orphans`.

The SQLite database lives in the `pm_data` named volume, so board data survives stop/start.
