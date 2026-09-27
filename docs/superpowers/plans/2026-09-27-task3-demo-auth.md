# Task 3 Demo Auth and Privacy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add switchable demo identities backed by server sessions, and prove private memory reads are enforced by the backend.

**Architecture:** Keep session creation, lookup, revocation and memory visibility in `backend/app/auth.py`; expose only small HTTP routes in the existing app factory. The H5 asks `/api/me` for identity and uses Cookie-bearing API requests; it never treats a local user ID as proof of identity.

**Tech Stack:** FastAPI, SQLAlchemy 2, SQLite, pytest/TestClient; React 19, TypeScript, Vite, Node 24 built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-27-task3-demo-auth-design.md`

## Global Constraints

- Work only on `main`; preserve the untracked old PRD and all ignored local data.
- Demo identities are exactly ID 1 小林 and ID 2 阿远 with `is_demo=true`; guest has no session. This is not production authentication.
- Sessions are 256-bit random values, SHA-256 digests in `Session.id`, 24-hour server expiry; Cookie: `HttpOnly`, `SameSite=Lax`, `Path=/`, 24-hour `Max-Age`, `Secure` only for HTTPS.
- Nonexistent and unreadable private cards share HTTP 404 and `这段音乐记忆已经不可见。`; no Task 4–6 creation, list, search or sharing UI.
- Do not add a package-manager migration, third-party music assets, secrets, DB files or the user’s old PRD to commits.

## Review Focus

- Invalid/non-demo `user_id` (including an existing non-demo user) must not create a session or discard an already valid one: Task 1 tests.
- An old copied Cookie after switching or logout must not authenticate, even in another client: Task 1 tests.
- Forged/expired session, or one with a missing expiry, must resolve to guest without a server error: Task 1 tests.
- A memory ID outside SQLite’s signed 64-bit range must return the same 404, not 500: Task 2 test.
- A public card must remain readable by guest while a private card’s direct URL reveals nothing to guest or another user: Task 2 tests.

---

### Task 1: Database-backed demo sessions

**Files:** Create `backend/app/auth.py`, `backend/tests/test_demo_auth.py`; modify `backend/app/main.py` (dependencies and three routes). Keep the existing `Session` model.

**Interfaces:** `auth.py` exports `SESSION_COOKIE_NAME: str = "song_memory_session"`, `SESSION_LIFETIME_SECONDS: int = 86400`, `create_session(db: OrmSession, user: User) -> str`, `resolve_user(db: OrmSession, raw_token: str | None) -> User | None`, `revoke_session(db: OrmSession, raw_token: str | None) -> None`, and `require_user(user: User | None) -> User` (401 for guest). `main.py` defines reusable `get_optional_user` dependency from the Cookie and `get_required_user` dependency via `require_user`. Public response: `{"user": {"id": 1, "display_name": "小林", "is_demo": true}}` or `{"user": null}`. Invalid demo selection returns 400; malformed request JSON returns 422.

- [ ] **Step 1: Write failing HTTP tests** in `test_demo_auth.py`: `test_guest_and_login` asserts `GET /api/me == {"user": None}` then login ID 1 is 200 and `/api/me` names 小林; `test_cookie_flags` asserts `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=86400`, no `Secure` on HTTP and `Secure` on HTTPS; `test_logout` asserts 204 and guest.
- [ ] **Step 2: Run** `cd backend && pytest -q tests/test_demo_auth.py`; expect route-not-found failures.
- [ ] **Step 3: Implement** the named service functions and routes. Generate `secrets.token_urlsafe(32)`, store only `sha256(token).hexdigest()`, reject IDs other than 1/2 or users lacking `is_demo`; normalize SQLite-loaded naive datetimes to UTC before checking expiry. Revoke the current Cookie only after validating the new selection. Set/delete Cookie on the response, with `secure=request.url.scheme == "https"`.
- [ ] **Step 4: Add and run edge tests**: `test_invalid_selection_keeps_session` asserts 400 for 0/3/non-demo and 422 for malformed JSON, with A still current; `test_client_isolation_and_revocation` asserts client B stays guest and copied old Cookies become guest after switch/logout; `test_restart_and_bad_sessions` asserts restart preserves a valid session while forged/expired/null-expiry sessions become guest. Assert `len(Session.id) == 64` and `Session.id != cookie_value`. Run `cd backend && pytest -q tests/test_demo_auth.py`; expect all pass.
- [ ] **Step 5: Commit** only this task’s files with `feat: add demo sessions`.

### Task 2: Private memory read boundary

**Files:** Modify `backend/app/auth.py` and `backend/app/main.py`; create `backend/tests/test_memory_read.py`.

**Interfaces:** `auth.py` exports `can_read_memory(card: MemoryCard, user: User | None) -> bool`: public is readable by anyone; private only when `user.id == card.owner_id`. `GET /api/memories/{memory_id}` uses Task 1’s `get_optional_user`, returns `id`, `owner_id`, `owner_display_name`, `song_id`, `story`, `tags: list[str]`, `life_time`, `scene`, `visibility`, `is_demo_sample`, `created_at`, `updated_at`.

- [ ] **Step 1: Write failing tests**: `test_private_card_direct_url` changes seeded card 1 to private; A gets 200 with story/tags while B and guest get identical `404 {"detail":"这段音乐记忆已经不可见。"}`. `test_public_card` asserts A/B/guest each get 200 and `owner_id == 2`, `song_id == 2`; `test_missing_and_overflow` asserts 404 with that same detail for 999 and `9223372036854775808`.
- [ ] **Step 2: Run** `cd backend && pytest -q tests/test_memory_read.py`; expect route-not-found failures.
- [ ] **Step 3: Implement** `can_read_memory` and the route. Guard the signed 64-bit ID before `db.get`; serialize only the listed fields, with tag names and ISO timestamps. Do not expose session fields.
- [ ] **Step 4: Run** `cd backend && pytest -q tests/test_memory_read.py tests/test_demo_auth.py`; expect all pass.
- [ ] **Step 5: Commit** only this task’s files with `feat: enforce memory read privacy`.

### Task 3: H5 identity switcher and end-to-end verification

**Files:** Create `frontend/src/demoAuth.ts`, `frontend/src/DemoAccountSwitcher.tsx`, `frontend/tests/demoAuth.test.mjs`; modify `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/styles.css`, `frontend/package.json`.

**Interfaces:** `demoAuth.ts` exports `DemoUser = { id: number; display_name: string; is_demo: boolean }`, `DemoIdentity = { user: DemoUser | null }`, `getDemoIdentity(baseUrl: string, request?: typeof fetch): Promise<DemoIdentity>` and `switchDemoIdentity(baseUrl: string, userId: 1 | 2 | null, request?: typeof fetch): Promise<DemoIdentity>`. Both use `credentials: "include"`; switching POSTs to `/api/demo/sessions` or `/api/demo/logout`, then refreshes `/api/me`. `api.ts` exports `apiBaseUrl` for `App.tsx`. `DemoAccountSwitcher` props are `identity: DemoIdentity | null`, `loading: boolean`, `error: string`, `onSwitch: (id: 1 | 2 | null) => Promise<void>`, and `onRetry: () => void`; it renders the topbar selector and permanent demo-only label.

- [ ] **Step 1: Write failing Node tests** in `demoAuth.test.mjs`: `getDemoIdentity` returns `{user:null}` or A from `/api/me`; `switchDemoIdentity` POSTs IDs 1/2 or logout and then returns refreshed identity; every request has `credentials: "include"`; rejected login/logout throws a Chinese error. Add `"test": "node --experimental-strip-types --test tests/*.test.mjs"` to package scripts; run `zsh -lic 'cd frontend && npm test'`; expect missing module/export failures.
- [ ] **Step 2: Implement** the typed API functions in `demoAuth.ts`, with no `localStorage` use. Run `zsh -lic 'cd frontend && npm test'`; expect all pass.
- [ ] **Step 3: Add** the accessible topbar switcher and responsive styles; load identity on app start, show pending/error/retry state, and update it after switching. Guest `/memories` says to select a demo account; signed-in users still see the truthful Task 4 placeholder. Keep song browsing available to guests.
- [ ] **Step 4: Verify** `zsh -lic 'cd frontend && npm test && npm run build'`, `cd backend && pytest -q`, a manual H5 check at mobile width (guest → A → B → guest and refresh), and `git diff --check`. Inspect `git status --short` to ensure no old PRD, DB, Cookie or token is staged.
- [ ] **Step 5: Commit** the frontend, tests and this approved plan as `feat: add demo auth and privacy rules`; push `main` using the existing HTTPS/7897 setup. Confirm remote `main` matches local HEAD; if push fails, stop before Task 4.
