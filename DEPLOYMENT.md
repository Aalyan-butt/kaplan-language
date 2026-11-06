# Deployment

Follow [HOSTED_DATABASE.md](HOSTED_DATABASE.md). Configure a standard hosted PostgreSQL connection with DATABASE_URL. The code does not provision Netlify Database. Run npm run setup:postgres and the one-time data migration before deploying. Keep connection credentials out of GitHub.

The Netlify frontend build command remains npm run build, publish directory dist, and functions directory netlify/functions. Google Drive/Docs integrations are optional.
