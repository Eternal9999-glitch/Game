'use strict';
// ============================================================================
//  Static game data: process nodes, chip blocks, component catalogs, techs,
//  factories, rivals, market sizes and scripted world events.
//  All money is US dollars, all time is fractional calendar years (2008.5).
// ============================================================================

const CELL_MM2 = 2.0;          // silicon area of one chip-lab grid cell
const CELL_MM = Math.sqrt(CELL_MM2);
const RETAIL_CUT = 0.30;       // retail margin, distribution, warranty & patent royalties (share of sticker price)
const VOLTAGE = 3.85;          // nominal cell voltage for mAh -> Wh

// ---- Semiconductor process nodes ------------------------------------------
// year: when foundries start offering it. density: million transistors / mm².
// fnom: nominal mobile CPU clock (GHz). pwr: relative power per block.
// wafer: foundry price for a 300 mm wafer. mask: tape-out mask set cost.
// fab: cost to build your own fab at this node.
const NODES = [
  { nm: 90,  year: 2004.0, density: 1.5, fnom: 0.45, pwr: 1.20, wafer: 1100,  mask: 0.35e6, fab: 60e6 },
  { nm: 65,  year: 2006.5, density: 3.0, fnom: 0.62, pwr: 1.10, wafer: 1500,  mask: 0.6e6,  fab: 90e6 },
  { nm: 45,  year: 2008.6, density: 5.5, fnom: 0.85, pwr: 1.05, wafer: 2000,  mask: 1.0e6,  fab: 140e6 },
  { nm: 32,  year: 2010.8, density: 9.5, fnom: 1.10, pwr: 1.00, wafer: 2500,  mask: 1.6e6,  fab: 200e6 },
  { nm: 28,  year: 2012.0, density: 14,  fnom: 1.40, pwr: 0.95, wafer: 3000,  mask: 2.2e6,  fab: 260e6 },
  { nm: 20,  year: 2014.5, density: 20,  fnom: 1.70, pwr: 0.93, wafer: 4000,  mask: 3.5e6,  fab: 400e6 },
  { nm: 14,  year: 2015.6, density: 29,  fnom: 1.95, pwr: 0.82, wafer: 5800,  mask: 5e6,    fab: 600e6 },
  { nm: 10,  year: 2017.3, density: 52,  fnom: 2.30, pwr: 0.80, wafer: 6500,  mask: 8e6,    fab: 900e6 },
  { nm: 7,   year: 2018.7, density: 91,  fnom: 2.60, pwr: 0.78, wafer: 9300,  mask: 12e6,   fab: 1.3e9 },
  { nm: 5,   year: 2020.7, density: 138, fnom: 3.00, pwr: 0.76, wafer: 16000, mask: 18e6,   fab: 2.0e9 },
  { nm: 4,   year: 2022.4, density: 150, fnom: 3.20, pwr: 0.75, wafer: 17500, mask: 20e6,   fab: 2.3e9 },
  { nm: 3,   year: 2023.7, density: 200, fnom: 3.50, pwr: 0.73, wafer: 20000, mask: 28e6,   fab: 3.0e9 },
  { nm: 2,   year: 2025.8, density: 260, fnom: 3.80, pwr: 0.68, wafer: 30000, mask: 40e6,   fab: 4.5e9 },
  { nm: 1.4, year: 2028.5, density: 330, fnom: 4.00, pwr: 0.65, wafer: 38000, mask: 55e6,   fab: 6.0e9 },
];
const nodeByNm = nm => NODES.find(n => n.nm === nm);
const nodeLabel = nm => nm + 'nm';

// ---- Chip floorplan blocks ------------------------------------------------
const BLOCKS = {
  pcore: { name: 'Performance core', short: 'P', w: 1, h: 2, color: '#e5655a', hot: true,
    desc: 'Big out-of-order CPU core. Fast single-thread speed, but hot. Place SRAM cache next to it for a speed boost.' },
  ecore: { name: 'Efficiency core', short: 'E', w: 1, h: 1, color: '#efa25a', tech: 'chip_little',
    desc: 'Small, cool CPU core. ~1/3 the speed of a P-core for a fraction of the power. Great for multi-core scores.' },
  cache: { name: 'SRAM cache', short: '$', w: 1, h: 1, color: '#5b8def',
    desc: 'Fast on-die memory. Boosts every adjacent CPU core (+10%), GPU and NPU (+4%). Runs cool – good as a heat spreader.' },
  gpu:   { name: 'GPU cluster', short: 'GPU', w: 2, h: 2, color: '#43b883', hot: true,
    desc: 'Graphics shader cluster. Needs memory bandwidth (memory controllers) to stay fed.' },
  npu:   { name: 'Neural engine', short: 'NPU', w: 2, h: 1, color: '#a777ee', tech: 'chip_npu',
    desc: 'Matrix accelerator for on-device AI (TOPS). Consumers start caring about AI from ~2018.' },
  isp:   { name: 'Image signal processor', short: 'ISP', w: 1, h: 1, color: '#e46bb3',
    desc: 'Processes camera sensor data. Without one, photo quality suffers badly.' },
  modem: { name: 'Cellular modem', short: 'RF', w: 2, h: 1, color: '#3fc1d1', edge: true,
    desc: 'Integrated modem (best generation you have access to). Must touch the die edge for RF routing. Saves a discrete modem chip.' },
  io:    { name: 'Memory controller', short: 'IO', w: 1, h: 1, color: '#97a3b8', edge: true,
    desc: 'LPDDR interface + I/O. Required (at least one). Must touch the die edge. Two are needed to fully feed big GPUs.' },
  media: { name: 'Media engine', short: 'VID', w: 1, h: 1, color: '#cdb73c',
    desc: 'Hardware video encode/decode. Small boost to camera video and features.' },
};
const BLOCK_ORDER = ['pcore', 'ecore', 'cache', 'gpu', 'npu', 'isp', 'modem', 'io', 'media'];
const MODEM_GENS = ['None', '3G', '4G LTE', '5G'];

// ---- Device categories ----------------------------------------------------
const CATS = {
  phone: {
    name: 'Phone', icon: '📱', size: [3.0, 7.2], sizeStep: 0.1,
    prefSize: [[2007, 3.4], [2009, 3.6], [2011, 4.1], [2013, 5.0], [2016, 5.5], [2018, 6.1], [2021, 6.5], [2025, 6.7], [2040, 6.8]],
    sigma: [0.55, 1.0], mah: [800, 7500], basePower: 0.25, intVol: 6, assembly: 13, inAssembly: 5, misc: 20,
    budget: 1.0, devCost: 300e3,
    flagMah: [[2007, 1150], [2010, 1420], [2012, 2000], [2014, 2800], [2016, 3000], [2018, 3400], [2020, 4200], [2022, 4800], [2025, 5100], [2040, 6000]],
  },
  tablet: {
    name: 'Tablet', icon: '📟', size: [7.0, 13.0], sizeStep: 0.1,
    prefSize: [[2007, 9.7], [2014, 9.7], [2018, 10.5], [2022, 11.0], [2040, 11.5]],
    sigma: [1.2, 2.0], mah: [3000, 13000], basePower: 0.4, intVol: 14, assembly: 17, inAssembly: 7, misc: 26,
    budget: 1.7, devCost: 360e3,
    flagMah: [[2007, 6600], [2012, 11500], [2016, 7300], [2020, 7600], [2025, 8100], [2040, 9000]],
  },
};

// ---- Market segments --------------------------------------------------------
// a: how strongly buyers value quality, b: price sensitivity, under: how much a bargain
// below their budget still counts (buyers punish overpricing more than they reward discounts).
const SEGMENTS = ['budget', 'mid', 'premium', 'ultra'];
const SEG_INFO = {
  budget:  { name: 'Budget',    a: 0.6, b: 1.6, under: 0.85, w: { perf: .16, cam: .14, disp: .14, batt: .26, design: .10, feat: .20 } },
  mid:     { name: 'Mid-range', a: 0.8, b: 1.2, under: 0.55, w: { perf: .20, cam: .20, disp: .16, batt: .18, design: .12, feat: .14 } },
  premium: { name: 'Premium',   a: 1.0, b: 0.9, under: 0.45, w: { perf: .22, cam: .24, disp: .16, batt: .12, design: .14, feat: .12 } },
  ultra:   { name: 'Ultra',     a: 1.2, b: 0.6, under: 0.35, w: { perf: .22, cam: .28, disp: .16, batt: .10, design: .14, feat: .10 } },
};
// what a typical buyer in each segment spends (shifts upward over the years)
const SEG_BUDGET = {
  phone:  [[2007, [150, 350, 650, 950]], [2014, [160, 380, 700, 1050]], [2020, [190, 420, 800, 1200]], [2026, [210, 450, 850, 1300]]],
  tablet: [[2007, [150, 330, 600, 950]], [2014, [170, 360, 680, 1050]], [2020, [200, 420, 800, 1200]], [2026, [220, 450, 850, 1300]]],
};
// units sold per month worldwide
const MARKET_SIZE = {
  phone:  [[2007, 9e6], [2008, 11e6], [2009, 15e6], [2010, 25e6], [2011, 41e6], [2012, 60e6], [2013, 84e6], [2014, 108e6], [2015, 120e6],
           [2016, 124e6], [2017, 122e6], [2019, 115e6], [2020, 107e6], [2022, 100e6], [2025, 102e6], [2040, 108e6]],
  tablet: [[2007, 0.2e6], [2009, 0.3e6], [2010, 1.5e6], [2011, 6e6], [2012, 11e6], [2013, 18e6], [2014, 19e6], [2016, 15e6], [2020, 13.5e6], [2025, 11e6], [2040, 11e6]],
};
const SEG_SPLIT = [ // budget, mid, premium, ultra
  [2007, [0.56, 0.30, 0.12, 0.02]], [2010, [0.52, 0.30, 0.15, 0.03]], [2014, [0.48, 0.30, 0.16, 0.06]],
  [2018, [0.44, 0.29, 0.17, 0.10]], [2022, [0.41, 0.28, 0.18, 0.13]], [2040, [0.38, 0.27, 0.19, 0.16]],
];

// ---- Display ----------------------------------------------------------------
const DISPLAY_TECH = {
  tn:     { name: 'TN LCD',      cost: 3.0, since: 2005,   rate: .08, floor: .35, q: 0.75, pwr: 1.25, stack: 1.7, tech: null },
  ips:    { name: 'IPS LCD',     cost: 3.6, since: 2009.5, rate: .09, floor: .35, q: 0.90, pwr: 1.15, stack: 1.5, tech: 'disp_ips' },
  amoled: { name: 'AMOLED',      cost: 6.5, since: 2010.3, rate: .11, floor: .40, q: 1.05, pwr: 0.85, stack: 1.0, tech: 'disp_amoled' },
  ltpo:   { name: 'LTPO OLED',   cost: 7.0, since: 2021.7, rate: .10, floor: .40, q: 1.15, pwr: 0.65, stack: 0.9, tech: 'disp_ltpo' },
  tandem: { name: 'Tandem OLED', cost: 8.0, since: 2024.4, rate: .10, floor: .40, q: 1.22, pwr: 0.55, stack: 0.9, tech: 'disp_tandem' },
};
const PPI_CAPS = [[null, 260], ['disp_330', 340], ['disp_440', 450], ['disp_530', 570]];
const REFRESH = [{ hz: 60, tech: null, q: 1, cost: 1, pwr: 1 }, { hz: 90, tech: 'disp_90', q: 1.07, cost: 1.08, pwr: 1.1 },
                 { hz: 120, tech: 'disp_120', q: 1.13, cost: 1.15, pwr: 1.2 }];

// ---- Camera -----------------------------------------------------------------
const SENSORS = [
  { name: '1/4"',    area: 8.0 },  { name: '1/3.2"', area: 11.5 }, { name: '1/3"', area: 17.3 }, { name: '1/2.55"', area: 24.7 },
  { name: '1/2"',    area: 30.7 }, { name: '1/1.7"', area: 43.0 }, { name: '1/1.33"', area: 70.0 }, { name: '1"', area: 116.0 },
];
const MP_OPTIONS = [2, 3, 5, 8, 12, 13, 16, 20, 48, 50, 64, 108, 200];
// camera generations: [tech, max sensor index, max MP]
const CAM_GENS = [[null, 0, 3], ['cam_g2', 1, 5], ['cam_g3', 2, 8], ['cam_g4', 2, 13], ['cam_g5', 3, 16],
                  ['cam_g6', 4, 48], ['cam_g7', 6, 108], ['cam_g8', 7, 200]];

// ---- Battery ----------------------------------------------------------------
const CHEM = {
  liion: { name: 'Li-ion',             whl: 430, cost: 1.0, tech: null },
  lipo:  { name: 'Li-Po pouch',        whl: 540, cost: 1.1, tech: 'bat_lipo' },
  hv:    { name: 'High-voltage Li-Po', whl: 640, cost: 1.2, tech: 'bat_hv' },
  sic:   { name: 'Silicon-carbon',     whl: 800, cost: 1.5, tech: 'bat_sic' },
};
const CHARGE = [{ w: 5, tech: null, cost: 0 }, { w: 10, tech: 'bat_fc10', cost: 0.6 }, { w: 18, tech: 'bat_fc18', cost: 1.5 },
                { w: 30, tech: 'bat_fc30', cost: 2.8 }, { w: 65, tech: 'bat_fc65', cost: 4.5 }, { w: 120, tech: 'bat_fc120', cost: 7 }];

// ---- Memory -----------------------------------------------------------------
const RAM_OPTIONS = [128, 256, 384, 512, 768, 1024, 1536, 2048, 3072, 4096, 6144, 8192, 12288, 16384, 24576];
const STORAGE_OPTIONS = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];
const MEM_GENS = [[null, 256, 16], ['mem_g1', 512, 32], ['mem_g2', 1024, 64], ['mem_g3', 2048, 64], ['mem_g4', 3072, 128],
                  ['mem_g5', 4096, 256], ['mem_g6', 6144, 256], ['mem_g7', 8192, 512], ['mem_g8', 12288, 512],
                  ['mem_g9', 16384, 1024], ['mem_g10', 24576, 1024]];

// ---- Body & features ------------------------------------------------------
const MATERIALS = {
  plastic: { name: 'Polycarbonate',    q: 0.62, cost: 4,  dens: 1.25, therm: 0.90, shell: 1.2,  tech: null },
  alu:     { name: 'Aluminum unibody', q: 0.85, cost: 13, dens: 1.42, therm: 1.15, shell: 0.9,  tech: 'body_alu' },
  glass:   { name: 'Glass + aluminum', q: 0.95, cost: 20, dens: 1.55, therm: 1.05, shell: 1.0,  tech: 'body_glass' },
  steel:   { name: 'Glass + steel',    q: 1.00, cost: 28, dens: 1.85, therm: 1.05, shell: 1.0,  tech: 'body_steel' },
  ceramic: { name: 'Ceramic',          q: 1.03, cost: 34, dens: 1.75, therm: 0.95, shell: 1.1,  tech: 'body_ceramic' },
  ti:      { name: 'Titanium',         q: 1.10, cost: 40, dens: 1.45, therm: 0.95, shell: 0.85, tech: 'body_ti' },
};
const WATER = {
  none: { name: 'None',          q: 0,   cost: 0,   tech: null },
  ip53: { name: 'Splash (IP53)', q: .03, cost: 1,   tech: null },
  ip67: { name: 'IP67',          q: .08, cost: 3.5, tech: 'body_ip67' },
  ip68: { name: 'IP68',          q: .11, cost: 5.5, tech: 'body_ip68' },
};
const FINGERPRINT = {
  none: { name: 'None',                   pts: 0, cost: 0,  tech: null,          since: 2005 },
  rear: { name: 'Fingerprint (home/rear)', pts: 6, cost: 6,  tech: 'feat_fp',     since: 2013.5 },
  side: { name: 'Fingerprint (side key)', pts: 7, cost: 5,  tech: 'feat_fpside', since: 2017 },
  ud:   { name: 'Under-display',          pts: 9, cost: 14, tech: 'feat_fpud',   since: 2019 },
};
const BODY_COLORS = ['#1f2430', '#e8e8ea', '#c9b48a', '#8aa2c8', '#c76d6d', '#5f8f6e', '#d8a7c4', '#3b4a6b', '#e2c35a'];

// ---- Technologies -----------------------------------------------------------
// market: when it becomes industry standard (buyable from suppliers / licensable).
// Research can start `lead` years earlier; researched tech is usable *in-house only*
// (needs the matching factory type, or your own chip designs for chip tech).
const TECHS = [];
const TECH = {};
function T(id, cat, name, market, cost, days, desc, req) {
  const t = { id, cat, name, market, cost, days, desc, req: req || [], lead: 1.75 };
  TECHS.push(t); TECH[id] = t;
}
// display
T('disp_ips', 'display', 'IPS LCD', 2009.5, 1.2e6, 150, 'Wide viewing angles and better color than TN LCD.');
T('disp_amoled', 'display', 'AMOLED panels', 2010.3, 3.5e6, 240, 'Self-emissive pixels: true blacks, thinner stack, lower power.');
T('disp_330', 'display', '330+ PPI panels', 2010.5, 1.5e6, 150, 'Pixel density so high individual pixels disappear.');
T('disp_440', 'display', 'Full-HD 440 PPI', 2013.0, 2e6, 180, '1080p-class phone panels.', ['disp_330']);
T('disp_530', 'display', 'Quad-HD 560 PPI', 2014.5, 2.5e6, 180, '1440p-class phone panels.', ['disp_440']);
T('disp_fullview', 'display', 'Edge-to-edge display', 2017.3, 3e6, 210, 'Slim bezels and taller 19.5:9 screens: much higher screen-to-body ratio.');
T('disp_90', 'display', '90 Hz refresh', 2019.4, 2e6, 150, 'Smoother scrolling.');
T('disp_120', 'display', '120 Hz refresh', 2020.2, 2.5e6, 150, 'Silky-smooth high refresh panels.', ['disp_90']);
T('disp_ltpo', 'display', 'LTPO OLED', 2021.7, 4e6, 240, 'Variable 1–120 Hz backplane: high refresh without the battery cost.', ['disp_amoled', 'disp_120']);
T('disp_tandem', 'display', 'Tandem OLED', 2024.4, 5e6, 270, 'Two stacked emitter layers: brighter, longer-lived, more efficient.', ['disp_ltpo']);
// camera
T('cam_g2', 'camera', '5 MP 1/3.2" sensors', 2009.5, 0.8e6, 120, 'Bigger, higher resolution sensors.');
T('cam_g3', 'camera', '8 MP BSI sensors', 2011.0, 1.5e6, 150, 'Back-side illuminated 1/3" sensors: much better low light.', ['cam_g2']);
T('cam_ois', 'camera', 'Optical image stabilization', 2012.7, 1.5e6, 150, 'Gyro-stabilized lens: sharper night shots and video.');
T('cam_g4', 'camera', '13 MP sensors', 2013.0, 1.5e6, 150, 'Higher resolution 1/3" sensors.', ['cam_g3']);
T('cam_g5', 'camera', '16 MP 1/2.55" sensors', 2014.5, 2e6, 180, 'Large-pixel main sensors.', ['cam_g4']);
T('cam_multi', 'camera', 'Multi-camera modules', 2016.7, 2.5e6, 180, 'Ultra-wide and telephoto cameras next to the main one.');
T('cam_g6', 'camera', '48 MP Quad-Bayer 1/2"', 2019.0, 3e6, 200, 'Pixel-binning sensors: tiny pixels that combine 4-in-1 in low light.', ['cam_g5']);
T('cam_periscope', 'camera', 'Periscope zoom', 2019.2, 3.5e6, 220, 'Folded optics for 5× optical zoom.', ['cam_multi']);
T('cam_g7', 'camera', '108 MP 1/1.33" sensors', 2020.5, 4e6, 220, 'Huge stacked sensors.', ['cam_g6']);
T('cam_g8', 'camera', '200 MP & 1-inch sensors', 2022.5, 5e6, 240, 'Compact-camera-sized sensors in a phone.', ['cam_g7']);
// battery
T('bat_lipo', 'battery', 'Li-Po pouch cells', 2010.0, 1e6, 150, '+25% energy density over cylindrical-style Li-ion.');
T('bat_fc10', 'battery', '10 W charging', 2011.0, 0.5e6, 90, 'Faster charging.');
T('bat_wireless', 'battery', 'Wireless charging', 2012.5, 1.2e6, 150, 'Qi inductive charging coil.');
T('bat_hv', 'battery', 'High-voltage Li-Po', 2015.0, 2e6, 180, 'Higher cell voltage, +18% energy density.', ['bat_lipo']);
T('bat_fc18', 'battery', '18 W fast charging', 2015.0, 1e6, 120, 'Quick Charge-class charging.', ['bat_fc10']);
T('bat_fc30', 'battery', '30 W fast charging', 2018.0, 1.5e6, 150, 'Half a battery in 30 minutes.', ['bat_fc18']);
T('bat_fc65', 'battery', '65 W fast charging', 2020.0, 2e6, 180, 'Dual-cell fast charging.', ['bat_fc30']);
T('bat_fc120', 'battery', '120 W hyper charging', 2022.0, 3e6, 200, 'Full charge in under 20 minutes.', ['bat_fc65']);
T('bat_sic', 'battery', 'Silicon-carbon anodes', 2023.5, 5e6, 270, '+25% energy density over HV Li-Po.', ['bat_hv']);
// memory
['mem_g1', 'mem_g2', 'mem_g3', 'mem_g4', 'mem_g5', 'mem_g6', 'mem_g7', 'mem_g8', 'mem_g9', 'mem_g10'].forEach((id, i) => {
  const g = MEM_GENS[i + 1];
  const years = [2009.5, 2011.0, 2012.5, 2014.5, 2016.0, 2017.5, 2018.7, 2020.0, 2021.5, 2023.5];
  const ram = g[1] >= 1024 ? (g[1] / 1024) + ' GB' : g[1] + ' MB';
  T(id, 'memory', `Memory gen ${i + 2}: ${ram} RAM / ${g[2] >= 1024 ? '1 TB' : g[2] + ' GB'}`, years[i], 1e6 + i * 0.6e6, 150,
    'Denser DRAM and NAND dies: larger RAM and storage options.', i ? ['mem_g' + i] : []);
});
// chip design
for (let g = 2; g <= 14; g++) {
  T('chip_arch' + g, 'chip', `CPU/GPU architecture v${g}`, 2008 + (g - 1) * 1.5, 0.8e6 + g * 0.35e6, 180,
    `+12% IPC for every CPU, GPU and NPU block in your custom chips.`, g > 2 ? ['chip_arch' + (g - 1)] : []);
}
T('chip_lte', 'chip', '4G LTE modem block', 2011.0, 2.5e6, 200, 'Integrate a 4G modem on-die.');
T('chip_little', 'chip', 'big.LITTLE efficiency cores', 2011.5, 1.5e6, 150, 'Unlocks the Efficiency core block.');
T('chip_npu', 'chip', 'Neural engine block', 2017.7, 3e6, 210, 'Unlocks the NPU block for on-device AI.');
T('chip_5g', 'chip', '5G modem block', 2019.5, 5e6, 240, 'Integrate a 5G modem on-die.', ['chip_lte']);
// process (lets you build your own fab at a node before it is industry standard)
NODES.forEach(n => {
  if (n.year <= 2008) return;
  T('proc_' + n.nm, 'process', `${nodeLabel(n.nm)} process`, n.year, n.mask * 2.5, 300,
    `Develop the ${nodeLabel(n.nm)} process in-house so you can build a fab before foundries offer it.`);
});
// body & features (in-house: needs an assembly plant)
T('body_alu', 'body', 'Aluminum unibody', 2010.5, 0.8e6, 120, 'Machined metal bodies: premium feel, better heat dissipation.');
T('feat_nfc', 'body', 'NFC payments', 2011.0, 0.5e6, 90, 'Tap-to-pay radio.');
T('body_glass', 'body', 'Glass sandwich design', 2012.5, 1e6, 120, 'Glass front and back around a metal frame.', ['body_alu']);
T('feat_stereo', 'body', 'Stereo speakers', 2013.0, 0.5e6, 90, 'Front-facing stereo audio.');
T('feat_fp', 'body', 'Fingerprint sensor', 2013.5, 1.2e6, 150, 'Capacitive fingerprint reader.');
T('body_ip67', 'body', 'IP67 water resistance', 2014.0, 1e6, 120, 'Survives a dunk in 1 m of water.');
T('body_ip68', 'body', 'IP68 water resistance', 2016.5, 1.5e6, 150, 'Survives 30 min at 1.5 m+.', ['body_ip67']);
T('body_steel', 'body', 'Stainless steel frames', 2017.0, 1.2e6, 150, 'Polished steel bands.', ['body_glass']);
T('feat_fpside', 'body', 'Side-key fingerprint', 2017.0, 0.8e6, 120, 'Fingerprint reader in the power key.', ['feat_fp']);
T('feat_face3d', 'body', '3D face unlock', 2017.7, 3e6, 210, 'Structured-light depth camera for secure face unlock.');
T('body_ceramic', 'body', 'Ceramic bodies', 2018.0, 1.5e6, 150, 'Scratch-proof zirconia ceramic.', ['body_glass']);
T('feat_fpud', 'body', 'Under-display fingerprint', 2019.0, 2.5e6, 180, 'Optical/ultrasonic reader under the screen.', ['feat_fp']);
T('body_ti', 'body', 'Titanium frames', 2023.7, 3e6, 210, 'Light and strong aerospace titanium.', ['body_steel']);

const TECH_CATS = {
  chip:    { name: 'Chip design',      icon: '🧠', factory: null,       note: 'Usable in your own chip designs.' },
  process: { name: 'Process nodes',    icon: '💠', factory: 'fab',      note: 'Lets you build a fab at a node early.' },
  display: { name: 'Displays',         icon: '🖥️', factory: 'display',  note: 'Needs your own Display Fab to use early.' },
  camera:  { name: 'Cameras',          icon: '📷', factory: 'camera',   note: 'Needs your own Camera Module Plant to use early.' },
  battery: { name: 'Batteries',        icon: '🔋', factory: 'battery',  note: 'Needs your own Battery Plant to use early.' },
  memory:  { name: 'Memory',           icon: '💾', factory: 'memory',   note: 'Needs your own Memory Fab to use early.' },
  body:    { name: 'Body & features',  icon: '🧩', factory: 'assembly', note: 'Needs your own Assembly Plant to use early.' },
};

// ---- Factories ----------------------------------------------------------------
const FACTORY_TYPES = {
  assembly: { name: 'Assembly Plant', icon: '🏭', cost: 0.9e6, days: 60, upkeep: 50e3, cap: 30000, unit: 'devices', spare: 2.5,
    desc: 'Assemble your devices in-house for ~$5/unit instead of paying a contract manufacturer ~$13. Unlocks in-house body & feature tech.' },
  camera:   { name: 'Camera Module Plant', icon: '📷', cost: 3e6, days: 120, upkeep: 110e3, cap: 80000, unit: 'camera modules', spare: 1.8, markup: 1.45,
    desc: 'Build sensor + lens modules at cost (~30% cheaper than suppliers). Unlocks in-house camera tech.' },
  battery:  { name: 'Battery Cell Plant', icon: '🔋', cost: 2.5e6, days: 120, upkeep: 90e3, cap: 60000, unit: 'cells', spare: 1.2, markup: 1.35,
    desc: 'Make your own battery cells (~26% cheaper). Unlocks in-house battery tech.' },
  display:  { name: 'Display Fab', icon: '🖥️', cost: 14e6, days: 240, upkeep: 300e3, cap: 60000, unit: 'panels', spare: 5, markup: 1.4,
    desc: 'Produce LCD/OLED panels (~29% cheaper). Displays are one of the most expensive parts. Unlocks in-house display tech.' },
  memory:   { name: 'Memory Fab', icon: '💾', cost: 45e6, days: 360, upkeep: 1.3e6, cap: 250000, unit: 'memory sets', spare: 4.5, markup: 1.45,
    desc: 'DRAM + NAND fabrication (~31% cheaper). Unlocks in-house memory tech.' },
  fab:      { name: 'Chip Fab', icon: '💠', cost: 0, days: 420, upkeep: 0, cap: 1000, unit: 'wafers',
    desc: 'A semiconductor fab locked to one process node. Wafers cost you ~30% of the foundry price. Spare wafers can be sold to other chip designers.' },
  rnd:      { name: 'R&D Center', icon: '🧪', cost: 2e6, days: 90, upkeep: 150e3, cap: 0, unit: '',
    desc: 'Each level adds one parallel research project and +25% research speed.' },
};
const FACTORY_MAX_LEVEL = 5;

// ---- Rivals -------------------------------------------------------------------
const RIVALS = [
  { id: 'orchard', name: 'Orchard', color: '#d4d8e0', aware: .78, growth: 0, skill: 1.05, priceMul: 1.18, rep: 8.6, month: 8.5,
    segs: { phone: ['premium', 'ultra'], tablet: ['mid', 'premium', 'ultra'] }, start: { phone: 2007, tablet: 2010.25 },
    names: { phone: { premium: 'oPhone {n}', ultra: 'oPhone {n} Pro' }, tablet: { mid: 'oPad {n}', premium: 'oPad Air {n}', ultra: 'oPad Pro {n}' } } },
  { id: 'nova', name: 'Nova Mobile', color: '#5ea2f7', aware: .80, growth: 0, skill: 1.0, priceMul: 1.0, rep: 8.0, month: 2.5,
    segs: { phone: ['budget', 'mid', 'premium', 'ultra'], tablet: ['budget', 'mid', 'premium'] }, start: { phone: 2007, tablet: 2010.9 },
    names: { phone: { budget: 'Nova A{n}', mid: 'Nova M{n}', premium: 'Nova S{n}', ultra: 'Nova S{n} Ultra' }, tablet: { budget: 'Nova Tab A{n}', mid: 'Nova Tab {n}', premium: 'Nova Tab S{n}' } } },
  { id: 'kestrel', name: 'Kestrel', color: '#f4a63c', aware: .62, growth: -0.006, skill: 0.95, priceMul: 0.92, rep: 7.4, month: 5.5,
    segs: { phone: ['budget', 'mid', 'premium'], tablet: ['budget'] }, start: { phone: 2007, tablet: 2012 },
    names: { phone: { budget: 'Kestrel E{n}', mid: 'Kestrel G{n}', premium: 'Kestrel X{n}' }, tablet: { budget: 'Kestrel Pad {n}' } } },
  { id: 'zenith', name: 'Zenith', color: '#3fd09a', aware: .30, growth: 0.03, skill: 0.92, priceMul: 0.8, rep: 7.0, month: 10.5,
    segs: { phone: ['budget', 'mid', 'premium'], tablet: ['budget', 'mid'] }, start: { phone: 2007, tablet: 2011.5 },
    names: { phone: { budget: 'Zenith Lite {n}', mid: 'Zenith {n}', premium: 'Zenith {n} Pro' }, tablet: { budget: 'Zenith Pad Lite {n}', mid: 'Zenith Pad {n}' } } },
  { id: 'keystone', name: 'Keystone', color: '#a98bf5', aware: .66, growth: -0.07, skill: 0.88, priceMul: 1.05, rep: 7.6, month: 4,
    segs: { phone: ['mid', 'premium'] }, start: { phone: 2007 }, end: 2016.5,
    names: { phone: { mid: 'Keystone Curve {n}', premium: 'Keystone Bold {n}' } } },
];

// ---- Chip vendors (sell off-the-shelf SoCs) ------------------------------------
const VENDORS = [
  { id: 'quasar', name: 'Quasar', series: 'Snapline', month: 1.5, tiers: ['budget', 'mid', 'flagship'] },
  { id: 'helix', name: 'Helix Semi', series: 'Dimension', month: 5.5, tiers: ['budget', 'mid'] },
  { id: 'arcadia', name: 'Arcadia', series: 'Exo', month: 9.5, tiers: ['mid', 'flagship'] },
];

// ---- Scripted world events ------------------------------------------------------
const EVENTS = [
  { start: 2008.70, end: 2009.60, title: 'Global financial crisis', desc: 'Consumers delay purchases: device demand −12%.', fx: { demand: 0.88 } },
  { start: 2011.20, end: 2011.55, title: 'Earthquake hits component suppliers', desc: 'Display and memory prices +20%.', fx: { display: 1.2, memory: 1.2 } },
  { start: 2017.40, end: 2018.60, title: 'DRAM price surge', desc: 'Memory prices +40% as data centers hoard DRAM.', fx: { memory: 1.4 } },
  { start: 2020.20, end: 2020.75, title: 'Global pandemic', desc: 'Stores closed worldwide: demand −18%.', fx: { demand: 0.82 } },
  { start: 2020.75, end: 2022.30, title: 'Global chip shortage', desc: 'Foundry wafers +25%, off-the-shelf chips +20%.', fx: { wafer: 1.25, soc: 1.2 } },
  { start: 2025.50, end: 2026.30, title: 'AI data-center memory crunch', desc: 'Memory prices +35%.', fx: { memory: 1.35 } },
];

// ---- Goals (guided objectives) -----------------------------------------------------
const GOALS = [
  { id: 'launch1', text: 'Design and launch your first device', hint: 'Phone Lab → configure → Launch.' },
  { id: 'sold25k', text: 'Sell 25,000 devices', hint: 'Marketing raises awareness, and awareness drives sales.' },
  { id: 'assembly', text: 'Build an Assembly Plant', hint: 'Factories tab. Cuts ~$9 off every unit.' },
  { id: 'chip', text: 'Tape out your own custom chip', hint: 'Chip Lab: floorplan a SoC and send it to the foundry.' },
  { id: 'component', text: 'Build a component factory (camera, battery, display or memory)', hint: 'Make parts at cost instead of paying supplier markups.' },
  { id: 'review8', text: 'Launch a device that reviews 8.0+', hint: 'Beat rivals on quality for the price.' },
  { id: 'research', text: 'Research a technology before it becomes industry standard', hint: 'Exclusive tech = an edge nobody can buy.' },
  { id: 'share5', text: 'Reach 5% of the worldwide phone market', hint: 'Market tab shows share by brand.' },
  { id: 'fab', text: 'Build your own chip fab', hint: 'Expensive – but wafers cost you a third of foundry prices.' },
  { id: 'vertical', text: 'Ship a phone with every part made in-house', hint: 'Custom chip from your fab + display, camera, battery, memory and assembly plants.' },
  { id: 'top1', text: 'Become the #1 phone brand by monthly sales', hint: 'Out-sell Nova and Orchard.' },
  { id: 'worth10b', text: 'Reach a $10B net worth', hint: 'An empire!' },
];
