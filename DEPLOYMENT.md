# Jadual Pemandu 1.3.0 - Spark

Uses Firebase Hosting, Authentication email/password and Firestore only.
No Cloud Functions, service account keys, or billing upgrade is required.
Hosting predeploy copies only the five public assets to .firebase-public.

Deploy using an authenticated Firebase CLI:

```
firebase deploy --only firestore:rules,hosting --project jadualpemandu-223c0
```

The trusted administrator is the existing mhafize@jkr.gov.my account, UID
Bg6iUrQS9cg4irQ3QAtG5VFDR8E2. No other account can edit access grants.
Admin saves grants in access/{email} and assigns vehicles within the app.
Supervisor registration never grants access by itself: a verified email,
active grant and matching vehicle assignment are all required by server rules.
Disabling a grant denies new booking writes even if a session remains logged in.
Changing the grant email disables the former grant and creates a new approval;
it does not change or delete the old Authentication account.

Supervisors register with their own passwords and explicitly send verification
emails from the registration form. Existing accounts log in and verify their email.
Users change their own passwords after reauthentication. Admin can request a
password reset email, but cannot read or directly set passwords.

Legacy users documents remain read-only and no longer grant supervisor privileges.
On the first Admin login, existing supervisor profiles are imported into access
grants without overwriting approvals that already exist. Vehicle ownership is
checked inside a transaction. Admin must log in once after deployment before
existing supervisors can edit bookings.
Spark quotas apply; this deployment never attaches a billing account.

Local preview: node preview-server.cjs then http://127.0.0.1:5187.
Use ?live=1 for real Firebase login. Preview writes are in-memory only.
Tests: node tests/access-policy.test.mjs.
