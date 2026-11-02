# Faster pages, instant tap feedback, demo dates

## 1. Find what makes pages slow (first step)
- Time every main page after sign-in at iPhone size (first open and repeat), and record where the wait goes: downloading page code or waiting for data.
- Fix the biggest causes found. The slow part hasn't been confirmed yet, so this measurement comes first.

## 2. Make pages open immediately
- Start loading a page's code as soon as a finger touches a menu item, tile or link, before the tap finishes, so most pages are already loaded when they open.
- Quietly preload the most-used pages (Activity, Inbox, Statements, Reports, More) a moment after Home appears.
- Show a page's layout straight away with light placeholder blocks while its numbers load, instead of a blank or frozen screen.

## 3. Show that every tap registered
- A thin gold progress bar at the very top appears the moment any page starts opening.
- Tiles, icons and menu items visibly press in when touched, and the tapped item shows a small spinner if it takes longer than a moment.
- While a page or action is opening, repeat taps on the same item are ignored, so pressing twice can't open things twice or save twice.

## 4. Demo dates that stay correct all year
- New demos spread their sample entries across the current month (only up to today) and the previous month, so Home's "This month" always shows sensible totals, including on the 1st or 2nd of a month.
- Existing demos aren't changed; they're removed after 24 hours anyway.

## 5. Check and publish
- Re-measure the same pages and report before/after times. Browser test: the progress bar appears and a double tap opens a page only once. Publish once you approve.

## Technical details
- Router: `defaultPreload: "intent"`, `defaultPreloadDelay: 0`, `defaultPendingMs` ~150ms with a shared pending skeleton; idle `router.preloadRoute` for top routes.
- Global top bar driven by `useRouterState` status; shared `:active` press styles; navigation guard ignoring duplicate taps while that route is pending; existing Button single-flight kept.
- Investigate heavy chunks shared by every page (charts, PDF, OCR libraries) and move them to lazy imports where they load eagerly.
- Demo seeding: dates computed as offsets inside the current month up to today plus the prior month, in an updated `start_demo_workspace` function.
