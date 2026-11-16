# Trigger: Cloudflare Preview — Keep & Flip Worker 2.1.6

This file is intentionally committed to the **test branch only** to trigger Cloudflare's connected Git preview-build hook after the user enabled Preview branch builds.

- Worker: `late-smoke-2a21`
- Branch: `test/cloudflare-worker-autofill-216`
- Preview entry: `worker/src/index.js` through `worker/wrangler.jsonc`
- Expected command: `npx wrangler preview`, **not** `npx wrangler deploy`
- Production: unchanged 2.1.4, production builds disabled
- Test secret: `KEEPFLIP_ACCESS_TOKEN`, stored in Cloudflare Previews Base; never committed
- Google Search: preview disabled
- No real customer or inventory data is sent to GitHub

This file does not change the Worker runtime or deploy it from GitHub Actions.

## Retry after Cloudflare root-directory mismatch

The previous Cloudflare build `cf7ac720` used root `/` and build command `None`, even though the dashboard's Previews Base was set to `/worker`. The temporary, **test-branch-only** root `wrangler.jsonc` now points at `./worker/src/index.js` and defines the required `previews` settings. This commit triggers a fresh preview build via the `worker/*` watch path. Production remains untouched.
