# Sharlock Hub: README for markers

IS216 Web Application Development 2, Group 7: Boey, Keane, Eric, Russell, Xin Lei and Athithya.

Sharlock Hub is a gamified cybersecurity learning site. Students explore an 1880s Thames wharf, in 3D or as a 2D map, and play short games that each teach one security topic. Instructors run classes and see results. Administrators set up schools, classes and staff.

- **Git repository:** https://github.com/boeyboeyboeyboey/SHARLOCK
- **Home page once running:** http://localhost:5173

## 1. Requirements

- Node.js 24.12.0, the version in `.nvmrc` and the one the project is tested on
- Google Chrome
- The `.env` file supplied with this submission
- An internet connection: the app uses a hosted database, and the first test run downloads a MongoDB server

## 2. Set up

Open a terminal in the application folder (the folder that holds `package.json`) and run:

```sh
npm install --global pnpm@12.3.4
pnpm install --frozen-lockfile
```

Copy the supplied `.env` into the application folder, next to `package.json`. Then create the server's session secret:

```sh
pnpm setup:env
```

It reports that the root `.env` is left unchanged and creates `server/.env`. It never overwrites the supplied `.env`.

If the global pnpm install fails with a permissions error, run `corepack enable` instead.

## 3. Run

```sh
pnpm dev
```

Open **http://localhost:5173**. Use `localhost`, not `127.0.0.1`. The API runs on port 3000.

No email is sent. When you register a new account, the six-digit verification code is printed in this terminal, on a line starting `[mail:dev] Verification code for`.

## 4. Accounts

The supplied database holds a demo school and class with recent plays. The emails and passwords are in the copy of this README inside the submission zip, not in the repository.

| Role                 | Email           | Password        | What to try                                                   |
| -------------------- | --------------- | --------------- | ------------------------------------------------------------- |
| Administrator        | in the zip copy | in the zip copy | Set up a class and an instructor                              |
| Instructor           | in the zip copy | in the zip copy | Class results, approve a student, issue a password-reset link |
| Student (in a class) | in the zip copy | in the zip copy | Play games, see progress and the class leaderboard            |
| Student (in a class) | in the zip copy | in the zip copy | A second player for Botnet Tag                                |
| Student (no class)   | in the zip copy | in the zip copy | Join the class with an invitation code                        |

Each account can be signed in on one browser at a time: signing in elsewhere signs the first browser out. For a second account, use an incognito window or a second Chrome profile. You can also register your own student account.

## 5. Testing

The tests are in three places:

- `tests/e2e/`: Playwright end-to-end journeys
- `server/tests/`: Vitest API and server tests
- the `__tests__/` folders beside the client code: Vitest component tests

Each run creates and deletes its own temporary database and never touches the demo data.

Install the Playwright browser once:

```sh
pnpm exec playwright install chromium
```

| Command                 | What it checks                                                   | Time                                                           | Expected result        |
| ----------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------- |
| `pnpm test:unit`        | Vue components, game rules and server logic                      | about 2 minutes                                                | 2,766 passed           |
| `pnpm test:integration` | API routes, permissions and saving against a temporary database  | about 4 minutes                                                | 400 passed             |
| `pnpm test:e2e`         | Main user journeys in Chrome, at a phone size and a desktop size | about 15 minutes on an idle machine, much longer on a busy one | 437 passed, 47 skipped |

The 47 skipped tests are checks that apply to only one of the two screen sizes.

The first `test:integration` or `test:e2e` run downloads a MongoDB server, about 150 MB, into `.cache/mongodb`. `test:e2e` runs its own copy of the app on ports 3001 and 5174, so `pnpm dev` can stay running. If every end-to-end test fails at once with `Executable doesn't exist`, the Playwright browser is missing: run the install command above.

### Main user journeys and their end-to-end tests

| Journey                                                   | Test file in `tests/e2e/`                                                                                                                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Register, enter the email code, sign in and out           | `auth.spec.js`                                                                                                                                                                        |
| Join a class with an invitation code; instructor approves | `cohorts.spec.js`, `instructor.spec.js`                                                                                                                                               |
| Play and save each game                                   | `cli-cyber-defender.spec.js`, `phishing-post-mortem.spec.js`, `sql-injection-arcade.spec.js`, `social-engineering-simulator.spec.js`, `clearance-tower.spec.js`, `botnet-tag.spec.js` |
| Read The Sharlock Times                                   | `news.spec.js`                                                                                                                                                                        |
| Progress and leaderboard                                  | `progress.spec.js`, `leaderboard.spec.js`                                                                                                                                             |
| Instructor views class results                            | `class-results.spec.js`, `staff-pages.spec.js`                                                                                                                                        |
| Admin sets up a class and an instructor; activation link  | `admin-workspace.spec.js`, `activation.spec.js`                                                                                                                                       |
| Staff-issued password recovery                            | `recovery.spec.js`                                                                                                                                                                    |
| 3D wharf and 2D town navigation                           | `hub.spec.js`, `hub-auto.spec.js`, `portal.spec.js`, `town-walk.spec.js`                                                                                                              |
| Classmates on the wharf and in the town                   | `hub-presence.spec.js`, `town-presence.spec.js`                                                                                                                                       |
| Profile, avatar and outfit                                | `profile.spec.js`, `wardrobe.spec.js`                                                                                                                                                 |
| Signed in elsewhere, signed out                           | `session-end.spec.js`                                                                                                                                                                 |
| Phone layout                                              | `mobile-shell.spec.js`, `page-fit.spec.js`                                                                                                                                            |

## 6. Cybersecurity topics covered

| Destination                                                             | Route                                 | Cybersecurity topics covered                                                                                                                                 |
| ----------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CLI Cyber Defender                                                      | `/games/cli-cyber-defender`           | Incident triage and containment: reading logs, blocking at the firewall, securing accounts and isolating hosts, tagged with the CIA triad and attack stage   |
| The Phishing Post-Mortem                                                | `/games/phishing-post-mortem`         | Spotting phishing: lookalike domains, display-name spoofing, reply-to and link mismatches, payment-change requests, and not distrusting genuine urgent email |
| SQL Injection Arcade                                                    | `/games/sql-injection-arcade`         | SQL injection: quote breakout, comments, unquoted numbers, UNION, boolean-blind and second-order injection, with bound parameters as the fix                 |
| LLM Social Engineering Simulator (shown in the town as Help Desk Shift) | `/games/social-engineering-simulator` | Social engineering and impersonation under pressure, and checking a request against independent records and a call back                                      |
| Clearance Tower                                                         | `/games/clearance-tower`              | Access control: discretionary, Bell-LaPadula mandatory and role-based, with Trojan horses, tampering and separation of duties                                |
| Botnet Tag                                                              | `/games/botnet-tag`                   | How worms and botnets spread, and why patching and filtering stop them                                                                                       |
| The daily briefing (The Sharlock Times)                                 | `/games/threat-briefing`              | Awareness of current threats, and the OWASP Top 10 web-application risks                                                                                     |

Around the games, the site also has:

- accounts with email verification
- classes with invitation codes
- instructor class results
- leaderboards
- staff-issued password recovery
- an admin workspace

## 7. A 10-minute tour

Everything below starts from **Menu** in the top bar. The **3D** and **2D** buttons switch between the wharf and the map.

- **Student:**
  1. Sign in.
  2. Walk to a building. In 2D, Menu, then Places, lists the buildings.
  3. Play CLI Cyber Defender and The Phishing Post-Mortem.
  4. Open **Profile & progress**, then **Leaderboard**.
- **Instructor:**
  1. Open **Manage your classes**.
  2. Look at the class results, approve a pending request, then issue a password-reset link for a student.
- **Administrator:**
  1. Open **Admin**.
  2. Create an institution, a class and an instructor.
  3. Open the one-time activation link in an incognito window.
- **Botnet Tag:** sign in two students in two windows, and open Botnet Tag in both. It needs WebGL2.

## 8. Data store and external APIs

- **Data store:** MongoDB Atlas (a MongoDB document database), accessed from an Express API through Mongoose.
- **External API:** the Guardian Open Platform, called from the server for The Sharlock Times. An edition is cached for 30 minutes and kept as a fallback for up to 23 hours. With no key or no connection, the Times shows a sample edition that is clearly labelled as made up.
- **AI model:** Google Gemini, called from the server, plays the caller in the LLM Social Engineering Simulator. When the model is unavailable, the game uses scripted replies and stays playable.
- **Real-time:** WebSockets carry classmates on the wharf and Botnet Tag rounds.

## 9. Screen sizes

Tested in Chrome from 375 px to 1440 px, in portrait and landscape. The 3D wharf needs WebGL2. Phones and browsers without it open the 2D map, and every game works in both.

## 10. Troubleshooting

- **Blank page, or `504 (Outdated Optimize Dep)` in the browser console:**
  1. Stop `pnpm dev`.
  2. Delete `client/node_modules/.vite`.
  3. Run `pnpm dev` again.
- **The API stops at startup with a database error:** your network cannot reach the hosted database. Some campus and office networks block outbound port 27017. Try another network, such as a phone hotspot.
- **Port 5173 or 3000 already in use:** stop the other program using it, then run `pnpm dev` again.
- **"Signed in somewhere else":** the same account was signed in on another browser. Sign in again, or use a different account in the second window.

## 11. How AI was used

[TEAM: placeholder for the team to write]

## 12. Credits

Libraries, fonts, images, music and data sources are listed in [CREDITS.md](../CREDITS.md).
