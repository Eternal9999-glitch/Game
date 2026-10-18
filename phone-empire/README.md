# 📱 Phone Empire Tycoon

A device-maker tycoon inspired by Roblox's *Build a Phone Empire*, but you don't just buy upgrades: you **engineer the hardware**.
Start in 1996 with $10k and a flip-phone sketch, win over investors, design phones part by part around a live 3D model,
floorplan your own chips, and decide who builds everything: contract manufacturers or your own factories.

## How to run it

The game is a folder of plain HTML/CSS/JS files with no build step. Download the whole `phone-empire/` folder (on GitHub:
**Code → Download ZIP**) and open `index.html` in a browser. The 3D preview loads three.js from cdnjs, so it needs an
internet connection; offline, the Phone Lab falls back to a 2D drawing. The game autosaves to your browser every in-game month.

## How to play

1. **Pick a playstyle** on the start screen:
   - 🎨 **Design House** – design phones people love and outsource building them (cheaper development, stronger marketing, lower contract fees).
   - 🏭 **Manufacturer** – own the factories, build cheap and sell capacity to rivals (starts with a workshop, cheaper plants, more supply contracts).
   - 🔬 **Tech Pioneer** – out-invent everyone (faster, cheaper research, cheaper chip tape-outs, bigger licensing royalties).
2. **📱 Phone Lab** – choose a form factor (candybar, flip, QWERTY, slider, full-touch, foldable, tablet) and every part: screen,
   chip, cameras, battery, memory, connectivity, OS and features. The 3D model updates as you go – drag to rotate, open the flip.
   Locked parts show the research that unlocks them, with a button to start it.
3. **🧪 Build a prototype**, then go to **💼 Investors**: friends & family, then angels (who judge your prototype), then seed,
   Series A–C and an IPO, each needing real revenue and a track record. Every round costs you a slice of the company.
4. **🚀 Develop & launch**, then **📦 order a production run**. Contract manufacturers differ in fee, minimum order, capacity,
   defect rate and how complex a device they can build; the biggest only take clients with serious revenue. Stock sells – no stock, no sales.
5. **🔬 Research** – about 160 upgrades gate everything: screen sizes, battery capacity, megapixels, color screens, touch, 3G/4G/5G,
   materials, OS generations, chip blocks and process nodes. Each becomes industry standard on its historical date: research it
   earlier and it's exclusive (made in your own plants only); research it later and it's cheap.
6. **🏭 Factories** – an assembly workshop or plant cuts the build fee; camera, battery, display and memory plants make your own
   **parts stock**; chip fabs make wafers. Rival brands send **supply contracts** for your spare capacity.
7. **💠 Chip Lab** – floorplan a SoC on a silicon die and tape it out. You can also sell it to rival brands, who adopt it if it beats the vendors.

Keys: `Space` pause/resume · `1`–`3` game speed · `R` rotate a block in the Chip Lab · right-click removes a block.

## The realism model

| System | How it works |
|---|---|
| **Eras** | Starts in 1996 (monochrome flip phones, 2G, NiMH, no cameras). Color screens, camera phones, 3G, sliders, touchscreens, smartphones, 4G, edge-to-edge OLED, 5G and foldables arrive on their historical dates, and buyers' tastes in form factor and screen size shift with them. |
| **Silicon** | 18 process nodes (350nm → 1.4nm) with real transistor densities, wafer prices and mask costs. Die cost uses dies-per-wafer geometry and the Poisson yield model *Y = e^(−area × defect density)*. |
| **Chip floorplanning** | Cache boosts the cores it touches; hot blocks crammed together throttle; memory controllers and modems must touch the die edge; empty silicon still costs money. |
| **Devices** | Each form factor has its own geometry: keypads need thumb room, flips fold, sliders stack. Battery chemistry sets volume and weight, display and chip power set battery life, and the body sets how much heat it can shed. |
| **Money** | Components follow learning curves, suppliers mark up, and retail, distribution and royalties take 30% of the sticker price. You pay deposits and per-unit costs as phones are built, and get paid when they sell. Profits pay 22% tax. Running out of credit for 90 days means bankruptcy. |
| **Market** | Historical handset volumes (6.5M/month in 1996 → ~160M at the 2016 peak), four buyer segments, a logit choice model over quality, price, awareness and reviews, and retail shelf space that limits how much of a segment one brand can reach. |
| **Rivals** | Seven competitors with their own eras and favourite form factors (some fade away, others arrive later) build real devices each year and reprice monthly against the market. |

## Code layout

| File | Contents |
|---|---|
| `js/data.js` | Static data: nodes, chip blocks, form factors, component catalogs, the research tree, playstyles, factories, contract manufacturers, investors, rivals, markets, events, goals |
| `js/model.js` | Pure model: chip physics & economics, device geometry and evaluation, component pricing, research caps, flagship references, buyer utility |
| `js/sim.js` | Game state, the daily tick (research, construction, parts stock, production orders, sales, contracts), investors, monthly books, rivals, save/load |
| `js/device3d.js` | three.js device model and viewer |
| `js/ui.js` | View router, top bar, toasts, modals, charts, 2D device fallback |
| `js/phonelab.js`, `js/chiplab.js`, `js/views.js` | The screens |
| `js/main.js` | Start screen, real-time loop, menu, keyboard |
