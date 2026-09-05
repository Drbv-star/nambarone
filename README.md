# Nambarone.lol

Pay to claim your spot. Be Nambarone.

## Shared board (so every visitor sees the same list)

1. Create a free account at https://jsonbin.io
2. New bin. Contents:

```
{"listings":[],"activity":[]}
```

3. Copy Bin ID and Master Key into `config.js` (and the same values are inside index.html / today.html / clicks.html — search for jsonbinId).

Without those two fields the sheet still works, but only on that browser.

## Deploy

Upload this whole folder to nambarone.lol (Cloudflare Pages, Netlify, or any static host).
Homepage must be index.html.

Payments are not wired yet.
