# MySQL setup and migration

The runtime uses MySQL for all tabular records, including users, Argon2 password hashes, sessions, results and audit logs. With `GOOGLE_ARTIFACTS=false`, audio chunks and completed recordings are stored in MySQL too. No Google request is needed to sign in.

## Local installation

1. Start MySQL and configure `.env` using the `MYSQL_*` entries in `.env.example`.
2. Run `npm ci` and `npm run setup:mysql` to create the `kaplan` database and tables. Alternatively, import `sql/schema.sql` in MySQL Workbench. The SQL file contains no passwords or student data.
3. For a fresh installation, run `npm run setup:mysql -- --create-admin` and enter the administrator details at the prompts. This seeds the lesson bank too.
4. Start with `npm start`, then open http://localhost:3000. Restart an existing Node process after changing configuration or code.

The setup script targets the default `kaplan` database. For a custom database, adjust CREATE DATABASE and USE in the SQL file before importing it and set MYSQL_DATABASE accordingly. Use a dedicated MySQL user with access only to this database for deployments. Keep passwords in `.env`, never in GitHub or schema.sql.

## Preserve existing Google accounts

For a destination with empty application tables:

```
npm run setup:mysql
npm run migrate:mysql
node scripts/migrate-google-recordings.mjs
```

The first migration reads the configured Google Sheet and imports existing records in one MySQL transaction. It refuses a populated destination to prevent accidental overwrites. Password hashes and user IDs are copied as-is; existing passwords continue to work. Sessions are excluded. The recording migration is resumable and skips audio already in MySQL. Both migrations leave Google originals unchanged. Google access is needed only during these imports.

Do not run `--create-admin` before importing an existing installation, since the destination must be empty. Back up MySQL regularly; the SQL schema alone does not contain your data.

## Optional Google features

Keep `GOOGLE_ARTIFACTS=false` to operate independently of Google. New results, recordings, scoring and account administration work with MySQL. Google Docs creation and the Google-generated PDF download are unavailable in this mode; reports remain viewable in the app. Existing Google document links still require Google access. For optional Drive/Docs features set `GOOGLE_ARTIFACTS=true` and supply valid Google configuration. Account lookup remains in MySQL in either mode.

## Verification

`npm test` runs the regression suite. To additionally exercise real MySQL persistence, login without Google configuration, uniqueness constraints and audio storage, set `MYSQL_INTEGRATION=1` and run `node --test tests/mysql.test.js`. This creates and removes a uniquely named `kaplan_test_*` database and needs a local MySQL account permitted to create test databases. It never writes to the application database.

For Netlify, use a network-accessible MySQL server. The local database on your PC is not automatically uploaded to GitHub or reachable from Netlify. See DEPLOYMENT.md.
