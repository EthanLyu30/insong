# Concert memory journal implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the music map an entrance to existing personal concert memories and arrange concert details as a compact, vertical journal without redesigning memory cards.

**Architecture:** Reuse `MemoryEntry` with its existing collection variant and `.collection-page` styling context for personal previews; reuse `StoryGrid` / `StoryEntry` for public previews. Both lead to the existing detail routes and `StoryCard`. Keep map navigation URLs compatible, and stop mounting the decorative concert scene in detail mode.

**Tech Stack:** React, TypeScript, React Router, existing CSS, Node test runner / jsdom, FastAPI.

**Spec:** The user's approved highest-priority prompt in this conversation, dated 2026-10-07. Pending conflicting feedback is preserved in `docs/deferred-ui-feedback-20261007.md`.

## Global constraints

- Do not change card internals, shared card styles, detail/edit/playback/Tag behaviors.
- `MemoryEntry`: used by personal collection and song memories; export only its existing component, without changing its rendering.
- `StoryEntry` / `StoryGrid`: used by Discover, themes and song public lists; reuse the Discover variant.
- `StoryCard`: used by private and public detail pages; leave untouched.
- Attendance, saved playlists and linked memories remain separate data sources. Private records never enter public previews.
- Do not fabricate photos, audio, setlists, authors or events, or add a second note data model.
- Keep existing three-part navigation and safe-area allowance. QQ Music collection integration remains deferred.
- Work in the current `main` checkout, preserving unrelated files. No push or remote mutation is part of this request.

## Review focus

- Single private memory, including multiple photographs: one unchanged summary with its existing full-detail link.
- Guest / no personal memories: small truthful hint, no private API read, and public records still available.
- Own published memory: appears in My only, not duplicated among other listeners.
- Switch event/account while reads are pending: no stale private records, stale errors or attendance assumptions.
- Deep links and map back navigation: exact event/date and existing filters survive; small screens retain reachable actions.

### Task 1: Existing-card concert journal

**Files:** `frontend/src/EventRecords.tsx`, `frontend/src/FootprintsPage.tsx`, `frontend/src/concertJournal.css`, export in `frontend/src/MemoryPages.tsx`, `frontend/tests/concert-journal.test.mjs`, existing footprint integration test.

**Interfaces:** `EventRecords({eventId,next,children})` consumes existing event-filtered memories/stories APIs. Its children slot holds optional authentic event/song information between My and public memories.

- [x] Write and run failing integration tests for simultaneous My/public sections, unchanged summary links, guest privacy, own-public de-duplication and event switching.
- [x] Export `MemoryEntry` without changing its JSX; use existing styling contexts. Replace the scene/song drawer with compact event header and vertical sections. Put existing song/player/collection capabilities in a disclosure after My.
- [x] Update old scene-layout expectations to test the new journal while keeping audio, attendance, collection, exact-date and return-path checks.
- [x] Run focused tests and production build; expect success.

### Task 2: Personal-first map

**Files:** `frontend/src/personalConcerts.ts`, `frontend/src/usePersonalConcerts.ts`, `frontend/src/FootprintsPage.tsx`, focused tests.

**Interfaces:** Personal data returns existing `Memory[]` and explicitly attended event IDs. Filtering uses their union only for membership, not for asserting attendance or collection.

- [x] Write and run failing tests: signed-in default shows personal events, unrelated saved/followed events are not inferred, explicit All/artist links still browse public events, late account reads are discarded.
- [x] Add a personal experience scope with all months by default, keeping All, saved and followed scopes separately accessible. Keep tiny real counts and honest empty/error states.
- [x] Run frontend suite, targeted backend permission tests and build; expect success.

### Task 3: Cross-page and single-memory verification

- [x] Check the same personal summary on My and the concert journal, plus public previews on Discover/journal; no internal CSS differences or extra cover.
- [x] Capture the existing single-memory demo event on mobile; inspect small viewport and no-memory/guest states.
- [x] Review the complete diff. Record outcomes here and report exactly which shared-card file was touched.

## Execution notes

- 2026-10-07: Current tracked tree clean at `fa4463b`; unrelated Figma/Word documents preserved.
- Ruling: User explicitly approved the supplied prompt and immediate implementation; proceed inline without a further design approval pause.
- Ruling: Only export the existing `MemoryEntry`; no shared JSX/style/interaction changes. Existing CSS requires its `.collection-page` container to retain the confirmed collection variant.
- Cross-page browser verification additionally required the existing `.timeline-year` ancestor: without it, shared CSS would apply 30px bottom padding instead of the timeline's 15px. The journal now reuses that context; only its external stack decoration/spacing is removed. Browser-confirmed padding, borders, radius, shadow, image ratio and title typography match. Public card styles match Discover as well.
- Final independent read-only review found two P2 issues: restore personal itinerary scroll after loaded rows return, and expose personal loading/error/retry in city panels. Both reproduced in integration verification and fixed; focused suite 6/6 passed afterward.
- Verification: full frontend suite 234/234 passed; targeted backend permission/event-record/interests/playlist tests 36/36 passed; TypeScript/Vite production build passed. Existing large-chunk and Starlette deprecation warnings remain, without related dependency changes.
- Browser: existing private sample memory `/memories/19` and public sample `/stories/20` checked. 390×844 single-memory screenshot saved; 360×640 has no horizontal overflow and retains the one real summary and existing detail/edit paths.
- Review boundaries: no physical-device performance or third-party artist audio/QQ collection verification; those capabilities were not changed. Returning from the journal remounts the map engine; route filters and itinerary scroll are verified, but arbitrary user-panned camera position is not preserved by this task. The earlier camera/motion feedback remains explicitly deferred rather than claimed complete.
- No shared card rendering, shared styles, full-detail components or Tag routing were modified. `MemoryPages.tsx` changed only by adding `export` to `MemoryEntry`. No commit or push performed; local services remain running.
