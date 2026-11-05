# Rajagiri Hospital Care Companion

Rajagiri's independent patient-tablet, nursing-recorder, department-dashboard and account-management application.

## Production

- Site: https://care.woyz.in/
- Repository: https://github.com/drgigy/care-companion-clone-20261014
- Firebase: `care-companion-mumbai-20261014`
- Firestore and Cloud Functions region: `asia-south1` (Mumbai)

This project must never deploy to the separate Aster project. The public web configuration is in `config.js`; `.firebaserc` and `firebase.json` retain the Rajagiri target. Private AI credentials stay in Secret Manager.

## Pages and access

- `index.html`: assigned room/tablet account; Malayalam startup, multilingual live conversation, red Start / orange Stop, request tracking and bedside completion.
- `nursing-bot.html`: enabled Staff accounts record, transcribe, review/edit, then send a request for any dictated room. No request is written until Send.
- `dashboard.html`: Staff see their own nursing submissions and assigned tablet requests. Administrators see all requests.
- Eight `*-dashboard.html` pages: category-specific queues; Department Admins access their own department.
- `log.html`: request history within the same role/assignment scope.
- `master-admin.html`: protected Master Admin account management, room assignments, enable/disable and private password-setup links.

Master Admin authorization is a private server-managed `adminAccess/{uid}` record. It is separate from the `administrator` profile role used for the hospital-wide dashboard. Tablet room assignments are managed centrally; local Settings manage ward, display, patient context and PIN.

## Local verification

Run `zsh CHECK.command` for syntax and offline regression checks. Runtime dependencies live in `functions/` (`npm ci --prefix functions`).

For a safe preview use `python3 tools/mock-preview.py` and open http://127.0.0.1:8879/tools/mock.html. The server substitutes invented demo accounts and a fake recorder; its CSP blocks external connections. Never use production Firebase for test fixtures.

Firestore rule tests use project `demo-rajagiri-admin` and the local emulator at `127.0.0.1:8088`. Run `tests/admin-rules.mjs` and `tests/migration-emulator.mjs` only against that emulator.

## Publishing

Pushing `main` publishes the explicit frontend file list through GitHub Pages. Deploy rules and required callable functions explicitly to `care-companion-mumbai-20261014`. Preserve existing users and requests. Never replay historical Aster account migrations or request cleanup.

The November 2026 update was adapted from the supplied Aster source snapshot `b89832701bd4cfe2d3e267c0b40280220a133171`, retaining Rajagiri identity, red styling, configuration and existing data. Some source modules/tests retain compatibility with the older nursing voice flow; the active nursing page uses recording and transcription.

## Room Allocation and multi-request nursing dictation

`room-allocation.html` is a read-only live board for rooms 301–330. The dedicated `departmentAdmin / roomAllocation` login and hospital Administrators can view it. Rooms without a report display **Ready for occupancy** in green, as requested. This is a display default; it does not create a nursing report. Statuses are occupied (red), awaiting discharge (orange), discharge tomorrow (blue), vacated/awaiting cleaning (light grey) and ready for occupancy (green).

Only enabled Staff accounts through the nursing callable can change room status. Patient tablets retain eight categories and cannot submit Room Allocation updates. Department accounts cannot directly write board data.

The nursing recorder accepts several requests for one room, requests for several rooms, and mixed care/status dictation. Every request is reviewed as a separate editable room/department/request row; allocation rows additionally require a status. A submission contains 1–30 rows and commits atomically. Ordinary care may reference any valid room; allocation rooms are restricted to 301–330. Duplicate allocation statuses for the same room require correction before sending. Stable recording IDs prevent duplicate requests and prevent old retries from reverting newer room reports.

Room status and immutable report records are stored separately from the ordinary service queue. The private `nursingBatches` ledger enforces retry safety. `tests/room-allocation.mjs` checks validation, routing, roles and retries; `tests/room-allocation-emulator.mjs` checks actual transactions and Firestore rules in the local demo emulator only.
