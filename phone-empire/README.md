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
   live 3D model. Each part is either a **supplier model** or **one of your own designs**.
   - **Suppliers**: every part type has three companies, and each releases a new range every year (models stay on sale for 3 years).
     For example, Lumina makes mainstream panels, Kiro the newest premium ones and Valor cheap older ones. SlimCell sells thin, small batteries
     and Titan big, cheap, thick ones. Every model lists its performance, the **room it takes** (cm³, thickness) and its price.
     Suppliers charge for performance: the best part on sale costs several times a mainstream one, so flagship parts are a real
     decision. Your own designs skip that premium. Shelves are stocked from the first day of every era.
     The processor list also shows each chip's performance, size and how much of its speed it keeps in your body.
   - **🧩 Body**: form factor, material, finish and color, plus an accent color (buttons, camera island, keys), a black or white
     front, key style (classic, round, flush pad, bubble), corner roundness, edge profile and **size**. Width, height and thickness are
     each either auto or a target you set:
     - Set a thickness below what the parts need and the body grows taller.
     - Fix the height as well and the parts must fit: smaller batteries, chips and cameras let you go thinner bit by bit between the big
       integration steps.
     - A "room inside" bar shows where the space goes, and nothing gets thinner than its tallest part (battery cell, board and chip).
     - Thin bodies shed less heat, so hot chips throttle.
   - **✏️ Your own art**: paint up to three **key shapes** (or start from a heart, star, circle and other presets) and a 16×16 **logo**.
     The logo replaces the printed name, and **🔖 logo stamps** put it anywhere on the body: a few add to the design, more than four
     look cluttered.
   - **Upgrades & decorations**: inner frames, cooling (graphite to fans), rugged bumpers or MIL-spec armor, back textures (carbon, leather,
     wood, aramid, fabric, gradient, translucent, color-shift), coatings, frame finishes and logo styles (embossed, badge, glowing).
   - **✨ Add-ons** (Features tab): ~30 researched extras – notification LED, scroll wheel, trackball, push-to-talk and shutter keys,
     IR blaster, flashlight, kickstand, TV tuner, dual SIM, alert slider, privacy switch, heart-rate and UV sensors, pico projector,
     e-ink or selfie back display, light strips, gaming triggers… Each adds cost, room and weight, and feature points if it fits the phone.
   - **📐 Layout** unfolds the body into front, back and four edges. Drag the screen, the keypad (click it to drag **single keys** and
     give each key its own shape), the earpiece, mic, speakers, power and volume keys, ports,
     headphone jack, SIM tray, card slot, cameras, flash, fingerprint sensor, antenna, logo and optional keys anywhere they fit.
   - Ergonomics are scored: thumb reach, the mouth-to-ear distance between mic and earpiece, cameras your palm covers,
     cables digging into your hand. Ports and jacks need body thickness. Moved keys can't overlap, sit on the screen or hang off
     the front. Touch
     phones choose a home button and navigation keys (physical, capacitive, on-screen bar, gestures).
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
   message (camera, display, performance, battery, thinness, lightness…). Ads lift how buyers see those strengths – fully only if your phone
   really leads there. **Thinness** and **lightness** are buyer categories of their own.
   **Trends** (camera-phone boom, "Thin is in", mobile gaming explosion, battery-first backlash, thinnest-phone race, compact revival,
   5G hype, AI phones…) shift what buyers want for a few years, and ads
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
| **Money** | Supplier markups, retail (33% of the sticker price, 25% once you sell online), patent royalties (1–4.5% by network generation), warranty & returns, freight & duties, line and tooling fees, offices & product support (a base plus each device and part line), sales commissions & customer service (7% of sales), salaries for the staff you hire, 22% tax, investor dilution and an overdraft limit. A well-run phone business nets roughly 10–20%. |
| **Rivals** | 19 brands enter and leave over the decades in their own regions. Each releases a model per segment about every 1.8 years, built from the same suppliers you buy from, then lowers its price gradually. |

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

## Round 7 changes (economy & management)

- **Steady prices:** what buyers pay drifts down slowly (about 1.3% a year) and part, body and assembly costs are kept in step, so a
  mid-range phone's parts cost about the same share of its price in every era. No more $250 expectations for $1,000 phones.
- **Power budget:** the processor, memory and screen turn into heat. Over what the body can shed, they throttle (Phone Lab → Body →
  ⚡ Heat). Bigger or thicker bodies and better cooling shed more. Flagship chips and memory also drain the battery faster, and they
  carry bigger price premiums.
- **More suppliers:** five companies per part type, with tall/curved, compact and jumbo displays, high-res and night cameras, fast-charge
  and long-life batteries, dense and low-power memory, world-band and low-power radios.
- **Rivals:** 19 brands that arrive over the decades, slightly stronger engineering, a new model per segment every ~1.8 years.
  Click 👁 in 📊 Market to see a rival's phone in 3D.
- **Research points:** research costs RP, earned daily (hire researchers for more). At most 5 slots. Tech opens when it is invented.
  **Breakthroughs** (more likely with more researchers) open a technology years early, and rivals get breakthroughs too. Exclusive tech is gone.
  ~45 new early-game refinements (1974–1997).
- **👥 Staff** replaces R&D centers: researchers, hardware engineers (hardware quality), software developers (software quality), PR
  (ad power), sales reps (store presence) and operations staff (cheaper production, fewer defects).
- **Launching:** a confirmation screen sets the release (when developed, X days later, when stock covers demand, or held) and the device's
  own ad budget. **🎤 Launch events** (💰 Finance) unveil devices that aren't public yet for a burst of launch demand. Every device can
  have its own ad budget (💰 Finance → 📺 Device ads). The calendar now ticks day by day.
- **Phone Lab:** 32×32 logo canvas with brush sizes and fill, a snap-to-grid option in the layout editor; drawn key shapes are gone
  (per-key preset shapes stay).

## Round 8 changes (prices, overhead & part variety)

- **Fairer prices:** buyers now expect to pay more for the same phone. A mid-range phone's parts are about 39% of its price (was 46%),
  early network standards are much cheaper, extra standards on a multi-band radio cost a quarter of a main one, rivals pay the same
  supplier markups you do, and a new brand's price handicap is smaller.
- **No phantom staff bill:** the old "Overhead & staff" line (offices plus 12% of sales) is split into **Offices & product support**
  and **Sales commissions & customer service (7%)**, and both are smaller. **Staff salaries** shows only the people you hire.
- **Upgrades that show:** every refinement (e.g. Ergonomic handsets) now adds +2.5–3% to its area, and each research card says what it
  does, e.g. "✚ +3% design score on your phones".
- **Real supplier variety:** each company has its own product styles. Displays include 1-, 2- and 3-line segment panels, square, tall,
  wide, compact and jumbo shapes, sharp or coarse, eco or bright. Batteries come safe, dense, thin, bulky, fast-charge or long-life.
  Memory comes RAM-heavy or storage-heavy, fast, dense or low-power. Radios come world-band, regional (North America, Europe, Asia)
  or low-power. Even in the 1970s and 1980s the catalogs differ in more than price.
- **More chips:** six chip makers (Corvex and Tessera Logic early on, Vortex for gaming later), each with its own character
  (frugal low clocks, big caches, efficiency cores, strong graphics/AI, hot gaming clocks). New *upper mid* and *gaming* tiers,
  and a tier filter in the chip list.
