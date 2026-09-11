# Local verification stand

Tooling used to verify the publication link (`/p/<identifier>/`) end to end against a locally
published Florence release. Nothing here runs in production and nothing here is deployed.

`wrangler dev` refuses to start with the production `wrangler.jsonc` because the `ai` binding needs a
Cloudflare API token, so `.verify/wrangler.local.jsonc` is the same worker and the same asset routing
without that binding. Real credentials are never required.

## Run

1. Studio + local Control (from the Studio checkout), on a private copy of its database:

   ```bash
   LH_DATABASE_PATH=<copy>.sqlite LH_CONTROL_PORT=8921 LH_STUDIO_PORT=4212 CONTROL_AUTH_MODE=local \
   LH_PUBLIC_MISSION_SESSION_SECRET=<32+ chars> node apps/studio/dist/src/main.js
   node scripts/seed-real-content.mjs --db <copy>.sqlite --confirm
   ```

2. Publish the seeded quest through the product API (validate -> build release -> publish), see
   `.verify/e2e.mjs` for the shapes of the calls the Studio's publication panel makes.

3. The site worker:

   ```bash
   npx wrangler dev -c .verify/wrangler.local.jsonc --ip 127.0.0.1 --port 8791
   ```

4. Checks and screenshots:

   ```bash
   node .verify/e2e.mjs http://127.0.0.1:8791 <releaseId>       # contract, exits non-zero on failure
   node .verify/initial-world-probe.mjs <releaseId> <copy>.sqlite   # the initial-world gap
   RESET=1 SHOT_PREFIX=<name>- node .verify/drive.mjs <releaseId>   # Chrome over CDP: <port> 9371
   ```
