# Clone Status

Prepared on 2026-10-14.

## Completed

- Copied the app source into a clean repository root.
- Preserved GitHub Pages workflow, Firebase rules, functions, tests, and assets.
- Created new Firebase project `care-companion-mumbai-20261014`.
- Created Firestore Native database `(default)` in `care-companion-mumbai-20261014` with location `asia-south1`.
- Deployed Firestore rules to the new project.
- Created Firebase Web app `Care Companion Web`.
- Updated `config.js` and `.firebaserc` so the clone points at the new Firebase project only.
- Deleted the accidentally created `nam5` Firestore database from `care-companion-clone-20261014`.

## Pending Account-Specific Work

- Create a new GitHub repository.
- Configure Firebase Auth users and Firestore `profiles` documents.
- Store the Gemini API key in Secret Manager.
- Configure `functions/.env` and deploy functions.
- Enable GitHub Pages.
