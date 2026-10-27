# The Sharlock Times

## Presentation summary

- What it is: The Sharlock Times, a newspaper overlay of recent cybersecurity and technology stories plus an OWASP Top 10 reference, opened from the newsstand ("The daily briefing") in the hub or 2D town at `/games/threat-briefing`.
- Security concept: situational awareness of real threats and web-application risk (OWASP Top 10), and safe handling of third-party content: external text is escaped, links are protocol-checked and there is no untrusted `v-html`. Course link: web security (11a, 12a decks) in the [course reference index](../../../../TASKS.md#course-reference-index).
- Using it: click the newsstand, browse and search sections and pages, open the OWASP tab, and use Close or Esc to return. A mute control and retry cover the lo-fi loop.
- Components: `NewsDialog.vue` (modal, URL state), `CyberNewsCentral.vue`, `NewsTabs.vue`, `OwaspTopTen.vue`, `NewsAudio.vue`; `useCyberNews.js` and `useNewsLocation.js`; `news.js` uses the shared `/api` client.
- Data: reads `GET /api/news` only; it saves no scores, accounts or reading history.
- Status: see the G-NEWS records in [TASKS.md](../../../../TASKS.md).
- Limits: live stories need a Guardian key in the server environment; unscored; sound state is local and non-persistent.

Cyber News Central retains catalog ID `threat-briefing` and `/games/threat-briefing`. Its paper reads live Guardian stories, without accounts, scores, reflections or saved reading history.

**Status: completed and accepted by Boey on 19 September 2026**, including The Sharlock Times branding, OWASP reference and newspaper sound. The requested lo-fi MP3 replaces the mistakenly supplied WAV; task evidence is retained in the root TASKS.md.

## Presentation walkthrough

1. `Dashboard.vue` remains mounted at `/` while its nested news route opens `NewsDialog.vue`. In the default 3D hub the newsstand ("The daily briefing") is a building too and opens the same overlay; the TownMap path is 2D mode.
2. `NewsDialog.vue` calls native `showModal()` and owns Escape/Close; Dashboard owns Back versus direct-link replacement and restores the newsstand focus
3. `NewsDialog.vue` also owns URL location, `NewsTabs.vue`, `OwaspTopTen.vue` and `NewsAudio.vue`; `CyberNewsCentral.vue` composes the newspaper, sections, feedback, story grid and pagination
4. `useNewsLocation.js` validates URL filters and searches/pages the loaded edition without HTTP calls; `update()` merges into the latest intended query so two updates in one tick never resurrect an earlier value
5. `useCyberNews.js` cancels superseded Axios requests, enforces browser content expiry and disposes its timer/listener/request
6. `news.js` reuses the shared `/api` Axios client; the [server news module](../../../../server/src/modules/news/README.md) owns upstream access, secrets and persistence

## Component contracts

| Component          | Inputs                                                                    | Events / responsibility                                                  |
| ------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `NewsDialog`       | none                                                                      | `request-close`, native modal lifecycle                                  |
| `NewsTabs`         | activeTab                                                                 | update:tab; arrows/Home/End focus tabs, Enter/Space select               |
| `OwaspTopTen`      | none                                                                      | bundled 2025 risk reference with native disclosures and official sources |
| `NewsAudio`        | none                                                                      | status event; automatic loop, mute/retry and media cleanup               |
| `CyberNewsCentral` | location, update callback                                                 | live news composition; unmounted outside the news tab                    |
| `NewsFilters`      | section, range, query, loading, canRefresh                                | section/range/query updates, refresh; mobile Browse & search disclosure  |
| `NewsArticle`      | article, featured                                                         | full title, inline byline/excerpt, safe publisher links and dates        |
| `SafeInline`       | nodes                                                                     | escaped text, safe links and line breaks; no raw HTML                    |
| `NewsPagination`   | page, pageCount                                                           | update:page                                                              |
| `NewsStatus`       | loading, error, stale, partial, fetchedAt, refreshAvailableAt, canRefresh | retry and honest cache/error feedback                                    |

Newspaper query fields are `tab=owasp` (omit for Latest news), `section=cybersecurity|technology`, `range=week|month`, `q` (up to 80 characters) and `page` (1–5). Defaults are omitted from the URL. Filter changes replace the current history entry. Each edition contains at most 50 stories, with ten per page. Dates use Asia/Singapore. Tab changes retain section/range/search/page. A direct OWASP link makes no news request; leaving the news tab cancels its request and disposes the news timer. Returning reloads through the existing server cache.

## Integration boundaries

Shared changes are limited to the existing router, Dashboard, PortalLayout focus handling, TownMap activation/focus methods (2D mode), the newsstand building in the 3D hub, catalog/card and town links. The original newsstand SVG follows the shared asset convention in `client/public/images/town/newsstand.svg`; no second registry or camera is introduced. Other activity previews retain their existing card behaviour. Dashboard passes `soundSuspended` through TownMap to `TownAudio({ suspended })`; this pauses the same landing player and, after closing, restarts it unless the visitor muted it this session (AUDIO-01). The paper uses shared pixel tokens through `.news-dialog`-prefixed CSS; it never styles the document body or another page.

Unit tests live in `__tests__/news.test.js` and `__tests__/audio.test.js`; browser journeys live in `tests/e2e/news.spec.js`. Deterministic stories are test fixtures only. The actual app never silently substitutes fixtures for live news.

## Reference and audio

`data/owaspTopTen.js` contains the official ordered 2025 category names/source links, adapted summaries/defences and original fictional town examples. `OwaspTopTen.vue` labels the edition and review date, links every category and credits OWASP under CC BY 3.0. This is a bundled awareness reference, not a live vulnerability feed, quiz or complete security checklist.

`NewsAudio.vue` attempts the supplied `/audio/Lo-fi_8-bit_coffee_s_1-1789752418868.mp3` on mount, looping at 20% volume. The original supplied filename included `#`; it was renamed to `client/public/audio/Lo-fi_8-bit_coffee_s_1-1789752418868.mp3` without changing its bytes because the development server treated that character as a URL fragment. A native media promise controls failure feedback; direct-link autoplay can be blocked and retried with the sticky Sound button. Mute is usable even during pending playback. The instance survives tab changes and stops/mutes on unmount, including late promise completion. Reopening attempts playback again; no local storage preference is written. Existing `gazette-*` CSS classes/element IDs remain internal styling names, while all visible branding is The Sharlock Times.

## Credits and deferred work

The pixel newsstand is original code-based artwork, using the existing capybara palette. Newspaper icons and mascot reuse the project's original assets. Publisher attribution links to The Guardian and uses its official [Powered by logo](https://www.theguardian.com/open-platform/logos). [Provider access](https://open-platform.theguardian.com/access/) and [provider terms](https://www.theguardian.com/open-platform/terms-and-conditions) govern this integration.

The [OWASP Top 10:2025](https://top10.owasp.org/2025/) is by the OWASP Top 10 Team under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Summaries are simplified adaptations; town examples are original. Boey supplied the lo-fi MP3 unchanged; its original creator/license still needs to be recorded for final credits.

A possible future headline Q&A assistant using a browser-local LLM is deferred. Boey will investigate browser capability and source permissions separately. There is no model download, inference dependency, chat UI or hidden assistant integration in this module.
