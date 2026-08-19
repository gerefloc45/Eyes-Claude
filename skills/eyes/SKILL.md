---
name: eyes
description: Opens a site or web app (starting it automatically if needed), navigates and interacts with it like a user, and produces a report of the layout, accessibility, console, and network bugs it found. Use when the user asks to visually check a site/app, find UI bugs, or do visual QA on something they're developing.
---

# Eyes

Drive the exploration yourself, one step at a time, using the MCP tools
`start_app`, `open_page`, `screenshot`, `click`, `fill`, `stop_app`.

## Budget

- At most **8 pages** visited per run.
- At most **15 interactions** (click/fill) per run.
- If a limit is reached, stop and note it in the report ("Notes").

## Procedure

1. **Start.** If the user gave a project path, call
   `start_app({ cwd: <path> })`. If they gave a URL, call
   `start_app({ url: <url> })`. If they gave nothing, use the current
   working directory as `cwd`.
2. **First page.** Call `open_page({ url: <baseUrl> })` with the URL
   returned by `start_app`. Look at the screenshot, the console/network
   errors, the automated audit (accessibility and visual issues), and
   the list of interactive elements.
3. **Responsiveness.** For the current page, also call
   `screenshot({ viewport: { width: 375, height: 667 } })` (mobile) and
   `screenshot({ viewport: { width: 768, height: 1024 } })` (tablet) to
   check the layout holds up there too.
4. **Exploration.** Looking at the screenshot and the list of
   interactive elements, choose which links to follow and which
   buttons/forms to try — stay on the same domain, and already avoid
   proposing obviously destructive actions yourself (the server-side
   guardrail is a safety net, not the first line of judgment). To
   follow an internal link, `click` its selector and then `open_page`
   again on the new URL (or observe that the navigation happened). For
   a button, use `click`; for a field, use `fill`.
5. **Guardrail blocks.** If `click`/`fill` returns `performed: false`,
   note the reason (`reason`) in the report under "Actions blocked by
   guardrails" and move on to another action.
6. **Repeat** the observe → judge → act cycle for each new page, up to
   the budget limit.
7. **Shutdown.** Call `stop_app()` if the app was started by Eyes
   (i.e. it wasn't already an external `url`).
8. **Final report.** Write the report in this format:

```
# Eyes — Analysis Report: <app name/URL>

## Summary
N pages analyzed, X issues found (Y critical, Z minor)

## Issues by page
### /home
- 🔴 [Critical] "Buy" button doesn't respond to clicks
- 🟡 [Minor] Footer text truncated on mobile viewport (375px)
- 🟡 [Accessibility] Insufficient contrast on menu link (axe-core: color-contrast)
- ⚪ [Console] JS error: "Cannot read property 'x' of undefined" in bundle.js:42

### /products
...

## Notes
- Pages/actions not explored due to budget limit: ...
- Actions blocked by guardrails: ...
```

Classify as 🔴 Critical anything that breaks functionality (dead
button, form that won't submit, JS crash); 🟡 Minor anything that's
visible but doesn't block use (contrast, overflow, truncated text); ⚪
for console/network errors with no directly observed visual impact.
