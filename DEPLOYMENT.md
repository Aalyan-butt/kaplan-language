# Current Netlify deployment

Use [HOSTED_DATABASE.md](HOSTED_DATABASE.md). Netlify automatically selects PostgreSQL; keep MySQL for local use. The PostgreSQL schema migration is committed under `netlify/database/migrations/`. Deploy the schema, then run the private one-time import from local MySQL. The older external-MySQL deployment instructions below are an alternative only if you explicitly select `DATABASE_PROVIDER=mysql` and configure a reachable hosted MySQL server.

# MySQL deployment requirement

The backend now uses MySQL. Configure `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` and optionally `MYSQL_SSL=true` in your hosting environment. Import `sql/schema.sql` into the target database, adjusting the database name if necessary, and migrate existing records before switching traffic. Keep `APP_SECRET` configured.

A Netlify function cannot connect to MySQL at `127.0.0.1` on your PC. Use a network-accessible MySQL host with TLS and a dedicated application account for deployment. GitHub contains source code and the empty schema, not your live local database or secrets. Back up and transfer database data separately using your MySQL administration tools.

`GOOGLE_ARTIFACTS=false` removes Google from normal operation. Optional Drive/Docs and Google-generated PDF export require `GOOGLE_ARTIFACTS=true` and working Google credentials. MySQL stores uploads and recordings durably when Google artifacts are disabled. Existing links remain in result records; use the one-time audio migration to copy legacy recordings.

The following legacy Google deployment notes apply only to the optional integration.

# Netlify deployment

## Existing installation

1. Install Node.js 22 or newer and run `npm ci`, `npm test`, `npm run build`, and `npm run check:netlify`.
2. Push this project to your Git repository, then import that repository in Netlify. `netlify.toml` supplies the build, publish and function settings.
3. Add these environment variables to Netlify with Functions access:
   - `APP_SECRET`: use your existing secret to preserve current session digests.
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`.
   - `GOOGLE_SPREADSHEET_ID`, `GOOGLE_DRIVE_FOLDER_ID`: use your current storage IDs.
   - `FRONTEND_ORIGIN`: your exact production URL, such as `https://your-site.netlify.app`, without a trailing slash.
   - Optional: `SESSION_IDLE_MINUTES=120`, `ACCOUNT_LOCK_MINUTES=2`, `MAX_LOGIN_FAILURES=5`.
4. Deploy after configuring environment variables. Open `/health` and confirm `status: ok`.
5. Sign in with an existing administrator. Check users and historical results, then submit a test using a designated test account. Verify the new Google Doc, three MP3s, PDF download, CSV export and teacher override.

No Google data migration is needed. Keep the current backend available until these production checks pass, then retire it. This workspace migration does not itself publish a site.

The frontend uses relative `/api/v1/...` URLs. It does not need a separate backend hostname. Netlify routes `/api/*` and `/health` to the Node function. The public build copies only `index.html`, `config.js` and `kaplan.png`; the project root must never be the publish directory.

## CLI deployment

With the Netlify CLI installed and authenticated, link the intended site and use:

```sh
netlify deploy --build
```

This creates a draft deployment. After checking it, use `netlify deploy --build --prod` to publish. Configure secrets through Netlify settings before deploying; do not commit them.

## Recordings and platform limits

The original API accepts three recordings of up to 6 MB each. Netlify limits buffered requests to 6 MB, with a smaller effective limit for binary uploads. The frontend therefore uploads recordings in 1 MB chunks, then sends a small JSON submission. Each chunk is stored in Google Drive under the student's submission folder, so another function instance can finish the submission. The server validates the reconstructed MP3s before using an attempt. Successful audio files retain the original names and links; upload `.part` files may remain alongside them and can be removed after a submission completes.

The original multipart submission endpoint remains available for local clients and requests that fit the hosting limit. Netlify returns binary downloads using a streamed Response, allowing the original 6 MB recording size. Streamed responses have a 20 MB platform limit. Extremely large CSV/PDF exports must stay within that platform limit.

Synchronous functions have a 60-second execution limit. Google latency can cause a submission to time out. The frontend keeps the submission ID for retries within the open assessment, and the API recognizes completed submissions. Check Google availability and retry if needed. No local filesystem or function memory is used for production persistence.

References: [Netlify function configuration and limits](https://docs.netlify.com/build/functions/configuration/), [Netlify Functions API and streaming](https://docs.netlify.com/build/functions/api/).

## Google permissions

The Node backend shares newly created submission folders with active administrators as readers and preserves existing Google permissions. It does not automatically make the master Sheet or Drive tree editable by anyone with a link. Review the existing Google sharing settings separately if the previous backend enabled that access.

## Validation boundary

Automated tests run against isolated stores and mocked Google operations. Live OAuth, Google permissions, upload latency and an actual Netlify deployment require the production smoke checks above. Netlify deployment needs a repository/site connection and its configured environment variables.

