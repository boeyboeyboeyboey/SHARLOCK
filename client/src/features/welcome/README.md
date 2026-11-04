# Welcome page (WELCOME-01)

## Presentation summary

- What it is: the page a signed-out visitor sees at `/`, a painterly golden-hour Thames wharf with a title card: logo, "Sharlock Hub", one lore line, Sign in, Create account and About.
- Concept taught: none; it frames the lore (London, 1880) and sends visitors to sign in or register. Task status is in [TASKS.md](../../../../TASKS.md).
- How it works: `createAccountGuard` (`features/auth/guards.js`) sends a signed-out navigation to exactly `/` to the `welcome` route. Expired or replaced sessions, a tab that was signed in, and every other guarded page still go to `/login` with their reason. `/welcome` is an `authPage` route, so a signed-in visit is redirected to the town (or class onboarding) like `/login`.
- Look: layered `thames-far-1` and `thames-mid-1` skyline plates from `client/public/hub/plates/` drift slowly over a CSS sky, fog, water and four lamp glows that fade on in turn. CSS animation only: no WebGL, audio, timers or listeners.
- Accessibility: backdrop is `aria-hidden` with empty alt text; the card is a solid surface over it; reduced motion shows the finished picture with no animation.
- Files: `WelcomePage.vue`, `welcome.css` (every rule under `.welcome-page`), `__tests__/welcome-page.test.js`, E2E `tests/e2e/welcome.spec.js`.
- Limits: the pixel wipe has no entry for `/welcome`, so none plays on arrival; the lore line is a fixed string taken from the hub intro, not read from `loreCards.js`.
