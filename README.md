# ⚽ GooBall

A **1v1 goo-physics party soccer game in a single HTML file**. Download
[`index.html`](index.html), open it in a desktop browser, and play — no install, no build, no server to run.

![genre](https://img.shields.io/badge/genre-physics%20party%20soccer-7cfc66) ![players](https://img.shields.io/badge/multiplayer-P2P%20WebRTC%20%2B%20local-5ec4ff) ![files](https://img.shields.io/badge/files-1-b48cff)

There is **no kick button**. You are a little ball of goo that stretches as it moves, and the only ways
to move the ball are pure physics: bump it, **charge a dash** and punt it across the pitch, or park on
top of it for **3 seconds** to **absorb** it into your goo — then dash to launch it like a cannonball.
Get dashed while carrying and the ball flies right back out.

## How to play with a friend

**Online** — one player opens `index.html` and clicks **Host Online Match**; a 5-letter room code
appears (click to copy). The friend opens the same file, types the code, and clicks **Join**. The host
picks the map and kicks off. Multiplayer is peer-to-peer over WebRTC (PeerJS handles signaling), so
there is no game server — the host's browser *is* the referee. Internet is required for online play.

**Local** — click **Local 1v1** and share a keyboard: WASD vs. arrow keys.

## Countries

You don't play as a real nation — you **found your own**. Name it (16 chars of pure diplomacy) and
design its flag: 12 patterns × 3 colors × 9 emblems. Your flag flies over your goo, the scoreboard,
and the victory screen. Player 2 gets their own country in local play. Everything is saved in your browser.

## The rules

- **5-minute match**, most goals wins. Tied at full time → **golden goal** sudden death.
- **Dash**: hold to charge (~1.2 s), release to fly. A **max-charged** dash that lands on your opponent
  deals **30 damage** and sends them across the map.
- **Absorb**: sit on the ball uninterrupted for 3 s to swallow it. Dash to launch it (power scales with
  charge); take a hit and it pops out. Waddling it into the net also counts.
- **Health**: 100 HP. Damage comes from max dashes, cards, and very hard wall slams. At 0 HP you're
  **out for 5 seconds**, then respawn at your own goal gates.
- **Cards**: before the match, build a deck of **6 of 15 cards**. In-match you start each round with
  **3 ⭐**, gain **+1 ⭐ every 5 s** (cap 10), and points reset to 3 after every goal. Cards are played
  with hotkeys or by clicking them.

## The 15 cards

| Card | ⭐ | Effect |
|---|---|---|
| 🫧 Goo Burst | 3 | Balloon out for 2 s, shoving ball & foe away |
| 🪚 Sawblade | 4 | Become a blade for 5 s — contact shreds & flings (no absorbing while spinning) |
| 💣 Self-Destruct | 5 | 1 s fuse, then a huge blast. You go down with it |
| 🌪️ Tornado | 5 | Suck everything in for 4 s; touching the ball absorbs it **instantly** |
| 💚 Heal | 2 | Regrow 35 HP over 3 s |
| 🛡️ Goo Armor | 2 | 4 s: immune to damage, barely knocked back |
| 🧲 Magnet | 3 | 4 s: the ball drifts toward you from anywhere |
| 👻 Ghost | 2 | 3 s: phase through your foe and their tricks |
| ⚡ Speed Surge | 2 | 3 s: move faster, charge dashes faster |
| 🧊 Frostbite | 3 | Chill your foe — 50 % slower for 3 s |
| 🔁 Swap | 4 | Instantly trade places with your foe |
| 🕳️ Black Hole | 4 | Drop a vortex that drags foe & ball for 3 s |
| 🐘 Giant | 4 | 5 s: double size, huge mass, hard to shove |
| 🔬 Shrink Ray | 3 | Zap your foe down to 60 % size for 5 s |
| 🧱 Goo Wall | 3 | Raise a wall just ahead of you for 4 s |

## The 5 maps

1. **Classic Pitch** — a pure pitch, no excuses
2. **The Pillars** — four bumpers guard midfield
3. **Hourglass** — fight through the pinch
4. **Pinball** — corner rounds plus a centre bumper that *kicks*
5. **Boost Lanes** — conveyor currents along both flanks

## Controls

| Input | Player 1 (& online) | Player 2 (local) |
|---|---|---|
| Move | `WASD` | `↑ ← ↓ →` |
| Dash (hold + release) | `Space` | `Enter` / `R-Shift` |
| Cards | `1`–`6` | `7 8 9 0 - =` |
| Pause | `Esc` | `Esc` |
| Mute | `M` | `M` |

## Tech notes

Everything — the fixed-step goo physics (squishy soft-body ball contact, impulse collisions, mass,
knockback), 15 card effects, flag designer, procedural WebAudio sound, particles, menu attract-mode AI,
and the host-authoritative netcode (guest sends inputs, host streams ~25 Hz snapshots with
interpolation, ≈ 21 KB/s) — is hand-written vanilla JavaScript on a 2D canvas inside `index.html`.
The file loads exactly one library at runtime, and only for online play:
[PeerJS](https://peerjs.com) (WebRTC signaling via the free public PeerJS cloud). Local 1v1 works fully offline.
