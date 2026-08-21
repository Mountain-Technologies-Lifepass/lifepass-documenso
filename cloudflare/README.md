# LifePass Documenso (Cloudflare Containers)

Thin Worker that runs the official `docker.io/documenso/documenso` image on Cloudflare Containers, backed by the dedicated Neon project.

## Deploy

1. Authenticate Wrangler against the LifePass Cloudflare account (`wrangler login` or `CLOUDFLARE_API_TOKEN`).
2. Install deps: `pnpm install`
3. Put runtime secrets in a gitignored file (from the monorepo: `.env/sync/documenso.cloudflare.env`), then:

```bash
pnpm secret:bulk /path/to/documenso.cloudflare.env
```

Required secrets (plus vars already in `wrangler.toml`):

- `NEXTAUTH_SECRET`
- `NEXT_PRIVATE_ENCRYPTION_KEY`
- `NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY`
- `NEXT_PRIVATE_DATABASE_URL`
- `NEXT_PRIVATE_DIRECT_DATABASE_URL`
- `NEXT_PRIVATE_SMTP_USERNAME`
- `NEXT_PRIVATE_SMTP_PASSWORD`
- `NEXT_PRIVATE_SIGNING_PASSPHRASE`
- `NEXT_PRIVATE_SIGNING_LOCAL_FILE_CONTENTS`

4. Deploy: `pnpm deploy`
5. Set `NEXT_PUBLIC_WEBAPP_URL` / `NEXT_PRIVATE_INTERNAL_WEBAPP_URL` to the real `*.workers.dev` (or custom) URL and redeploy.
6. Open the URL, create the admin user, API token, and webhook → LifePass API `/api/b2b/signing/documenso/webhook`.
7. Wire monorepo `DOCUMENSO_API_URL`, `DOCUMENSO_API_TOKEN`, `DOCUMENSO_WEBHOOK_SECRET`.

## Idle behavior

The container sleeps after 15 minutes without a request. There is no keep-warm
cron, so the dedicated Neon endpoint can autosuspend after the container closes
its database connections. The first signing request after a long idle period
may wait for the container cold start.
