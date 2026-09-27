# Task 2 Data Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the demo's users, songs, memory cards, tags, and sessions in SQLite with repeat-safe sample data while preserving the existing song API.

**Architecture:** SQLAlchemy models and a SQLite engine live in focused backend modules. FastAPI's lifespan creates the schema and seeds only a new database; `create_app(database_url)` lets tests use temporary files. The current song endpoints query the database without changing their response shape.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy 2.x, SQLite, pytest, React/Vite build check.

**Spec:** `docs/superpowers/specs/2026-09-27-task2-data-model-design.md`

## Global Constraints

- Work on `feat/h5-demo-mvp`; preserve the user's untracked old PRD and existing Task 1 behavior.
- Default SQLite path: `backend/data/demo.db`, ignored by Git. Do not commit database files, `.env`, tokens, or cookies.
- Six required models: `User`, `Song`, `MemoryCard`, `Tag`, `MemoryCardTag`, `Session`.
- `MemoryCard.visibility` allows only `private` / `public` and defaults to `private`.
- Seed exactly two demo users and five fictional songs; seed at least five `public` stories with `is_demo_sample=true`; never claim real user feedback.
- Keep `/api/songs` and `/api/songs/{song_id}` JSON and 404 behavior compatible with Task 1; no new story or auth API in Task 2.
- Use `backend/.venv/bin/python -m pytest`; finish with `frontend` build, `git diff --check`, exact-file staging, `feat: add demo data model` commit, and HTTPS push through the configured 7897 proxy.

## Review Focus

1. Missing `backend/data/` on a fresh checkout: startup creates it and the database; Task 2.3 test.
2. Repeated startup: no duplicate rows; Task 2.2 test.
3. Withdrawn or deleted seed story: restart does not restore it; Task 2.2 test.
4. Invalid owner/song foreign key: SQLite rejects the row; Task 2.1 test.
5. Song API accidentally keeps reading static constants: changing a stored title changes the endpoint response; Task 2.3 test.

---

### Task 2.1: Model schema and SQLite engine

**Files:** Create `backend/app/models.py`, `backend/app/database.py`, `backend/tests/test_models.py`.

**Interfaces:** `models.py` exports `Base`, `User`, `Song`, `MemoryCard`, `Tag`, `MemoryCardTag`, `Session`. `database.py` exports `DEFAULT_DB_PATH: Path`, `create_sqlite_engine(database_url: str) -> Engine`, and `initialize_database(engine: Engine) -> None` (the Seed call is added in Task 2.2). Alias SQLAlchemy's ORM session as `OrmSession` where it would conflict with the `Session` model.

- [ ] Write `test_schema_has_six_tables`: `inspect(engine).get_table_names()` contains `users`, `songs`, `memory_cards`, `tags`, `memory_card_tags`, `sessions` after `initialize_database(engine)` on `tmp_path / "test.db"`.
- [ ] Run `backend/.venv/bin/python -m pytest backend/tests/test_models.py::test_schema_has_six_tables -v` from the repository root; expect FAIL because the modules do not exist.
- [ ] Implement the six SQLAlchemy 2.x typed models with the spec's fields, relationships, foreign keys, composite card-tag primary key, UTC timestamps, a `private` default and visibility check constraint. `create_sqlite_engine` creates the SQLite file's parent directory and enables `PRAGMA foreign_keys=ON`; `initialize_database` calls `Base.metadata.create_all(engine)`.
- [ ] Add `test_card_defaults_private_and_bad_foreign_key_fails`: persist one valid card without visibility and assert `private` plus timestamps; inserting a card with unknown owner or a duplicate card-tag pair raises `IntegrityError`.
- [ ] Run `backend/.venv/bin/python -m pytest backend/tests/test_models.py -v`; expect PASS.

### Task 2.2: One-time, labeled demo Seed

**Files:** Modify `backend/app/demo_data.py`, `backend/app/database.py`; create `backend/app/seed.py`, `backend/tests/test_seed.py`.

**Interfaces:** `seed.py` exports `seed_demo_data(db: OrmSession) -> None`; it tests for seeded `Song` ID 1 and otherwise inserts all rows in the caller's single transaction. `initialize_database(engine)` opens that transaction after `create_all` and calls `seed_demo_data`.

- [ ] Write `test_seed_counts_and_labels`: initialize a temporary database, then assert 2 demo users named 小林/阿远, song IDs 1–5 with `artist="Demo Artist"`, `source_label="虚构演示曲目"` and `audio_available=False`, at least 5 `public` cards with `is_demo_sample=True`, valid story lengths, at most 3 tags each, and zero sessions.
- [ ] Run `backend/.venv/bin/python -m pytest backend/tests/test_seed.py::test_seed_counts_and_labels -v`; expect FAIL because Seed is absent.
- [ ] Add five original fictional sample stories and preset tags to `demo_data.py`; insert users, songs, tags, story cards and links in `seed_demo_data`. Store tag names without `#`; keep Song JSON fields from Task 1 unchanged.
- [ ] Write `test_seed_is_idempotent_and_does_not_resurrect`: initialize twice and compare counts; set card 1 private, delete card 2, initialize again, then assert card 1 remains private and card 2 remains absent.
- [ ] Run `backend/.venv/bin/python -m pytest backend/tests/test_seed.py -v`; expect PASS.

### Task 2.3: FastAPI startup and song API compatibility

**Files:** Modify `backend/app/main.py`, `backend/tests/test_health_and_songs.py`; create `backend/tests/test_app_database.py`.

**Interfaces:** `create_app(database_url: str | None = None) -> FastAPI` creates an app whose lifespan calls `initialize_database(engine)` and stores `app.state.session_factory`; module-level `app = create_app()` keeps `uvicorn app.main:app` working. `/api/songs` and `/api/songs/{song_id}` serialize DB-backed `Song` objects to the existing seven fields.

- [ ] Write `test_song_api_reads_persisted_data`: start `create_app` on a `tmp_path` SQLite URL, edit Song 1's title via `app.state.session_factory`, then assert `/api/songs` and `/api/songs/1` return the edited title and still expose the existing seven fields.
- [ ] Run `backend/.venv/bin/python -m pytest backend/tests/test_app_database.py::test_song_api_reads_persisted_data -v`; expect FAIL while endpoints use `DEMO_SONGS`.
- [ ] Implement app lifespan, session dependency, DB-backed song queries, and existing 404 response. Update existing endpoint tests to use temporary `create_app` instances rather than the default database.
- [ ] Add `test_fresh_database_directory_and_restart`: start from a missing nested directory, assert the database file exists, then recreate the app on the same URL and assert rows persist without duplication.
- [ ] Run `backend/.venv/bin/python -m pytest backend/tests -q` from the repository root; expect all tests PASS.
- [ ] Run `npm run build` in `frontend`; expect exit 0. Run `git diff --check`, inspect `git status --short` and `git diff --cached --name-only`, and confirm no database/secret/user PRD is staged.
- [ ] Commit only Task 2 code, tests, and plan with `git commit -m "feat: add demo data model"`; push `feat/h5-demo-mvp` and verify remote HEAD equals local HEAD. Stop without starting Task 3 if push fails.
