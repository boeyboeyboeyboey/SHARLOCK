# Sharlock Hub

**Backup API keys:** the news (Guardian) and AI caller (Gemini) keys are free-tier and can hit their daily limit. The submitted `SharlockHub/.env` (in the submission zip) holds commented-out backup keys under "Backup Guardian API Key" and "Backup Gemini API Keys"; copy one into `GUARDIAN_API_KEY` or `LLM_API_KEY` and restart `pnpm dev`. Keys are not stored in this repository.

IS216 Web Application Development 2, Group 7: Boey, Keane, Eric, Russell, Xin Lei and Athithya.

Sharlock Hub is a gamified cybersecurity learning site. Students explore a 3D wharf (or a 2D map) and play short games that each teach one security topic. Instructors run classes and see results. Administrators set up schools, classes and staff.

- **Git repository:** https://github.com/boeyboeyboeyboey/SHARLOCK
- **Presentation video:** https://youtu.be/G7RfdOOov54
- **Home page once running:** http://localhost:5173

**Why it runs locally instead of being deployed:** we did not have enough time to deploy the app and test it properly once hosted. Since hosting is optional, we judged the time and effort not worth the tradeoff and spent it refining the application and its UX instead. Two things would have made hosting costly:

- **AI key:** a hosted copy would share our one free-tier Gemini key among every visitor, and it could run out mid-grading. Run locally, you can put your own key in `.env` if ours hits its limit.
- **Multiplayer:** wharf presence and Botnet Tag need an Express server that stays running and holds WebSocket connections. Free serverless hosting such as Vercel cannot do that, so in practice one of our laptops would have had to run the server for multiplayer to work, and making that reliable would have taken a lot of extra work.

## 1. Requirements

- Node.js 24.12.0 or later 24.x
- Google Chrome (the end-to-end tests install their own Chromium in §5)
- An internet connection (packages, the MongoDB Atlas database, the news and AI APIs)

The `.env` files hold the database connection and API keys, so they are not in this repository; markers received them in the submission zip. For a fresh clone, run `pnpm setup:env` after installing, then set `MONGO_URI` in the root `.env` (or run `pnpm db:local` in a second terminal and use `mongodb://127.0.0.1:27018/sharlock_dev`).

## 2. Set up and run

In a terminal inside the repository folder:

```sh
npm install --global pnpm@12.3.4   # skip if you already have pnpm 12; the project pins its version
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://localhost:5173** (use `localhost`, not `127.0.0.1`). The API runs on port 3000.

No email is sent. When you register a new account, the six-digit verification code is printed in the `pnpm dev` terminal (`[mail:dev] Verification code for ...`).

## 3. Accounts

The demo accounts for the shared database were given to the markers with the submission and are not published here. Sign in with the username or the email.

One account is signed in on one browser at a time: signing in elsewhere signs the first one out. Use an incognito window or another Chrome profile for a second account. To see a join request: register a new student, enter the class invitation code (shown on the instructor's class page) from the Menu, then approve it as the instructor.

## 4. What to look at

- **CLI Cyber Defender**
  - Route: `/games/cli-cyber-defender`
  - Topic: incident triage: logs, firewall blocks, isolating hosts
- **The Phishing Post-Mortem**
  - Route: `/games/phishing-post-mortem`
  - Topic: spotting phishing: lookalike domains, spoofing, link mismatch
- **SQL Injection Arcade**
  - Route: `/games/sql-injection-arcade`
  - Topic: SQL injection and bound parameters as the fix
- **LLM Social Engineering Simulator**
  - Route: `/games/social-engineering-simulator`
  - Topic: impersonation under pressure and verifying requests
- **Clearance Tower**
  - Route: `/games/clearance-tower`
  - Topic: access control: DAC, Bell-LaPadula and RBAC
- **Botnet Tag**
  - Route: `/games/botnet-tag`
  - Topic: how worms spread and why patching stops them (multiplayer)
- **The Sharlock Times**
  - Route: `/games/threat-briefing`
  - Topic: current threat news and the OWASP Top 10

Walk to a building and press Enter (or E in 2D), or open **Menu → Places**. Phones, browsers without WebGL2 and slower laptops open the 2D map automatically, with a notice saying so; **Try 3D anyway** or the **3D | 2D** switch changes it. Every game works in both.

**Intros and help:** the story intro and control hints play on first visit to the 3D wharf. To see them again: **Menu → Settings → Replay intro** or **Show controls**. Each game opens its rules on first play; the **How to play** button in every game reopens them.

**Data and APIs:** MongoDB Atlas through Express and Mongoose; the Guardian Open Platform for The Sharlock Times (cached 30 minutes); Google Gemini plays the caller in the Social Engineering Simulator (scripted lines if it is unavailable); WebSockets for classmates on the wharf and Botnet Tag rounds.

**Note on the submitted `.env`:** the four `LLM_COLLEAGUE_*` lines are commented out on purpose. They point at a teammate's private model server that you cannot reach. With them off, the in-game colleague in the Social Engineering Simulator uses scripted lines; everything else is unaffected.

## 5. Testing

Each test run creates and deletes its own temporary database and never touches the demo data. The first run needs internet: it downloads a MongoDB server (about 141 MB) into `.cache/mongodb`, which adds a few minutes. Warnings in the output (jsdom "Not implemented", Mongoose deprecation notices) are expected; the pass counts are what matter.

```sh
pnpm exec playwright install chromium   # once, before the end-to-end tests
pnpm test:unit
pnpm test:integration
pnpm test:e2e
```

Last results, 5 November 2026:

- `pnpm test:unit`
  - Checks: Vue components, game rules and server logic
  - Time: about 1 minute
  - Result: 2,802 passed
- `pnpm test:integration`
  - Checks: API routes, permissions and saving
  - Time: about 3 minutes
  - Result: 400 passed
- `pnpm test:e2e`
  - Checks: user journeys in Chrome at phone and desktop sizes (Playwright)
  - Time: about 80 minutes
  - Result: 448 passed, 48 skipped (496 tests)

Skipped end-to-end tests are checks that apply to only one screen size. The 3D and game tests are heavy: on a slower laptop some may time out when run in parallel; `pnpm test:e2e --workers=1` runs them one at a time, which is how all 448 passed for us. For a one-minute check, run `pnpm test:e2e tests/e2e/auth.spec.js --workers=1` (6 tests).

`test:e2e` runs its own copy of the app on ports 3001 and 5174, so `pnpm dev` can stay running. End-to-end specs are in `tests/e2e/`, for example `auth.spec.js` (register, verify, sign in and out), `cohorts.spec.js` (join a class, instructor approves), each game's own spec, `hub.spec.js` and `town-walk.spec.js`.

## 6. Troubleshooting

- **Blank page or `504 Outdated Optimize Dep`:** stop `pnpm dev`, run `rm -rf client/node_modules/.vite`, start it again.
- **Port 3000 or 5173 in use:** close the other program using it, then run `pnpm dev` again.

## 7. How AI was used

### AI coding assistants

- **Codex:** GPT-6.1 Sol and GPT-6 Astra.
- **Claude Code:** Claude Opus 5.5 and Claude Sonnet 5.5.

#### Why we chose these models

We researched benchmarks to choose models at the frontier of coding and cybersecurity, aiming for the best guidance on clean code, an organised database and an efficient app hardened against vulnerabilities (e.g. [SWE-bench](https://www.swebench.com/SWE-bench/) and [CyberGym](https://www.cybergym.io/cybergym/)).

**We used these models mainly as planners and guides, rather than letting them write the whole app; our workflow is described below.**

#### How we worked with AI

1. **Start with an idea.** We supplied an idea, goal or our own concept art and asked AI to develop a detailed, feasible feature proposal.
2. **Work out a technical plan.** AI suggested technologies, explained unfamiliar techniques and broke implementation into steps.
3. **Back-and-forth discussion.** We challenged AI's ideas and it challenged ours, revising the plan until we were satisfied.
4. **Write the first version.** We wrote the first version and bug fixes by hand from the agreed plan. AI-generated parts are listed below.
5. **Try the app and solve problems.** We tried debugging ourselves first (with some head-scratching and occasional swearing, LOL...). AI was a last resort when unfamiliar technologies or connected features left us stuck. Wherever possible, we asked for explanations so we could make fixes ourselves and avoid implementing “spaghetti code”.
6. **Set limits for the agents.** Our Markdown instructions (`agents.md`, `CLAUDE.md`, in the Git repository) told agents to read project context, seek approval before coding, edit only agreed files, preserve teammates' work and ask before scope changes, commits or pushes.

#### Specific AI uses

- **Website and database:** planned API routes, database structures, permissions, class management and scoring.
- **2D town and mobile layouts:** recommended Panzoom and planned support for smaller screens, keyboards and touch controls.
- **3D Wharf:**
  - Suggested adding 3D, recommended Babylon.js and assessed how it could fit into the existing 2D app.
  - Generated 3D models from our artwork ideas and references we drew in Photoshop.
  - Explained animation, textures, lighting, physics, movement and camera controls.
  - Planned multiplayer, performance, loading, cleanup and the 2D fallback.
  - Wrote the NPC dialogue and lore script.
- **Games and news:** developed game concepts and technical plans covering database connections and complex styling, and suggested the Guardian API.
- **Tests:** wrote unit, component, integration and end-to-end tests, and explained what they check.
- **Security and code review:** proposed security controls and performed final reviews to catch overlooked bugs and security issues.
- **Performance and tooling:** suggested improvements, refined existing code and cleaned up tools and outdated dependencies.
- **Written content:** refined instructions, scenarios, hints and explanations.

### AI-generated images and audio

- **ChatGPT ImageGen:** generated the avatars and skyline imagery.
- **Gemini image generation:** generated the game room backgrounds.
- **Gemini Lyria:** generated music and some sound effects.

### AI inside the application

The Social Engineering Simulator calls Gemini from the server to generate fictional caller replies. Human-written scripted replies are used if requests fail or Gemini is unavailable. Server code controls rules and scoring.

### AI used for the presentation

We used AI to:

- Generate the initial slides, which we edited.
- Record gameplay.
- Combine our recordings, gameplay and slides, and synchronise their timing.

## 8. Credits

The same credits are also in `CREDITS.md`. Versions and licences were read from each package's own `package.json` on 27 October 2026.

**Team and ownership.** Game scenarios, rules, puzzles and copy were written by the team.

- **Boey:** platform (accounts, classes, recovery, admin, saving results, profile), 3D wharf, The Sharlock Times, Botnet Tag
- **Keane:** SQL Injection Arcade
- **Xin Lei:** CLI Cyber Defender
- **Athithya:** The Phishing Post-Mortem
- **Eric:** LLM Social Engineering Simulator
- **Russell:** Clearance Tower

**Client libraries:** vue 3.5.42, vue-router 4.6.4, pinia 3.0.4, axios 1.20.0, bootstrap 5.3.8, @popperjs/core 2.11.8, @panzoom/panzoom 4.6.2 (2D map camera), @phosphor-icons/vue 2.2.1 (all MIT); @babylonjs/core 9.31.0 (3D wharf, Apache-2.0); @babylonjs/havok 1.3.14 (3D physics, MIT).

**Server libraries:** express 5.2.1, mongoose 9.10.1, express-session 1.19.0, connect-mongo 6.0.0, express-rate-limit 8.7.0, argon2 0.45.1 (password hashing), parse5 8.0.1, ws 8.22.0 (WebSockets), nodemon 3.1.14 (all MIT); mongodb 7.6.0 and mongodb-connection-string-url 7.0.2 (Apache-2.0); csrf-sync 4.2.1 (ISC); dotenv 17.4.2 (BSD-2-Clause).

**Tooling:** vite 8.3.0, @vitejs/plugin-vue 6.0.9, vitest 5.0.1, @vue/test-utils 2.5.0, jsdom 27.4.0, supertest 7.2.2, mongodb-memory-server-core 11.2.0, eslint 10.10.0 with @eslint/js, eslint-plugin-vue, eslint-config-prettier and globals, prettier 3.9.6, concurrently 10.0.5 (all MIT); @playwright/test 1.63.0 (Apache-2.0).

**Fonts** (SIL Open Font License 1.1, self-hosted through `@fontsource`): Pixelify Sans, DotGothic16 (Fontworks), Silkscreen, Azeret Mono, and Libre Baskerville 5.3.0 (Copyright 2012 The Libre Baskerville Project Authors).

**Images**

- Town sprites and placeholder images (`client/public/images/`): original code-drawn pixel art.
- Capybara avatar portraits (`client/public/images/avatars/`): AI-generated with Codex's image tool at Boey's request, 14 October 2026.
- Game room stills (`client/public/interiors/`): AI-generated by Boey with Gemini image generation, 1 November 2026, under Google's generative AI terms; cropped and resized to 1600 × 900 WebP.
- 3D wharf scene and capybara rig: procedural code, no external model files.
- Skyline plates (`client/public/hub/plates/`): AI-generated by Boey with ChatGPT ImageGen, under OpenAI's terms.
- Guardian "Powered by" logo: the official [Guardian logo](https://www.theguardian.com/open-platform/logos), used per the Guardian's terms.

**Audio**

- 3D wharf ambience (`hub-ambience.mp3`): AlexLane, [Freesound 530210](https://freesound.org/people/AlexLane/sounds/530210/), CC0 1.0; excerpted, looped, denoised and loudness-normalised.
- Lore intro (`lore-intro.mp3`) and the game themes in `client/public/audio/games/` (CLI, Phishing, SQL, Social Engineering, Clearance Tower, Botnet Tag round and final 30 s), plus `sfx-win.mp3`: AI-generated by Boey with Google Lyria (Gemini), 29 October to 1 November 2026, from text prompts only. They carry Google's SynthID watermark and are used under Google's generative AI terms; trimmed, looped and loudness-normalised.
- `sfx-correct`, `sfx-wrong`, `sfx-lose` and `sfx-click`: made by Boey in jsfxr (sfxr.me), 1 November 2026.
- Botnet Tag sound effects and the wharf footsteps and gas-lamp hiss: original Web Audio code, no audio files.
- 2D town soundtrack (`sharlock-bgm.mp3`) and newspaper music (`Lo-fi_8-bit_coffee_s_1-1789752418868.mp3`): AI-generated by Boey with Google Lyria (Gemini), under Google's generative AI terms.

**Data and content**

- Articles in The Sharlock Times come from the Guardian Open Platform API, under its [access terms](https://open-platform.theguardian.com/access/) and [terms and conditions](https://www.theguardian.com/open-platform/terms-and-conditions). The sample edition shown without a key is original fiction.
- The OWASP Top 10:2025 reference adapts the work of the OWASP Top 10 Team under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/); summaries are simplified and the town examples are original.
- Course material from CS440 Cybersecurity Fundamentals and WAD2 informed the learning objectives; no slide content is reproduced.
