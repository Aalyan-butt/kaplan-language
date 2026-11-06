# Current storage: PostgreSQL

The application uses PostgreSQL for accounts, sessions, results, audit records and recordings. Follow [HOSTED_DATABASE.md](HOSTED_DATABASE.md). Run `node scripts/reset-admin-password.mjs` to reset a PostgreSQL administrator password. Google authorization is not required for this operation.

The Google instructions below are retained for legacy imports and optional Drive/Docs integrations. `setup-google.mjs` manages the legacy Google storage; it does not create PostgreSQL accounts.

# Administrator guide

Start locally with `npm ci` and `npm start`, then open http://localhost:3000. On Netlify, sign in at your site's URL. Existing accounts and passwords remain valid when using the same Google storage.

Administrators can create or bulk import students, edit accounts, enable/disable accounts, reset passwords, adjust attempts, inspect results and recordings, download PDF/CSV reports and save teacher placement overrides. A password reset revokes that user's sessions. A password change keeps the current session and revokes the others.

## New Google installation only

Existing deployments should reuse their current `.env` and skip storage setup.

For a fresh installation, create a Google Desktop OAuth client, enable the Google Sheets and Drive APIs, download the client JSON, and run:

```sh
node scripts/setup-google.mjs --client-secrets path/to/client_secret.json
```

Open the authorization URL printed by the script and grant access. The script creates the Sheet, tabs, lesson bank and Drive folder, saves configuration to the ignored local `.env`, and prompts for the first administrator's name, email and password. Password input is hidden in an interactive terminal; passwords and OAuth tokens are not printed. Transfer the required environment variables to Netlify through its environment settings.

If valid Google configuration already exists, `node scripts/setup-google.mjs` preserves the current storage and checks whether an administrator exists. It only prompts to create one if no active administrator is found.

## Recover an administrator

Run locally with the existing Google environment configuration:

```sh
node scripts/reset-admin-password.mjs
```

Enter the administrator's email and new password when prompted. The script updates the Argon2 hash, clears lock state, revokes sessions and records an audit event. It does not print or store the plaintext password.

## Scoring

The deterministic British English checker retains `rules-1.0` and `kaplan-1.0`. Speaking automation measures recording evidence only. A teacher must judge pronunciation, fluency, spoken word accuracy, relevance and final placement.


## Expired or revoked Google authorization

`invalid_grant` with "Token has been expired or revoked" means the backend cannot access Google storage; it does not mean the placement account password is incorrect.

Run `node scripts/setup-google.mjs --reconnect` using the existing `.env`. Open the printed URL and authorize with the Google account that can access the existing storage. The command saves replacement OAuth credentials while preserving storage IDs and existing accounts. Restart the local app. For Netlify, also update `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN` in the hosting environment and redeploy; local `.env` changes do not update hosting.

Before reconnecting, check Google Cloud Console > Google Auth Platform > Audience. External apps in Testing receive refresh tokens that expire after seven days for the scopes used here. Move the app to In production, completing any Google requirements, then reconnect to obtain a new token. Production tokens can still be revoked; this removes the Testing seven-day expiry, not all possible revocation.

After reconnecting, run `npm run check:google`, then `node scripts/reset-admin-password.mjs` if a password reset is needed.
