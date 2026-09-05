# Nambarone.lol

India-focused creator ranking game.

> **Pre-launch build — payments are OFF.**

Nambarone lets creators claim a position on a public ranking board and share their position with their audience.

## Current status

This is the **free pre-launch version**.

- Payments are OFF.
- Nothing on the site charges money.
- “Try” / “Claim” actions create demo rankings locally.
- Cashfree payment integration will be added after production KYC and payment wiring are completed.

## Important security note

Do **not** put a Cashfree secret, API key, JSONBin Master Key, database credential, or any other private secret inside the frontend.

The current `config.js` intentionally contains no write/master credentials.

## Pages

- `/` — All-time leaderboard
- `/today.html` — Today's leaderboard
- `/clicks.html` — Profile-click leaderboard
- `/rules.html` — Rules
- `/about.html` — About
- `/contact.html` — Contact
- `/terms.html` — Terms
- `/privacy.html` — Privacy

## Deployment

The project is a static HTML/CSS/JavaScript site.

The repository root must contain:

`index.html`

It can be deployed using Cloudflare Pages or another static hosting provider.

## Roadmap

1. Launch free pre-launch version
2. Build initial creator/community traction
3. Complete Cashfree KYC
4. Add secure server-side payment processing
5. Add real-time shared rankings
6. Add outbid notifications and viral “take it back” mechanics

## License

All rights reserved.
