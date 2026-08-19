# Eyes — Design del plugin Claude Code

Data: 2026-08-19
Stato: Approvato, pronto per implementazione

## Obiettivo

Un plugin Claude Code chiamato **Eyes** che dà a Claude una vista visiva
"da utente" su qualsiasi sito o app web sviluppata dall'utente: avvia
l'app (o si collega a un URL già attivo), la naviga ed interagisce con
essa come farebbe una persona, e produce un report strutturato dei
problemi trovati — bug di layout, elementi rotti, errori console/rete,
problemi di accessibilità e contrasto.

Eyes è complementare alla skill di sistema `run` (che verifica che una
modifica funzioni): `run` conferma il funzionamento, Eyes fa QA visivo
approfondito e multi-pagina.

## Non-obiettivi (v1)

- Non genera un Artifact HTML separato — il report è testo/markdown in
  conversazione, con gli screenshot mostrati inline.
- Non tenta di "riparare" i bug trovati automaticamente — solo li
  riporta.
- Non gestisce login/autenticazione con credenziali reali.
- Non pubblica autonomamente il plugin sul marketplace — resta
  un'azione manuale dell'utente.

## Architettura

Plugin Claude Code standard con due componenti:

```
EyesClaude/
  .claude-plugin/
    plugin.json          # manifest del plugin
  skills/
    eyes/
      SKILL.md            # istruzioni per Claude su come guidare l'esplorazione
  mcp-server/
    package.json
    src/
      index.ts            # entrypoint MCP server
      tools/
        startApp.ts        # rilevamento + avvio progetto
        openPage.ts         # naviga + screenshot + audit automatici
        interact.ts          # click / fill con guardrail
        screenshot.ts
        stopApp.ts
      detect/
        appDetectors.ts     # euristiche di rilevamento stack
      audit/
        a11y.ts              # wrapper axe-core
        visualChecks.ts       # overflow/contrasto/clipping via computed styles
      guardrails.ts          # pattern di azioni distruttive da bloccare
  README.md
  LICENSE
```

Stack: **Node.js + TypeScript**, `@modelcontextprotocol/sdk` per il
server MCP, **Playwright** per il browser headless (cattura
console/network nativamente), **axe-core** per l'audit di
accessibilità. Il `plugin.json` registra sia la skill che il server
MCP, così installando il plugin Claude Code ottiene entrambi.

L'approccio scelto è **ibrido semi-agentico**: il server MCP espone
primitive a basso livello (naviga, screenshot, click, fill) più audit
automatici per pagina; Claude, tramite le istruzioni della skill,
guida l'esplorazione passo passo decidendo quali link/elementi
esplorare, osservando screenshot e dati strutturati ad ogni passo.
Questo è stato preferito a un crawler monolitico server-side perché
sfrutta meglio il giudizio di Claude su cosa è "sicuro" e interessante
da esplorare, in cambio di un costo maggiore in token/turni (accettato
come trade-off).

## Tool MCP

### `start_app({ cwd?, url? })`

Se viene passato `url`, lo usa direttamente (nessun avvio). Altrimenti
ispeziona `cwd` con euristiche in ordine di priorità:

1. `docker-compose.yml` / `compose.yaml` → `docker compose up -d`
2. `package.json` → script `dev`, poi `start`, poi `serve`
3. `manage.py` (Django) → `python manage.py runserver`
4. `requirements.txt`/`pyproject.toml` con Flask/FastAPI rilevato →
   comando standard del framework
5. `Gemfile` (Rails) → `rails server`
6. `index.html` senza altro → server statico minimale (`npx serve` o
   `python -m http.server`)
7. Nessun match → errore chiaro che chiede di specificare come avviare

Avvia il processo in background, fa polling sulla porta finché non
risponde (timeout configurabile, default 30s), cattura stdout/stderr
per rilevare crash. Ritorna `{ baseUrl, pid, detectedStack }`.

Gli script di rilevamento e avvio devono funzionare su Windows (niente
comandi shell POSIX-only).

### `open_page({ url, viewport? })`

Naviga alla pagina, aspetta `networkidle`, ritorna in un'unica
risposta:

- screenshot (immagine, default desktop 1280×800)
- errori/warning console del browser
- richieste di rete fallite (4xx/5xx/timeout)
- audit automatico axe-core (violazioni accessibilità con severità)
- controlli CSS automatici: overflow/testo troncato, elementi fuori
  viewport, contrasto testo/sfondo sotto soglia WCAG
- lista di elementi interattivi (link, bottoni, form) con selettore e
  testo visibile, per permettere a Claude di scegliere cosa esplorare

### `screenshot({ viewport })`

Screenshot aggiuntivi della pagina corrente su altri viewport (mobile
375×667, tablet 768×1024) su richiesta di Claude, per controlli di
responsività.

### `click({ selector })` / `fill({ selector, value })`

Interagiscono con la pagina corrente, passando prima dal guardrail
(vedi sotto).

### `stop_app()`

Termina il processo avviato da `start_app` e chiude il browser.

## Guardrail di sicurezza

Prima di eseguire `click`/`fill`, il tool valuta l'elemento target e
blocca (ritornando un messaggio esplicativo a Claude, senza eseguire
l'azione) se:

- **Testo/attributi distruttivi**: testo visibile, `aria-label`,
  `name` o `id` matcha pattern come
  `delete|elimina|cancella|remove|rimuovi|pay|paga|checkout|purchase|acquista|logout.*all|unsubscribe|disdici`
  (case-insensitive, IT/EN, lista estendibile).
- **Link esterni**: click su `<a>` con `href` verso un dominio diverso
  da quello corrente → bloccato, Eyes resta sempre sullo stesso sito.
- **Campi sensibili**: `fill` su input `password`, `email` (se il form
  sembra un vero login/signup) o dati carta di credito → bloccato,
  Eyes non inserisce credenziali reali.
- **Submit di form**: permesso solo se nessun campo del form è tra
  quelli sensibili sopra.

Ogni blocco ritorna un messaggio chiaro a Claude, che lo segnala nel
report invece di far fallire silenziosamente l'esplorazione. Nessun
bypass in v1.

**Budget globale** per evitare loop infiniti: massimo N pagine
visitate (default 8) e M interazioni totali (default 15) per ogni run
di `/eyes`, configurabili come parametri della skill.

## Workflow della skill `/eyes`

Invocazione: `/eyes <url>`, `/eyes <path-progetto>`, oppure senza
argomenti (usa la working directory corrente).

Istruzioni per Claude in `SKILL.md`:

1. Se è un path, chiama `start_app`; altrimenti usa l'URL direttamente.
2. Chiama `open_page` sulla pagina iniziale. Osserva screenshot,
   errori console/network, audit automatico, lista elementi
   interattivi.
3. Decide quali link interni seguire e quali elementi "sicuri" provare
   a cliccare — il guardrail è la rete di sicurezza, non la prima
   linea di giudizio: Claude evita già di proporre azioni ovviamente
   distruttive.
4. Ripete il ciclo osserva → giudica → (eventualmente) agisce per ogni
   pagina/interazione, fino al budget massimo.
5. Per ogni pagina scatta anche screenshot mobile/desktop via
   `screenshot` per controllare la responsività.
6. Al termine, chiama `stop_app` (se l'app era stata avviata da Eyes)
   e compone il report finale.

## Formato del report

Markdown in chat, screenshot inline (nessun Artifact separato in v1):

```
# Eyes — Report analisi: <nome app/URL>

## Riepilogo
N pagine analizzate, X problemi trovati (Y critici, Z minori)

## Problemi per pagina
### /home
- 🔴 [Critico] Bottone "Acquista" non risponde al click
- 🟡 [Minore] Testo del footer troncato su viewport mobile (375px)
- 🟡 [Accessibilità] Contrasto insufficiente su link nel menu (axe-core: color-contrast)
- ⚪ [Console] Errore JS: "Cannot read property 'x' of undefined" in bundle.js:42

### /prodotti
...

## Note
- Pagine/azioni non esplorate per limite budget: ...
- Azioni bloccate dai guardrail: ...
```

## Testing e validazione

- Test manuale del server MCP contro 2-3 app di prova locali: una
  statica (HTML puro), una Node/React (`npm run dev`), una con un bug
  di layout inserito apposta (es. CSS overflow, bottone non
  funzionante) per verificare che Eyes lo trovi davvero.
- Verifica che i guardrail blocchino correttamente click su bottoni
  tipo "Elimina account" / submit di form con password, usando una
  pagina di test dedicata.
- Verifica su Windows (ambiente target dell'utente) che gli script di
  rilevamento/avvio funzionino correttamente.

## Preparazione al marketplace Claude plugins

Il progetto sarà pubblicato sulla pagina dei plugin di Claude, quindi
fin dalla v1:

- `plugin.json` completo con `name`, `description`, `version`
  (semver), `author`, e i campi richiesti dallo schema plugin di
  Claude Code.
- `README.md` chiaro: cosa fa il plugin, esempio d'uso
  (`/eyes <url>`), requisiti (Node.js, `npx playwright install`),
  limitazioni note (guardrail, budget pagine).
- `LICENSE` (es. MIT, da confermare).
- Nessuna chiave/segreto hardcoded, nessuna telemetria esterna
  nascosta.
- Versione iniziale `0.1.0`, changelog minimo.
- La submission effettiva al marketplace resta un'azione manuale
  dell'utente.
