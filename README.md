# 🧊 VoxelVerse

A third-person **multiplayer voxel sandbox game in a single HTML file**. Download
[`index.html`](index.html), open it in a desktop browser, and play — no install, no build, no server to run.

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
| Left click | Break block (hold to keep mining) |
| Right click | Place block |
| `1`–`9` | Select block (grass, dirt, stone, sand, wood, leaves, planks, brick, glass) |
| Scroll | Camera zoom |
| `T` | Chat |
| `Esc` | Pause menu |

## Features

- **Procedural terrain** — seeded value-noise heightmap with plains, mountains, beaches, lakes, snowy peaks, and forests; every peer generates an identical world from the shared seed.
- **Chunked voxel renderer** — 160×64×160 world meshed in 16×16 column chunks with per-vertex ambient occlusion, directional face shading, and translucent water/glass passes (Three.js, vertex colors — no textures).
- **Third-person characters** — animated blocky avatars with name tags, walk cycles, and head pitch that follows the camera.
- **Real physics** — swept AABB collision, gravity, jumping, sprinting, swimming, camera collision, and DDA voxel raycasting for block targeting.
- **Host-relay networking** — the host owns the seed and edit log; guests connect by room code, late joiners receive the full edit history, and state updates stream at ~12 Hz with interpolation.
- **Chat, hotbar, pause menu, sound effects** — the whole game UI lives in the same file.

## Tech notes

The file loads exactly two libraries from CDN at runtime: [Three.js](https://threejs.org) (rendering) and [PeerJS](https://peerjs.com) (WebRTC signaling via the free public PeerJS cloud). Everything else — engine, meshing, physics, netcode, UI — is hand-written vanilla JavaScript inside `index.html`.
