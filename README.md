# 🎮 Game

Browser games, each playable straight from its HTML file — no install, no build. (Phone Empire is a folder: download it whole.)

| Game | Play | What it is |
|---|---|---|
| 📱 **Phone Empire Tycoon** | [`phone-empire/index.html`](phone-empire/index.html) · [docs](phone-empire/README.md) | Start in 1996 with $10k: raise money from investors, design phones part by part around a live 3D model, research ~160 upgrades, floorplan your own chips, and build phones with contract manufacturers or your own factories. Three playstyles. |
| 🧊 **VoxelVerse** | [`index.html`](index.html) | Third-person multiplayer voxel sandbox (details below). |

---

## 🧊 VoxelVerse

A third-person **multiplayer voxel sandbox game in a single HTML file**. Download
[`index.html`](index.html), open it in a desktop browser, and play — no install, no build, no server to run.

![genre](https://img.shields.io/badge/genre-voxel%20sandbox-6ee76e) ![players](https://img.shields.io/badge/multiplayer-P2P%20WebRTC-5ec4ff) ![files](https://img.shields.io/badge/files-1-b48cff)

### How to play with friends

1. One player opens `index.html`, enters a name, and clicks **Host Online World** — a 5-letter room code appears in the top-right corner (click it to copy).
2. Friends open the same file (send it to them, or serve it anywhere), type the code, and click **Join**.
3. Everyone shares one world: the terrain seed, every placed/broken block, positions, and chat are synchronized live.

Multiplayer is peer-to-peer over WebRTC (PeerJS handles signaling), so there is no game server — the host's browser *is* the server. An internet connection is required for online play; **Singleplayer (offline)** works once the page assets are cached.

### Controls

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

### Gameplay

You start with empty pockets. **Break blocks to gather them** — every mined block turns into
a pickup that flies into your inventory, and placing costs what you carry. Punch trees for
wood, then craft in the inventory (`E`): `1 wood → 4 planks`, `2 stone → 4 bricks`,
`1 sand → 1 glass`. **Pigs** drop porkchops (eat with `F` to heal) and **sheep** drop wool.
When the sun sets, **zombies** rise and hunt players — they hit hard, so build shelter or
keep your hearts up. Health regenerates slowly when you haven't been hurt for a while;
falling from heights hurts too.

### Features

- **Procedural terrain** — seeded value-noise heightmap with plains, mountains, beaches, lakes, snowy peaks, and forests; every peer generates an identical world from the shared seed.
- **Pixel-art texturing** — a 16-tile atlas drawn procedurally on a canvas at boot (grass tufts, bark ridges, growth rings, brick courses, glass sheen…), sampled with nearest-neighbor filtering; combined with per-vertex ambient occlusion and directional face shading.
- **Detailed voxel models** — players, zombies, pigs, and sheep are assembled from dozens of small cubes: faces with eyes, brows, noses and mouths, layered hair, sleeves, boots, snouts, ears, and fleece, with walk/swing animations and name tags.
- **Day/night cycle** — drifting sun and moon, tinted terrain and fog, and zombies that spawn in the dark and crumble at dawn.
- **Mobs** — host-simulated AI (wander, flee, chase) with voxel-aware physics, streamed to guests at ~10 Hz with interpolation.
- **Survival loop** — per-player gathering with magnetic item pickups, a hotbar with carry counts, an inventory/crafting panel, hearts, hunger-free eating, fall damage, knockback, and respawn.
- **Real physics** — swept AABB collision, gravity, jumping, sprinting, swimming, camera collision, and DDA voxel raycasting for block targeting.
- **Host-relay networking** — the host owns the seed, edit log, mobs, and loot authority; guests connect by room code, late joiners receive the full edit history, and state updates stream at ~12 Hz with interpolation. A background tick keeps the host's world alive even when its tab is hidden.
- **Chat, pause menu, sound effects** — the whole game UI lives in the same file.

### Tech notes

The file loads exactly two libraries from CDN at runtime: [Three.js](https://threejs.org) (rendering) and [PeerJS](https://peerjs.com) (WebRTC signaling via the free public PeerJS cloud). Everything else — engine, texture atlas, meshing, physics, mob AI, netcode, UI — is hand-written vanilla JavaScript inside `index.html`.
