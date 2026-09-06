# Nambarone.lol

Nambarone is a digital creator billboard where Instagram and YouTube creators pay for public advertising placement.

**Claim your spot on the creator billboard.**

## Production architecture

- Static frontend served by Cloudflare Pages.
- Cloudflare Pages Functions provide the API under `/api/*`.
- Cloudflare D1 is the shared source of truth for rankings, activity, and visits.
- Browsers may cache the last board for fast rendering, but cached/local browser data is never authoritative.
- The leaderboard polls the shared API every 3 seconds and refreshes when a tab becomes visible.
- Claims are server-side only. The browser cannot set a rank, amount, ownership, or payment status directly.
- Payment verification will be the only remaining checkout integration.
- Creator identity is intended to be tied to a verified Instagram or YouTube account, not a phone, browser, cookie, or IP address. Multiple creators can use the same device.
- Claim writes should be atomic and idempotent so simultaneous outbids cannot create inconsistent rankings.

## Required Cloudflare setup

1. Create a D1 database named `nambarone`.
2. Run `schema.sql` against that database.
3. Put the D1 database ID in `wrangler.toml`.
4. Deploy the repository as a Cloudflare Pages project with Functions enabled.
5. Add the custom domain `nambarone.lol` to the Pages project.

## Pages

- `/` — all-time leaderboard
- `/today.html` — today leaderboard
- `/rules.html` — ranking and claiming rules
- `/about.html` — what Nambarone is
- `/why-pay.html` — why payments are required and what they support
- `/contact.html` — contact
- `/terms.html` — terms
- `/privacy.html` — privacy

## Payment integration

Payment-provider credentials must remain in server-side environment variables/secrets. The frontend must never receive a merchant secret or database write credential. The payment flow should be:

`creator profile → server calculates required amount → payment order → provider verification/webhook → atomic D1 claim → live leaderboard update`

A successful browser redirect alone must never grant a rank.
