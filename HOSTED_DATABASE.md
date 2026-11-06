# PostgreSQL setup

PostgreSQL is the application database both locally and on Netlify. The app uses the standard `pg` driver; it does not provision Netlify Database or require that paid feature. Google authorization is optional for Drive/Docs and is never required for login.

## Configuration

Create a PostgreSQL database using your chosen host or local PostgreSQL installation. Add its private connection URL to `DATABASE_URL` in `.env` locally and in your backend hosting environment for production. Use the TLS URL supplied by your provider; do not disable certificate verification. Keep APP_SECRET configured and set FRONTEND_ORIGIN to the frontend origin, such as https://kaplan-language.netlify.app.

The code also accepts NETLIFY_DB_URL for an existing managed database, but DATABASE_URL takes precedence. DATABASE_PROVIDER and MYSQL_* no longer select the runtime store. MYSQL_* are retained only for migration tools.

## Existing installation: preserve accounts and recordings

```
npm ci
npm run setup:postgres
npm run migrate:postgres
npm start
```

`setup:postgres` creates the tables in the selected database using `sql/postgres.sql`. It does not create the database server itself and does not erase existing records. You can alternatively import that SQL file with your provider's SQL editor.

`migrate:postgres` reads the previous local MySQL database configured by MYSQL_*, then copies accounts, unchanged Argon2 password hashes, results, settings, lessons, audit records, jobs and completed recordings into PostgreSQL in one transaction. The destination must have empty application tables; importing into a populated destination is refused. Original MySQL data is never deleted. Existing sessions and incomplete uploads are excluded; users sign in again. Keep users from editing source data during the one-time import.

Do not create an administrator before importing existing accounts. No private data or password hashes should be committed to GitHub.

## Fresh installation

```
npm ci
npm run setup:postgres -- --create-admin
npm start
```

Enter the admin email, name and password at the terminal prompts. Passwords are hashed with Argon2. This option also adds the lesson bank.

## Netlify deployment

Set DATABASE_URL, APP_SECRET, FRONTEND_ORIGIN and GOOGLE_ARTIFACTS=false in Netlify. Create the schema and import existing data before directing users to the new deployment. Then deploy the code. A PostgreSQL server on your PC is not reachable as 127.0.0.1 from Netlify; production requires a network-accessible database. Hosting, provisioning, billing and deployment are managed separately from these code changes.

The former @netlify/database package and automatic Netlify database migrations have been removed, preventing the previous unsupported-account provisioning error. Your local MySQL installation and its original records remain unchanged.

## Checks and limitations

`npm test` includes PostgreSQL integration tests using the PGlite PostgreSQL engine. To additionally run legacy MySQL tests, set MYSQL_INTEGRATION=1. Run `npm run build` and `npm run check:netlify` for frontend and function package checks. A real hosted connection is still required to verify production connectivity.

Google-generated PDFs remain an optional integration; in-app reports and recordings use PostgreSQL. Schedule database backups with your provider. Keep `.env`, connection URLs and private database exports out of GitHub.
