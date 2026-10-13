# Aphorisms

One thought a day — a sentence, aphorism or short paragraph — drawn from the
personal-development sources you choose. The app fetches the text itself from
[Wikiquote](https://en.wikiquote.org), so the pool keeps growing without you
maintaining a quote list.

**Live app:** https://carlot78.github.io/aphorisms/

## How it works

- **Choose what inspires you** — on first launch you pick a few themes
  (resilience, calm mind, death & time, habits, happiness…). Each day you get
  one thought on them, from every author in the catalogue. You can also follow
  specific authors, and add passages of your own.
- **A daily ritual** — today's thought waits under a wax seal. Breaking it
  keeps your **streak** going; ratings, saves and new authors earn XP towards
  seven levels (Novice → Oracle) and twelve laurels. Tap the 🔥 to see your
  journey.
- **It learns your taste** — rate each thought 🙁 😐 🙂. Your ratings, and —
  when the community database is configured — everyone's, tilt future picks
  towards what speaks to you. One pick in five stays random, and about once a
  week a completely new author is introduced.
- **Autonomous retrieval** — quotes come from Wikiquote, live in the browser
  and from a weekly snapshot committed by a GitHub Action
  ([`refresh-quotes.yml`](.github/workflows/refresh-quotes.yml)), which also
  rebuilds the theme index.
- **Translation** — optionally show each thought in a second language too.
- **Send text from other apps** — share a passage from Chrome, Kindle, a PDF
  reader… (Android share sheet once installed, bookmarklet on desktop), or
  import Kindle `My Clippings.txt`.
- **Daily reminder** — an optional push notification, sent by a GitHub Action.
- **Installable & offline** — a PWA: "Add to Home Screen" on a phone.
- **Private** — everything lives in your browser. Community votes, if enabled,
  carry only an anonymous random id, a quote hash and the vote; your own
  passages are never sent.

## Community ratings (optional, Supabase)

Shared ratings need a small database. Supabase's free tier is enough:

1. Create a project at [supabase.com](https://supabase.com) (free plan).
2. Open **SQL Editor → New query**, paste [`supabase/schema.sql`](supabase/schema.sql)
   and run it. It creates the `votes` table (not publicly readable), two
   functions to cast/clear a vote, and the aggregate view `quote_scores`.
3. In **Project Settings → API**, copy the **Project URL** and the **anon
   public** key into [`src/community-config.js`](src/community-config.js),
   commit and push. Both values are public by design.

Until then the app works on each reader's own ratings only.

## Android app (Google Play)

The app is packaged as a Trusted Web Activity with PWABuilder; the domain
verification file lives in the [`carlot78.github.io`](https://github.com/carlot78/carlot78.github.io)
repository. Step-by-step guide (in Italian), store texts and Data safety
answers: [`docs/PLAY_STORE.md`](docs/PLAY_STORE.md).

## Run locally

It's plain HTML/JS with no build step. Serve the folder over HTTP (ES modules
don't load from `file://`):

```bash
python -m http.server 8080
```

then open http://localhost:8080.

## Push notifications (optional)

There is no server, so the daily push is sent by the repository's own
[`daily-push.yml`](.github/workflows/daily-push.yml) workflow. One-time setup:

1. Generate a VAPID key pair (the public half is in `src/push-config.js`) and
   store the private half as the repository secret `VAPID_PRIVATE_KEY`.
2. In the app, open Settings → **Daily reminder**, pick the hour, tap
   **Turn on** and allow notifications. (iPhone/iPad: add the app
   to the Home Screen first and open it from there.)
3. Copy the configuration shown and save it as the repository secret
   `PUSH_CONFIG`. It contains the device's push subscription plus your sources,
   language and hour — copy it again after changing those.

The workflow runs hourly, and at your hour picks a quote from your sources in
the snapshot, translates it if you chose a language, and pushes it. Opening the
app from the notification shows that same quote. Run the workflow manually
from the Actions tab to get a test push immediately.

## Refresh the snapshot manually

```bash
node scripts/fetch.mjs            # every catalog source
node scripts/fetch.mjs seneca     # one source id (see src/sources.js)
```

## Layout

| Path | Purpose |
| --- | --- |
| `index.html`, `style.css`, `app.js` | The app |
| `src/wikiquote.js` | Wikiquote fetch + HTML parser (shared by browser and Node) |
| `src/sources.js` | Source catalog |
| `src/translate.js` | Translation providers (on-device → MyMemory → Google) |
| `scripts/fetch.mjs` | Snapshot builder used by the Action |
| `scripts/push.mjs`, `src/push.js`, `src/push-config.js` | Web Push: sender (Action), browser subscription, VAPID public key |
| `src/journey.js` | Streaks, XP, levels, laurels |
| `src/community.js`, `src/community-config.js`, `supabase/schema.sql` | Shared ratings (Supabase) |
| `src/themes.js`, `scripts/themes.mjs` | Themes and the weekly theme index |
| `data/` | Generated snapshot (committed by the Action) |
| `sw.js`, `manifest.webmanifest` | PWA bits |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Requirements and architecture document |

## Licence

Code: MIT. Quote text comes from Wikiquote and is
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
