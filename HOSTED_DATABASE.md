# Hosted database setup for kaplan-language

The app automatically uses PostgreSQL on Netlify, and MySQL for local development. Google authorization is not needed for login or assessment storage.

## Deploy schema

The `@netlify/database` dependency enables Netlify's managed PostgreSQL integration. The committed migration at `netlify/database/migrations/20261106000100_application.sql` creates empty tables during deployment. No passwords, student data or recordings are included in this file.

1. Enable Netlify Database for the `kaplan-language` project (Data & Storage > Database) if it is not automatically provisioned during deployment. Netlify Database requires a supported credit-based plan and consumes usage credits; review the dashboard's billing information before enabling a paid upgrade.
2. Deploy this code. Keep `APP_SECRET` set, set `GOOGLE_ARTIFACTS=false`, and use `FRONTEND_ORIGIN=https://kaplan-language.netlify.app` for the hosted frontend.
3. Remove an explicit `DATABASE_PROVIDER=mysql` override if present, or change it to `postgres`. Netlify supplies `NETLIFY_DB_URL` automatically. Do not copy local `MYSQL_HOST=127.0.0.1` into a hosted database configuration.

The app returns a clear configuration error if the hosted database has not been provisioned. The schema alone does not create accounts; import the existing MySQL data next.

## Copy existing data once

After the schema has deployed, retrieve the production PostgreSQL connection URL from the Netlify database dashboard or the authenticated Netlify CLI. Keep it private. Set `DATABASE_URL` in your local PowerShell session (never in a committed file), then run:

```
npm run migrate:postgres
```

The script reads the local MySQL configured in `.env`, and copies all existing tabular data except sessions, plus completed recordings, into PostgreSQL in one transaction. It refuses a nonempty destination and never changes or deletes MySQL records. Keep local users from editing records during the import. Imported password hashes are unchanged; users sign in with existing passwords. Active sessions are intentionally excluded, so users sign in again. Incomplete recording uploads are not copied.

After importing, sign in on the hosted site and check results and audio before allowing students to use it. If the import fails, the PostgreSQL transaction is rolled back. Original MySQL and Google data remain available.

## Local development

Leave DATABASE_PROVIDER, DATABASE_URL and NETLIFY_DB_URL unset to keep local MySQL. Alternatively, point DATABASE_URL at a separate PostgreSQL development database. Do not point local automated tests at the production database.

## Verification and maintenance

`npm test` includes PostgreSQL schema and application tests using PGlite, a local PostgreSQL engine. `MYSQL_INTEGRATION=1` additionally enables the real local MySQL tests. Run `npm run build` and `npm run check:netlify` to verify frontend build and function packaging. Hosted provisioning and network connectivity still require a real deployment smoke test.

Manage database backups and restore options in Netlify. The local `.env`, hosted connection URL and private database exports must never be committed to GitHub. Google-generated PDF exports remain optional; normal reports and audio use the application database.
