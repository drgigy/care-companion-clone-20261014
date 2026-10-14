# Care Companion Clone

This is a clean clone of the Care Companion patient tablet and staff dashboard app.

The app starts in demo mode and is intentionally not bound to any existing Firebase or Firestore project. Before deploying live Firebase/Gemini functionality, create a new Firebase project, register a new web app, then replace the placeholder values in `config.js`.

## Local Demo

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open:

- `http://localhost:8765/index.html`
- `http://localhost:8765/dashboard.html`
- `http://localhost:8765/log.html`

Demo requests sync across tabs in the same browser origin.

## Live Setup Checklist

1. Create a new Firebase project.
2. Enable Firestore in Native mode.
3. Enable Firebase Authentication with Email/Password.
4. Register a new Firebase web app.
5. Replace placeholders in `config.js` and switch `mode` to `firebase`.
6. Create `.firebaserc` for the new project only.
7. Configure `functions/.env` from `functions/.env.example`.
8. Store `GEMINI_API_KEY` in Firebase Secret Manager.
9. Deploy Firestore rules and functions.
10. Push this repository to a new GitHub repository and enable GitHub Pages with GitHub Actions.

Do not commit `.env`, service-account JSON, private keys, passwords, or real patient data.
