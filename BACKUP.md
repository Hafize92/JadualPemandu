# NADI Pemandu cloud backup

Status: prepared locally, NOT activated or tested against production.

## Scope

The workflow reads the five current top-level app collections: vehicles,
bookings, access, registrationRequests, users. It preserves Firestore typed
fields, document names and timestamps in JSON, at one readTime. This is NOT
a native Firestore export. Subcollections, Firebase Authentication accounts,
passwords, Hosting assets and security rules are NOT included. If the app
adds collections, update the manifest and tests. Restoring data requires a
separate reviewed import procedure; access records alone do not restore Auth.

Files go only to Drive folder `1m_Flsq97jZwjBxxGKPd3LPL0z3m375wX`.
No personal data or backup artifacts are committed or logged by the script.
Drive MD5 and byte length must match before cleanup is attempted. Cleanup
permanently deletes only this app's marked JSON files older than 30 days,
not all files in the folder. Cleanup defaults off until explicitly enabled.

## One-time setup (not completed)

1. Keep Firebase on Spark. Do not enable billing for this setup.
2. Create a dedicated Google Cloud service account with Firestore read-only
   IAM access (`roles/datastore.viewer`), not Editor or Owner. Configure
   Workload Identity Federation for GitHub OIDC; restrict its attribute
   condition to this repository's immutable repository/owner IDs AND the
   `refs/heads/main` ref. Grant only that principal service account token access.
3. Set GitHub Actions variables `BACKUP_WIF_PROVIDER` and
   `BACKUP_SERVICE_ACCOUNT`. Never store a service account JSON key in Git.
4. Create a dedicated Google OAuth web client for backup. Enable Drive API
   and Picker API. Authorize only `https://www.googleapis.com/auth/drive.file`.
   The owner must select the existing backup folder through Google Picker
   using this SAME OAuth app, then grant offline access to obtain a refresh
   token through an authorized callback. Merely pasting a folder ID does not
   grant access. This authorization helper is not yet implemented.
5. Store the client ID, client secret and refresh token directly in GitHub
   Actions secrets: `BACKUP_DRIVE_CLIENT_ID`, `BACKUP_DRIVE_CLIENT_SECRET`,
   `BACKUP_DRIVE_REFRESH_TOKEN`. Do not send them in chat. Review OAuth app
   publishing status: external apps in Testing can have short-lived refresh
   tokens, so that mode is unsuitable for unattended long-term backups.
6. Review and merge the workflow to main, enable `BACKUP_ENABLED=true`,
   leave `BACKUP_CLEANUP_ENABLED` unset and manually run the workflow.
   Verify the resulting JSON privately, counts/types and a restore test in
   an isolated environment. Do not restore over production for testing.
7. Only after a successful test, set `BACKUP_CLEANUP_ENABLED=true`.
   Monitor failed-run notifications and confirm backups continue to arrive.

## Scheduling and cost limits

`0 13 * * *` is 21:00 Asia/Kuala_Lumpur. GitHub execution is best effort,
not a precise-time guarantee. Scheduled public-repository workflows can be
disabled after 60 days of repository inactivity. The workflow does not need
the user's PC. Turn `BACKUP_ENABLED` off to stop it.

Firestore reads count against Spark's free quota and backups consume Drive
storage. GitHub Actions usage is subject to the repository's plan/quota.
Do not authorize paid overages. Quota exhaustion may prevent a backup.
No scheduled cloud backup has been activated merely by adding these files.

References:
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://developers.google.com/workspace/drive/picker/guides/overview
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
