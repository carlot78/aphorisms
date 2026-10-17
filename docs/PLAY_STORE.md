# Pubblicare Aphorisms su Google Play

L'app Android è una **Trusted Web Activity (TWA)**: un piccolo guscio Android che
apre https://carlot78.github.io/aphorisms/ a schermo intero. Gli aggiornamenti al
sito arrivano subito anche agli utenti Play; il pacchetto va ricaricato solo se
cambiano icona, nome o impostazioni Android.

**Stato (17 ottobre 2026):** pacchetto generato (passo 2 fatto) — `.aab`, `.apk` di prova e chiave di firma in `Documentiphorisms-android-signing` sul PC di Carlo (fuori dal repository). Impronta della chiave di caricamento già in `assetlinks.json` e verificata dall'API Digital Asset Links di Google. Manca l'impronta di Google Play App Signing (passo 3, dopo il primo caricamento).

Già pronto nel repository:

| Cosa | Dove |
| --- | --- |
| Icone PNG (192, 512, maskable) | `icons/` |
| Icona per lo store 512×512 | `icons/play-icon-512.png` |
| Grafica in evidenza 1024×500 | `icons/play-feature-1024x500.png` |
| Screenshot telefono (4) | `screenshots/` |
| Informativa privacy | https://carlot78.github.io/aphorisms/privacy.html |
| File di verifica del dominio | https://carlot78.github.io/.well-known/assetlinks.json (repo `carlot78.github.io`) |

---

## 1. Account Google Play Console (solo tu)

1. Vai su https://play.google.com/console e crea un account sviluppatore
   **personale** (25 USD una tantum, verifica dell'identità con documento).
2. Per gli account personali nuovi Google richiede, prima della pubblicazione
   in produzione, un **test chiuso con almeno 12 tester per 14 giorni
   consecutivi**. Prepara 12 indirizzi Gmail (amici, famiglia).

## 2. Generare il pacchetto Android con PWABuilder

1. Apri https://www.pwabuilder.com, incolla `https://carlot78.github.io/aphorisms/`
   e premi **Start**. Il punteggio del manifest dovrebbe essere verde.
2. **Package for stores → Android → Generate Package**, poi **Options** e imposta:

   | Campo | Valore |
   | --- | --- |
   | Package ID | `io.github.carlot78.aphorisms` ← **esattamente questo** |
   | App name | `Aphorisms` |
   | Launcher name | `Aphorisms` |
   | App version / version code | `1.0.0` / `1` |
   | Host | `carlot78.github.io` |
   | Start URL | `/aphorisms/` |
   | Display mode | Standalone |
   | Status bar / nav bar color | `#F3EAD8` |
   | Splash background | `#F3EAD8` |
   | Notification delegation | **On** (per il promemoria quotidiano) |
   | Share target | **On** se presente (per "Condividi → Aphorisms") |
   | Signing key | **Create new** — compila nome e una password che **conservi** |

3. Scarica lo zip. Contiene:
   - `app-release-bundle.aab` → da caricare su Play;
   - `signing.keystore` + `signing-key-info.txt` → **conservali in un posto
     sicuro** (cloud privato + chiavetta). Senza, non potrai più aggiornare l'app;
   - `assetlinks.json` con l'impronta SHA-256 della tua chiave.

## 3. Collegare l'app al dominio (assetlinks)

L'impronta va nel repo `carlot78.github.io`, file `.well-known/assetlinks.json`,
al posto di `REPLACE_WITH_PLAY_APP_SIGNING_SHA256_FINGERPRINT`. Servono **due**
impronte, perché Google rifirma l'app:

1. quella del file `assetlinks.json` di PWABuilder (la tua chiave di caricamento);
2. quella di Google: Play Console → la tua app → **Test e rilascio → Integrità
   dell'app → Firma dell'app** → *Certificato della chiave di firma dell'app* →
   **Impronta del certificato SHA-256** (visibile dopo il primo caricamento).

Mandami le due impronte (sono pubbliche) e aggiorno io il file; oppure modificalo
tu su GitHub. Il risultato deve essere:

```json
"sha256_cert_fingerprints": [
  "AA:BB:…  (PWABuilder)",
  "CC:DD:…  (Google Play)"
]
```

Finché l'impronta di Google manca, l'app installata da Play mostra una barra
dell'indirizzo in alto: è il segnale che manca questo passo.

## 4. Creare l'app in Play Console

**Crea app** → nome `Aphorisms`, lingua predefinita Italiano (o Inglese), *App*,
*Gratuita*, accetta le dichiarazioni.

### Scheda dello store (Crescita → Presenza nello store → Scheda principale)

- **Icona**: `icons/play-icon-512.png`
- **Grafica in evidenza**: `icons/play-feature-1024x500.png`
- **Screenshot telefono**: i 4 file di `screenshots/` (in quest'ordine: seal,
  thought, journey, welcome). Se vuoi immagini più nitide, fai gli stessi
  screenshot dal tuo telefono.
- **Categoria**: Libri e consultazione · Tag: citazioni, filosofia, crescita personale
- **E-mail di contatto**: la tua (Google la mostra pubblicamente nella scheda)
- **Informativa privacy**: `https://carlot78.github.io/aphorisms/privacy.html`

**Italiano**

- *Descrizione breve (max 80):*
  `Un pensiero al giorno dalle grandi voci della saggezza.`
- *Descrizione completa:*

  > Ogni giorno un pensiero, sotto un sigillo di ceralacca da rompere: un
  > aforisma o un breve passo dai grandi autori — gli Stoici, Laozi e il Buddha,
  > Montaigne ed Emerson, Frankl, Tolstoj e molti altri.
  >
  > • Scegli i temi che ti ispirano: resilienza, mente calma, morte e tempo,
  > abitudini, felicità, amore, coraggio, saggezza…
  > • Vota ogni pensiero 🙁 😐 🙂: l'app impara i tuoi gusti e, insieme ai voti
  > anonimi di tutti i lettori, sceglie quello che ti parla di più.
  > • Una volta a settimana ti presenta una voce nuova da conoscere.
  > • Serie di giorni consecutivi, livelli da Novizio a Oracolo e dodici allori
  > da conquistare.
  > • Traduzione del pensiero in 24 lingue, accanto all'originale.
  > • Salva i tuoi preferiti e aggiungi passi tuoi: condividi un testo da Chrome,
  > Kindle o un PDF verso Aphorisms, o importa le note del Kindle.
  > • Promemoria quotidiano facoltativo.
  >
  > Nessun account, nessuna pubblicità. Le citazioni provengono da Wikiquote
  > (CC BY-SA 4.0).

**English**

- *Short description:* `One thought a day from the great voices of wisdom.`
- *Full description:*

  > Every day, one thought waits under a wax seal: an aphorism or short passage
  > from the great authors — the Stoics, Laozi and the Buddha, Montaigne and
  > Emerson, Frankl, Tolstoy and many more.
  >
  > • Choose the themes that inspire you: resilience, calm mind, death & time,
  > habits, happiness, love, courage, wisdom…
  > • Rate each thought 🙁 😐 🙂 — the app learns your taste and, together with
  > every reader's anonymous votes, picks what speaks to you.
  > • Once a week it introduces a new voice to get to know.
  > • Daily streaks, levels from Novice to Oracle, and twelve laurels to earn.
  > • Each thought translated into 24 languages, beside the original.
  > • Save favourites and add your own passages: share text from Chrome, Kindle
  > or a PDF to Aphorisms, or import your Kindle highlights.
  > • Optional daily reminder.
  >
  > No account, no ads. Quotes from Wikiquote (CC BY-SA 4.0).

### Contenuti dell'app (Policy → Contenuti dell'app)

| Sezione | Risposta |
| --- | --- |
| Informativa privacy | l'URL sopra |
| Annunci | No, l'app non contiene annunci |
| Accesso all'app | Tutte le funzionalità sono disponibili senza accesso |
| Classificazione dei contenuti | Questionario: categoria *Riferimento, notizie o istruzione*; rispondi **No** a violenza, sesso, linguaggio, droghe, gioco d'azzardo; **No** a interazione tra utenti e condivisione posizione → PEGI 3 / Per tutti |
| Pubblico di destinazione | **13+** (non rivolta ai bambini) |
| App di notizie | No |
| Funzionalità finanziarie, salute, ecc. | No |

### Sicurezza dei dati (Data safety)

| Domanda | Risposta |
| --- | --- |
| L'app raccoglie o condivide dati utente? | **Sì** |
| Tutti i dati sono criptati in transito? | **Sì** (solo HTTPS) |
| Gli utenti possono chiedere l'eliminazione? | **Sì** (ritirando il voto, "Reset the app", o tramite GitHub Issues) |
| Tipi di dati raccolti | **Attività nell'app → Altre azioni dell'utente** (i voti 🙁/😐/🙂) e **Identificatori dispositivo o altri ID** (ID anonimo casuale generato dall'app) |
| Per ciascuno: raccolto / condiviso | Raccolto: **Sì**. Condiviso con terze parti: **No** (Supabase è un fornitore di servizi per conto tuo) |
| Trattamento effimero? | No |
| Obbligatorio o facoltativo? | **Facoltativo** (si vota solo se si vuole) |
| Finalità | **Funzionalità dell'app** e **Personalizzazione** |

Il testo inviato per la traduzione e le richieste a Wikiquote non sono "raccolti"
dall'app (vanno direttamente al servizio scelto, senza essere conservati da te).

## 5. Test chiuso (obbligatorio per i nuovi account personali)

1. **Test e rilascio → Test → Test chiuso → Crea traccia** → aggiungi un elenco
   di tester con i 12+ indirizzi Gmail.
2. **Crea release** → carica `app-release-bundle.aab` → note di rilascio
   ("Prima versione") → **Revisione e avvio**.
3. Dopo l'approvazione (di solito poche ore, a volte qualche giorno) copia il
   **link per partecipare** e mandalo ai tester: devono aprirlo, accettare e
   **installare** l'app, e tenerla installata **14 giorni**.
4. Ora prendi l'**impronta SHA-256 di Google** (passo 3) e aggiorniamo
   `assetlinks.json`.

## 6. Produzione

Dopo i 14 giorni compare **Richiedi l'accesso alla produzione**: rispondi alle
domande sul test (quanti tester, che feedback), poi crea una release in
**Produzione** con lo stesso `.aab` (o uno nuovo con version code 2) e invia in
revisione.

## Aggiornamenti futuri

- Modifiche a testi, grafica, funzioni del sito → **niente da fare su Play**:
  basta pubblicare su GitHub.
- Nuova icona, nome o impostazioni Android → rigenera il pacchetto su PWABuilder
  con **la stessa chiave** (`signing.keystore`) e un **version code più alto**,
  poi carica il nuovo `.aab`.
