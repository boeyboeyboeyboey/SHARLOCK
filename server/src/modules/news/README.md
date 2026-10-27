# News service

## Presentation summary

- What it is: the public news reading service behind The Sharlock Times: `GET /api/news` returns a validated, cached edition of Guardian articles.
- Security concept: safe use of an external API. Only an allowlisted upstream is called (no arbitrary URL proxying), requests and reads are bounded, the key stays server-side, article HTML is reduced to text, HTTP(S) links and line breaks, and errors are generic. Course link: web security (11a, 12a decks) and network security (09a) in the [course reference index](../../../../TASKS.md#course-reference-index).
- Using it: add `GUARDIAN_API_KEY` to root `.env`, restart the backend and open the Times; no key is needed for the rest of the app.
- Components: `router.js` (allowlisted query), `policy.js`, `service.js` (fresh/stale/expired, request coalescing, cooldown), `store.js`, `models.js`, `providers/guardian.js`, `inline.js`.
- Data: MongoDB `NewsCache` and `NewsQuota` collections hold the edition cache and a persistent daily budget with pacing; it creates no users, attempts or scores.
- Status: see the API-01 and G-NEWS records in [TASKS.md](../../../../TASKS.md).
- Limits: the daily quota bounds live refreshes, so older cached stories may be labelled stale; one upstream provider.

This feature belongs to G-NEWS / API-01. It is a public reading service; it does not create users, attempts, scores or learning records.

## Request and data flow

`GET /api/news` → query validation → edition service → Mongo cache → atomic quota/pacing reservation → Guardian adapter → validated article DTO → Mongo cache → Vue newspaper

| File                    | Responsibility                                                               |
| ----------------------- | ---------------------------------------------------------------------------- |
| `router.js`             | endpoint, allowlisted query fields, safe errors and retry metadata           |
| `policy.js`             | constants, Singapore calendar windows and feature errors                     |
| `service.js`            | fresh/stale/expired decisions, concurrent-request coalescing and cooldown    |
| `store.js`              | scoped Mongo queries, persistent daily budget and pacing                     |
| `models.js`             | connection-bound NewsCache/NewsQuota schemas and feature-only initialization |
| `providers/guardian.js` | fixed upstream URL, bounded JSON read, date validation and normalization     |
| `inline.js`             | parse5 fragment parsing; only text, HTTP(S) links and line breaks survive    |

`server/src/app.js` mounts the router under `/api`. `server/src/server.js` initializes the two feature collections/indexes, removes expired cache records at startup and every minute, and disposes the interval on shutdown. Existing database setup and unrelated collections/indexes are preserved.

## Configuration and provider

Add `GUARDIAN_API_KEY` privately to root `.env`, or provide it through the server environment. Precedence remains shell → root `.env` → server defaults. Get a free non-commercial developer key through [Guardian Open Platform](https://open-platform.theguardian.com/access/). Never use `VITE_`, print the key, commit it, or pass it through a browser request. Protected environment templates are intentionally unchanged. Restart the backend after changing the key.

Missing configuration returns a retryable `NEWS_NOT_CONFIGURED` response; other application routes still work. Normal `NODE_ENV=test` startup disables live upstream credentials. Integration tests inject a synthetic provider; registered-key rehearsals are explicit separate checks.

The fixed upstream is `https://content.guardianapis.com/search`. Cybersecurity uses the OR of `technology/data-computer-security`, `technology/hacking`, `technology/malware`, and `technology/data-protection`; Technology uses `section=technology`. Both use `type=article`, newest publication order, a maximum of 50 results and `show-fields=headline,trailText,byline,bylineHtml,publication`. No article-body scraping or arbitrary URL proxying occurs. Provider filters may yield fewer stories on quiet days.

## Public contract

Only scalar `section=cybersecurity|technology` and `range=week|month` are accepted; defaults are cybersecurity/week. Reject unknown keys, repeated values, arrays and objects. Search and page numbers never reach the server.

The response contains `provider`, `section`, `range`, `dateKey`, `timezone`, `window`, `editionLimit`, `articles`, `fetchedAt`, `freshUntil`, `expiresAt`, `refreshAvailableAt`, `stale`, and `partial`. Each article has `id`, `title`, `url`, `publishedAt`, `excerpt`, `byline`, and `copyright`. Inline arrays contain only `{ type: "text", text }`, `{ type: "link", text, href }`, or `{ type: "break" }`. Missing provider excerpts/bylines remain absent rather than invented. Internal fields and raw provider HTML are not serialized.

Week/month include the current Singapore day plus the previous 6/29 days. The adapter requests broad UTC date bounds, then checks exact start-inclusive/end-exclusive instants and rejects future dates. `fetchedAt` identifies successful retrieval; publication dates remain the publisher's dates.

## Bounded persistence and failure behaviour

- Freshness: 30 minutes; hard content lifetime: 23 hours; TTL plus startup/minute cleanup and application expiry checks
- Cache key: version, section, range and Singapore date; maximum 50 normalized stories per edition
- Quota: atomic 450-request UTC-day allowance; independent `guardian-pacing` record preserves at least 1.1 seconds between reserved starts across day rollover and restarts
- Provider: 4.5-second abort deadline, one MiB response bound, no redirects, bounded 16,000-character fragments and parser traversal
- Coalescing: one promise per edition within the server process, at most four refreshes; failures impose at least a 60-second cooldown
- Cached data is served on refresh failure only before hard expiry, labelled stale with the original retrieval time
- Expired content is never served; no matching usable edition returns a safe 503 with retry information
- Browser responses use `Cache-Control: no-store`; the client uses no durable content storage

`NewsCache` contains the edition and article subdocuments. `NewsQuota` contains only counters, pacing timestamps and housekeeping expiry, never publisher text. Models use the existing passed Mongoose connection. GET requests may refresh this internal cache/quota but never mutate user or learning data. The app targets one localhost backend; coalescing and short failure cooldowns are process-local, while quota and pacing persist in MongoDB.

## Verification and credits

Unit tests: `server/tests/unit/news/`; isolated integration tests: `server/tests/integration/news/`; browser tests: `tests/e2e/news.spec.js`. Tests use synthetic content and explicitly disposable `_test` databases. Live verification must report date, status, normalization and cache reuse separately, without logging secrets or retaining publisher responses as fixtures.

[parse5](https://parse5.js.org/) 8.0.1 supplies HTML parsing under MIT. Guardian [API documentation](https://open-platform.theguardian.com/documentation/search), [access limits](https://open-platform.theguardian.com/access/) and [terms](https://www.theguardian.com/open-platform/terms-and-conditions) are the primary provider references. Future browser-local AI work requires a separate source-permission review.
