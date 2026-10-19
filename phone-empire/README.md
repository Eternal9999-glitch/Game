# 📱 Phone Empire Tycoon

A device-maker tycoon inspired by Roblox's *Build a Phone Empire*, but you don't just buy upgrades: you **engineer the hardware**.
Start in 1973 with $10k, when "mobile phone" means a 6 kg radio-telephone in a car trunk. Win over investors, research your way
through 0G, 1G, 2G… 5G, design every component yourself, arrange every port and button on the body, and decide who builds it all.

## How to run it

The game is a folder of plain HTML/CSS/JS files with no build step. Download the whole `phone-empire/` folder (on GitHub:
**Code → Download ZIP**) and open `index.html` in a browser. The 3D preview loads three.js from cdnjs, so it needs an
internet connection; offline, the Phone Lab still works without the 3D model. The game autosaves to your browser every in-game month.

## How to play

1. **Pick a playstyle and an era** on the start screen: 1973 (car phones), 1983 (first handhelds), 1996 (flip phones), 2007 (smartphones) or 2016.
   - 🎨 **Design House**: cheaper development, stronger marketing, lower contract fees.
   - 🏭 **Manufacturer**: starts with a workshop, cheaper plants, more supply contracts.
   - 🔬 **Tech Pioneer**: faster, cheaper research, cheaper tooling and tape-outs, bigger licensing royalties.
2. **📱 Phone Lab**: pick a form factor (car, bag, brick, candybar, flip, QWERTY, slider, touch, foldable, tablet) and every part around a
   live 3D model. Each part is either a **supplier part**, configurable within what suppliers sell, or **one of your own designs**.
   - **🧩 Body**: form factor, material, finish and color, plus an accent color (buttons, camera island, keys), a black or white
     front, key style (classic, round, flush pad, bubble), corner roundness, edge profile and **size**. Make the body wider or taller
     and the same parts spread thinner (keypads grow too); make it thicker for spare room, then fill it with a bigger battery.
     Bigger bodies weigh more and score lower on design, but shed more heat.
   - **📐 Layout** unfolds the body into front, back and four edges. Drag the earpiece, mic, speakers, power and volume keys, ports,
     headphone jack, SIM tray, card slot, cameras, flash, fingerprint sensor, antenna, logo and optional keys anywhere they fit.
   - Ergonomics are scored: thumb reach, the mouth-to-ear distance between mic and earpiece, cameras your palm covers,
     cables digging into your hand. Ports and jacks need body thickness.
3. **🛠️ Parts Lab**: each part type has its own design system:
   - **Display**: a layer stack of cover glass, touch layer, polarizer, emitter or liquid crystal plus color filter, TFT backplane and backlight.
     Design rules apply (OLED needs LTPS, passive matrices smear when large).
   - **Camera**: an optical bench with sensor type, optical format, megapixels, lens elements, aperture, focal length, autofocus,
     stabilization and periscope. Diffraction, pixel pitch and light gathering drive a rendered sample photo.
   - **Battery**: chemistry, cell format, capacity, charge voltage, electrode design (energy vs power) and safety margin.
     Aggressive cells risk recalls.
   - **Memory**: DRAM generation and dies, flash dies, cell type, interface and die stacking.
   - **Radio**: network standards (GSM vs CDMA vs TDMA, the WiMAX dead end…), RF bands, MIMO, carrier aggregation, antenna
     and power amplifier, with a world coverage map.

   Your designs skip the 45% supplier markup (×1.22 at contract part makers, ×1.0 in your own plant) and can use exclusive tech.
4. **💠 Processor** (a Parts Lab tab): pick a process node (10 µm in 1973 → 1.4 nm), how many CPU cores, cache, GPU, NPU, ISP, modem and memory
   controllers go on the die, the clock and options. Area, Poisson yield, clock binning (few dies run fast), heat, speed and price follow; maxing
   everything costs thousands per chip. Tape-out costs a mask set plus an engineering budget. You can also sell your chip to rival brands.
   Vendors price chips by performance: the newest flagship costs about 10% of a premium phone's price (≈$40 in 2007, ≈$190 in 2024),
   older and slower chips far less. Your own chip costs only its silicon plus a one-off tape-out. The 🧠 Chip design research track
   (CPU architectures, blocks) only affects chips you design yourself.
5. **🧪 Prototype → 💼 Investors**: friends & family, then angels (who judge your prototype), then seed, Series A–C and an IPO.
6. **🚀 Develop & launch**: a production line at a contract manufacturer (or your own plant) builds stock continuously.
   **📦 Production** lets you pick the maker and the output rate. Parts and chips you designed are produced **into stock** first – in your own
   plant (at cost, small capacity), by a contract part maker (+22%, monthly tooling fee, ~3 weeks) or at a foundry (~2½ months, with a wafer
   allocation that grows as you use it). Phones can't be built without them; you can stop a part line at any time.
7. **📣 Marketing** (💰 Finance): split the budget over budget / mid / premium / ultra buyers (each segment has its own awareness) and pick a
   message (camera, display, performance, battery…). Ads lift how buyers see those strengths – fully only if your phone really leads there.
   **Trends** (camera-phone boom, mobile gaming explosion, selfie craze, 5G hype, AI phones…) shift what buyers want for a few years, and ads
   that ride a trend work better.
7. **🔬 Research**: about 410 technologies across 11 tracks, shown as a tech tree over time:
   - networks
   - displays
   - cameras
   - batteries
   - memory
   - chip design
   - process nodes
   - design & body
   - features & software
   - manufacturing
   - business

   Each becomes industry standard on its historical date. Research it earlier and it's exclusive, and only your own plant can make it.
   - 🏭 **Manufacturers** see the whole tree and research every part technology themselves.
   - 🎨 **Design Houses** and 🔬 **Tech Pioneers** buy their parts, so networks, displays, cameras, batteries, memory, process nodes
     and manufacturing tech arrive from suppliers once they become standard. Their tree is chip design, design & body,
     features & software and business. Building a plant (say a Display Fab) adds that plant's track back, so you can research it early.
8. **🏁 Benchmarks**: every phone on sale is measured the same way:
   - PhoneMark
   - CPU and single-core
   - graphics
   - AI
   - CameraMark
   - DisplayMark
   - battery hours
   - charge time
   - download speed
   - coverage
   - storage
   - weight and thickness

   Your Phone Lab draft is shown in the ranking so you can see where it would land.

Keys: `Space` pause/resume · `1`–`3` game speed.

## The realism model

| System | How it works |
|---|---|
| **Eras** | 1973 car phones on IMTS radio, AMPS/NMT cellular from 1981–83, then GSM/TDMA/CDMA, 3G, LTE, 5G and 6G on their historical dates. Integration steps (hybrids, LSI, VLSI, SMT, ASICs, RF ICs … system-in-package) shrink the electronics from a 6,000 cm³ trunk box to a few cm³, so what you can fit in a hand follows the real timeline. |
| **Networks** | Five regions, each with its own carriers that launch and shut down standards over time. A phone only sells to buyers whose carrier runs a standard its radio supports, and RF bands decide whether it works everywhere. Real-world speed depends on how far each network has rolled out. |
| **Parts** | Displays: brightness, contrast, gamut, PPI, power, stack thickness and a defect-density yield. Cameras: pixel pitch, diffraction (Airy disk), lens blur, light gathering, dynamic range and module height (the camera bump). Batteries: Wh/L, Wh/kg, C-rate, cycles and incident risk. Memory: per-bit prices by year and die. Chips: transistor density, wafers, Poisson yield and heat. |
| **Bodies** | The body is fitted around the parts. Thickness grows with internal volume up to a limit for the form factor, then the body grows taller. Weight, volume, screen-to-body ratio and heat dissipation follow from it. |
| **Market** | Historical handset volumes (≈1,500/month in 1973 → ~160M at the 2016 peak), four buyer segments and five regions. Buyers weigh quality (against a smooth curve of what a flagship delivers), price, awareness, shelf space, reviews and coverage – and check a **fair price** (what rivals ask for the same quality, adjusted for brand: a newcomer must undercut), **deal-breakers** (far behind on something the segment cares about, no camera, an old network) and trends. Rivals cut prices in segments you are winning. Demand drifts toward its target over a few weeks. |
| **Reviews** | Five outlets score each category against the phone's price segment plus value for money, each with its own priorities; owners' ratings then drift with value and reliability and feed your reputation. |
| **Money** | Supplier markups, retail (30% of the sticker price), patent royalties (2.5–4.5% by network generation), warranty & returns, freight & duties, line and tooling fees, staff per device and part line, sales & admin (9% of revenue), 22% tax, investor dilution and an overdraft limit. A well-run phone business nets roughly 5–12%. |
| **Rivals** | Ten brands enter and leave over the decades in their own regions. Each releases a model per segment every year, built from industry-standard parts, then lowers its price gradually. |

## Code layout

| File | Contents |
|---|---|
| `js/data.js` | Static data: regions, carriers & network standards, process nodes, chip blocks, every part's design options, form factors, layout elements, the research tree, playstyles, factories, manufacturers, investors, rivals, events, goals |
| `js/parts.js` | Shared math and the part engineering models (display, camera, battery, memory, radio), plus "what a supplier sells" builders |
| `js/model.js` | Chips, layout & ergonomics, full phone evaluation and benchmarks, standard/rival specs, smooth market expectations, buyer appeal |
| `js/sim.js` | Game state, daily tick (research, engineering, production lines, demand & sales), monthly books, rivals, investors, save/load |
| `js/ui.js` | View router, top bar, toasts, modals, option widgets, charts |
| `js/device3d.js` | three.js device models for every form factor, with keys, ports, grilles and cameras placed from the layout |
| `js/phonelab.js`, `js/partlabs.js`, `js/views.js` | The screens |
| `js/chiplab.js` | The Parts Lab's 💠 Processor designer |
| `js/main.js` | Start screen, real-time loop, menu, keyboard |
