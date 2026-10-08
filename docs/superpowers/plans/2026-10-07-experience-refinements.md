# Experience map and concert reading implementation plan

> **For agentic workers:** Use superpowers:executing-plans for the root tasks. Independent backend and search/date domains are dispatched under superpowers:dispatching-parallel-agents. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Execute the user's latest consolidated changes and add clearly fictional demo experiences, without altering My artists or integrating QQ Music.

**Architecture:** Existing memories/publication records remain the sole note model. Concert detail directly renders the existing full StoryCard instead of song-summary entry cards; legacy additional memories remain accessible without merging or deleting data. Map overview derives the densest personal region, uses permission-aware photo selections, and keeps the engine camera stable under ordinary filters. Existing warm choice popovers provide 7-day/1-month/2-month future ranges. Search/date fixes are isolated from map/data work.

**Tech Stack:** React/TypeScript/MapLibre, existing CSS/icons/assets, FastAPI/SQLAlchemy/SQLite, Node/jsdom and pytest.

**Spec:** User-approved consolidated requirements in this conversation and final execution request on 2026-10-07. This supersedes the earlier card-freeze prompt only for the specified date/header/Tag behaviors and concert reading organization.

## Global constraints

- Work on the current main checkout; preserve all prior edits, Figma/Word files, drafts, records and publications. No push/commit/remote write requested.
- Do not modify My artists' follow control, ownership, follow/unfollow logic or list membership.
- QQ Music collection integration remains deferred; current collection remains truthful local-project functionality.
- Own photos > other listeners' published photos ranked by actual reads > existing sourced artist/reference fallback. Do not falsely label an unverified reference image as official.
- No fake counts, songs, audio, performance dates, attendance or real-user posts. New fictional stories are demo-account-only and explicitly labeled.
- Private originals/photos never enter another account's map or public content; revocation/deletion invalidates public photos.
- Do not merge old per-song notes destructively, or enforce a new unique-note database rule. Show a complete primary note immediately; keep older notes reachable.
- Reuse existing full card/gallery/player/editor. No new notebook data model or decorative generic venue cover.

## Review focus

- Account changes during photo/memory reads, including pending requests and withdrawn publications.
- Densest region ties, no known coordinates, no personal records, explicit city/event links and manual camera gestures.
- Chinese IME composition, browser Back, query filters and valid-date inference without inventing imprecise dates.
- One/zero/multiple concert memories: immediate complete reading, existing editing and permission paths, no data loss.
- Calendar-month boundary selection and saved/unsaved playlist controls without extra post-save layout.

### Task 1: Search, dates and header refinements

**Owner:** search_dates_and_tags agent. Files: MemoryPages, PublicPages, StoryCard, StoryContent, memoryClient, memoryPresentation; isolated memoryDates/readingRefinements CSS and tests.

**Interfaces:** StoryCard adds `headingLevel?: 'h1'|'h2'`; helper exports `memoryLifeDate`, `memoryYear`, `memoryDateLabel`.

- [x] Watch failing integration tests for result nesting, Chinese composition, date dedup/year inference, public Tag destinations and automatic search mode.
- [x] Implement isolated fixes, pale anchored suggestions, remove mode/tag banner UI, and remove intro photo/header strip.
- [x] Run focused tests and build; report changed behaviors for old tests.

### Task 2: Demo records and permission-aware map photos

**Owner:** record_samples_and_map_photos agent. Files: backend models/database/stories/event samples/new map_photos module and tests. Root registers the endpoint in main.py.

**Interfaces:** GET `/api/footprints/photos` -> `{photos:[{event_id,url,source:'mine'|'public',memory_id,author_name,is_demo_sample,views}],ranking:'views_then_recent'}`. `install_map_photos(app,get_db,get_optional_user)`.

- [x] Watch failing tests for own-photo priority, real view ranking, account/privacy boundaries, additive sample seeding and restart protection.
- [x] Add 6 personal + 8 public fictional concert experiences, real catalog associations, unavailable rather than fake audio, idempotent receipts and preserved older records.
- [x] Add actual successful-public-read counts and photo selection endpoint; run backend suite.

### Task 3: Personal region and stable map

**Owner:** root. Files: personalMap.ts/useMapPhotos.ts, AtlasMap, FootprintsPage, personalMap.css, isolated tests.

**Interfaces:** `personalOverview(events,cities)` yields a geographic cluster with center/bounds/event IDs, counting distinct concerts rather than number of cards. Photo identity selects per-event owner/public data, then the existing credited reference source when available.

- [x] Add failing tests for dense personal region, distant outliers/ties, photo priority and calendar future windows.
- [x] Use region bounds on initial My experience entry; do not recenter for All/artist/search or late reads after a manual pan. Keep explicit city/reset navigation intentional.
- [x] Fill marker circles fully, crop baked avatar rings at the container, distinguish past/upcoming with meaningful border/color, reserve constant search icon/text/close-slot geometry, stabilize city/national sheet dimensions.
- [x] Reuse ChoicePicker for future 7 days/1 month/2 months and preserve URL/back context.

### Task 4: Immediate full concert memory and compact collection

**Owner:** root. Files: EventRecords, FootprintsPage/concertJournal CSS, ConcertPlaylist; focused tests and old affected test expectations.

- [x] Watch failing tests for directly readable full memory and absence of post-save extras.
- [x] Render first full existing personal StoryCard immediately, keep extra legacy memories in a small disclosure, render real public content when no personal note. Preserve full-detail/edit routes.
- [x] Compact artist/title/date/venue header, remove duplicate small artist/city and attendance button from this page only. Attendance data remains independent.
- [x] Collection control shows heart/status only; same button cancels, no visible Cancel text/new metadata/view-list blocks. Version update stays in existing playlist page rather than in the concert panel.

### Task 5: Integration and visual acceptance

- [x] Run frontend suite, backend suite, production build, and diff checks. Update superseded tests without weakening privacy/data-loss checks.
- [x] Restart backend safely for additive migration/new samples; keep current user's content intact.
- [x] Browser QA mobile My map, whole-concert memory, My search/IME layout, public search and future choice popup. Save final screenshots.
- [x] Fresh read-only review, fix important findings with regression tests, report limitations and exact new sample counts.

## Progress and rulings

- User explicitly approved executing the consolidated design; this plan records implementation logistics, not a new design choice requiring another approval round.
- Existing uncommitted implementation from the first approved prompt is the starting point, not disposable work.
- Parallel tasks have disjoint file ownership; root-only map/concert modules consume their explicit APIs. Shared tests are updated by root after the agents report, not concurrently edited.
- The stored artist photo library includes licensed/reference imagery, not uniformly verified official images. Preserve provenance rather than invent an official attribution; use own/public photos whenever actually available.

## Verification and handoff 2026-10-08

- Backend: 175 tests passed. Live additive migration/sample seed loaded on restart; 6 additional private demo experiences and 8 public demo posts were added, without filling registered accounts or replacing old samples. Existing data backup: `/private/tmp/experience-refinements.i4kDWc/demo-before-expansion.db`.
- Frontend: final full suite 255 tests passed; TypeScript/Vite production build and `git diff --check` passed. Existing large-chunk and Starlette/httpx deprecation warnings remain.
- Browser: 390×844 My map shows 4 visible My photos in Shenzhen/Guangzhou; switching All keeps exact actual camera state. Open/closed search icon/input bounding boxes and font size match. Future choice popup and selected one-month URL/empty state verified. 360×640 has no horizontal overflow; search results remain outside input border and at full width.
- Whole-concert reader shows the actual full private note, photo gallery and associated music immediately. Existing private detail/reflection/delete and editor routes remain reachable. Extra legacy records stay intact in a disclosure; existing notes do not invite another per-song note.
- Independent review: two P2 findings (detail-route reachability, wheel/keyboard camera protection) reproduced and fixed with passing regressions. Root also verified My defaults back to past after public future browsing, cleared invisible stale Tag constraints, and prevented duplicate creation prompts for an existing concert note.
- Official third-choice profile pictures verified for GEM and Liu Yuxin through QQ Music public track metadata and imported from its official CDN. Other unverified library pictures remain explicitly labeled references, not official concert photos. Attribution now uses actual selected fallback images instead of crediting images replaced by My/public photos.
- Screenshots: `docs/my-experience-map-20261008.jpg`, `docs/concert-whole-memory-first-screen-20261008.jpg`, `docs/concert-whole-memory-20261008.jpg`, `docs/future-range-options-20261008.jpg`.
- My artists follow design/logic and QQ playlist integration were not changed. Existing licensed artist audio was not newly provided; no fake playback/confirmed setlist claims were added. No physical-device performance or native OS IME measurement; browser layout and composition event regression verified.
- No commit or push performed. Original Figma/Word files, previous implementation and user-created records remain in place.
