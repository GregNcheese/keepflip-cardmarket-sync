# Keep & Flip — isolated preview secret inheritance check

This new Git branch was created **after** the user added `KEEPFLIP_ACCESS_TOKEN` in Cloudflare **Previews Base**.

- Purpose: verify whether a newly created Worker Preview inherits the base secret.
- Worker code: unchanged 2.1.6 AUTOFILL TEST from `test/cloudflare-worker-autofill-216`.
- This is a **preview-only** build: not production, not a merge, no production deployment.
- No secret values are present in the repository.
- The only public check is GET /health: `version` and `accessConfigured`.

If `accessConfigured` is false, check the Previews Base secret binding in Cloudflare dashboard; do not publish a real access token.
