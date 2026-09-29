# Jev experiment verification — 2026-09-29

Base: 44578fa11da55f2e863900752653e0c221f6cf70. Node 24.19.0, PostgreSQL 17 in a dedicated local test database.

- `npm run typecheck`: passed, including scripts/tsconfig.jev.json.
- `npm test`: 153 passed, 0 failed.
- `npm run build -w @aihot/web`: passed.
- `node --test apps/web/tests/*.test.ts`: 13 passed, 0 failed.
- `node scripts/smoke.ts --base http://localhost:3310`: all checks passed.
- Real headless browser: review filter yields only the review case; review renders as 待复核, not 不选; row expansion works; no page errors; 1440px and 390px inspected, no document horizontal overflow (table scroll remains available).
- Independent review found two defects (prototype-property Choice acceptance; baseline content refusal recorded as rejection); failure-first regression tests reproduced them and final suite passes with fixes.

All model tests used local HTTP fixtures, not paid APIs. This establishes implementation behavior, not Jev editorial quality, live provider availability, latency or savings.

150 unlabeled real feed candidates from the upstream demo sources are stored only under `.data/jev-labeling/`; 120 development / 30 holdout. Sixteen feeds returned candidates; AWS and TechCrunch feeds failed on this collection attempt. Feed excerpts require full-article checks before human labeling. No gold labels, production takeover or deployment occurred.

Local logs are under `.data/qa/jev-selection/`; browser screenshots and the read-friendly labeling index are under `.data/jev-labeling/`. These private working artifacts are excluded from Git.

An upstream Fastify deprecation warning remains; it did not fail tests.
