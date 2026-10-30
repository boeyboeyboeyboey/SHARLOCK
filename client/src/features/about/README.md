# About page

The public `/about` page ("About Sharlock") introduces the project: the capybara detective, the investigate-first learning approach and the 3D and 2D modes. It needs no account.

## Presentation summary

- What it is: the public About page, rendered by `views/About.vue` from `AboutStory.vue`.
- Security concept: none taught; it is the introduction, with a link into the signed-in town.
- Using it: open About in the navbar; "Explore the town" goes to `/`, which asks for sign-in; `/about#graphics` scrolls to the "3D and 2D modes" section.
- Components: `AboutStory.vue` composes `PixelIcon` and `SharlockTip` from the shared components; it has no props, store or API of its own. The 3D/2D section states the phone rule (touch screens under 768px open the 2D town).
- Data: none stored.
- Status: see TASKS.md for the About records.
- Limits: static copy; the pixel styling follows the shared tokens.
