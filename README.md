# Eyes

Plugin Claude Code che dà a Claude una vista visiva "da utente" su
qualsiasi sito o app web che stai sviluppando: la avvia (o si collega a
un URL già attivo), la naviga e ci interagisce come farebbe una
persona, e produce un report dei bug trovati — layout rotto,
accessibilità, errori console/rete.

## Uso

```
/eyes <url>
/eyes <path-al-progetto>
/eyes
```

Senza argomenti, Eyes usa la working directory corrente e prova a
rilevare come avviare il progetto (Node.js, Django, Flask, FastAPI,
Rails, Docker Compose, o un semplice `index.html` statico).

## Requisiti

- Node.js 18+
- `npm install` in `mcp-server/` compila automaticamente il progetto (script `prepare`); dopo, esegui `npx playwright install chromium`

## Come funziona

- Un server MCP (`mcp-server/`) espone i tool `start_app`, `open_page`,
  `screenshot`, `click`, `fill`, `stop_app`, basati su Playwright.
- La skill `/eyes` (`skills/eyes/SKILL.md`) istruisce Claude a guidare
  l'esplorazione passo passo: osserva screenshot e dati automatici
  (errori console/rete, audit di accessibilità con axe-core, controlli
  di overflow/contrasto), decide quali link/bottoni esplorare, e
  compone un report finale.

## Limitazioni note

- Guardrail di sicurezza bloccano click su elementi che sembrano
  distruttivi (es. "Elimina account", pagamenti), link verso domini
  esterni, e l'inserimento di credenziali reali in form di
  login/signup — vedi `docs/superpowers/specs/2026-08-19-eyes-plugin-design.md`.
- Budget di default: massimo 8 pagine e 15 interazioni per run.
- Nessun bypass dei guardrail nella v1.

## Sviluppo

```
cd mcp-server
npm install
npx playwright install chromium
npm test
```
