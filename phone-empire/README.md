# 📱 Phone Empire Tycoon

A device-maker tycoon inspired by Roblox's *Build a Phone Empire*, but you don't just buy upgrades — you **engineer the hardware**.
Spec every part of a phone or tablet, floorplan your own chips on a silicon die, build factories for each component,
and race rivals to new technology from 2008 onward.

Open [`index.html`](index.html) in a browser. No install, no build step, no server: plain HTML/CSS/JS that also works from `file://`.
The game autosaves to your browser every in-game month.

## How to play

1. **📱 Phone Lab** — design a device part by part: processor, display (panel tech, size, pixel density, refresh, bezels),
   up to four cameras (sensor size, megapixels, OIS, periscope), battery (capacity, chemistry, charging), memory, body
   material, water resistance and biometrics. The side panel updates as you go: dimensions, weight, battery life, thermal
   throttling, buyer scores against rivals, predicted review, unit cost and forecast sales. Hit **💡 Suggest price**, then
   start development (45 days).
2. **💰 Finance** — set a marketing budget. Unknown brands barely sell, however good the phone.
3. **🏭 Factories** — make parts at cost instead of paying supplier markups. Start with an Assembly Plant (cheap, pays
   back fast), then cameras and batteries, then display and memory fabs, and finally your own chip fab.
4. **💠 Chip Lab** — floorplan a system-on-chip and tape it out at a foundry (or your own fab).
5. **🔬 Research** — every technology becomes industry standard on a set date. Research it earlier and it is **yours
   alone**, usable in-house only, and your production of it is limited by your own factory capacity.
6. **📊 Market** — market share by brand, every device on sale, what a flagship looks like right now, and the
   off-the-shelf chip catalog.

Keys: `Space` pause/resume · `1`–`3` game speed · `R` rotate a block in the Chip Lab · right-click removes a block.

## The realism model

| System | How it works |
|---|---|
| **Silicon** | 14 real process nodes (90nm → 1.4nm) with real transistor densities, wafer prices and mask costs. Die cost uses dies-per-wafer geometry and the Poisson yield model *Y = e^(−area × defect density)*; defect density falls as a node matures. Foundries charge an early-access premium on new nodes; your own fab pays ~30% of the foundry price. |
| **Chip floorplanning** | Blocks (P-cores, E-cores, SRAM cache, GPU, NPU, ISP, modem, memory controllers, media engine) scale with the node. Cache boosts every core it touches; P-cores and GPUs are hot, and a blurred power-density heat map decides whether the hotspot throttles; memory controllers and modems must touch the die edge; GPUs need two memory channels to run at full speed; empty cells still cost money. Clock speed trades performance for power roughly cubically. |
| **Devices** | Screen geometry sets the body footprint (screen-to-body ratio improves over the years, and jumps with edge-to-edge displays). Battery Wh and chemistry energy density set volume, thickness and weight. Display, chip and modem power set battery life. Body material and size set how many watts the chassis can shed, so a hot chip in a small plastic phone throttles. Camera quality depends on sensor area and pixel pitch, so cramming megapixels onto a tiny sensor makes noisy images unless you have quad-Bayer binning. |
| **Costs** | Every component has a supplier price that falls along its own learning curve after introduction. In-house parts skip the supplier markup (26–31%), but factories have fixed upkeep, so they pay off only at volume. Retailers, distribution, warranty and patent royalties take 30% of the sticker price, and profits pay 22% corporate tax. |
| **Market** | Real-ish market sizes (11M phones/month in 2008, ~120M at the 2016 peak) split into budget, mid, premium and ultra buyers with different budgets and priorities. Buyers choose with a logit model over quality, price, brand awareness, reputation and reviews. Every score is relative to *today's* flagship, so devices age as the market moves. |
| **Rivals** | Five competitors build real devices from off-the-shelf parts each year, and every month they adjust their prices against the market, so undercutting them gets matched. Chip vendors release new SoCs every year. |
| **World** | Scripted events: the 2008 financial crisis, a 2011 supply shock, DRAM price spikes, the 2020 pandemic and chip shortage. Buyers' expected modem generation (3G → 4G → 5G) and screen size shift over time. |

## Code layout

| File | Contents |
|---|---|
| `js/data.js` | Static data: nodes, chip blocks, component catalogs, techs, factories, rivals, markets, events, goals |
| `js/model.js` | Pure model: chip physics & economics, component pricing, device evaluation, flagship references, buyer utility |
| `js/sim.js` | Game state, the daily tick (research, construction, production, sales), monthly books, rivals, save/load |
| `js/ui.js` | View router, top bar, toasts, modals, charts, device SVG renderer |
| `js/phonelab.js`, `js/chiplab.js`, `js/views.js` | The screens |
| `js/main.js` | Start screen, real-time loop, menu, keyboard |
