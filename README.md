# Tacta: pass-and-play

An unofficial pass-and-play companion for the card game Tacta, made so a group of friends who own the physical game can play on one phone when the cards aren't handy. It runs entirely in the browser (no server, no accounts) and installs as an app.

**Play:** https://rbuchmeier.github.io/tacta/

To install it, open the link on your phone and choose *Add to Home Screen* (Safari's share menu on iPhone, or the install prompt / ⋮ menu in Chrome on Android). It works offline after the first visit.

## Not affiliated

Tacta is designed by Jason Tremblay and published by The Op. This project is not affiliated with, endorsed by, or sponsored by them. The game's name and card designs belong to their owners; the card layouts here were transcribed by hand from a purchased copy for personal use. If you enjoy it, buy the game.

No license is granted for this repository. All rights reserved.

## Development

```sh
npm install
npm run dev       # http://localhost:5317
npm test          # rules engine and deck tests
npm run build && npm run preview   # production build with the service worker, http://localhost:4317
```

Pushing to `main` runs the tests and deploys to GitHub Pages (`.github/workflows/deploy.yml`).

### Layout

- `src/deck/tacta.ts`: the 18 cards every color has, plus the starting card, in "frame units".
- `src/engine.ts`: rules: legal placements, scoring, turn order, first player.
- `src/geometry.ts`: card transforms (45° steps, flips) and convex-polygon math.
- `src/ui/`: setup screen, game screen, pannable board, card rendering.
- `public/`: manifest, service worker, icons.

### Placement model

Cards are measured in frame units: the white frame is 14 × 20 with a 0.8 colored margin around it. A card can be turned in 45° steps and flipped over (16 orientations). A placement is legal when:

- one of its shapes exactly covers a matching open shape on another card;
- its printed area (inside the white frame) overlaps the card underneath only inside that shape, so the outline underneath stays continuous;
- it covers none of that card's other dots and no other card's printed area (margins may touch).

The second rule is what makes triangles connect only edge-to-corner on a 45° turn, and bands, squares and full bands connect square-on. If neither outermost card can connect, the player may place one apart from the board.
