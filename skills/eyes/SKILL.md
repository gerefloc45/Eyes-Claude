---
name: eyes
description: Apre un sito o un'app web (avviandola automaticamente se necessario), la naviga e ci interagisce come un utente, e produce un report dei bug di layout, accessibilità, console ed errori di rete trovati. Usa quando l'utente chiede di controllare visivamente un sito/app, trovare bug di UI, o fare QA visivo su qualcosa che sta sviluppando.
---

# Eyes

Guida l'esplorazione tu stesso, un passo alla volta, usando i tool MCP
`start_app`, `open_page`, `screenshot`, `click`, `fill`, `stop_app`.

## Budget

- Massimo **8 pagine** visitate per run.
- Massimo **15 interazioni** (click/fill) per run.
- Se un limite viene raggiunto, fermati e segnalalo nel report ("Note").

## Procedura

1. **Avvio.** Se l'utente ha passato un path di progetto, chiama
   `start_app({ cwd: <path> })`. Se ha passato un URL, chiama
   `start_app({ url: <url> })`. Se non ha passato nulla, usa la
   working directory corrente come `cwd`.
2. **Prima pagina.** Chiama `open_page({ url: <baseUrl> })` con
   l'URL restituito da `start_app`. Osserva lo screenshot, gli errori
   console/network, l'audit automatico (accessibilità e problemi
   visivi) e la lista di elementi interattivi.
3. **Responsività.** Per la pagina corrente, chiama anche
   `screenshot({ viewport: { width: 375, height: 667 } })` (mobile) e
   `screenshot({ viewport: { width: 768, height: 1024 } })` (tablet)
   per controllare che il layout regga anche lì.
4. **Esplorazione.** Guardando lo screenshot e la lista di elementi
   interattivi, scegli quali link seguire e quali bottoni/form provare
   — resta sullo stesso dominio, evita già di proporre azioni
   ovviamente distruttive (il guardrail lato server è una rete di
   sicurezza, non la prima linea di giudizio). Per seguire un link
   interno, usa `click` sul suo selettore e poi `open_page` di nuovo
   sulla nuova URL (o osserva la navigazione avvenuta). Per un bottone,
   usa `click`; per un campo, usa `fill`.
5. **Blocchi del guardrail.** Se `click`/`fill` ritorna
   `performed: false`, annota il motivo (`reason`) nel report sotto
   "Azioni bloccate dai guardrail" e prosegui con un'altra azione.
6. **Ripeti** il ciclo osserva → giudica → agisci per ogni pagina
   nuova, fino al budget massimo.
7. **Chiusura.** Chiama `stop_app()` se l'app era stata avviata da
   Eyes (cioè se non era già un `url` esterno).
8. **Report finale.** Componi il report in questo formato:

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

Classifica come 🔴 Critico ciò che rompe una funzionalità (bottone
morto, form che non si invia, crash JS); 🟡 Minore ciò che è visibile
ma non blocca l'uso (contrasto, overflow, testo troncato); ⚪ per
errori console/rete che non hanno un impatto visivo osservato
direttamente.
