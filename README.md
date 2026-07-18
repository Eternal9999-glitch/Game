# 🕹 Game — multiplayer browser games, one HTML file each

Two games live in this repo. Download a file, open it in a browser, and play — no install,
no build, no server to run. Multiplayer is peer-to-peer over WebRTC (PeerJS handles
signaling), so the host's browser *is* the server.

| Game | File | Genre |
|---|---|---|
| 🎨 [Turf Wars](#-turf-wars) | [`turfwars.html`](turfwars.html) | pixel territory party game |
| 🧊 [VoxelVerse](#-voxelverse) | [`index.html`](index.html) | third-person voxel sandbox |

---

# 🎨 Turf Wars

A **multiplayer pixel territory party game in a single HTML file**, inspired by War of Dots.
A big pixel map is generated at match start — most of it empty — and every player spawns
with a small cluster of paint at a random position. Whoever owns the most turf after
**5 minutes** wins.

![genre](https://img.shields.io/badge/genre-territory%20party%20game-ffd23f) ![players](https://img.shields.io/badge/multiplayer-P2P%20WebRTC-5ec4ff) ![files](https://img.shields.io/badge/files-1-b48cff)

## How to play with friends

1. One player opens `turfwars.html`, enters a name, and clicks **Host Online Game** — a
   5-letter room code appears in the lobby (click it to copy).
2. Up to 7 friends open the same file, type the code, and click **Join**. The host can top
   the lobby up with bots. Late joiners can even drop into a running match.
3. The host clicks **Start Game**. There's also **Practice vs Bots** for offline play.

## Rules

- **Economy** — every player earns **+1 coin per second** (and starts with a small purse).
  Coins buy units, which spawn at your flag.
- **Movement** — click one of your units (it highlights), then **drag a path**; the unit
  follows your drawn line fluidly. Tap open ground to send the selected unit straight
  there; tap the unit again to halt it.
- **Capturing** — a moving unit paints every **empty or undefended enemy tile** it crosses.
  Tiles close to an enemy unit are *defended* and can't be painted from under it.
- **Battle** — when two opposing units touch, the lower-power unit is destroyed, the
  survivor loses that much power, and the winner's owner earns **+1 gold**. Equal power
  destroys both.
- **Winning** — when the 5-minute timer ends, the player owning the most tiles wins.

## Units

| Unit | Key | Cost | Power | Speed | Role |
|---|---|---|---|---|---|
| ▶ Dart | `1` | 6 🪙 | 5 | 13 | fast scout, thin paint trail |
| ● Guard | `2` | 10 🪙 | 12 | 8.5 | all-rounder |
| ■ Titan | `3` | 18 🪙 | 26 | 5.2 | slow bruiser, widest trail |

Each player fields at most 12 units. A unit's current power is printed under it — that's
the number battles compare.

## Tech notes

Vanilla JavaScript + a 2D canvas; the only runtime dependency is
[PeerJS](https://peerjs.com) from CDN (WebRTC signaling via the free public PeerJS cloud).
The host's browser runs the authoritative simulation — units, paint, battles, coins and
the clock — and streams snapshots to guests at ~12 Hz (territory as run-length deltas);
guests send only commands (buy / set path) and interpolate between snapshots. Mouse and
touch both work. A background tick keeps the host simulating while its tab is hidden, and
heartbeats detect dropped players. Bots (buy, expand toward unowned turf, hunt weaker
units) fill out lobbies and power practice mode.

---

# 🧊 VoxelVerse

A third-person **multiplayer voxel sandbox game in a single HTML file**. Download
[`index.html`](index.html), open it in a desktop browser, and play.

![genre](https://img.shields.io/badge/genre-voxel%20sandbox-6ee76e) ![players](https://img.shields.io/badge/multiplayer-P2P%20WebRTC-5ec4ff) ![files](https://img.shields.io/badge/files-1-b48cff)

## How to play with friends

1. One player opens `index.html`, enters a name, and clicks **Host Online World** — a 5-letter room code appears in the top-right corner (click it to copy).
2. Friends open the same file (send it to them, or serve it anywhere), type the code, and click **Join**.
3. Everyone shares one world: the terrain seed, every placed/broken block, positions, and chat are synchronized live.

Multiplayer is peer-to-peer over WebRTC (PeerJS handles signaling), so there is no game server — the host's browser *is* the server. An internet connection is required for online play; **Singleplayer (offline)** works once the page assets are cached.

## Controls

| Input | Action |
|---|---|
| `WASD` | Move |
| Mouse | Look (third-person orbit camera) |
| `Space` | Jump / swim up |
| `Shift` | Sprint |
| Left click | Mine block / punch mob (hold to repeat) |
| Right click | Place block (hold to repeat) |
| `1`–`9` | Select block (dirt, stone, sand, wood, leaves, planks, brick, glass, wool) |
| `E` | Inventory & crafting |
| `F` | Eat a porkchop (+4 hearts) |
| Scroll | Camera zoom |
| `T` | Chat |
| `Esc` | Pause menu |

## Gameplay

You start with empty pockets. **Break blocks to gather them** — every mined block turns into
a pickup that flies into your inventory, and placing costs what you carry. Punch trees for
wood, then craft in the inventory (`E`): `1 wood → 4 planks`, `2 stone → 4 bricks`,
`1 sand → 1 glass`. **Pigs** drop porkchops (eat with `F` to heal) and **sheep** drop wool.
When the sun sets, **zombies** rise and hunt players — they hit hard, so build shelter or
keep your hearts up. Health regenerates slowly when you haven't been hurt for a while;
falling from heights hurts too.

## Features

- **Procedural terrain** — seeded value-noise heightmap with plains, mountains, beaches, lakes, snowy peaks, and forests; every peer generates an identical world from the shared seed.
- **Pixel-art texturing** — a 16-tile atlas drawn procedurally on a canvas at boot (grass tufts, bark ridges, growth rings, brick courses, glass sheen…), sampled with nearest-neighbor filtering; combined with per-vertex ambient occlusion and directional face shading.
- **Detailed voxel models** — players, zombies, pigs, and sheep are assembled from dozens of small cubes: faces with eyes, brows, noses and mouths, layered hair, sleeves, boots, snouts, ears, and fleece, with walk/swing animations and name tags.
- **Day/night cycle** — drifting sun and moon, tinted terrain and fog, and zombies that spawn in the dark and crumble at dawn.
- **Mobs** — host-simulated AI (wander, flee, chase) with voxel-aware physics, streamed to guests at ~10 Hz with interpolation.
- **Survival loop** — per-player gathering with magnetic item pickups, a hotbar with carry counts, an inventory/crafting panel, hearts, hunger-free eating, fall damage, knockback, and respawn.
- **Real physics** — swept AABB collision, gravity, jumping, sprinting, swimming, camera collision, and DDA voxel raycasting for block targeting.
- **Host-relay networking** — the host owns the seed, edit log, mobs, and loot authority; guests connect by room code, late joiners receive the full edit history, and state updates stream at ~12 Hz with interpolation. A background tick keeps the host's world alive even when its tab is hidden.
- **Chat, pause menu, sound effects** — the whole game UI lives in the same file.

## Tech notes

The file loads exactly two libraries from CDN at runtime: [Three.js](https://threejs.org) (rendering) and [PeerJS](https://peerjs.com) (WebRTC signaling via the free public PeerJS cloud). Everything else — engine, texture atlas, meshing, physics, mob AI, netcode, UI — is hand-written vanilla JavaScript inside `index.html`.
