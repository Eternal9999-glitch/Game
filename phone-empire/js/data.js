'use strict';
// ============================================================================
//  Static game data: process nodes, chip blocks, component catalogs, the
//  research tree, factories, contract manufacturers, investors, rivals,
//  markets and scripted world events.
//  All money is US dollars, all time is fractional calendar years (2008.5).
// ============================================================================

const CELL_MM2 = 2.0;          // silicon area of one chip-lab grid cell
const CELL_MM = Math.sqrt(CELL_MM2);
const RETAIL_CUT = 0.30;       // retail margin, distribution, warranty & patent royalties (share of sticker price)
const VOLTAGE = 3.85;          // nominal cell voltage for mAh -> Wh
const FIRST_YEAR = 1996;

// How prices of people, buildings and funding scale with the era (1.0 = 2016).
const ERA_DEV = [[1994, 0.07], [2000, 0.13], [2008, 0.45], [2016, 1.0], [2024, 1.4], [2040, 2.0]];
const ERA_FACTORY = [[1994, 0.22], [2000, 0.32], [2008, 0.7], [2016, 1.0], [2024, 1.2], [2040, 1.5]];
const ERA_FUND = [[1994, 0.35], [2000, 0.5], [2008, 0.8], [2016, 1.0], [2025, 1.3], [2040, 1.6]];

// ---- Semiconductor process nodes ------------------------------------------
// year: when foundries start offering it. density: million transistors / mm².
// fnom: nominal mobile CPU clock (GHz). pwr: relative power per block.
// wafer: foundry price for a wafer. mask: tape-out mask set cost. fab: cost of your own fab.
const NODES = [
  { nm: 350, year: 1995.0, density: 0.06, fnom: 0.03, pwr: 1.60, wafer: 600,   mask: 0.03e6, fab: 12e6 },
  { nm: 250, year: 1997.5, density: 0.14, fnom: 0.07, pwr: 1.45, wafer: 700,   mask: 0.06e6, fab: 20e6 },
  { nm: 180, year: 1999.5, density: 0.30, fnom: 0.13, pwr: 1.35, wafer: 850,   mask: 0.10e6, fab: 30e6 },
  { nm: 130, year: 2001.8, density: 0.75, fnom: 0.22, pwr: 1.28, wafer: 1000,  mask: 0.20e6, fab: 45e6 },
  { nm: 90,  year: 2004.0, density: 1.5,  fnom: 0.45, pwr: 1.20, wafer: 1100,  mask: 0.35e6, fab: 60e6 },
  { nm: 65,  year: 2006.5, density: 3.0,  fnom: 0.62, pwr: 1.10, wafer: 1500,  mask: 0.6e6,  fab: 90e6 },
  { nm: 45,  year: 2008.6, density: 5.5,  fnom: 0.85, pwr: 1.05, wafer: 2000,  mask: 1.0e6,  fab: 140e6 },
  { nm: 32,  year: 2010.8, density: 9.5,  fnom: 1.10, pwr: 1.00, wafer: 2500,  mask: 1.6e6,  fab: 200e6 },
  { nm: 28,  year: 2012.0, density: 14,   fnom: 1.40, pwr: 0.95, wafer: 3000,  mask: 2.2e6,  fab: 260e6 },
  { nm: 20,  year: 2014.5, density: 20,   fnom: 1.70, pwr: 0.93, wafer: 4000,  mask: 3.5e6,  fab: 400e6 },
  { nm: 14,  year: 2015.6, density: 29,   fnom: 1.95, pwr: 0.82, wafer: 5800,  mask: 5e6,    fab: 600e6 },
  { nm: 10,  year: 2017.3, density: 52,   fnom: 2.30, pwr: 0.80, wafer: 6500,  mask: 8e6,    fab: 900e6 },
  { nm: 7,   year: 2018.7, density: 91,   fnom: 2.60, pwr: 0.78, wafer: 9300,  mask: 12e6,   fab: 1.3e9 },
  { nm: 5,   year: 2020.7, density: 138,  fnom: 3.00, pwr: 0.76, wafer: 16000, mask: 18e6,   fab: 2.0e9 },
  { nm: 4,   year: 2022.4, density: 150,  fnom: 3.20, pwr: 0.75, wafer: 17500, mask: 20e6,   fab: 2.3e9 },
  { nm: 3,   year: 2023.7, density: 200,  fnom: 3.50, pwr: 0.73, wafer: 20000, mask: 28e6,   fab: 3.0e9 },
  { nm: 2,   year: 2025.8, density: 260,  fnom: 3.80, pwr: 0.68, wafer: 30000, mask: 40e6,   fab: 4.5e9 },
  { nm: 1.4, year: 2028.5, density: 330,  fnom: 4.00, pwr: 0.65, wafer: 38000, mask: 55e6,   fab: 6.0e9 },
];
const nodeByNm = nm => NODES.find(n => n.nm === nm);
const nodeLabel = nm => nm + 'nm';

// ---- Chip floorplan blocks ------------------------------------------------
const BLOCKS = {
  pcore: { name: 'Performance core', short: 'P', w: 1, h: 2, color: '#e5655a', hot: true,
    desc: 'Big CPU core. Fast single-thread speed, but hot. Place SRAM cache next to it for a speed boost.' },
  ecore: { name: 'Efficiency core', short: 'E', w: 1, h: 1, color: '#efa25a', tech: 'chip_little',
    desc: 'Small, cool CPU core. ~1/3 the speed of a P-core for a fraction of the power.' },
  cache: { name: 'SRAM cache', short: '$', w: 1, h: 1, color: '#5b8def',
    desc: 'Fast on-die memory. Boosts every adjacent CPU core (+10%), GPU and NPU (+4%). Runs cool – a good heat spreader.' },
  gpu:   { name: 'GPU cluster', short: 'GPU', w: 2, h: 2, color: '#43b883', hot: true, tech: 'chip_gpu',
    desc: 'Graphics shader cluster. Needs memory bandwidth (memory controllers) to stay fed.' },
  npu:   { name: 'Neural engine', short: 'NPU', w: 2, h: 1, color: '#a777ee', tech: 'chip_npu',
    desc: 'Matrix accelerator for on-device AI (TOPS).' },
  isp:   { name: 'Image signal processor', short: 'ISP', w: 1, h: 1, color: '#e46bb3', tech: 'chip_isp',
    desc: 'Processes camera sensor data. Without one, photo quality suffers badly.' },
  modem: { name: 'Cellular modem', short: 'RF', w: 2, h: 1, color: '#3fc1d1', edge: true,
    desc: 'Integrated modem (best generation you have researched). Must touch the die edge.' },
  io:    { name: 'Memory controller', short: 'IO', w: 1, h: 1, color: '#97a3b8', edge: true,
    desc: 'Memory interface + I/O. Required (at least one). Must touch the die edge. Two fully feed big GPUs.' },
  media: { name: 'Media engine', short: 'VID', w: 1, h: 1, color: '#cdb73c', tech: 'chip_media',
    desc: 'Hardware audio/video codec. Boosts camera video and features.' },
};
const BLOCK_ORDER = ['pcore', 'ecore', 'cache', 'gpu', 'npu', 'isp', 'modem', 'io', 'media'];
const MODEM_GENS = ['None', '2G', '2.5G', '3G', '4G LTE', '5G'];
const MODEM_TECH = [null, null, 'modem_25g', 'modem_3g', 'modem_4g', 'modem_5g'];
const MODEM_MARKET = [0, 1990, 2001.5, 2004.0, 2011.0, 2019.5];

// ---- Device categories & form factors ----------------------------------------
const CATS = {
  phone: {
    name: 'Phone', icon: '📱', basePower: 0.25, intVol: 6, devCost: 200e3, budget: 1.0,
    flagMah: [[1994, 600], [2000, 750], [2004, 900], [2007, 1150], [2010, 1420], [2012, 2000], [2014, 2800], [2016, 3000], [2018, 3400], [2020, 4200], [2022, 4800], [2025, 5100], [2040, 6000]],
    misc: [[1994, 55], [2000, 38], [2006, 26], [2010, 20], [2040, 20]],
    labor: [[1994, 30], [2002, 18], [2010, 13], [2040, 13]],
  },
  tablet: {
    name: 'Tablet', icon: '📟', basePower: 0.4, intVol: 14, devCost: 250e3, budget: 1.7,
    flagMah: [[1994, 6000], [2012, 11500], [2016, 7300], [2020, 7600], [2025, 8100], [2040, 9000]],
    misc: [[1994, 30], [2010, 26], [2040, 26]],
    labor: [[1994, 20], [2010, 17], [2040, 17]],
  },
};
// screen aspect (h/w), keypad, how big a screen fits, buyer appeal over time
const FORMS = {
  candybar: { name: 'Candybar', icon: '▮', tech: null, keypad: 'num', maxSize: 2.4, minSize: 1.0, extraThick: 0, cost: 0, labor: 0,
    appeal: [[1994, 1.0], [2000, 0.95], [2005, 0.85], [2008, 0.62], [2012, 0.35], [2040, 0.25]],
    desc: 'Classic bar phone with a number pad.' },
  flip: { name: 'Flip phone', icon: '◫', tech: 'form_flip', keypad: 'num', maxSize: 2.8, minSize: 1.0, extraThick: 2, cost: 3, labor: 2,
    appeal: [[1994, 1.0], [2000, 1.06], [2004, 1.12], [2006, 1.05], [2008, 0.75], [2012, 0.4], [2040, 0.25]],
    desc: 'Clamshell that folds shut. Big screen for its size; the hinge adds cost.' },
  qwerty: { name: 'QWERTY messenger', icon: '⌨', tech: 'form_qwerty', keypad: 'qwerty', maxSize: 2.8, minSize: 1.8, extraThick: 1, cost: 4, labor: 1,
    appeal: [[2002, 1.0], [2008, 1.05], [2011, 0.7], [2014, 0.35], [2040, 0.2]],
    desc: 'Full thumb keyboard for email and texting.' },
  slider: { name: 'Slider', icon: '⇕', tech: 'form_slider', keypad: 'num', maxSize: 3.2, minSize: 1.6, extraThick: 4, cost: 4, labor: 3,
    appeal: [[2004, 1.05], [2007, 1.05], [2010, 0.6], [2014, 0.3], [2040, 0.2]],
    desc: 'Screen slides up to reveal the keypad. Bigger screen, thicker body.' },
  touch: { name: 'Full-touch slate', icon: '▭', tech: 'form_touch', keypad: null, maxSize: 99, minSize: 2.8, extraThick: 0, cost: 0, labor: 1,
    appeal: [[2007, 1.1], [2010, 1.2], [2040, 1.2]],
    desc: 'All screen. Needs a touchscreen – and shines with a touch-first OS.' },
  fold: { name: 'Foldable', icon: '◧', tech: 'form_fold', keypad: null, maxSize: 8.1, minSize: 7.0, extraThick: 6, cost: 60, labor: 8,
    appeal: [[2019.5, 1.12], [2025, 1.18], [2040, 1.18]],
    desc: 'A tablet-sized screen that folds into a phone. Expensive hinge and panel.' },
  slate: { name: 'Tablet', icon: '▬', tech: 'form_tablet', keypad: null, maxSize: 13, minSize: 7.0, extraThick: 0, cost: 0, labor: 0,
    appeal: [[2010, 1.15], [2040, 1.15]], desc: 'A big touch slate.' },
};
const PHONE_FORMS = ['candybar', 'flip', 'qwerty', 'slider', 'touch', 'fold'];
const KEYPAD_PREF = [[1994, 1.4], [2000, 1.7], [2004, 2.0], [2008, 2.4], [2015, 2.8], [2040, 2.8]];
const TOUCH_PREF = [[2007, 3.5], [2011, 4.1], [2013, 5.0], [2016, 5.5], [2018, 6.1], [2021, 6.5], [2025, 6.7], [2040, 6.8]];
const TABLET_PREF = [[2007, 9.7], [2014, 9.7], [2018, 10.5], [2022, 11.0], [2040, 11.5]];

// ---- Market segments --------------------------------------------------------
// a: how strongly buyers value quality, b: price sensitivity, under: how much a bargain
// below their budget still counts (buyers punish overpricing more than they reward discounts).
const SEGMENTS = ['budget', 'mid', 'premium', 'ultra'];
const SEG_INFO = {
  budget:  { name: 'Budget',    a: 0.48, b: 1.6, under: 0.85, w: { perf: .16, cam: .14, disp: .14, batt: .26, design: .10, feat: .20 } },
  mid:     { name: 'Mid-range', a: 0.64, b: 1.2, under: 0.55, w: { perf: .20, cam: .20, disp: .16, batt: .18, design: .12, feat: .14 } },
  premium: { name: 'Premium',   a: 0.8, b: 0.9, under: 0.45, w: { perf: .22, cam: .24, disp: .16, batt: .12, design: .14, feat: .12 } },
  ultra:   { name: 'Ultra',     a: 0.96, b: 0.6, under: 0.35, w: { perf: .22, cam: .28, disp: .16, batt: .10, design: .14, feat: .10 } },
};
// what a typical buyer in each segment spends
const SEG_BUDGET = {
  phone:  [[1994, [180, 380, 650, 1000]], [2000, [110, 230, 420, 720]], [2005, [70, 170, 350, 600]], [2008, [60, 190, 450, 700]],
           [2012, [100, 300, 600, 900]], [2016, [140, 360, 720, 1080]], [2020, [190, 420, 800, 1200]], [2026, [210, 450, 850, 1300]]],
  tablet: [[1994, [150, 330, 600, 950]], [2014, [170, 360, 680, 1050]], [2020, [200, 420, 800, 1200]], [2026, [220, 450, 850, 1300]]],
};
// handsets sold per month worldwide (all phones, not only smartphones)
const MARKET_SIZE = {
  phone:  [[1994, 2.5e6], [1996, 6.5e6], [1998, 14e6], [2000, 34e6], [2002, 36e6], [2004, 56e6], [2006, 82e6], [2008, 100e6], [2010, 115e6],
           [2012, 145e6], [2014, 160e6], [2016, 163e6], [2018, 155e6], [2020, 135e6], [2022, 130e6], [2025, 128e6], [2040, 130e6]],
  tablet: [[1994, 0.02e6], [2009, 0.1e6], [2010, 1.5e6], [2011, 6e6], [2012, 11e6], [2013, 18e6], [2014, 19e6], [2016, 15e6], [2020, 13.5e6], [2025, 11e6], [2040, 11e6]],
};
const SEG_SPLIT = [ // budget, mid, premium, ultra
  [1994, [0.40, 0.33, 0.20, 0.07]], [2002, [0.52, 0.30, 0.14, 0.04]], [2008, [0.56, 0.28, 0.13, 0.03]], [2014, [0.48, 0.30, 0.16, 0.06]],
  [2018, [0.44, 0.29, 0.17, 0.10]], [2022, [0.41, 0.28, 0.18, 0.13]], [2040, [0.38, 0.27, 0.19, 0.16]],
];

// ---- Display ----------------------------------------------------------------
const DISPLAY_TECH = {
  mono:   { name: 'Monochrome LCD', cost: 1.2, since: 1990,   rate: .06, floor: .5,  q: 0.40, pwr: 0.15, stack: 2.0, tech: null },
  cstn:   { name: 'Color STN',      cost: 3.5, since: 2000.5, rate: .12, floor: .35, q: 0.58, pwr: 0.70, stack: 1.9, tech: 'disp_cstn' },
  tft:    { name: 'Color TFT LCD',  cost: 4.5, since: 2002.3, rate: .10, floor: .30, q: 0.75, pwr: 1.25, stack: 1.7, tech: 'disp_tft' },
  ips:    { name: 'IPS LCD',        cost: 3.6, since: 2009.5, rate: .09, floor: .35, q: 0.90, pwr: 1.15, stack: 1.5, tech: 'disp_ips' },
  amoled: { name: 'AMOLED',         cost: 6.5, since: 2010.3, rate: .11, floor: .40, q: 1.05, pwr: 0.85, stack: 1.0, tech: 'disp_amoled' },
  ltpo:   { name: 'LTPO OLED',      cost: 7.0, since: 2021.7, rate: .10, floor: .40, q: 1.15, pwr: 0.65, stack: 0.9, tech: 'disp_ltpo' },
  tandem: { name: 'Tandem OLED',    cost: 8.0, since: 2024.4, rate: .10, floor: .40, q: 1.22, pwr: 0.55, stack: 0.9, tech: 'disp_tandem' },
};
const DISPLAY_ORDER = ['mono', 'cstn', 'tft', 'ips', 'amoled', 'ltpo', 'tandem'];
const TOUCH = {
  none:      { name: 'No touch',            cost: 0,   since: 1990,   q: 1.00, tech: null },
  resistive: { name: 'Resistive (stylus)',  cost: 1.2, since: 2003.0, q: 1.03, tech: 'disp_touchr' },
  capacitive:{ name: 'Capacitive multi-touch', cost: 2.0, since: 2007.0, q: 1.08, tech: 'disp_touchc' },
};
const PPI_CAPS = [[null, 100], ['disp_ppi1', 130], ['disp_ppi2', 160], ['disp_ppi3', 200], ['disp_ppi4', 260], ['disp_330', 340], ['disp_440', 450], ['disp_530', 570]];
const SIZE_CAPS = [[null, 1.8], ['disp_size2', 2.2], ['disp_size3', 2.6], ['disp_size4', 3.5], ['disp_size5', 4.3], ['disp_size6', 5.0],
                   ['disp_size7', 5.7], ['disp_size8', 6.3], ['disp_size9', 6.9], ['disp_size10', 7.2]];
const TABLET_SIZE_CAPS = [['form_tablet', 10.1], ['disp_tab13', 13]];
const REFRESH = [{ hz: 60, tech: null, q: 1, cost: 1, pwr: 1 }, { hz: 90, tech: 'disp_90', q: 1.07, cost: 1.08, pwr: 1.1 },
                 { hz: 120, tech: 'disp_120', q: 1.13, cost: 1.15, pwr: 1.2 }];

// ---- Camera -----------------------------------------------------------------
const SENSORS = [
  { name: '1/4"',    area: 8.0 },  { name: '1/3.2"', area: 11.5 }, { name: '1/3"', area: 17.3 }, { name: '1/2.55"', area: 24.7 },
  { name: '1/2"',    area: 30.7 }, { name: '1/1.7"', area: 43.0 }, { name: '1/1.33"', area: 70.0 }, { name: '1"', area: 116.0 },
];
const MP_OPTIONS = [0.1, 0.3, 1.3, 2, 3, 5, 8, 12, 13, 16, 20, 48, 50, 64, 108, 200];
// camera generations: [tech, max sensor index, max MP]
const CAM_GENS = [['cam_cif', 0, 0.1], ['cam_vga', 0, 0.3], ['cam_13', 0, 1.3], ['cam_2mp', 0, 2], ['cam_3mp', 0, 3],
                  ['cam_g2', 1, 5], ['cam_g3', 2, 8], ['cam_g4', 2, 13], ['cam_g5', 3, 16],
                  ['cam_g6', 4, 48], ['cam_g7', 6, 108], ['cam_g8', 7, 200]];

// ---- Battery ----------------------------------------------------------------
const CHEM = {
  nimh:  { name: 'NiMH',               whl: 250, gwh: 7.5, cost: 0.8, tech: null },
  liion: { name: 'Li-ion',             whl: 430, gwh: 4.2, cost: 1.0, tech: 'bat_liion' },
  lipo:  { name: 'Li-Po pouch',        whl: 540, gwh: 4.0, cost: 1.1, tech: 'bat_lipo' },
  hv:    { name: 'High-voltage Li-Po', whl: 640, gwh: 3.9, cost: 1.2, tech: 'bat_hv' },
  sic:   { name: 'Silicon-carbon',     whl: 800, gwh: 3.6, cost: 1.5, tech: 'bat_sic' },
};
const CHEM_ORDER = ['nimh', 'liion', 'lipo', 'hv', 'sic'];
const MAH_CAPS = [[null, 900], ['bat_c1', 1100], ['bat_c2', 1300], ['bat_c3', 1600], ['bat_c4', 2000], ['bat_c5', 2600], ['bat_c6', 3200],
                  ['bat_c7', 4000], ['bat_c8', 4600], ['bat_c9', 5200], ['bat_c10', 6000], ['bat_c11', 7500]];
const MAH_YEARS = [1999.0, 2003.0, 2007.0, 2010.5, 2012.5, 2014.5, 2017.5, 2019.5, 2021.5, 2023.5, 2025.5];
const CHARGE = [{ w: 5, tech: null, cost: 0 }, { w: 10, tech: 'bat_fc10', cost: 0.6 }, { w: 18, tech: 'bat_fc18', cost: 1.5 },
                { w: 30, tech: 'bat_fc30', cost: 2.8 }, { w: 65, tech: 'bat_fc65', cost: 4.5 }, { w: 120, tech: 'bat_fc120', cost: 7 }];

// ---- Memory (MB) ---------------------------------------------------------------
const RAM_OPTIONS = [1, 2, 4, 8, 16, 32, 64, 128, 256, 384, 512, 768, 1024, 1536, 2048, 3072, 4096, 6144, 8192, 12288, 16384, 24576];
const STORAGE_OPTIONS = [1, 4, 16, 64, 256, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576];
const MEM_GENS = [[null, 1, 1], ['mem_e1', 4, 4], ['mem_e2', 16, 16], ['mem_e3', 32, 64], ['mem_e4', 64, 1024], ['mem_e5', 128, 16384],
                  ['mem_g1', 512, 32768], ['mem_g2', 1024, 65536], ['mem_g3', 2048, 65536], ['mem_g4', 3072, 131072],
                  ['mem_g5', 4096, 262144], ['mem_g6', 6144, 262144], ['mem_g7', 8192, 524288], ['mem_g8', 12288, 524288],
                  ['mem_g9', 16384, 1048576], ['mem_g10', 24576, 1048576]];
const MEM_YEARS = [2000.0, 2002.5, 2004.5, 2006.5, 2007.5, 2009.5, 2011.0, 2012.5, 2014.5, 2016.0, 2017.5, 2018.7, 2020.0, 2021.5, 2023.5];
const fmtMB = mb => (mb >= 1048576 ? (mb / 1048576) + ' TB' : mb >= 1024 ? (mb / 1024) + ' GB' : mb + ' MB');

// ---- Body & features ------------------------------------------------------
const MATERIALS = {
  plastic: { name: 'Plastic',          q: 0.62, cost: 4,  dens: 1.25, therm: 0.90, shell: 1.2,  tech: null },
  alu:     { name: 'Aluminum',         q: 0.85, cost: 13, dens: 1.42, therm: 1.15, shell: 0.9,  tech: 'body_alu' },
  glass:   { name: 'Glass + aluminum', q: 0.95, cost: 20, dens: 1.55, therm: 1.05, shell: 1.0,  tech: 'body_glass' },
  steel:   { name: 'Glass + steel',    q: 1.00, cost: 28, dens: 1.85, therm: 1.05, shell: 1.0,  tech: 'body_steel' },
  ceramic: { name: 'Ceramic',          q: 1.03, cost: 34, dens: 1.75, therm: 0.95, shell: 1.1,  tech: 'body_ceramic' },
  ti:      { name: 'Titanium',         q: 1.10, cost: 40, dens: 1.45, therm: 0.95, shell: 0.85, tech: 'body_ti' },
};
const WATER = {
  none: { name: 'None',          q: 0,   cost: 0,   tech: null },
  ip53: { name: 'Splash (IP53)', q: .03, cost: 1,   tech: 'body_ip53' },
  ip67: { name: 'IP67',          q: .08, cost: 3.5, tech: 'body_ip67' },
  ip68: { name: 'IP68',          q: .11, cost: 5.5, tech: 'body_ip68' },
};
const FINGERPRINT = {
  none: { name: 'None',                    pts: 0, cost: 0,  tech: null,          since: 1990 },
  rear: { name: 'Fingerprint (home/rear)', pts: 6, cost: 6,  tech: 'feat_fp',     since: 2013.5 },
  side: { name: 'Fingerprint (side key)',  pts: 7, cost: 5,  tech: 'feat_fpside', since: 2017 },
  ud:   { name: 'Under-display',           pts: 9, cost: 14, tech: 'feat_fpud',   since: 2019 },
};
// on/off extras: [key, tech, label, points, cost, since]
const EXTRAS = [
  ['poly', 'feat_poly', 'Polyphonic ringtones', 3, 1.5, 2001.5],
  ['bt', 'feat_bt', 'Bluetooth', 4, 5, 2002.5],
  ['mp3', 'feat_mp3', 'Music player', 4, 1.5, 2004.5],
  ['wifi', 'feat_wifi', 'Wi-Fi', 5, 6, 2006],
  ['gps', 'feat_gps', 'GPS', 4, 7, 2007.5],
  ['nfc', 'feat_nfc', 'NFC payments', 4, 3, 2011],
  ['stereo', 'feat_stereo', 'Stereo speakers', 4, 3, 2013],
  ['face3d', 'feat_face3d', '3D face unlock', 8, 25, 2017.7],
  ['jack', null, 'Headphone jack', 3, 0.5, 1990],
];
const OS = {
  basic:   { name: 'Basic firmware',     pts: 0,  fee: 0,   tech: null },
  feature: { name: 'Feature phone OS',   pts: 6,  fee: 1.5, tech: 'os_feature' },
  smart:   { name: 'Smartphone OS',      pts: 12, fee: 6,   tech: 'os_smart' },
  touch:   { name: 'Touch-first OS',     pts: 20, fee: 4,   tech: 'os_touch', needsTouch: true },
  modern:  { name: 'Modern mobile OS',   pts: 26, fee: 3,   tech: 'os_modern', needsTouch: true },
  ai:      { name: 'AI-native OS',       pts: 31, fee: 4,   tech: 'os_ai', needsTouch: true },
};
const OS_ORDER = ['basic', 'feature', 'smart', 'touch', 'modern', 'ai'];
const BODY_COLORS = ['#1f2430', '#e8e8ea', '#b9a07a', '#7f98c4', '#c25d5d', '#4f8a64', '#d8a7c4', '#2f4b7c', '#e2c35a', '#9aa0a8'];

// ---- Research tree ------------------------------------------------------------
// market: when it becomes industry standard (parts can be bought from suppliers).
// Everything must be researched before you can use it. Research is pricey before
// `market` (you are inventing it; the part is then in-house only) and gets cheap after.
const TECHS = [];
const TECH = {};
function T(id, cat, name, market, k, days, desc, req, extra) {
  const t = Object.assign({ id, cat, name, market, k, days, desc, req: req || [], lead: 2.5 }, extra || {});
  TECHS.push(t); TECH[id] = t;
}
// design & form factors (in-house: needs your own assembly plant)
T('form_flip', 'design', 'Flip phone design', 1996.0, 0.7, 45, 'Clamshell hinge engineering. The hottest look of the late 90s.');
T('body_intant', 'design', 'Internal antenna', 1998.5, 0.8, 60, 'Hide the antenna inside the body – no more stub on top.');
T('form_qwerty', 'design', 'QWERTY messenger', 2002.5, 1, 60, 'A full thumb keyboard for email addicts.');
T('form_slider', 'design', 'Slider mechanism', 2004.5, 1, 60, 'Spring-loaded rails: the screen slides up over the keypad.', ['form_flip']);
T('body_alu', 'design', 'Aluminum bodies', 2004.5, 1.2, 75, 'Thin anodized metal shells. Feels premium, sheds heat.');
T('body_ip53', 'design', 'Splash resistance', 2006.0, 0.8, 45, 'Gaskets that survive rain.');
T('form_touch', 'design', 'Full-touch slate', 2007.0, 2.5, 120, 'Drop the keypad: the whole front is a screen.', ['disp_touchc']);
T('form_tablet', 'design', 'Tablets', 2010.25, 2, 100, 'A new device category: big touch slates.', ['form_touch']);
T('body_glass', 'design', 'Glass sandwich design', 2010.5, 1.2, 75, 'Glass front and back around a metal frame.', ['body_alu']);
T('body_ip67', 'design', 'IP67 water resistance', 2014.0, 1, 60, 'Survives a dunk in 1 m of water.', ['body_ip53']);
T('body_ip68', 'design', 'IP68 water resistance', 2016.5, 1, 60, 'Survives 30 min at 1.5 m+.', ['body_ip67']);
T('body_steel', 'design', 'Stainless steel frames', 2017.0, 1, 60, 'Polished steel bands.', ['body_glass']);
T('body_ceramic', 'design', 'Ceramic bodies', 2018.0, 1, 75, 'Scratch-proof zirconia ceramic.', ['body_glass']);
T('form_fold', 'design', 'Foldable phones', 2019.5, 3, 150, 'A hinge that folds a tablet-sized screen in half.', ['disp_fold', 'form_touch']);
T('body_ti', 'design', 'Titanium frames', 2023.7, 1.2, 75, 'Light and strong aerospace titanium.', ['body_steel']);
// display (in-house: display fab)
['2.2', '2.6', '3.5', '4.3', '5.0', '5.7', '6.3', '6.9', '7.2'].forEach((s, i) => {
  const yrs = [2001.0, 2004.5, 2007.0, 2010.0, 2012.5, 2014.0, 2017.0, 2020.0, 2024.0];
  T('disp_size' + (i + 2), 'display', `${s}" screens`, yrs[i], 0.6, 45, `Lets you fit screens up to ${s}" diagonal.`, i ? ['disp_size' + (i + 1)] : []);
});
T('disp_cstn', 'display', 'Color screens (CSTN)', 2000.5, 1.2, 60, 'Passive-matrix color: 4,096 colors!');
T('disp_ppi1', 'display', '130 PPI panels', 2000.5, 0.6, 40, 'Sharper text and icons.');
T('disp_tft', 'display', 'Color TFT LCD', 2002.3, 1.4, 75, 'Active-matrix color: bright, fast, 65k colors.', ['disp_cstn']);
T('disp_touchr', 'display', 'Resistive touchscreen', 2003.0, 1, 60, 'Pressure-sensitive touch layer. Works with a stylus.');
T('disp_ppi2', 'display', '160 PPI panels', 2003.0, 0.6, 40, 'QVGA-class sharpness.', ['disp_ppi1']);
T('disp_ppi3', 'display', '200 PPI panels', 2006.0, 0.7, 45, 'Crisp photos and web pages.', ['disp_ppi2']);
T('disp_touchc', 'display', 'Capacitive multi-touch', 2007.0, 2, 100, 'Glass that senses fingers. Pinch to zoom.', ['disp_tft']);
T('disp_ppi4', 'display', '260 PPI panels', 2008.0, 0.8, 50, 'High-density smartphone panels.', ['disp_ppi3']);
T('disp_ips', 'display', 'IPS LCD', 2009.5, 1.2, 60, 'Wide viewing angles and accurate color.', ['disp_tft']);
T('disp_amoled', 'display', 'AMOLED panels', 2010.3, 2, 90, 'Self-emissive pixels: true blacks, thinner, efficient.', ['disp_tft']);
T('disp_330', 'display', '330+ PPI panels', 2010.5, 1, 60, 'Pixels too small to see.', ['disp_ppi4']);
T('disp_440', 'display', 'Full-HD 440 PPI', 2013.0, 1, 60, '1080p-class phone panels.', ['disp_330']);
T('disp_530', 'display', 'Quad-HD 560 PPI', 2014.5, 1, 60, '1440p-class phone panels.', ['disp_440']);
T('disp_tab13', 'display', '13" tablet panels', 2015.8, 0.8, 50, 'Laptop-sized tablet screens.', ['form_tablet']);
T('disp_fullview', 'display', 'Edge-to-edge display', 2017.3, 1.5, 75, 'Slim bezels and taller 19.5:9 screens.', ['disp_amoled']);
T('disp_90', 'display', '90 Hz refresh', 2019.4, 1, 50, 'Smoother scrolling.');
T('disp_fold', 'display', 'Foldable OLED', 2019.5, 3, 150, 'Plastic OLED that bends thousands of times.', ['disp_amoled']);
T('disp_120', 'display', '120 Hz refresh', 2020.2, 1, 50, 'Silky-smooth high refresh.', ['disp_90']);
T('disp_ltpo', 'display', 'LTPO OLED', 2021.7, 1.5, 75, 'Variable 1–120 Hz: high refresh without the battery cost.', ['disp_amoled', 'disp_120']);
T('disp_tandem', 'display', 'Tandem OLED', 2024.4, 1.5, 75, 'Two stacked emitter layers: brighter and more efficient.', ['disp_ltpo']);
// camera (in-house: camera module plant)
T('cam_cif', 'camera', 'Built-in camera (0.1 MP)', 2000.8, 1.5, 75, 'A tiny CIF camera module. Photos the size of a stamp.');
T('cam_vga', 'camera', 'VGA camera (0.3 MP)', 2002.0, 1, 60, '640×480 photos you can send by MMS.', ['cam_cif']);
T('cam_front', 'camera', 'Front camera', 2003.5, 0.8, 45, 'For video calls (and later, selfies).', ['cam_vga']);
T('cam_13', 'camera', '1.3 MP camera', 2004.0, 1, 60, 'Megapixel photos.', ['cam_vga']);
T('cam_flash', 'camera', 'LED flash', 2005.0, 0.6, 40, 'Light for indoor shots.', ['cam_vga']);
T('cam_2mp', 'camera', '2 MP autofocus', 2005.5, 1, 60, 'Autofocus lens and 2 MP sensor.', ['cam_13']);
T('cam_3mp', 'camera', '3.2 MP camera', 2007.0, 1, 60, 'Good enough to replace a cheap compact camera.', ['cam_2mp']);
T('cam_g2', 'camera', '5 MP 1/3.2" sensors', 2009.5, 1, 60, 'Bigger, higher resolution sensors.', ['cam_3mp']);
T('cam_g3', 'camera', '8 MP BSI sensors', 2011.0, 1.2, 70, 'Back-side illuminated 1/3" sensors: much better low light.', ['cam_g2']);
T('cam_ois', 'camera', 'Optical image stabilization', 2012.7, 1.2, 70, 'Gyro-stabilized lens: sharper night shots and video.', ['cam_g3']);
T('cam_g4', 'camera', '13 MP sensors', 2013.0, 1, 60, 'Higher resolution 1/3" sensors.', ['cam_g3']);
T('cam_g5', 'camera', '16 MP 1/2.55" sensors', 2014.5, 1.2, 70, 'Large-pixel main sensors.', ['cam_g4']);
T('cam_multi', 'camera', 'Multi-camera modules', 2016.7, 1.5, 80, 'Ultra-wide and telephoto cameras beside the main one.', ['cam_g5']);
T('cam_g6', 'camera', '48 MP Quad-Bayer 1/2"', 2019.0, 1.5, 80, 'Pixel-binning sensors that combine 4-in-1 in low light.', ['cam_g5']);
T('cam_periscope', 'camera', 'Periscope zoom', 2019.2, 1.5, 80, 'Folded optics for 5× optical zoom.', ['cam_multi']);
T('cam_g7', 'camera', '108 MP 1/1.33" sensors', 2020.5, 1.5, 80, 'Huge stacked sensors.', ['cam_g6']);
T('cam_g8', 'camera', '200 MP & 1-inch sensors', 2022.5, 1.8, 90, 'Compact-camera-sized sensors in a phone.', ['cam_g7']);
// battery (in-house: battery plant)
T('bat_liion', 'battery', 'Li-ion cells', 1997.5, 1, 60, '+70% energy density over NiMH and no memory effect.');
MAH_CAPS.slice(1).forEach(([id, mah], i) => {
  T(id, 'battery', `${mah.toLocaleString('en-US')} mAh cells`, MAH_YEARS[i], 0.5, 40, `Lets you fit batteries up to ${mah.toLocaleString('en-US')} mAh (tablets ×2.2).`, i ? [MAH_CAPS[i][0]] : []);
});
T('bat_lipo', 'battery', 'Li-Po pouch cells', 2005.0, 1, 60, 'Flat pouch cells: +25% energy density.', ['bat_liion']);
T('bat_fc10', 'battery', '10 W charging', 2011.0, 0.5, 30, 'Faster charging.');
T('bat_wireless', 'battery', 'Wireless charging', 2012.5, 1, 60, 'Qi inductive charging coil.');
T('bat_hv', 'battery', 'High-voltage Li-Po', 2015.0, 1, 60, 'Higher cell voltage, +18% energy density.', ['bat_lipo']);
T('bat_fc18', 'battery', '18 W fast charging', 2015.0, 0.6, 40, 'Quick Charge-class charging.', ['bat_fc10']);
T('bat_fc30', 'battery', '30 W fast charging', 2018.0, 0.6, 40, 'Half a battery in 30 minutes.', ['bat_fc18']);
T('bat_fc65', 'battery', '65 W fast charging', 2020.0, 0.7, 45, 'Dual-cell fast charging.', ['bat_fc30']);
T('bat_fc120', 'battery', '120 W hyper charging', 2022.0, 0.8, 50, 'Full charge in under 20 minutes.', ['bat_fc65']);
T('bat_sic', 'battery', 'Silicon-carbon anodes', 2023.5, 1.5, 80, '+25% energy density over HV Li-Po.', ['bat_hv']);
// memory (in-house: memory fab)
MEM_GENS.slice(1).forEach(([id, ram, sto], i) => {
  T(id, 'memory', `${fmtMB(ram)} RAM / ${fmtMB(sto)} storage`, MEM_YEARS[i], 0.6, 45, 'Denser DRAM and flash: larger RAM and storage options.', i ? [MEM_GENS[i][0]] : []);
});
// chip design (usable in your own chip designs; modems also gate which chips you can use)
for (let g = 2; g <= 20; g++) {
  T('chip_arch' + g, 'chip', `CPU architecture v${g}`, 1995 + (g - 1) * 1.6, 0.7, 60,
    '+12% IPC for every CPU, GPU and NPU block in your custom chips.', g > 2 ? ['chip_arch' + (g - 1)] : []);
}
T('modem_25g', 'chip', '2.5G GPRS/EDGE modems', 2001.5, 1.2, 70, 'Always-on mobile data. Needed to use 2.5G chips and modems.');
T('chip_isp', 'chip', 'Camera ISP block', 2002.0, 0.8, 50, 'Unlocks the image signal processor block.');
T('chip_gpu', 'chip', 'Graphics core block', 2004.0, 1.2, 70, 'Unlocks the GPU block: 3D games!');
T('modem_3g', 'chip', '3G modems', 2004.0, 2, 100, 'Video calls and mobile internet.', ['modem_25g']);
T('chip_media', 'chip', 'Media engine block', 2004.5, 0.8, 50, 'Unlocks hardware audio/video codecs.');
T('modem_4g', 'chip', '4G LTE modems', 2011.0, 2.5, 110, 'Broadband-speed mobile data.', ['modem_3g']);
T('chip_little', 'chip', 'big.LITTLE efficiency cores', 2011.5, 1, 60, 'Unlocks the efficiency core block.');
T('chip_npu', 'chip', 'Neural engine block', 2017.7, 1.5, 80, 'Unlocks the NPU block for on-device AI.');
T('modem_5g', 'chip', '5G modems', 2019.5, 3, 120, 'Gigabit mobile data.', ['modem_4g']);
// process design kits (design custom chips at a node; also lets you build a fab there before foundries offer it)
NODES.forEach((n, i) => {
  if (i === 0) return;
  T('proc_' + n.nm, 'process', `${nodeLabel(n.nm)} design kit`, n.year, 1.5, 80,
    `Design custom chips on the ${nodeLabel(n.nm)} process. Researched early, you can build your own fab before foundries offer it.`, i > 1 ? ['proc_' + NODES[i - 1].nm] : []);
});
// features & software (in-house: assembly plant)
EXTRAS.forEach(([key, id, label, , , since]) => {
  if (!id) return;
  T(id, 'features', label, since, 0.7, 45, { poly: 'Ringtones with real chords.', bt: 'Wireless headsets and file sharing.', mp3: 'Your music collection in your pocket.',
    wifi: 'Fast internet at home and in cafés.', gps: 'Turn-by-turn navigation.', nfc: 'Tap-to-pay radio.', stereo: 'Front-facing stereo audio.',
    face3d: 'Structured-light depth camera for secure face unlock.' }[key], key === 'face3d' ? ['form_touch'] : []);
});
T('feat_sd', 'features', 'Memory card slot', 2005.0, 0.5, 30, 'Expandable storage with microSD.');
T('feat_fp', 'features', 'Fingerprint sensor', 2013.5, 1, 60, 'Capacitive fingerprint reader.');
T('feat_fpside', 'features', 'Side-key fingerprint', 2017.0, 0.6, 40, 'Fingerprint reader in the power key.', ['feat_fp']);
T('feat_fpud', 'features', 'Under-display fingerprint', 2019.0, 1, 60, 'Optical reader under the screen.', ['feat_fp']);
T('os_feature', 'features', 'Feature phone OS', 2002.0, 1.5, 80, 'Downloadable games, apps and themes.');
T('os_smart', 'features', 'Smartphone OS', 2004.0, 2, 100, 'Multitasking, email, office documents.', ['os_feature']);
T('os_touch', 'features', 'Touch-first OS', 2007.5, 3, 120, 'An OS built for fingers, with an app store.', ['os_smart', 'disp_touchc']);
T('os_modern', 'features', 'Modern mobile OS', 2013.0, 2, 100, 'Polished, secure, cloud-synced.', ['os_touch']);
T('os_ai', 'features', 'AI-native OS', 2024.5, 3, 120, 'An on-device assistant woven through everything.', ['os_modern', 'chip_npu']);
T('os_own', 'features', 'In-house operating system', 9999, 12, 240, 'Write your own OS: no more per-unit license fees to OS vendors.', ['os_smart'], { opens: 2004, never: true });

const TECH_CATS = {
  design:   { name: 'Design & form', icon: '🧩', factory: 'assembly', note: 'Before it is standard, needs your own Assembly Plant.' },
  display:  { name: 'Displays',      icon: '🖥️', factory: 'display',  note: 'Before it is standard, needs your own Display Fab.' },
  camera:   { name: 'Cameras',       icon: '📷', factory: 'camera',   note: 'Before it is standard, needs your own Camera Module Plant.' },
  battery:  { name: 'Batteries',     icon: '🔋', factory: 'battery',  note: 'Before it is standard, needs your own Battery Plant.' },
  memory:   { name: 'Memory',        icon: '💾', factory: 'memory',   note: 'Before it is standard, needs your own Memory Fab.' },
  chip:     { name: 'Chips & modems', icon: '🧠', factory: null,      note: 'Unlocks chip blocks, modem generations and CPU architecture.' },
  process:  { name: 'Process nodes', icon: '💠', factory: 'fab',      note: 'Design chips at a node; build a fab there early.' },
  features: { name: 'Features & software', icon: '✨', factory: 'assembly', note: 'Before it is standard, needs your own Assembly Plant.' },
};

// ---- Playstyles -----------------------------------------------------------------
const PLAYSTYLES = {
  brand: { name: 'Design House', icon: '🎨', tagline: 'Design phones people love and let others build them.',
    perks: ['−40% device development cost', '+50% marketing effect', '−15% contract manufacturing fees', 'Starts with 2% brand awareness'],
    devMul: 0.6, mkMul: 1.5, feeMul: 0.85, aware: 0.02 },
  maker: { name: 'Manufacturer', icon: '🏭', tagline: 'Own the factories. Build your phones cheap and sell parts to rivals.',
    perks: ['Starts with a small assembly workshop', '−30% factory cost, −20% upkeep', 'In-house parts 10% cheaper', 'More and better supply contracts'],
    facMul: 0.7, upkeepMul: 0.8, inMul: 0.9, contractMul: 1.6 },
  tech: { name: 'Tech Pioneer', icon: '🔬', tagline: 'Out-invent everyone. Custom chips, exclusive tech, licensing.',
    perks: ['+50% research speed, −30% research cost', '+1 research slot', '−40% chip tape-out cost', '+50% licensing royalties'],
    rsSpeed: 1.5, rsCost: 0.7, rsSlot: 1, tapeMul: 0.6, royaltyMul: 1.5 },
};

// ---- Factories ----------------------------------------------------------------
// costs/upkeep here are 2016 values; they scale with ERA_FACTORY
const FACTORY_TYPES = {
  workshop: { name: 'Assembly Workshop', icon: '🛠️', cost: 70e3, days: 30, upkeep: 2.5e3, cap: 3000, unit: 'devices', spare: 2, pool: 'assembly', assemblyMul: 0.6,
    desc: 'A few benches and soldering stations. Builds your devices at ~60% of contract prices.' },
  assembly: { name: 'Assembly Plant', icon: '🏭', cost: 0.9e6, days: 60, upkeep: 50e3, cap: 30000, unit: 'devices', spare: 2.5, pool: 'assembly', assemblyMul: 0.4,
    desc: 'A proper production line: devices at ~40% of contract prices. Unlocks in-house design & feature tech.' },
  camera:   { name: 'Camera Module Plant', icon: '📷', cost: 3e6, days: 120, upkeep: 110e3, cap: 80000, unit: 'camera modules', spare: 1.8, markup: 1.45, pool: 'camera',
    desc: 'Build sensor + lens modules at cost (~30% cheaper than suppliers). Unlocks in-house camera tech.' },
  battery:  { name: 'Battery Cell Plant', icon: '🔋', cost: 2.5e6, days: 120, upkeep: 90e3, cap: 60000, unit: 'cells', spare: 1.2, markup: 1.35, pool: 'battery',
    desc: 'Make your own battery cells (~26% cheaper). Unlocks in-house battery tech.' },
  display:  { name: 'Display Fab', icon: '🖥️', cost: 14e6, days: 240, upkeep: 300e3, cap: 60000, unit: 'panels', spare: 5, markup: 1.4, pool: 'display',
    desc: 'Produce LCD/OLED panels (~29% cheaper). Unlocks in-house display tech.' },
  memory:   { name: 'Memory Fab', icon: '💾', cost: 45e6, days: 360, upkeep: 1.3e6, cap: 250000, unit: 'memory sets', spare: 4.5, markup: 1.45, pool: 'memory',
    desc: 'DRAM + flash fabrication (~31% cheaper). Unlocks in-house memory tech.' },
  fab:      { name: 'Chip Fab', icon: '💠', cost: 0, days: 420, upkeep: 0, cap: 1000, unit: 'wafers',
    desc: 'A semiconductor fab locked to one process node. Wafers cost you ~30% of the foundry price.' },
  rnd:      { name: 'R&D Center', icon: '🧪', cost: 2e6, days: 90, upkeep: 150e3, cap: 0, unit: '',
    desc: 'Each level adds one parallel research project and +25% research speed.' },
};
const FACTORY_MAX_LEVEL = 5;
const STOCK_TYPES = ['display', 'camera', 'battery', 'memory'];

// ---- Contract manufacturers ------------------------------------------------------
// fee: multiplier on the era's assembly labor price. tier: most complex device they can build.
// cap: units per month they can make for you. minRev: monthly revenue they require from clients.
const PARTNERS = [
  { id: 'riverside', name: 'Riverside Workshop', since: 1990, fee: 1.3, defect: 0.05, cap: 4000, moq: 200, lead: 21, tier: 2, minRev: 0,
    desc: 'A small local assembler. Takes tiny orders, quality is so-so.' },
  { id: 'pearl', name: 'Pearl Delta Electronics', since: 1994, fee: 1.0, defect: 0.025, cap: 60000, moq: 2000, lead: 30, tier: 3, minRev: 0,
    desc: 'A big Shenzhen assembler. Solid quality, sensible minimums.' },
  { id: 'lumos', name: 'Lumos Contract Mfg.', since: 2003, fee: 0.95, defect: 0.015, cap: 250000, moq: 10000, lead: 35, tier: 4, minRev: 150e3,
    desc: 'Modern lines that can build smartphones and metal bodies.' },
  { id: 'honsheng', name: 'Hon Sheng Precision', since: 1998, fee: 0.85, defect: 0.008, cap: 1500000, moq: 50000, lead: 45, tier: 5, minRev: 2e6,
    desc: 'The giant. Builds anything at enormous scale – for big clients only.' },
];
const TIER_NAMES = ['', 'basic', 'color/camera', 'smartphone', 'flagship', 'cutting-edge'];

// ---- Investors -------------------------------------------------------------------
// amounts are 2016 dollars (scaled by ERA_FUND); rev = monthly revenue needed to pitch
const ROUNDS = [
  { id: 'ff', name: 'Friends & family', min: 20e3, max: 50e3, eq: [0.10, 0.15], rev: 0, need: 'none', days: 10,
    investors: ['Your old college roommate', 'Uncle Ray', 'The neighbors\' savings club'] },
  { id: 'angel', name: 'Angel round', min: 250e3, max: 600e3, eq: [0.15, 0.25], rev: 0, need: 'proto', days: 20,
    investors: ['Harbor Angels', 'Ridgeway Angel Group', 'Lindqvist Family Office'] },
  { id: 'seed', name: 'Seed round', min: 1e6, max: 3e6, eq: [0.15, 0.22], rev: 40e3, need: 'rev', days: 30,
    investors: ['Sandhill Seed', 'Copperline Ventures', 'First Light Capital'] },
  { id: 'a', name: 'Series A', min: 5e6, max: 15e6, eq: [0.15, 0.22], rev: 400e3, need: 'rev', days: 45,
    investors: ['Northgate Capital', 'Bluewater Partners', 'Ironwood Ventures'] },
  { id: 'b', name: 'Series B', min: 25e6, max: 70e6, eq: [0.12, 0.18], rev: 3e6, need: 'rev', days: 50,
    investors: ['Atlas Growth Partners', 'Summit Ridge Capital'] },
  { id: 'c', name: 'Series C', min: 100e6, max: 300e6, eq: [0.10, 0.15], rev: 15e6, need: 'rev', days: 60,
    investors: ['Meridian Crossover Fund', 'Orion Sovereign Fund'] },
  { id: 'ipo', name: 'IPO', min: 0, max: 0, eq: [0.15, 0.20], rev: 50e6, need: 'ipo', days: 90,
    investors: ['the public markets (NXQ exchange)'] },
];

// ---- Rivals -------------------------------------------------------------------
// aware: brand awareness over time. form: favourite form factor while it is fashionable.
const RIVALS = [
  { id: 'nordvik', name: 'Nordvik', color: '#3d8bd9', aware: [[1994, .85], [2007, .9], [2011, .7], [2014, .3], [2016, .1]], skill: 1.0, priceMul: 1.0, rep: 8.2, month: 2.5,
    segs: { phone: ['budget', 'mid', 'premium'] }, start: { phone: 1990 }, end: 2016.5, form: 'candybar',
    names: { phone: { budget: 'Nordvik 1{n}00', mid: 'Nordvik 6{n}30', premium: 'Nordvik N{n}' } } },
  { id: 'halcyon', name: 'Halcyon', color: '#e2504a', aware: [[1994, .8], [2004, .85], [2008, .6], [2012, .35], [2040, .2]], skill: 0.98, priceMul: 1.08, rep: 7.8, month: 6.5,
    segs: { phone: ['mid', 'premium', 'ultra'] }, start: { phone: 1990 }, form: 'flip',
    names: { phone: { mid: 'Halcyon V{n}', premium: 'Halcyon Edge {n}', ultra: 'Halcyon Star {n}' } } },
  { id: 'nova', name: 'Nova Mobile', color: '#5ea2f7', aware: [[1994, .45], [2004, .65], [2010, .82], [2040, .85]], skill: 1.0, priceMul: 1.0, rep: 8.0, month: 2.5,
    segs: { phone: ['budget', 'mid', 'premium', 'ultra'], tablet: ['budget', 'mid', 'premium'] }, start: { phone: 1990, tablet: 2010.9 },
    names: { phone: { budget: 'Nova A{n}', mid: 'Nova M{n}', premium: 'Nova S{n}', ultra: 'Nova S{n} Ultra' }, tablet: { budget: 'Nova Tab A{n}', mid: 'Nova Tab {n}', premium: 'Nova Tab S{n}' } } },
  { id: 'kestrel', name: 'Kestrel', color: '#f4a63c', aware: [[1994, .35], [2006, .55], [2012, .55], [2018, .35], [2021, .2]], skill: 0.95, priceMul: 0.92, rep: 7.4, month: 5.5,
    segs: { phone: ['budget', 'mid', 'premium'], tablet: ['budget'] }, start: { phone: 1990, tablet: 2012 }, end: 2021.3, form: 'slider',
    names: { phone: { budget: 'Kestrel E{n}', mid: 'Kestrel G{n}', premium: 'Kestrel X{n}' }, tablet: { budget: 'Kestrel Pad {n}' } } },
  { id: 'keystone', name: 'Keystone', color: '#a98bf5', aware: [[1999, .3], [2005, .55], [2010, .66], [2013, .35], [2016, .08]], skill: 0.9, priceMul: 1.05, rep: 7.6, month: 4,
    segs: { phone: ['mid', 'premium'] }, start: { phone: 1999 }, end: 2016.5, form: 'qwerty',
    names: { phone: { mid: 'Keystone Curve {n}', premium: 'Keystone Bold {n}' } } },
  { id: 'orchard', name: 'Orchard', color: '#d4d8e0', aware: [[2007, .6], [2010, .8], [2040, .82]], skill: 1.05, priceMul: 1.18, rep: 8.6, month: 8.5,
    segs: { phone: ['premium', 'ultra'], tablet: ['mid', 'premium', 'ultra'] }, start: { phone: 2007.5, tablet: 2010.25 },
    names: { phone: { premium: 'oPhone {n}', ultra: 'oPhone {n} Pro' }, tablet: { mid: 'oPad {n}', premium: 'oPad Air {n}', ultra: 'oPad Pro {n}' } } },
  { id: 'zenith', name: 'Zenith', color: '#3fd09a', aware: [[2011, .2], [2016, .45], [2022, .65], [2040, .7]], skill: 0.92, priceMul: 0.8, rep: 7.0, month: 10.5,
    segs: { phone: ['budget', 'mid', 'premium'], tablet: ['budget', 'mid'] }, start: { phone: 2011, tablet: 2012.5 },
    names: { phone: { budget: 'Zenith Lite {n}', mid: 'Zenith {n}', premium: 'Zenith {n} Pro' }, tablet: { budget: 'Zenith Pad Lite {n}', mid: 'Zenith Pad {n}' } } },
];

// ---- Chip vendors (sell off-the-shelf SoCs) ------------------------------------
const VENDORS = [
  { id: 'quasar', name: 'Quasar', series: 'Snapline', month: 1.5, tiers: ['budget', 'mid', 'flagship'] },
  { id: 'helix', name: 'Helix Semi', series: 'Dimension', month: 5.5, tiers: ['budget', 'mid'] },
  { id: 'arcadia', name: 'Arcadia', series: 'Exo', month: 9.5, tiers: ['mid', 'flagship'] },
];

// ---- Scripted world events ------------------------------------------------------
const EVENTS = [
  { start: 2000.25, end: 2002.0, title: 'Dot-com crash', desc: 'Tech stocks collapse. Investors are cautious: funding rounds are harder to win.', fx: { funding: 0.6 } },
  { start: 2008.70, end: 2009.60, title: 'Global financial crisis', desc: 'Consumers delay purchases: device demand −12%. Investors pull back.', fx: { demand: 0.88, funding: 0.6 } },
  { start: 2011.20, end: 2011.55, title: 'Earthquake hits component suppliers', desc: 'Display and memory prices +20%.', fx: { display: 1.2, memory: 1.2 } },
  { start: 2017.40, end: 2018.60, title: 'DRAM price surge', desc: 'Memory prices +40% as data centers hoard DRAM.', fx: { memory: 1.4 } },
  { start: 2020.20, end: 2020.75, title: 'Global pandemic', desc: 'Stores closed worldwide: demand −18%.', fx: { demand: 0.82 } },
  { start: 2020.75, end: 2022.30, title: 'Global chip shortage', desc: 'Foundry wafers +25%, off-the-shelf chips +20%.', fx: { wafer: 1.25, soc: 1.2 } },
  { start: 2025.50, end: 2026.30, title: 'AI data-center memory crunch', desc: 'Memory prices +35%.', fx: { memory: 1.35 } },
];

// ---- Goals (guided objectives) -----------------------------------------------------
const GOALS = [
  { id: 'proto', text: 'Build a prototype', hint: 'Phone Lab → 🧪 Build prototype. Investors want to hold something.' },
  { id: 'raise', text: 'Raise money from investors', hint: 'Investors tab: start with friends & family, then pitch angels with your prototype.' },
  { id: 'launch1', text: 'Launch your first device', hint: 'Phone Lab → Develop & launch.' },
  { id: 'order1', text: 'Get your first production run delivered', hint: 'Production tab: order units from a contract manufacturer.' },
  { id: 'sold10k', text: 'Sell 10,000 devices', hint: 'Marketing raises awareness, and awareness drives sales.' },
  { id: 'research5', text: 'Research 5 new technologies', hint: 'Research unlocks bigger batteries, screens, cameras and more.' },
  { id: 'factory', text: 'Build your own factory', hint: 'Factories tab: a workshop or assembly plant cuts the contract fee.' },
  { id: 'review8', text: 'Launch a device that reviews 8.0+', hint: 'Beat rivals on quality for the price.' },
  { id: 'seriesA', text: 'Close a Series A', hint: 'Grow monthly revenue so big investors take you seriously.' },
  { id: 'chip', text: 'Tape out your own custom chip', hint: 'Chip Lab: floorplan a processor and send it to the foundry.' },
  { id: 'exclusive', text: 'Research a technology before it becomes industry standard', hint: 'Exclusive tech = an edge nobody can buy.' },
  { id: 'b2b', text: 'Earn money from another brand', hint: 'Supply contracts, selling your chips, or licensing your tech.' },
  { id: 'share5', text: 'Reach 5% of the worldwide phone market', hint: 'Market tab shows share by brand.' },
  { id: 'ipo', text: 'Take the company public', hint: 'An IPO raises a fortune – if your revenue is big enough.' },
  { id: 'fab', text: 'Build your own chip fab', hint: 'Expensive – but wafers cost you a third of foundry prices.' },
  { id: 'top1', text: 'Become the #1 phone brand by monthly sales', hint: 'Out-sell everyone.' },
  { id: 'worth10b', text: 'Reach a $10B net worth', hint: 'An empire!' },
];
