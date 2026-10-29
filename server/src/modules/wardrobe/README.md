# Wardrobe

SKIN-01 stage A (server). A signed-in student equips cosmetic items on the Sharlock figure. Items unlock through achievements; the server owns the catalog, the unlock rule and the equipped choice. Colours and drawing live on the client.

## Catalog

One item per slot is always unlocked (the default). Unlocks are re-derived on every request from the actor's own completed attempts (practice included, except the timed run) through `progress/achievements.js`; no unlock list is stored.

| Slot      | Item                  | Unlocked by                                              |
| --------- | --------------------- | -------------------------------------------------------- |
| scarf     | `scarf-red`           | default                                                  |
| scarf     | `scarf-navy`          | `first-close-sql-injection-arcade` (Customs cleared)     |
| scarf     | `scarf-forest`        | `first-close-clearance-tower` (Tower cleared)            |
| scarf     | `scarf-mustard`       | `first-close-phishing-post-mortem` (Post sorted)         |
| scarf     | `scarf-plum`          | `first-close-cli-cyber-defender` (Wire held)             |
| scarf     | `scarf-teal`          | `first-close-social-engineering-simulator` (Talked down) |
| hat       | `hat-deerstalker`     | default                                                  |
| hat       | `hat-brown-tweed`     | `first-clue`                                             |
| hat       | `hat-grey-tweed`      | `persistent-detective`                                   |
| hat       | `hat-flat-cap`        | `well-rounded`                                           |
| monocle   | `monocle-gold`        | default                                                  |
| monocle   | `monocle-silver`      | `perfect-case`                                           |
| monocle   | `monocle-brass`       | `timed-run` (Against the clock)                          |
| accessory | `accessory-none`      | default                                                  |
| accessory | `accessory-magnifier` | `topic-expert`                                           |

`timed-run` needs a completed attempt with mode `standard` on a ruleset the attempts registry marks `competitive`; the server reads both from its own records.

## Endpoints

Both sit under `/api`, use the session, and the PUT also needs the CSRF token and expected origin. Responses are `Cache-Control: no-store`. A per-user limiter allows 60 requests a minute.

| Method | Path                     | Input                        | Response                                                                                                              |
| ------ | ------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/me/wardrobe`       | empty query                  | `{ items: [{ id, slot, name, unlocked, unlockedBy, unlockedByName }], equipped: { scarf, hat, monocle, accessory } }` |
| PUT    | `/api/me/wardrobe/:slot` | exactly `{ itemId: string }` | `{ equipped }`                                                                                                        |

PUT errors: `400 VALIDATION_ERROR` for an unknown slot, an item of another slot, a non-string, a missing or extra key; `403 WARDROBE_ITEM_LOCKED` ("That item is not available yet.") for a locked item; `401`/`403` for session, CSRF and origin failures. `/api/auth/me` returns `user.wardrobe` (equipped ids only).

## Security notes

- The actor comes from the session; the request cannot name a user. The write is `$set` on `wardrobe.<slot>` filtered by the actor's `_id`, active status and auth version.
- The slot and item id are checked against the server catalog before any query; the browser never supplies an unlock, score or achievement.
- `PATCH /api/me/profile` still rejects every key except `username` and `avatarId`, so `wardrobe` cannot be set there.
- The User schema (`strict: 'throw'`) restricts each slot to its catalog ids with defaults, and accounts without the field read as defaults through `equippedFrom`.

## Affected consumers

- `models/User.js`: new `wardrobe` sub-document (four enum strings with defaults).
- `modules/auth/service.js` `serializeUser`: `/api/auth/me`, login and register responses gain `user.wardrobe`.
- `modules/progress`: six new achievement keys in `/api/me/progress` (`first-close-*`, `timed-run`); `deriveAchievements` takes `{ isCompetitive }` and progress attempts now carry `mode`.
- `modules/attempts/service.js` `listCompletedAttempts`: projection also returns `mode`.
- `app.js`: mounts `createWardrobeRouter` next to the profile router.
