# Credits

What Sharlock Hub (IS216 Group 7) builds on. Versions and licences were read from each package's own `package.json` in `node_modules` on 27 October 2026. Where a source is not recorded in the repository it says so; nothing here is assumed.

## Client libraries (`client/package.json`)

| Package             | Version | Licence    | Used for                                                   |
| ------------------- | ------- | ---------- | ---------------------------------------------------------- |
| vue                 | 3.5.42  | MIT        | UI framework (`<script setup>` components)                 |
| vue-router          | 4.6.4   | MIT        | Routing                                                    |
| pinia               | 3.0.4   | MIT        | Shared state (signed-in user)                              |
| axios               | 1.20.0  | MIT        | HTTP client                                                |
| bootstrap           | 5.3.8   | MIT        | Layout, offcanvas, utilities                               |
| @popperjs/core      | 2.11.8  | MIT        | Bootstrap positioning                                      |
| @panzoom/panzoom    | 4.6.2   | MIT        | Pan/zoom camera of the 2D town                             |
| @phosphor-icons/vue | 2.2.1   | MIT        | Installed icon set (shared pages use original pixel icons) |
| @babylonjs/core     | 9.31.0  | Apache-2.0 | 3D hub rendering (`/` only)                                |
| @babylonjs/havok    | 1.3.14  | MIT        | 3D hub character physics                                   |

## Server libraries (`server/package.json`)

| Package                       | Version | Licence      | Used for                         |
| ----------------------------- | ------- | ------------ | -------------------------------- |
| express                       | 5.2.1   | MIT          | HTTP API                         |
| mongoose                      | 9.10.1  | MIT          | Models and queries               |
| mongodb                       | 7.6.0   | Apache-2.0   | MongoDB driver                   |
| mongodb-connection-string-url | 7.0.2   | Apache-2.0   | Connection string parsing        |
| express-session               | 1.19.0  | MIT          | Server sessions                  |
| connect-mongo                 | 6.0.0   | MIT          | Mongo-backed session store       |
| csrf-sync                     | 4.2.1   | ISC          | CSRF protection                  |
| express-rate-limit            | 8.7.0   | MIT          | Rate limiting                    |
| argon2                        | 0.45.1  | MIT          | Argon2id password hashing        |
| dotenv                        | 17.4.2  | BSD-2-Clause | Environment loading              |
| parse5                        | 8.0.1   | MIT          | HTML parsing in the news service |
| nodemon (dev)                 | 3.1.14  | MIT          | Backend reload in development    |

## Tooling (root and client `devDependencies`)

| Package                    | Version | Licence    | Used for                        |
| -------------------------- | ------- | ---------- | ------------------------------- |
| vite                       | 8.3.0   | MIT        | Dev server and build            |
| @vitejs/plugin-vue         | 6.0.9   | MIT        | Vue support in Vite             |
| vitest                     | 5.0.1   | MIT        | Unit and integration tests      |
| @vue/test-utils            | 2.5.0   | MIT        | Component mount tests           |
| jsdom                      | 27.4.0  | MIT        | Test DOM                        |
| supertest                  | 7.2.2   | MIT        | API tests                       |
| mongodb-memory-server-core | 11.2.0  | MIT        | Disposable test database        |
| @playwright/test           | 1.63.0  | Apache-2.0 | End-to-end tests                |
| eslint                     | 10.10.0 | MIT        | Linting                         |
| @eslint/js                 | 10.0.1  | MIT        | ESLint base config              |
| eslint-plugin-vue          | 10.11.0 | MIT        | Vue lint rules                  |
| eslint-config-prettier     | 10.1.8  | MIT        | Lint/format compatibility       |
| globals                    | 17.12.0 | MIT        | Lint globals                    |
| prettier                   | 3.9.6   | MIT        | Formatting                      |
| concurrently               | 10.0.5  | MIT        | Running client and API together |

## Fonts

DESIGN.md ("Verification and credits") records that Pixelify Sans (headings and brand, OFL-1.1, self-hosted via `@fontsource/pixelify-sans`), DotGothic16 (body and UI text, OFL-1.1, Fontworks, self-hosted via `@fontsource/dotgothic16`) and the CLI and SQL games' Silkscreen (self-hosted via `@fontsource/silkscreen`) and the CLI game's Azeret Mono (self-hosted via `@fontsource/azeret-mono`) use the SIL Open Font License.

Libre Baskerville 400 (serif; OFL-1.1; Copyright 2012 The Libre Baskerville Project Authors; self-hosted via `@fontsource/libre-baskerville` 5.3.0) is used only for the 3D hub's lore intro title cards (`client/src/features/hub/intro/LoreIntro.vue`).

## Images and artwork

| Asset                                                       | Source as recorded                                                                                                           |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `client/public/images/town/*.svg` (11 sprites)              | Original code-based pixel artwork (DESIGN.md)                                                                                |
| `client/public/images/*-placeholder.svg` (6 files)          | Original code-based placeholders, including the navbar illustration (DESIGN.md)                                              |
| `client/public/images/avatars/*.png` (6 capybara portraits) | AI-generated with Codex's image tool at Boey's request, 14 October 2026; prompts in `client/public/images/avatars/README.md` |
| `client/public/hub/plates/*.webp` (12 skyline plates)       | Source not recorded                                                                                                          |
| 3D hub scene geometry and capybara rig                      | Procedural code in `client/src/features/hub/` (hub README); no external model files are listed under `client/public`         |
| `client/public/interiors/*.webp` (5 room stills)            | Rendered from the project's own procedural scenes in `client/src/features/interiors/` with `scripts/capture-interiors.mjs`   |
| Guardian "Powered by" logo in The Sharlock Times            | Official [Guardian Powered by logo](https://www.theguardian.com/open-platform/logos), per the Guardian's terms               |

`client/src/assets/styles/` holds the team's own CSS.

## Audio

| Asset                                                                           | Source as recorded                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `client/public/audio/sharlock-bgm.mp3` (town soundtrack)                        | Contributor-provided; source and permission pending (DESIGN.md: creator and licence not supplied)                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `client/public/audio/Lo-fi_8-bit_coffee_s_1-1789752418868.mp3`                  | Supplied by Boey, audio unchanged apart from the filename; original creator and licence not recorded (threat-briefing README)                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `client/public/audio/hub-ambience.mp3` (3D hub ambience)                        | AlexLane, [Freesound 530210 "Pea Point, New Brunswick, Seaside ambience"](https://freesound.org/people/AlexLane/sounds/530210/), CC0 1.0. Excerpted (75 s), crossfaded loop join, high-passed, loudness-normalised, re-encoded. Revised 29 Oct 2026 (LORE-01, Boey): stationary surf/wind noise reduced (FFT denoise about 12 dB plus a -6 dB low shelf at 400 Hz), so the wash is about 5.5 dB quieter while the gull range drops about 1 dB; about -22 LUFS overall; the previous version is kept locally in `.local-handover/audio-sources/`. |
| `client/public/audio/lore-intro.mp3` (3D hub lore intro)                        | AI-generated by Boey with Google Lyria (Gemini) on 29 October 2026 from a text prompt (no reference audio). Carries Google's SynthID watermark; used under Google's generative AI terms (not CC0). Processed: first 28 s of a 60 s clip (from 0.6 s), 0.5 s fade-in, 3.5 s fade-out, loudness-normalised to about -17 LUFS, stereo MP3 96 kbps 44.1 kHz, 0.34 MB. Original kept locally (gitignored) in `.local-handover/audio-sources/intro audio.mp4`.                                                                                         |
| `client/public/audio/games/cli-cyber-defender-theme.mp3` (game theme)           | pending: Gemini Lyria, generated by Boey                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `client/public/audio/games/phishing-post-mortem-theme.mp3` (game theme)         | pending: Gemini Lyria, generated by Boey                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `client/public/audio/games/sql-injection-arcade-theme.mp3` (game theme)         | pending: Gemini Lyria, generated by Boey                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `client/public/audio/games/social-engineering-simulator-theme.mp3` (game theme) | pending: Gemini Lyria, generated by Boey                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `client/public/audio/games/clearance-tower-theme.mp3` (game theme)              | pending: Gemini Lyria, generated by Boey                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `client/public/audio/games/sfx-correct.mp3` (game effect)                       | pending: Gemini Lyria, generated by Boey                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `client/public/audio/games/sfx-wrong.mp3` (game effect)                         | pending: Gemini Lyria, generated by Boey                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `client/public/audio/games/sfx-win.mp3` (game effect)                           | pending: Gemini Lyria, generated by Boey                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `client/public/audio/games/sfx-lose.mp3` (game effect)                          | pending: Gemini Lyria, generated by Boey                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `client/public/audio/games/sfx-click.mp3` (game effect)                         | pending: Gemini Lyria, generated by Boey                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Data and content sources

- The Guardian Open Platform API supplies the articles in The Sharlock Times, under its [access terms](https://open-platform.theguardian.com/access/) and [terms and conditions](https://www.theguardian.com/open-platform/terms-and-conditions). The server uses a free developer key kept in the server environment.
- The OWASP Top 10:2025 reference in the Times adapts the work of the OWASP Top 10 Team under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/); summaries are simplified, town examples are original.
- Course material under `documentation/` (CS440 Cybersecurity Fundamentals decks, WAD2 teaching slides) informs learning objectives and implementation. It is a teaching reference only; no slide content is reproduced. The collection is indexed in the [course reference index](TASKS.md#course-reference-index).

## Original work

Game scenarios, rules, puzzles and copy were written by the team. Owners follow the TASKS.md records:

- G-NEWS / The Sharlock Times (`threat-briefing`) and the platform (auth, cohorts, recovery, admin, attempts, profile, 3D hub): Boey
- G-SQL SQL Injection Arcade: Keane
- G-CLI CLI Cyber Defender: Xin Lei
- G-PHISH Phishing Post-Mortem: Athithya
- G-SOC Social Engineering Simulator: Eric (its `llm/` engine is separately owned; provider details are in that module's records)
- G-CLEAR Clearance Tower: Russell
