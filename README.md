# Eyes

Claude Code plugin that gives Claude a "real user's" visual view of any
site or web app you're developing: it starts it (or connects to an
already-running URL), navigates and interacts with it like a person
would, and produces a report of the bugs it finds — broken layout,
accessibility issues, console/network errors.

## Usage

```
/eyes <url>
/eyes <path-to-project>
/eyes
```

With no arguments, Eyes uses the current working directory and tries to
detect how to start the project (Node.js, Django, Flask, FastAPI,
Rails, or a plain static `index.html`). Docker Compose projects aren't
automatically supported yet in v1 — see "Known limitations".

## Requirements

- Node.js 18+
- `npm install` in `mcp-server/` builds the project automatically (`prepare` script); afterward, run `npx playwright install chromium`

## How it works

- An MCP server (`mcp-server/`) exposes the tools `start_app`, `open_page`,
  `screenshot`, `click`, `fill`, `stop_app`, built on Playwright.
- The `/eyes` skill (`skills/eyes/SKILL.md`) instructs Claude to drive
  the exploration step by step: look at the screenshot and automated
  data (console/network errors, accessibility audit via axe-core,
  overflow/contrast checks), decide which links/buttons to explore, and
  compose a final report.

## Known limitations

- Safety guardrails block clicks on elements that look destructive
  (e.g. "Delete account", payments), links to external domains, and
  entering real credentials into login/signup forms — see
  `docs/superpowers/specs/2026-08-19-eyes-plugin-design.md`.
- Default budget: at most 8 pages and 15 interactions per run.
- No guardrail bypass in v1.
- Docker Compose projects: detection fails immediately with a clear
  error instead of starting them — use the `url` parameter to point
  directly at an app you've already started manually.

## Development

```
cd mcp-server
npm install
npx playwright install chromium
npm test
```
