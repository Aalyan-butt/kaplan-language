# Kaplan English Placement

The backend runs on Node.js and Express. Netlify serves the existing frontend and runs the API as a Node.js Function.

Preserved features include student/admin accounts, Argon2 passwords, idle sessions and CSRF checks, account lockout, bulk imports, attempt allowances, writing and speaking evidence scoring, MySQL accounts, sessions, results, audit records and MP3s, optional Google Drive/Docs reports and PDF exports, teacher overrides and CSV exports.

## Run locally

Install Node.js 22 or newer, then:

```sh
npm ci
npm start
```

Open http://localhost:3000. For a new checkout, copy `.env.example` to `.env`, configure `MYSQL_*`, and run `npm run setup:mysql -- --create-admin`. The backend uses MySQL. Google authorization is not required for login or local assessment storage. Never publish `.env` or OAuth client JSON files.

## Keep existing data

See [MYSQL_GUIDE.md](MYSQL_GUIDE.md) for the one-time Google-to-MySQL migration. Existing Argon2 password hashes are preserved. Google originals are retained; sessions are not imported, so users sign in again.

## Deploy

See [DEPLOYMENT.md](DEPLOYMENT.md). The Netlify build command is `npm run build`, the publish directory is `dist`, and functions are in `netlify/functions`. Deploy through a connected repository or the Netlify CLI; uploading only the static `dist` directory does not deploy the backend.

## Verify

```sh
npm test
npm run build
```

Regression tests compare complete placement checker reports against 93 reference samples. API tests cover authentication, roles, account administration, submissions, recording chunks, reports and exports. Adapter tests exercise Netlify request routing and binary responses. Tests use an isolated in-memory store and do not change live Google data.

MySQL setup and migration are described in [MYSQL_GUIDE.md](MYSQL_GUIDE.md). Administrator password recovery uses `node scripts/reset-admin-password.mjs` against MySQL.

Run `npm run check:google` to verify OAuth, all eight Sheet header schemas and Drive upload permissions against your configured storage. This check is read-only and does not print credentials or student records.



## Project structure

```text
app/                 Node.js backend
  main.js            Express API routes and middleware
  index.js           Local server entry point
  config.js          Environment configuration
  models.js          Request validation
  service.js         Account and session logic
  security.js        Password hashing and tokens
  store.js           Google Sheets storage
  checker.js         Placement scoring
  lessons.js         Lesson bank
  workspace.js       Google Drive and report generation
  submissions.js     Recording validation and submissions
scripts/             Node.js setup, checks and build tools
tests/               Node.js tests and reference data
netlify/functions/   Netlify API entry point
index.html           Frontend
```
