# Jadual Pemandu 1.2.0

Production: https://jadualpemandu-223c0.web.app

The existing Firebase Auth UID for mhafize@jkr.gov.my is the only trusted
administrator. The browser cannot create or edit role documents directly.
Account creation, email changes, disabling and vehicle assignments use callable
Cloud Functions. No service account key belongs in the repository or browser.

## Deployment

Requires Firebase project access and the Blaze billing plan for Cloud Functions.
Use Node.js 22 and an authenticated Cloud Shell or Firebase CLI environment.

1. Install backend dependencies: `npm install --prefix functions`.
2. Verify the existing admin and migrate vehicle assignments:
   `node scripts/bootstrap-admin.cjs` (Application Default Credentials required).
3. Run `npm test --prefix functions`.
4. Deploy backend and rules before the UI:
   `firebase deploy --only functions,firestore:rules --project jadualpemandu-223c0`.
5. Deploy the UI:
   `firebase deploy --only hosting --project jadualpemandu-223c0`.
6. Verify admin creation/edit/disable flows and supervisor access on production.

Do not deploy the UI alone before the functions are available. Do not upgrade
billing without the project owner's approval. GitHub pushes do not deploy
Firebase automatically in this repository.

## Accounts

Admin uses Pengurusan Penyelia to create or edit a supervisor and select vehicles.
Temporary passwords are returned once to the admin, never stored in Firestore.
The supervisor must change the password through the app before writing bookings.
Disabling updates both Authentication and the profile checked by Firestore rules.
Old sessions are revoked on account changes. Existing bookings remain intact.
Password reset emails are sent only when the admin explicitly clicks and confirms.

Users and vehicles remain in the existing Firebase project. A failed account
update may leave its profile disabled; the admin should retry that existing row.
If initial password delivery fails, use the reset-email action on the new row.

Local preview: `node preview-server.cjs`, then http://127.0.0.1:5187.
Preview data is in-memory only and never writes to Firebase.
Use `?live=1` locally to inspect the real login UI (subject to Auth domain settings).
