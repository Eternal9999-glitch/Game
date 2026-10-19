'use strict';
// ============================================================================
//  Static game data: eras, regions & cellular networks, process nodes, chip
//  blocks, every part's design options (display, camera, battery, memory,
//  radio), form factors, layout elements, the research tree, playstyles,
//  factories, manufacturers, investors, rivals and world events.
//  Money is nominal US dollars, time is fractional calendar years (1983.5),
//  lengths are millimetres unless a name says otherwise (display size: inches).
// ============================================================================

const FIRST_YEAR = 1973;
const RETAIL_CUT = 0.30;        // retail margin, distribution, warranty & royalties (share of sticker price)
const VOLTAGE = 3.8;            // nominal cell voltage used to turn mAh into Wh
const CELL_MM2 = 2.0;           // silicon area of one chip-lab grid cell
const CELL_MM = Math.sqrt(CELL_MM2);
const SUPPLIER_MARKUP = 1.45;   // standard parts bought from suppliers
const CONTRACT_MARKUP = 1.22;   // your own part designs, built by contract part makers
const TAX_RATE = 0.22;

// How people, buildings and research cost over time (1.0 = 2016) and how big funding rounds are.
const ECON = [[1973, 0.10], [1983, 0.16], [1990, 0.22], [1996, 0.32], [2000, 0.42], [2008, 0.72], [2016, 1.0], [2024, 1.3], [2040, 1.8]];
const FUND = [[1973, 0.30], [1983, 0.34], [1990, 0.38], [1996, 0.45], [2000, 0.55], [2008, 0.8], [2016, 1.0], [2025, 1.3], [2040, 1.6]];

// ---- World regions -----------------------------------------------------------
// share: fraction of worldwide handset buyers living there.
const REGIONS = {
  na: { name: 'North America', icon: '🌎', share: [[1973, .70], [1983, .55], [1990, .42], [1996, .30], [2002, .17], [2010, .11], [2020, .10], [2040, .10]] },
  eu: { name: 'Europe', icon: '🌍', share: [[1973, .20], [1983, .25], [1990, .33], [1996, .32], [2002, .30], [2010, .18], [2020, .14], [2040, .13]] },
  ea: { name: 'Japan & Korea', icon: '🗾', share: [[1973, .10], [1983, .17], [1990, .17], [1996, .18], [2002, .12], [2010, .06], [2020, .05], [2040, .05]] },
  cn: { name: 'China', icon: '🏯', share: [[1973, 0], [1983, 0], [1990, .02], [1996, .06], [2002, .15], [2010, .25], [2020, .25], [2040, .24]] },
  rw: { name: 'Rest of world', icon: '🌏', share: [[1973, 0], [1983, .03], [1990, .06], [1996, .14], [2002, .26], [2010, .40], [2020, .46], [2040, .48]] },
};
const REGION_ORDER = ['na', 'eu', 'ea', 'cn', 'rw'];

// ---- Cellular standards ----------------------------------------------------------
// gen: network generation. peak: downlink Mbps of a basic radio. needs: standard a radio must
// also support (fallback). cost/pwr/vol: radio cost ($ at its launch), talk power (W), electronics
// volume factor. niche: rivals skip it.
const NET_STDS = {
  imts:   { name: 'IMTS mobile radio-telephone', short: '0G', gen: 0, peak: 0, tech: 'net_imts', cost: 260, pwr: 9.0, vol: 1.0, vehicle: true },
  amps:   { name: 'AMPS analog cellular', short: '1G AMPS', gen: 1, peak: 0, tech: 'net_amps', cost: 250, pwr: 1.25, vol: 0.62 },
  nmt:    { name: 'NMT / TACS analog cellular', short: '1G NMT', gen: 1, peak: 0, tech: 'net_nmt', cost: 250, pwr: 1.25, vol: 0.62 },
  gsm:    { name: 'GSM', short: '2G GSM', gen: 2, peak: 0.0096, tech: 'net_gsm', cost: 160, pwr: 0.42, vol: 0.46 },
  tdma:   { name: 'D-AMPS / PDC (TDMA)', short: '2G TDMA', gen: 2, peak: 0.0096, tech: 'net_tdma', cost: 150, pwr: 0.42, vol: 0.46 },
  cdma:   { name: 'cdmaOne (IS-95)', short: '2G CDMA', gen: 2, peak: 0.0144, tech: 'net_cdma', cost: 180, pwr: 0.36, vol: 0.46 },
  gprs:   { name: 'GPRS / EDGE', short: '2.5G', gen: 2.5, peak: 0.236, tech: 'net_gprs', needs: 'gsm', cost: 20, pwr: 0.05, vol: 0.04 },
  cdma1x: { name: 'CDMA2000 1x', short: '2.5G 1x', gen: 2.5, peak: 0.153, tech: 'net_1x', needs: 'cdma', cost: 20, pwr: 0.05, vol: 0.04 },
  umts:   { name: 'UMTS / W-CDMA', short: '3G UMTS', gen: 3, peak: 0.384, tech: 'net_umts', needs: 'gprs', cost: 45, pwr: 0.30, vol: 0.10 },
  evdo:   { name: 'CDMA2000 EV-DO', short: '3G EV-DO', gen: 3, peak: 2.4, tech: 'net_evdo', needs: 'cdma1x', cost: 35, pwr: 0.25, vol: 0.08 },
  tdscdma:{ name: 'TD-SCDMA', short: '3G TD', gen: 3, peak: 2.8, tech: 'net_tdscdma', needs: 'gsm', cost: 30, pwr: 0.28, vol: 0.08, niche: true },
  hspa:   { name: 'HSPA / HSPA+', short: '3.5G HSPA', gen: 3.5, peak: 14.4, tech: 'net_hspa', needs: 'umts', cost: 15, pwr: 0.12, vol: 0.04 },
  wimax:  { name: 'Mobile WiMAX', short: '4G WiMAX', gen: 4, peak: 37, tech: 'net_wimax', cost: 30, pwr: 0.45, vol: 0.10, niche: true },
  lte:    { name: 'LTE', short: '4G LTE', gen: 4, peak: 100, tech: 'net_lte', cost: 50, pwr: 0.36, vol: 0.10 },
  nr:     { name: '5G NR (sub-6 GHz)', short: '5G', gen: 5, peak: 1500, tech: 'net_nr', needs: 'lte', cost: 55, pwr: 0.44, vol: 0.10 },
  mmw:    { name: '5G mmWave', short: '5G mmW', gen: 5, peak: 4000, tech: 'net_mmw', needs: 'nr', cost: 40, pwr: 0.3, vol: 0.06, niche: true },
  nr5a:   { name: '5G-Advanced', short: '5.5G', gen: 5.5, peak: 5000, tech: 'net_5ga', needs: 'nr', cost: 25, pwr: 0.2, vol: 0.04 },
  g6:     { name: '6G', short: '6G', gen: 6, peak: 25000, tech: 'net_6g', needs: 'nr', cost: 70, pwr: 0.5, vol: 0.10 },
};
const NET_ORDER = ['imts', 'amps', 'nmt', 'gsm', 'tdma', 'cdma', 'gprs', 'cdma1x', 'umts', 'evdo', 'tdscdma', 'hspa', 'wimax', 'lte', 'nr', 'mmw', 'nr5a', 'g6'];
const GEN_LABEL = g => (g < 1 ? '0G' : g % 1 ? g.toFixed(1) + 'G' : g + 'G');

// Carrier groups: each runs standards over [launch, shutdown]. A phone works for a group's
// customers if it supports any standard the group runs. Shares are within the region.
const CARRIERS = [
  { id: 'na1', region: 'na', share: .52, name: 'Bell-system carriers', from: 1946, stds: { imts: [1964, 1988.5], amps: [1983.8, 2008.1], tdma: [1992.7, 2008.1], gsm: [1996.8, 2017.0], gprs: [2001.5, 2017.0], umts: [2004.9, 2022.1], hspa: [2006.4, 2022.1], lte: [2011.7], nr: [2019.9], mmw: [2019.0], nr5a: [2026.0], g6: [2031] } },
  { id: 'na2', region: 'na', share: .38, name: 'Independent carriers', from: 1946, stds: { imts: [1964, 1988.5], amps: [1983.8, 2008.1], cdma: [1996.0, 2022.95], cdma1x: [2002.0, 2022.95], evdo: [2003.75, 2022.95], lte: [2010.92], nr: [2020.0], mmw: [2018.9], nr5a: [2026.0], g6: [2031] } },
  { id: 'na3', region: 'na', share: .10, name: 'PCS upstarts', from: 1995.9, stds: { cdma: [1996.0, 2022.4], cdma1x: [2002.6, 2022.4], evdo: [2004.6, 2022.4], wimax: [2008.75, 2015.9], lte: [2012.55], nr: [2019.4], nr5a: [2026.5], g6: [2031.5] } },
  { id: 'eu1', region: 'eu', share: 1.0, name: 'European operators', from: 1950, stds: { imts: [1958, 1990.0], nmt: [1981.75, 2001.5], gsm: [1991.5, 2028], gprs: [2000.5, 2028], umts: [2003.2, 2025.5], hspa: [2006.0, 2025.5], lte: [2009.95], nr: [2019.4], nr5a: [2025.8], g6: [2030.8] } },
  { id: 'ea1', region: 'ea', share: .45, name: 'Japanese incumbent', from: 1968, stds: { imts: [1968, 1982], nmt: [1979.9, 2000.2], tdma: [1993.3, 2012.25], umts: [2001.75, 2026.25], hspa: [2006.7, 2026.25], lte: [2010.95], nr: [2020.2], nr5a: [2025.5], g6: [2030.5] } },
  { id: 'ea2', region: 'ea', share: .22, name: 'Japanese challengers', from: 1988, stds: { nmt: [1988.9, 1999.0], cdma: [1998.55, 2012.5], cdma1x: [2002.3, 2022.25], evdo: [2003.9, 2022.25], lte: [2012.7], nr: [2020.2], nr5a: [2025.5], g6: [2030.5] } },
  { id: 'ea3', region: 'ea', share: .33, name: 'Korean carriers', from: 1984, stds: { amps: [1984.25, 1999.9], cdma: [1996.0, 2012.0], cdma1x: [2000.8, 2018.0], evdo: [2002.1, 2018.0], wimax: [2006.5, 2018.9], umts: [2006.4, 2026.0], hspa: [2006.7, 2026.0], lte: [2011.5], nr: [2019.25], nr5a: [2025.5], g6: [2030.5] } },
  { id: 'cn1', region: 'cn', share: .62, name: 'Chinese state carrier', from: 1987, stds: { nmt: [1987.9, 2001.5], gsm: [1995.0, 2030], gprs: [2002.0, 2030], tdscdma: [2009.1, 2020.0], lte: [2013.95], nr: [2019.8], nr5a: [2025.3], g6: [2030.5] } },
  { id: 'cn2', region: 'cn', share: .25, name: 'Chinese challenger', from: 1994.5, stds: { gsm: [1995.0, 2030], gprs: [2002.3, 2030], umts: [2009.4, 2026.0], hspa: [2009.4, 2026.0], lte: [2014.5], nr: [2019.8], nr5a: [2025.3], g6: [2030.5] } },
  { id: 'cn3', region: 'cn', share: .13, name: 'Chinese CDMA carrier', from: 2002, stds: { cdma: [2002.0, 2020.5], cdma1x: [2003.0, 2020.5], evdo: [2009.3, 2020.5], lte: [2014.4], nr: [2019.8], nr5a: [2025.3], g6: [2030.5] } },
  { id: 'rw1', region: 'rw', share: .55, name: 'Americas & Oceania', from: 1985, stds: { amps: [1985.5, 2008.5], tdma: [1995.0, 2010.0], gsm: [1996.0, 2032], gprs: [2003.0, 2032], umts: [2006.5, 2030], hspa: [2008.0, 2030], lte: [2013.5], nr: [2021.0], nr5a: [2027.0], g6: [2032] } },
  { id: 'rw2', region: 'rw', share: .45, name: 'Africa, India & Asia', from: 1987, stds: { nmt: [1987.0, 2002.0], gsm: [1995.5, 2035], gprs: [2004.0, 2035], cdma: [2003.0, 2016.0], cdma1x: [2003.5, 2016.0], umts: [2008.5, 2030], hspa: [2010.0, 2030], lte: [2016.7], nr: [2022.8], nr5a: [2028.0], g6: [2033] } },
];
const NET_RAMP = 1.6;          // years for a new network to reach full coverage
const NET_SUNSET = 1.2;        // years over which customers migrate off a network before shutdown
// how many RF bands a phone needs to work everywhere its standards are used
const BANDS_NEEDED = [[1973, 1], [1996, 1], [1998, 2], [2001, 3], [2004, 4], [2009, 6], [2012, 10], [2015, 16], [2018, 24], [2021, 32], [2025, 40], [2040, 48]];

// ---- Radio design options ---------------------------------------------------------
const BAND_CAPS = [[null, 1], ['rf_bands2', 2], ['rf_bands3', 3], ['rf_bands4', 4], ['rf_bands6', 6], ['rf_bands10', 10], ['rf_bands16', 16],
                   ['rf_bands24', 24], ['rf_bands32', 32], ['rf_bands48', 48]];
const MIMO = [{ n: 1, tech: null }, { n: 2, tech: 'rf_mimo2' }, { n: 4, tech: 'rf_mimo4' }, { n: 8, tech: 'rf_mimo8' }];
const CARRIER_AGG = [{ n: 1, tech: null }, { n: 2, tech: 'rf_ca2' }, { n: 3, tech: 'rf_ca3' }, { n: 5, tech: 'rf_ca5' }];
const ANTENNAS = {
  whip:     { name: 'Pull-out whip', tech: null, gain: 1.10, cost: 4, ext: true, len: 150, desc: 'Long telescoping antenna. Best signal, but it sticks out.' },
  stub:     { name: 'Helical stub', tech: 'rf_stub', gain: 0.96, cost: 2, ext: true, len: 32, desc: 'A short coiled antenna in a plastic nub.' },
  internal: { name: 'Internal antenna', tech: 'rf_internal', gain: 0.88, cost: 2.5, ext: false, desc: 'Printed antenna inside the case. Clean lines; metal bodies block it.' },
  frame:    { name: 'Frame-integrated', tech: 'rf_frame', gain: 0.97, cost: 5, ext: false, metal: true, desc: 'The metal frame itself is split into tuned antenna bands.' },
};
const PAS = {
  si:   { name: 'Silicon bipolar PA', tech: null, pwr: 1.0, cost: 1.0 },
  gaas: { name: 'GaAs PA', tech: 'rf_pa_gaas', pwr: 0.72, cost: 1.15 },
  et:   { name: 'Envelope-tracking PA', tech: 'rf_pa_et', pwr: 0.56, cost: 1.3 },
};
// RF front-end: what sits between the antenna and the transceiver (gain → signal, pwr/vol multipliers, cost $ at launch)
const RF_FE = {
  basic: { name: 'Discrete front-end', tech: null, gain: 1.0, pwr: 1.0, vol: 1.0, cost: 0, desc: 'Separate filters, switches and amplifiers.' },
  div:   { name: 'Receive diversity', tech: 'rf_div', gain: 1.04, pwr: 1.0, vol: 1.03, cost: 1.5, desc: 'A second receive antenna fills in the fades.' },
  tuner: { name: 'Antenna tuners', tech: 'rf_tuner', gain: 1.08, pwr: 0.98, vol: 1.03, cost: 2.5, desc: 'Retunes the antenna on the fly when your hand detunes it.' },
  fem:   { name: 'Integrated front-end modules', tech: 'rf_fem', gain: 1.09, pwr: 0.92, vol: 0.9, cost: 4, desc: 'Filters, switches and amplifiers packed into one module.' },
  ai:    { name: 'AI antenna management', tech: 'rf_ai', gain: 1.12, pwr: 0.88, vol: 0.9, cost: 5, desc: 'Machine-learned antenna switching and beam steering.' },
};
const RF_FE_ORDER = ['basic', 'div', 'tuner', 'fem', 'ai'];
// electronics volume shrinks with every integration step (cm³ multipliers)
const INTEGRATION = [
  ['int_discrete', 1.0, 'Discrete transistors'], ['int_hybrid', 0.6, 'Thick-film hybrids'], ['int_lsi', 0.55, 'LSI logic'], ['int_vlsi', 0.5, 'VLSI chipsets'],
  ['int_smt', 0.5, 'Surface-mount boards'], ['int_asic', 0.4, 'Custom ASICs'], ['int_rfic', 0.5, 'RF integrated circuits'], ['int_csp', 0.88, 'Chip-scale packages'],
  ['int_hdi', 0.65, 'HDI microvia boards'], ['int_pop', 0.7, 'Package-on-package'], ['int_anylayer', 0.8, 'Any-layer HDI'], ['int_slp', 0.8, 'Substrate-like PCB'],
  ['int_sip', 0.85, 'System-in-package'],
];
const ELECTRONICS_BASE = 6000;  // cm³ of a 1973 radio-telephone built from discrete parts

// ---- Process nodes -------------------------------------------------------------
// density: million transistors per mm². fnom: nominal mobile clock (GHz). pwr: relative power.
// wafer: foundry wafer price. waferD: wafer diameter (mm). mask: mask set. fab: cost of your own fab.
const NODES = [
  { nm: 10000, year: 1971.0, density: 0.0002, fnom: 0.0007, pwr: 4.0, wafer: 60, waferD: 50, mask: 4e3, fab: 1.5e6 },
  { nm: 6000, year: 1974.5, density: 0.0004, fnom: 0.0012, pwr: 3.6, wafer: 80, waferD: 76, mask: 6e3, fab: 2.5e6 },
  { nm: 3000, year: 1979.0, density: 0.0012, fnom: 0.0035, pwr: 3.0, wafer: 120, waferD: 100, mask: 10e3, fab: 4e6 },
  { nm: 2000, year: 1981.5, density: 0.0025, fnom: 0.006, pwr: 2.7, wafer: 160, waferD: 100, mask: 14e3, fab: 6e6 },
  { nm: 1500, year: 1983.5, density: 0.004, fnom: 0.008, pwr: 2.5, wafer: 200, waferD: 125, mask: 18e3, fab: 8e6 },
  { nm: 1000, year: 1986.0, density: 0.008, fnom: 0.012, pwr: 2.2, wafer: 280, waferD: 150, mask: 22e3, fab: 10e6 },
  { nm: 800, year: 1989.0, density: 0.016, fnom: 0.018, pwr: 2.0, wafer: 350, waferD: 150, mask: 26e3, fab: 13e6 },
  { nm: 600, year: 1992.0, density: 0.03, fnom: 0.024, pwr: 1.8, wafer: 450, waferD: 150, mask: 30e3, fab: 16e6 },
  { nm: 350, year: 1995.0, density: 0.06, fnom: 0.03, pwr: 1.60, wafer: 600, waferD: 200, mask: 0.04e6, fab: 22e6 },
  { nm: 250, year: 1997.5, density: 0.14, fnom: 0.07, pwr: 1.45, wafer: 700, waferD: 200, mask: 0.06e6, fab: 30e6 },
  { nm: 180, year: 1999.5, density: 0.30, fnom: 0.13, pwr: 1.35, wafer: 850, waferD: 200, mask: 0.10e6, fab: 40e6 },
  { nm: 130, year: 2001.8, density: 0.75, fnom: 0.22, pwr: 1.28, wafer: 1000, waferD: 300, mask: 0.20e6, fab: 55e6 },
  { nm: 90, year: 2004.0, density: 1.5, fnom: 0.45, pwr: 1.20, wafer: 1100, waferD: 300, mask: 0.35e6, fab: 70e6 },
  { nm: 65, year: 2006.5, density: 3.0, fnom: 0.62, pwr: 1.10, wafer: 1500, waferD: 300, mask: 0.6e6, fab: 100e6 },
  { nm: 45, year: 2008.6, density: 5.5, fnom: 0.85, pwr: 1.05, wafer: 2000, waferD: 300, mask: 1.0e6, fab: 150e6 },
  { nm: 32, year: 2010.8, density: 9.5, fnom: 1.10, pwr: 1.00, wafer: 2500, waferD: 300, mask: 1.6e6, fab: 210e6 },
  { nm: 28, year: 2012.0, density: 14, fnom: 1.40, pwr: 0.95, wafer: 3000, waferD: 300, mask: 2.2e6, fab: 270e6 },
  { nm: 20, year: 2014.5, density: 20, fnom: 1.70, pwr: 0.93, wafer: 4000, waferD: 300, mask: 3.5e6, fab: 400e6 },
  { nm: 14, year: 2015.6, density: 29, fnom: 1.95, pwr: 0.82, wafer: 5800, waferD: 300, mask: 5e6, fab: 600e6 },
  { nm: 10, year: 2017.3, density: 52, fnom: 2.30, pwr: 0.80, wafer: 6500, waferD: 300, mask: 8e6, fab: 900e6 },
  { nm: 7, year: 2018.7, density: 91, fnom: 2.60, pwr: 0.78, wafer: 9300, waferD: 300, mask: 12e6, fab: 1.3e9 },
  { nm: 5, year: 2020.7, density: 138, fnom: 3.00, pwr: 0.76, wafer: 16000, waferD: 300, mask: 18e6, fab: 2.0e9 },
  { nm: 4, year: 2022.4, density: 150, fnom: 3.20, pwr: 0.75, wafer: 17500, waferD: 300, mask: 20e6, fab: 2.3e9 },
  { nm: 3, year: 2023.7, density: 200, fnom: 3.50, pwr: 0.73, wafer: 20000, waferD: 300, mask: 28e6, fab: 3.0e9 },
  { nm: 2, year: 2025.8, density: 260, fnom: 3.80, pwr: 0.68, wafer: 30000, waferD: 300, mask: 40e6, fab: 4.5e9 },
  { nm: 1.4, year: 2028.5, density: 330, fnom: 4.00, pwr: 0.65, wafer: 38000, waferD: 300, mask: 55e6, fab: 6.0e9 },
];
const nodeByNm = nm => NODES.find(n => n.nm === nm);
const nodeLabel = nm => (nm >= 1000 ? (nm / 1000) + 'µm' : nm + 'nm');

// ---- Chip floorplan blocks -----------------------------------------------------------
const BLOCKS = {
  pcore: { name: 'CPU core', short: 'CPU', w: 1, h: 2, color: '#e5655a', hot: true,
    desc: 'Big CPU core. Fast single-thread speed, but hot. Place SRAM cache next to it for a speed boost.' },
  ecore: { name: 'Efficiency core', short: 'E', w: 1, h: 1, color: '#efa25a', tech: 'chip_little',
    desc: 'Small, cool CPU core. ~1/3 the speed of a big core for a fraction of the power.' },
  cache: { name: 'SRAM cache', short: '$', w: 1, h: 1, color: '#5b8def',
    desc: 'Fast on-die memory. Boosts every adjacent CPU core (+10%), GPU and NPU (+4%). Runs cool – a good heat spreader.' },
  dsp:   { name: 'DSP', short: 'DSP', w: 1, h: 1, color: '#d4a64a', tech: 'chip_dsp',
    desc: 'Digital signal processor for voice codecs and audio. Digital (2G+) phones without one need an extra DSP chip.' },
  gpu:   { name: 'GPU cluster', short: 'GPU', w: 2, h: 2, color: '#43b883', hot: true, tech: 'chip_gpu',
    desc: 'Graphics shader cluster. Needs memory bandwidth (memory controllers) to stay fed.' },
  npu:   { name: 'Neural engine', short: 'NPU', w: 2, h: 1, color: '#a777ee', tech: 'chip_npu',
    desc: 'Matrix accelerator for on-device AI (TOPS).' },
  isp:   { name: 'Image signal processor', short: 'ISP', w: 1, h: 1, color: '#e46bb3', tech: 'chip_isp',
    desc: 'Processes camera sensor data. Without one, photo quality suffers badly.' },
  modem: { name: 'Baseband modem', short: 'RF', w: 2, h: 1, color: '#3fc1d1', edge: true, tech: 'chip_modem',
    desc: 'Integrated cellular baseband (best generation you have researched). Must touch the die edge. Saves a separate baseband chip.' },
  io:    { name: 'Memory controller', short: 'IO', w: 1, h: 1, color: '#97a3b8', edge: true,
    desc: 'Memory interface + I/O. Required (at least one). Must touch the die edge. Two fully feed big GPUs.' },
  media: { name: 'Media engine', short: 'VID', w: 1, h: 1, color: '#cdb73c', tech: 'chip_media',
    desc: 'Hardware audio/video codec. Boosts camera video and features.' },
};
const BLOCK_ORDER = ['pcore', 'ecore', 'cache', 'dsp', 'gpu', 'npu', 'isp', 'modem', 'io', 'media'];
// CPU architecture generations: the year each becomes standard (+12% IPC each)
const ARCH_YEARS = [1971, 1976, 1979, 1982, 1985, 1988, 1991, 1994, 1996.5, 1999, 2001, 2003, 2005, 2007, 2008.5, 2010,
                    2011.5, 2013, 2014.5, 2016, 2017.5, 2019, 2021, 2023, 2025.5, 2028];

// ---- Device categories & form factors -------------------------------------------------
const CATS = {
  phone: {
    name: 'Phone', icon: '📱', devCost: 800e3,
    labor: [[1973, 60], [1980, 50], [1985, 38], [1990, 26], [1995, 17], [2002, 13], [2010, 11], [2040, 11]],
    misc:  [[1973, 80], [1980, 70], [1985, 55], [1990, 40], [1995, 28], [2000, 22], [2006, 19], [2010, 16], [2040, 16]],
  },
  tablet: {
    name: 'Tablet', icon: '📟', devCost: 1000e3,
    labor: [[1973, 60], [2010, 17], [2040, 17]],
    misc:  [[1973, 60], [2010, 26], [2040, 26]],
  },
};
// geometry (mm): kp = keypad (w × h), fore/chin = space above/below the screen, side = side bezel,
// maxT = thickest a body gets before it grows taller instead, minT = thinnest it can be.
const FORMS = {
  car: { name: 'Car phone', icon: '🚗', tech: null, kp: 'num', handset: true, cost: 60, labor: 8,
    geo: { minW: 56, fore: 34, chin: 30, side: 6, maxT: 46, minT: 38, kpW: 46, kpH: 66 },
    appeal: [[1973, 1.0], [1983, 0.9], [1987, 0.62], [1991, 0.32], [1996, 0.12], [2002, 0.03], [2040, 0.01]],
    desc: 'A handset in the car, wired to a radio transceiver in the trunk. Runs on the car battery.' },
  bag: { name: 'Bag phone', icon: '👜', tech: 'form_bag', kp: 'num', handset: true, cost: 30, labor: 5,
    geo: { minW: 54, fore: 30, chin: 28, side: 6, maxT: 42, minT: 34, kpW: 46, kpH: 62 },
    appeal: [[1984.5, 1.0], [1988, 1.0], [1992, 0.55], [1996, 0.2], [2002, 0.03], [2040, 0.01]],
    desc: 'A transportable: handset plus a shoulder bag holding the radio and a big battery.' },
  brick: { name: 'Brick handheld', icon: '🧱', tech: 'form_brick', kp: 'num', cost: 18, labor: 6,
    geo: { minW: 44, fore: 30, chin: 26, side: 5, maxT: 50, minT: 34, maxH: 260, kpW: 40, kpH: 64 },
    appeal: [[1983.7, 1.12], [1988, 1.06], [1992, 0.72], [1996, 0.32], [2002, 0.05], [2040, 0.01]],
    desc: 'The first true handheld cellphone: a long brick with a whip antenna.' },
  candybar: { name: 'Candybar', icon: '▮', tech: 'form_candybar', kp: 'num', cost: 0, labor: 0,
    geo: { minW: 44, fore: 15, chin: 10, side: 4, maxT: 30, minT: 11, maxH: 190, kpW: 42, kpH: 47 },
    appeal: [[1991.5, 1.05], [1996, 1.06], [2000, 0.97], [2005, 0.86], [2008, 0.62], [2012, 0.35], [2040, 0.25]],
    desc: 'Classic bar phone with a number pad below the screen.' },
  flip: { name: 'Flip phone', icon: '◫', tech: 'form_flip', kp: 'num', cost: 3, labor: 2, hinge: true,
    geo: { minW: 44, fore: 12, chin: 8, side: 5.5, maxT: 15, minT: 7, maxH: 160, kpW: 42, kpH: 48 },
    appeal: [[1989.3, 1.06], [1996, 1.1], [2004, 1.12], [2006, 1.05], [2008, 0.75], [2012, 0.4], [2040, 0.25]],
    desc: 'Clamshell that folds shut. Big screen for its size; the hinge adds cost.' },
  qwerty: { name: 'QWERTY messenger', icon: '⌨', tech: 'form_qwerty', kp: 'qwerty', cost: 4, labor: 1,
    geo: { minW: 60, fore: 14, chin: 8, side: 4, maxT: 18, minT: 10, maxH: 150, kpW: 58, kpH: 34 },
    appeal: [[2002.5, 1.0], [2008, 1.05], [2011, 0.7], [2014, 0.35], [2040, 0.2]],
    desc: 'Full thumb keyboard for email and texting.' },
  slider: { name: 'Slider', icon: '⇕', tech: 'form_slider', kp: 'num', cost: 4, labor: 3, slide: true,
    geo: { minW: 46, fore: 12, chin: 10, side: 3.5, maxT: 20, minT: 12, maxH: 125, kpW: 42, kpH: 46 },
    appeal: [[2004.5, 1.05], [2007, 1.05], [2010, 0.6], [2014, 0.3], [2040, 0.2]],
    desc: 'Screen slides up to reveal the keypad. Bigger screen, thicker body.' },
  touch: { name: 'Full-touch slate', icon: '▭', tech: 'form_touch', kp: null, cost: 0, labor: 1,
    geo: { minW: 50, fore: 18, chin: 18, side: 4.5, maxT: 14, minT: 5.6, kpW: 0, kpH: 0 },
    appeal: [[1994, 0.85], [2007, 1.1], [2010, 1.2], [2040, 1.2]],
    desc: 'All screen. Needs a touchscreen – and shines with a touch-first OS.' },
  fold: { name: 'Foldable', icon: '◧', tech: 'form_fold', kp: null, cost: 60, labor: 8, hinge: true,
    geo: { minW: 60, fore: 4, chin: 4, side: 3, maxT: 8, minT: 5, kpW: 0, kpH: 0 },
    appeal: [[2019.5, 1.12], [2025, 1.18], [2040, 1.18]],
    desc: 'A tablet-sized screen that folds into a phone. Expensive hinge and panel.' },
  slate: { name: 'Tablet', icon: '▬', tech: 'form_tablet', kp: null, cost: 0, labor: 0,
    geo: { minW: 120, fore: 14, chin: 14, side: 9, maxT: 11, minT: 5.2, kpW: 0, kpH: 0 },
    appeal: [[2010, 1.15], [2040, 1.15]], desc: 'A big touch slate.' },
};
const PHONE_FORMS = ['car', 'bag', 'brick', 'candybar', 'flip', 'qwerty', 'slider', 'touch', 'fold'];
const isKeypadForm = f => !!FORMS[f].kp;
// what screen size buyers want on each kind of device (inches)
const KEYPAD_PREF = [[1973, 0.7], [1983, 0.9], [1988, 1.2], [1994, 1.4], [2000, 1.7], [2004, 2.0], [2008, 2.4], [2015, 2.8], [2040, 2.8]];
const TOUCH_PREF = [[1994, 3.0], [2007, 3.5], [2011, 4.1], [2013, 5.0], [2016, 5.5], [2018, 6.1], [2021, 6.5], [2025, 6.7], [2040, 6.8]];
const TABLET_PREF = [[2007, 9.7], [2014, 9.7], [2018, 10.5], [2022, 11.0], [2040, 11.5]];

// ---- Market ----------------------------------------------------------------------------
const SEGMENTS = ['budget', 'mid', 'premium', 'ultra'];
// k: how strongly quality drives choice, e: price sensitivity (power-law exponents)
const SEG_INFO = {
  budget:  { name: 'Budget',    k: 2.2, e: 2.6, tilt: { perf: .8, cam: .8, disp: .9, batt: 1.3, net: 1.0, design: .8, slim: .7, light: .85, feat: 1.0 }, typical: 62 },
  mid:     { name: 'Mid-range', k: 2.8, e: 2.1, tilt: { perf: 1, cam: 1, disp: 1, batt: 1, net: 1, design: 1, slim: 1, light: 1, feat: 1 }, typical: 74 },
  premium: { name: 'Premium',   k: 3.4, e: 1.6, tilt: { perf: 1.1, cam: 1.15, disp: 1.05, batt: .9, net: 1, design: 1.1, slim: 1.2, light: 1.1, feat: .95 }, typical: 86 },
  ultra:   { name: 'Ultra',     k: 4.0, e: 1.15, tilt: { perf: 1.2, cam: 1.3, disp: 1.1, batt: .8, net: 1, design: 1.2, slim: 1.3, light: 1.15, feat: .9 }, typical: 96 },
};
// what a typical buyer in each segment spends
const SEG_BUDGET = {
  phone:  [[1973, [800, 1250, 1800, 2600]], [1983, [800, 1300, 2000, 2900]], [1987, [650, 1100, 1800, 2700]], [1990, [450, 850, 1400, 2200]],
           [1993, [250, 500, 900, 1400]], [1996, [150, 320, 600, 1000]], [2000, [110, 240, 480, 850]], [2005, [80, 200, 450, 800]], [2008, [70, 210, 500, 850]],
           [2012, [100, 300, 620, 900]], [2016, [140, 360, 720, 1080]], [2020, [190, 420, 800, 1200]], [2026, [210, 450, 850, 1300]]],
  tablet: [[1973, [150, 330, 600, 950]], [2014, [170, 360, 680, 1050]], [2020, [200, 420, 800, 1200]], [2026, [220, 450, 850, 1300]]],
};
// handsets sold per month worldwide (log-interpolated)
const MARKET_SIZE = {
  phone:  [[1973, 1500], [1976, 2200], [1980, 4500], [1983, 9000], [1985, 40e3], [1987, 110e3], [1989, 260e3], [1991, 600e3], [1993, 1.6e6], [1995, 4e6],
           [1996, 6.5e6], [1998, 14e6], [2000, 34e6], [2002, 36e6], [2004, 56e6], [2006, 82e6], [2008, 100e6], [2010, 115e6], [2012, 145e6], [2014, 160e6],
           [2016, 163e6], [2018, 155e6], [2020, 135e6], [2022, 130e6], [2025, 128e6], [2040, 130e6]],
  tablet: [[1973, 1], [2009, 0.1e6], [2010, 1.5e6], [2011, 6e6], [2012, 11e6], [2013, 18e6], [2014, 19e6], [2016, 15e6], [2020, 13.5e6], [2025, 11e6], [2040, 11e6]],
};
const SEG_SPLIT = [ // budget, mid, premium, ultra
  [1973, [0.32, 0.36, 0.22, 0.10]], [1990, [0.40, 0.33, 0.20, 0.07]], [2002, [0.52, 0.30, 0.14, 0.04]], [2008, [0.56, 0.28, 0.13, 0.03]],
  [2014, [0.48, 0.30, 0.16, 0.06]], [2018, [0.44, 0.29, 0.17, 0.10]], [2022, [0.41, 0.28, 0.18, 0.13]], [2040, [0.38, 0.27, 0.19, 0.16]],
];
// what buyers care about over the decades (sums to 1)
const ERA_WEIGHTS = [
  [1973, { perf: .02, cam: 0, disp: .05, batt: .14, net: .22, design: .22, slim: .05, light: .18, feat: .12 }],
  [1985, { perf: .03, cam: 0, disp: .08, batt: .20, net: .18, design: .18, slim: .06, light: .14, feat: .13 }],
  [1995, { perf: .05, cam: .02, disp: .12, batt: .22, net: .12, design: .14, slim: .06, light: .10, feat: .17 }],
  [2001, { perf: .08, cam: .08, disp: .15, batt: .18, net: .10, design: .12, slim: .05, light: .07, feat: .17 }],
  [2008, { perf: .17, cam: .16, disp: .16, batt: .15, net: .08, design: .07, slim: .04, light: .03, feat: .14 }],
  [2015, { perf: .20, cam: .22, disp: .15, batt: .14, net: .06, design: .06, slim: .035, light: .025, feat: .11 }],
  [2025, { perf: .20, cam: .24, disp: .14, batt: .14, net: .05, design: .06, slim: .03, light: .03, feat: .11 }],
];
const SUB_LABELS = { perf: 'Performance', cam: 'Camera', disp: 'Display', batt: 'Battery', net: 'Network', design: 'Design', slim: 'Thinness', light: 'Lightness', feat: 'Features' };
const SUB_ICONS = { perf: '🧠', cam: '📷', disp: '🖥️', batt: '🔋', net: '📶', design: '🧩', slim: '📏', light: '🪶', feat: '✨' };

// ---- Display design options ---------------------------------------------------------------
// emitter / light-modulator layer. nits: brightness (emissive) or transmittance (LCD × backlight).
const DISP_EMIT = {
  none:   { name: 'No display', tech: null, matrices: [], desc: 'A dial-only handset.' },
  led:    { name: 'LED segments', tech: 'disp_led', emissive: true, matrices: ['segment'], nits: 220, contrast: 60, gamut: 0, pwr: 1.6, cost: 7, stack: 3.4, q: 0.30, life: 1,
    desc: 'Glowing red seven-segment digits. Bright, but power-hungry.' },
  lcd:    { name: 'TN liquid crystal', tech: 'disp_lcd', matrices: ['segment', 'passive', 'asi'], trans: 1.0, contrast: 18, gamut: 0.6, pwr: 0.02, cost: 3.0, stack: 1.4, q: 0.50, life: 1,
    desc: 'Twisted-nematic LCD: sips power, poor viewing angles.' },
  stn:    { name: 'STN liquid crystal', tech: 'disp_stn', matrices: ['passive'], trans: 1.05, contrast: 30, gamut: 0.55, pwr: 0.03, cost: 2.8, stack: 1.4, q: 0.62, life: 1,
    desc: 'Super-twisted nematic: much better contrast on dot-matrix screens.' },
  ips:    { name: 'IPS liquid crystal', tech: 'disp_ips', matrices: ['asi', 'ltps'], trans: 1.2, contrast: 85, gamut: 0.95, pwr: 0.03, cost: 1.3, stack: 1.2, q: 0.95, life: 1,
    desc: 'In-plane switching: wide viewing angles and accurate color.' },
  oled:   { name: 'AMOLED', tech: 'disp_oled', emissive: true, matrices: ['ltps', 'ltpo'], nits: 420, contrast: 1e5, gamut: 1.2, pwr: 0.55, cost: 1.9, stack: 0.9, q: 1.05, life: 0.8,
    desc: 'Self-emissive pixels: true blacks, thin and efficient on dark content.' },
  tandem: { name: 'Tandem OLED', tech: 'disp_tandem', emissive: true, matrices: ['ltpo'], nits: 800, contrast: 1e5, gamut: 1.25, pwr: 0.42, cost: 1.2, stack: 0.95, q: 1.12, life: 1.3,
    desc: 'Two stacked emitter layers: twice the brightness, longer life.' },
  microled: { name: 'MicroLED', tech: 'disp_microled', emissive: true, matrices: ['ltpo'], nits: 1600, contrast: 1e6, gamut: 1.3, pwr: 0.32, cost: 2.0, stack: 0.8, q: 1.2, life: 2,
    desc: 'Inorganic micro-LEDs: blinding brightness, no burn-in. Fiendishly hard to mass-produce.' },
};
const DISP_EMIT_ORDER = ['none', 'led', 'lcd', 'stn', 'ips', 'oled', 'tandem', 'microled'];
const DISP_MATRIX = {
  segment: { name: 'Fixed segments', tech: null, ppiMax: 0, cost: 0.6, contrast: 1, resp: 1, desc: 'Pre-shaped digit segments: shows numbers only.' },
  passive: { name: 'Passive matrix', tech: 'disp_passive', ppiMax: 140, cost: 1.0, contrast: 0.7, resp: 0.55, sizeMax: 2.8, desc: 'Rows and columns scanned in turn. Cheap; ghosts on motion.' },
  asi:     { name: 'a-Si TFT', tech: 'disp_asi', ppiMax: 330, cost: 1.6, contrast: 11, resp: 0.9, desc: 'A transistor per pixel (amorphous silicon). Sharp, fast, colorful.' },
  ltps:    { name: 'LTPS TFT', tech: 'disp_ltps', ppiMax: 650, cost: 2.1, contrast: 13, resp: 1.0, desc: 'Low-temperature polysilicon: tiny fast transistors for high PPI and OLED.' },
  ltpo:    { name: 'LTPO TFT', tech: 'disp_ltpo', ppiMax: 650, cost: 2.3, contrast: 13, resp: 1.0, vrr: true, desc: 'LTPS + oxide: refresh drops to 1 Hz on still images to save power.' },
};
const DISP_MATRIX_ORDER = ['segment', 'passive', 'asi', 'ltps', 'ltpo'];
const DISP_BL = {
  none: { name: 'None (reflective)', tech: null, nits: 0, pwr: 0, cost: 0, stack: 0, desc: 'Readable in daylight only.' },
  el:   { name: 'Electroluminescent', tech: 'disp_el', nits: 40, pwr: 0.10, cost: 1.4, stack: 0.4, desc: 'A glowing film behind the LCD: dim green light.' },
  led:  { name: 'LED backlight', tech: 'disp_ledbl', nits: 230, pwr: 0.22, cost: 1.2, stack: 0.7, desc: 'Edge-lit LEDs and a light guide. Brightness improves every year.' },
};
const DISP_TOUCH = {
  none:       { name: 'No touch', tech: null, q: 1.0, cost: 0, stack: 0, trans: 1 },
  resistive:  { name: 'Resistive (stylus)', tech: 'disp_resistive', q: 1.03, cost: 1.5, stack: 0.45, trans: 0.84 },
  capacitive: { name: 'Capacitive multi-touch', tech: 'disp_capacitive', q: 1.10, cost: 2.6, stack: 0.5, trans: 0.92 },
  incell:     { name: 'In-cell touch', tech: 'disp_incell', q: 1.12, cost: 1.8, stack: 0, trans: 1.0 },
};
const DISP_COVER = {
  acrylic: { name: 'Acrylic window', tech: null, drop: 0.9, scratch: 0.2, cost: 0.25, stack: 0.9, q: 0.88 },
  glass:   { name: 'Soda-lime glass', tech: 'disp_glass', drop: 0.35, scratch: 0.6, cost: 0.6, stack: 0.9, q: 1.0 },
  alusil:  { name: 'Strengthened glass', tech: 'disp_alusil', drop: 0.62, scratch: 0.7, cost: 1.5, stack: 0.7, q: 1.04 },
  alusil2: { name: 'Toughened glass gen-2', tech: 'disp_alusil2', drop: 0.76, scratch: 0.75, cost: 2.0, stack: 0.6, q: 1.06 },
  alusil3: { name: 'Toughened glass gen-3', tech: 'disp_alusil3', drop: 0.82, scratch: 0.78, cost: 2.6, stack: 0.55, q: 1.07 },
  ceramic: { name: 'Glass-ceramic', tech: 'disp_ceramic', drop: 0.9, scratch: 0.8, cost: 3.6, stack: 0.6, q: 1.08 },
  ceramic2: { name: 'Glass-ceramic gen-2', tech: 'disp_ceramic2', drop: 0.95, scratch: 0.85, cost: 4.6, stack: 0.55, q: 1.10 },
  sapphire: { name: 'Sapphire crystal', tech: 'disp_sapphire', drop: 0.5, scratch: 1.0, cost: 16, stack: 0.6, q: 1.09, desc: 'Nearly scratch-proof luxury crystal – but it shatters more easily and costs a fortune.' },
};
const DISP_COVER_ORDER = ['acrylic', 'glass', 'alusil', 'alusil2', 'alusil3', 'ceramic', 'ceramic2', 'sapphire'];
const DISP_COVER_STD = DISP_COVER_ORDER.filter(k => k !== 'sapphire');   // what suppliers fit by default
// optional display features (q: DisplayMark multiplier, cost: $ at launch)
const DISP_OPTS = {
  oleo:  { name: 'Oleophobic coating', tech: 'disp_oleo', q: 1.01, cost: 0.3, desc: 'Fingerprints wipe straight off the glass.' },
  calib: { name: 'Factory color calibration', tech: 'disp_calib', q: 1.02, cost: 0.8, desc: 'Every panel is measured and tuned to the color standard on the line.' },
  aod:   { name: 'Always-on display', tech: 'disp_aod', q: 1.02, cost: 0.6, oled: true, desc: 'The clock and notifications glow on a black screen. OLED only; costs a little standby power.' },
  hdr:   { name: 'HDR & 10-bit color', tech: 'disp_hdr', q: 1.04, cost: 3, desc: 'Brighter highlights and a billion colors – only shines above ~500 nits.' },
  coe:   { name: 'Polarizer-free OLED', tech: 'disp_coe', q: 1.02, cost: 5, oled: true, desc: 'Color filters on the encapsulation replace the polarizer: +30% light, −20% power, thinner.' },
  ar:    { name: 'Anti-reflective coating', tech: 'disp_ar', q: 1.05, cost: 6, desc: 'A nano-layer cuts reflections by 75%: readable in sunlight, deeper blacks.' },
};
const DISP_OPT_ORDER = ['oleo', 'calib', 'aod', 'hdr', 'coe', 'ar'];
// how an OLED dims (LCDs dim their backlight without flicker)
const DIMMING = {
  pwm:   { name: 'Standard PWM', tech: null, q: 0.97, cost: 0, desc: 'Dimmed OLEDs flicker at ~240 Hz – some eyes notice.' },
  dc:    { name: 'DC dimming', tech: 'disp_dc', q: 0.99, cost: 0.6, desc: 'Lowers the current instead of flickering; colors shift a little at very low brightness.' },
  hfpwm: { name: 'High-frequency PWM', tech: 'disp_pwm', q: 1.0, cost: 1.4, desc: '2,000+ Hz dimming: no visible flicker.' },
};
const TOUCH_RATE = [{ hz: 60, tech: null }, { hz: 120, tech: 'disp_t120' }, { hz: 240, tech: 'disp_t240' }, { hz: 480, tech: 'disp_t480' }];
const REFRESH = [{ hz: 60, tech: null }, { hz: 90, tech: 'disp_90' }, { hz: 120, tech: 'disp_120' }, { hz: 144, tech: 'disp_144' }];
const DISP_SHAPE = {
  bezel:  { name: 'Standard bezels', tech: null, stb: 0, q: 1.0, cost: 1.0 },
  curved: { name: 'Curved edges', tech: 'disp_curved', stb: 0.03, q: 1.04, cost: 1.15, oled: true },
  slim:   { name: 'Slim bezels (18:9+)', tech: 'disp_fullview', stb: 0.10, q: 1.06, cost: 1.08 },
  notch:  { name: 'Notch cut-out', tech: 'disp_notch', stb: 0.13, q: 1.07, cost: 1.10 },
  punch:  { name: 'Punch-hole camera', tech: 'disp_punch', stb: 0.15, q: 1.09, cost: 1.12, oled: true },
  udc:    { name: 'Under-display camera', tech: 'disp_udc', stb: 0.16, q: 1.10, cost: 1.25, oled: true },
};
const DISP_SHAPE_ORDER = ['bezel', 'curved', 'slim', 'notch', 'punch', 'udc'];
const DISP_SIZE_CAPS = [[null, 1.0], ['disp_s1', 1.5], ['disp_s2', 1.8], ['disp_s3', 2.2], ['disp_s4', 2.6], ['disp_s5', 3.5], ['disp_s6', 4.3],
                        ['disp_s7', 5.0], ['disp_s8', 5.7], ['disp_s9', 6.3], ['disp_s10', 6.9], ['disp_s11', 7.2]];
const DISP_SIZE_YEARS = [1986, 1992, 2001, 2004.5, 2007, 2010, 2012.5, 2014, 2017, 2020, 2024];
const TABLET_SIZE_CAPS = [['form_tablet', 10.1], ['disp_tab13', 13]];
const PPI_CAPS = [[null, 40], ['disp_p1', 80], ['disp_p2', 100], ['disp_p3', 130], ['disp_p4', 160], ['disp_p5', 200], ['disp_p6', 260],
                  ['disp_p7', 330], ['disp_p8', 440], ['disp_p9', 570], ['disp_p10', 650]];
const PPI_YEARS = [1988.5, 1994, 2000.5, 2003, 2006, 2008, 2010.5, 2013, 2014.5, 2027];
const ASPECTS = [{ a: 0.28, name: 'Strip' }, { a: 0.75, name: '4:3 wide' }, { a: 1.0, name: 'Square' }, { a: 1.25, name: '5:4' }, { a: 1.33, name: '4:3' },
                 { a: 1.5, name: '3:2' }, { a: 1.78, name: '16:9' }, { a: 2.0, name: '18:9' }, { a: 2.17, name: '19.5:9' }, { a: 2.22, name: '20:9' }];

// ---- Camera design options -----------------------------------------------------------------
const CAM_SENSOR = {
  cmos:    { name: 'CMOS (front-side)', tech: 'cam_cmos', qe: 0.36, dr: 0, cost: 1.0, pwr: 1.0, desc: 'Cheap, low-power sensors with wiring in front of the pixels.' },
  ccd:     { name: 'CCD', tech: 'cam_ccd', qe: 0.46, dr: 0.4, cost: 1.5, pwr: 2.6, desc: 'Cleaner images than early CMOS, but power-hungry and slow.' },
  bsi:     { name: 'BSI CMOS', tech: 'cam_bsi', qe: 0.62, dr: 0.4, cost: 1.2, pwr: 1.0, desc: 'Back-side illuminated: wiring moved behind the pixels, +70% light.' },
  stacked: { name: 'Stacked BSI', tech: 'cam_stacked', qe: 0.68, dr: 1.1, cost: 1.6, pwr: 0.9, desc: 'Pixel layer bonded on a logic die: fast readout and HDR.' },
  quad:    { name: 'Quad-Bayer stacked', tech: 'cam_quad', qe: 0.70, dr: 1.7, cost: 1.7, pwr: 0.95, bin: true, desc: 'Groups of 4 pixels merge in the dark: huge MP counts that still see at night.' },
  layer2:  { name: '2-layer transistor pixel', tech: 'cam_2layer', qe: 0.74, dr: 2.7, cost: 2.2, pwr: 1.0, bin: true, desc: 'Photodiodes and transistors on separate layers: twice the full-well capacity.' },
};
const CAM_SENSOR_ORDER = ['cmos', 'ccd', 'bsi', 'stacked', 'quad', 'layer2'];
const CAM_FORMATS = [
  { name: '1/7"', w: 2.0, h: 1.5 }, { name: '1/6"', w: 2.4, h: 1.8 }, { name: '1/5"', w: 2.88, h: 2.16 }, { name: '1/4"', w: 3.6, h: 2.7 },
  { name: '1/3.2"', w: 4.54, h: 3.42 }, { name: '1/3"', w: 4.8, h: 3.6 }, { name: '1/2.55"', w: 5.6, h: 4.2 }, { name: '1/2.3"', w: 6.17, h: 4.55 },
  { name: '1/2"', w: 6.4, h: 4.8 }, { name: '1/1.7"', w: 7.6, h: 5.7 }, { name: '1/1.5"', w: 8.8, h: 6.6 }, { name: '1/1.3"', w: 9.8, h: 7.4 },
  { name: '1"', w: 13.2, h: 8.8 },
];
const CAM_FORMAT_TECH = ['cam_cmos', 'cam_f1', 'cam_f2', 'cam_f3', 'cam_f4', 'cam_f5', 'cam_f6', 'cam_f7', 'cam_f8', 'cam_f9', 'cam_f10', 'cam_f11', 'cam_f12'];
const CAM_FORMAT_YEARS = [2000.8, 2003, 2004, 2005.5, 2009.5, 2011, 2014.5, 2016, 2019, 2019.6, 2020.5, 2021, 2022.5];
const CAM_MP = [0.11, 0.3, 1.3, 2, 3.2, 5, 8, 12, 13, 16, 20, 48, 50, 64, 108, 200];
const CAM_MP_TECH = ['cam_cmos', 'cam_mp1', 'cam_mp2', 'cam_mp3', 'cam_mp4', 'cam_mp5', 'cam_mp6', 'cam_mp7', 'cam_mp7', 'cam_mp8', 'cam_mp9', 'cam_mp10', 'cam_mp10', 'cam_mp11', 'cam_mp12', 'cam_mp13'];
const CAM_MP_YEARS = [2000.8, 2002, 2004, 2005.5, 2007, 2009.5, 2011, 2013, 2013, 2014.5, 2016.5, 2019, 2019, 2019.7, 2020.5, 2022.5];
const LENS_CAPS = [[null, 1], ['lens_2', 2], ['lens_3', 3], ['lens_4', 4], ['lens_5', 5], ['lens_6', 6], ['lens_7', 7], ['lens_8', 8]];
const LENS_YEARS = [2002, 2004, 2007, 2010.5, 2014, 2017.5, 2021.5];
const APERTURES = [4.0, 3.2, 2.8, 2.4, 2.2, 2.0, 1.8, 1.6, 1.4];
const APERTURE_TECH = [null, null, 'ap_28', 'ap_24', 'ap_22', 'ap_20', 'ap_18', 'ap_16', 'ap_14'];
const APERTURE_YEARS = [0, 0, 2004, 2008, 2011.5, 2014, 2016.5, 2019, 2022.5];
const CAM_AF = {
  fixed: { name: 'Fixed focus', tech: null, q: 0.62, cost: 0 },
  vcm:   { name: 'Autofocus (VCM)', tech: 'cam_af', q: 0.86, cost: 1.6 },
  pdaf:  { name: 'Phase-detect AF', tech: 'cam_pdaf', q: 0.95, cost: 2.0 },
  laser: { name: 'Laser AF', tech: 'cam_laser', q: 0.97, cost: 2.6 },
  dpaf:  { name: 'Dual-pixel AF', tech: 'cam_dpaf', q: 1.0, cost: 2.4 },
  apaf:  { name: 'All-pixel AF (2×2 on-chip lens)', tech: 'cam_apaf', q: 1.04, cost: 3.2 },
};
const CAM_AF_ORDER = ['fixed', 'vcm', 'pdaf', 'laser', 'dpaf', 'apaf'];
const CAM_OIS = {
  none:  { name: 'None', tech: null, stops: 0, cost: 0, z: 0 },
  lens:  { name: 'Optical (lens-shift)', tech: 'cam_ois', stops: 1.6, cost: 5, z: 0.4 },
  shift: { name: 'Sensor-shift', tech: 'cam_shift', stops: 2.3, cost: 7, z: 0.6 },
  gimbal: { name: 'Micro-gimbal', tech: 'cam_gimbal', stops: 3.0, cost: 12, z: 1.1 },
};
const CAM_OIS_ORDER = ['none', 'lens', 'shift', 'gimbal'];
// video recording modes: px = megapixels per frame (the sensor needs at least that many)
const VIDEO = [{ name: 'VGA video', px: 0.3, tech: null }, { name: '720p HD', px: 0.92, tech: 'cam_v720' }, { name: '1080p Full HD', px: 2.1, tech: 'cam_v1080' },
               { name: '4K UHD', px: 8.3, tech: 'cam_v4k' }, { name: '8K', px: 33, tech: 'cam_v8k' }];
// optional camera hardware (pts: CameraMark points, cost: $ at launch, roles: which cameras can have it)
const CAM_OPTS = {
  coat:     { name: 'Anti-flare lens coating', tech: 'cam_coat', pts: 1.5, cost: 1.2, desc: 'Atomic-layer coatings stop flare and ghosting around lights.' },
  macro:    { name: 'Close-focus macro', tech: 'cam_macro', pts: 1.5, cost: 1.0, roles: ['main', 'ultra'], af: true, desc: 'Focuses 2 cm away. Needs autofocus.' },
  tof:      { name: '3D time-of-flight sensor', tech: 'cam_tof', pts: 3, cost: 4, power: 0.02, roles: ['main'], desc: 'Maps depth with infrared pulses: better portraits and AR.' },
  varap:    { name: 'Variable aperture', tech: 'cam_varap', pts: 2, cost: 4.5, z: 0.3, roles: ['main'], desc: 'Mechanical blades switch between two f-stops: sharp in daylight, bright at night.' },
  spectral: { name: 'Multispectral color sensor', tech: 'cam_spectral', pts: 1.2, cost: 1.6, roles: ['main'], desc: 'Measures the color of the light for true-to-life white balance.' },
  cz:       { name: 'Continuous optical zoom', tech: 'cam_cz', pts: 0, zoomQ: 1.12, cost: 7, z: 0.5, roles: ['tele'], desc: 'Moving lens groups zoom smoothly between focal lengths.' },
};
const CAM_OPT_ORDER = ['coat', 'macro', 'tof', 'varap', 'spectral', 'cz'];
const CAM_ROLES = {
  main:  { name: 'Main camera', focal: [22, 35], dflt: 26, tech: 'cam_cmos', weight: 1.0 },
  ultra: { name: 'Ultra-wide', focal: [12, 18], dflt: 14, tech: 'cam_multi', weight: 0.25 },
  tele:  { name: 'Telephoto', focal: [50, 125], dflt: 70, tech: 'cam_multi', weight: 0.3 },
  front: { name: 'Front camera', focal: [22, 30], dflt: 26, tech: 'cam_front', weight: 0.15 },
};
const FLASHES = {
  none:  { name: 'No flash', tech: null, q: 0, cost: 0 },
  led:   { name: 'LED flash', tech: 'cam_flash', q: 0.05, cost: 1.2 },
  dual:  { name: 'Dual-tone LED', tech: 'cam_dualflash', q: 0.07, cost: 1.8 },
  xenon: { name: 'Xenon flash', tech: 'cam_xenon', q: 0.10, cost: 4, vol: 1.2 },
};

// ---- Battery design options -----------------------------------------------------------------
const CHEM = {
  nicd:  { name: 'NiCd', tech: null, whl: 95, whkg: 42, cost: 1.9, cycles: 1000, risk: 0.3, maxC: 1.0, nickel: true, desc: 'Rugged nickel-cadmium. Heavy and suffers memory effect.' },
  nimh:  { name: 'NiMH', tech: 'bat_nimh', whl: 230, whkg: 68, cost: 1.4, cycles: 500, risk: 0.3, maxC: 1.0, nickel: true, desc: 'Nickel-metal hydride: 2.4× the energy of NiCd.' },
  liion: { name: 'Li-ion', tech: 'bat_liion', whl: 330, whkg: 140, cost: 1.25, cycles: 500, risk: 1.0, maxC: 1.0, desc: 'Lithium cobalt oxide cells: light, no memory effect – handle with care.' },
  lipo:  { name: 'Li-polymer', tech: 'bat_lipo', whl: 420, whkg: 165, cost: 1.3, cycles: 500, risk: 1.0, maxC: 1.5, desc: 'Gel electrolyte in a flat foil pouch.' },
  hv:    { name: 'High-energy Li-Po', tech: 'bat_hv', whl: 560, whkg: 220, cost: 1.4, cycles: 600, risk: 1.3, maxC: 2.0, desc: 'Denser cathodes and anodes for modern smartphones.' },
  sic:   { name: 'Silicon-carbon', tech: 'bat_sic', whl: 750, whkg: 275, cost: 1.6, cycles: 800, risk: 1.2, maxC: 3.0, desc: 'Silicon in the anode stores far more lithium.' },
  solid: { name: 'Solid-state', tech: 'bat_solid', whl: 950, whkg: 320, cost: 2.6, cycles: 1500, risk: 0.2, maxC: 4.0, desc: 'Ceramic electrolyte: dense and non-flammable.' },
};
const CHEM_ORDER = ['nicd', 'nimh', 'liion', 'lipo', 'hv', 'sic', 'solid'];
const BAT_FORMAT = {
  cyl:     { name: 'Cylindrical cells', tech: null, minT: 10.5, pack: 0.72, cost: 0.9, risk: 0.8, desc: 'Round cells in a pack: robust, but wasted corners.' },
  prism:   { name: 'Prismatic can', tech: 'bat_prism', minT: 4.2, pack: 0.86, cost: 1.0, risk: 1.0, desc: 'A flat aluminum can.' },
  pouch:   { name: 'Pouch', tech: 'bat_lipo', minT: 2.7, pack: 0.94, cost: 1.05, risk: 1.15, lithium: true, desc: 'Foil pouch fills every millimetre – but needs room to swell.' },
  shaped:  { name: 'Shaped (L / split) cells', tech: 'bat_shaped', minT: 2.7, pack: 0.99, cost: 1.35, risk: 1.05, lithium: true, desc: 'L-shaped or split cells fill every corner around the board.' },
  stacked: { name: 'Stacked-electrode pouch', tech: 'bat_stack', minT: 2.4, pack: 0.97, cost: 1.2, risk: 1.0, lithium: true, desc: 'Stacked instead of wound electrodes: square corners, lower resistance.' },
};
const BAT_FORMAT_ORDER = ['cyl', 'prism', 'pouch', 'shaped', 'stacked'];
// optional cell & charging features (cyc/risk/maxC: multipliers, cost: $ at launch)
const BAT_OPTS = {
  bms:     { name: 'Battery-health management', tech: 'bat_bms', cyc: 1.25, risk: 0.92, cost: 0.3, desc: 'Learns your routine and holds the charge at 80% until you need it.' },
  tabs:    { name: 'Multi-tab electrodes', tech: 'bat_multitab', maxC: 1.35, cost: 0.8, desc: 'Current leaves each electrode through several tabs: lower resistance, faster charging.' },
  thermal: { name: 'Graphene thermal layer', tech: 'bat_graphene', maxC: 1.2, risk: 0.9, cost: 1.2, desc: 'Pulls heat out of the cell so it can take a faster charge.' },
  bypass:  { name: 'Bypass charging', tech: 'bat_bypass', cyc: 1.12, cost: 0.4, desc: 'Runs the phone straight from the charger while gaming – the cell stays cool.' },
};
const BAT_OPT_ORDER = ['bms', 'tabs', 'thermal', 'bypass'];
// largest cell you can make (mAh at 3.8 V); bag phones ×6, tablets ×2.2
const BAT_CAPS = [[null, 800], ['bat_c1', 1000], ['bat_c2', 1200], ['bat_c3', 1500], ['bat_c4', 1800], ['bat_c5', 2200], ['bat_c6', 2800],
                  ['bat_c7', 3400], ['bat_c8', 4000], ['bat_c9', 4600], ['bat_c10', 5200], ['bat_c11', 6000], ['bat_c12', 7500]];
const BAT_CAP_YEARS = [1985, 1993, 2003, 2007, 2010.5, 2012.5, 2014.5, 2017.5, 2019.5, 2021.5, 2023.5, 2025.5];
const CHARGE = [{ w: 3, tech: null }, { w: 5, tech: 'bat_fc5' }, { w: 10, tech: 'bat_fc10' }, { w: 18, tech: 'bat_fc18' }, { w: 30, tech: 'bat_fc30' },
                { w: 65, tech: 'bat_fc65' }, { w: 120, tech: 'bat_fc120' }, { w: 240, tech: 'bat_fc240' }];
const CHARGE_V = [{ v: 4.2, tech: null, e: 1.0, cyc: 1.0, risk: 1.0 }, { v: 4.35, tech: 'bat_v435', e: 1.06, cyc: 0.82, risk: 1.25 },
                  { v: 4.4, tech: 'bat_v44', e: 1.085, cyc: 0.72, risk: 1.4 }, { v: 4.45, tech: 'bat_v445', e: 1.11, cyc: 0.62, risk: 1.6 }];
const WIRELESS = {
  none: { name: 'None', tech: null, w: 0, cost: 0 },
  qi:   { name: 'Qi wireless (5 W)', tech: 'bat_qi', w: 5, cost: 3.5 },
  qi15: { name: 'Fast wireless (15 W)', tech: 'bat_qi15', w: 15, cost: 4.5 },
  mag:  { name: 'Magnetic wireless (25 W)', tech: 'bat_mag', w: 25, cost: 6 },
};
const DENSITY_STEPS = ['bat_d1', 'bat_d2', 'bat_d3', 'bat_d4', 'bat_d5', 'bat_d6'];   // +6% Wh/L each (lithium cells)

// ---- Memory design options --------------------------------------------------------------------
// DRAM dies (Mbit) and the year each becomes standard
const DRAM_DIES = [0.001, 0.004, 0.016, 0.064, 0.256, 1, 4, 16, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 12288, 16384, 24576, 32768];
const DRAM_YEARS = [1970, 1975, 1977.5, 1980.5, 1984, 1987, 1990, 1993, 1996, 1999, 2001.5, 2003.5, 2006, 2009, 2011.5, 2014, 2017, 2019.5, 2022.5, 2025.5];
const DRAM_GENS = {
  sram:  { name: 'Static RAM', tech: null, bw: 0.002, pwr: 1.6, cost: 1.6 },
  dram:  { name: 'Async DRAM', tech: 'mem_dram', bw: 0.01, pwr: 1.3, cost: 1.0 },
  sdram: { name: 'Mobile SDRAM', tech: 'mem_sdram', bw: 0.2, pwr: 1.0, cost: 1.0 },
  lp1:   { name: 'LPDDR', tech: 'mem_lp1', bw: 1.6, pwr: 0.8, cost: 1.05 },
  lp2:   { name: 'LPDDR2', tech: 'mem_lp2', bw: 4.2, pwr: 0.65, cost: 1.08 },
  lp3:   { name: 'LPDDR3', tech: 'mem_lp3', bw: 6.4, pwr: 0.55, cost: 1.1 },
  lp4:   { name: 'LPDDR4', tech: 'mem_lp4', bw: 12.8, pwr: 0.45, cost: 1.12 },
  lp4x:  { name: 'LPDDR4X', tech: 'mem_lp4x', bw: 17, pwr: 0.36, cost: 1.12 },
  lp5:   { name: 'LPDDR5', tech: 'mem_lp5', bw: 25.6, pwr: 0.3, cost: 1.15 },
  lp5x:  { name: 'LPDDR5X', tech: 'mem_lp5x', bw: 34, pwr: 0.26, cost: 1.18 },
  lp6:   { name: 'LPDDR6', tech: 'mem_lp6', bw: 48, pwr: 0.22, cost: 1.22 },
};
const DRAM_GEN_ORDER = ['sram', 'dram', 'sdram', 'lp1', 'lp2', 'lp3', 'lp4', 'lp4x', 'lp5', 'lp5x', 'lp6'];
// non-volatile memory dies (Mbit). Index 0 = none (no user storage).
const FLASH_DIES = [0, 0.064, 1, 4, 16, 64, 256, 1024, 4096, 16384, 32768, 65536, 131072, 262144, 524288, 1048576, 2097152];
const FLASH_YEARS = [0, 1983.5, 1989, 1993, 1996, 1999, 2001, 2003.5, 2006, 2008.5, 2010.5, 2012.5, 2015, 2017.5, 2019, 2021.5, 2025.5];
const FLASH_NAMES = ['None', 'EEPROM', 'NOR flash', 'NOR flash', 'NOR flash', 'NAND flash', 'NAND flash', 'NAND flash', 'NAND flash', 'NAND flash', 'NAND flash',
                     'NAND flash', '3D NAND 32-layer', '3D NAND 64-layer', '3D NAND 96-layer', '3D NAND 176-layer', '3D NAND 300-layer'];
const FLASH_CELL = {
  slc: { name: 'SLC (1 bit/cell)', tech: null, cost: 1.0, speed: 1.0, endur: 1.0 },
  mlc: { name: 'MLC (2 bits/cell)', tech: 'fl_mlc', cost: 0.6, speed: 0.85, endur: 0.4 },
  tlc: { name: 'TLC (3 bits/cell)', tech: 'fl_tlc', cost: 0.45, speed: 0.72, endur: 0.15 },
  qlc: { name: 'QLC (4 bits/cell)', tech: 'fl_qlc', cost: 0.37, speed: 0.55, endur: 0.06 },
};
const STORAGE_IF = {
  par:   { name: 'Parallel bus', tech: null, mbs: 2, cost: 0 },
  emmc:  { name: 'eMMC 4', tech: 'if_emmc', mbs: 40, cost: 0.6 },
  emmc5: { name: 'eMMC 5', tech: 'if_emmc5', mbs: 250, cost: 0.8 },
  ufs2:  { name: 'UFS 2', tech: 'if_ufs2', mbs: 800, cost: 1.2 },
  ufs3:  { name: 'UFS 3', tech: 'if_ufs3', mbs: 1700, cost: 1.6 },
  ufs4:  { name: 'UFS 4', tech: 'if_ufs4', mbs: 4000, cost: 2.0 },
  ufs5:  { name: 'UFS 5', tech: 'if_ufs5', mbs: 8000, cost: 2.6 },
};
const STORAGE_IF_ORDER = ['par', 'emmc', 'emmc5', 'ufs2', 'ufs3', 'ufs4', 'ufs5'];
const STACK_CAPS = [[null, 1], ['mem_stack2', 2], ['mem_stack4', 4], ['mem_stack8', 8], ['mem_stack16', 16]];
// optional memory features (vol/pwr/speed: multipliers, cost: $ at launch; flash: needs flash dies)
const MEM_OPTS = {
  pop: { name: 'Package-on-package', tech: 'mem_pop', vol: 0.65, pwr: 0.95, cost: 0.6, desc: 'RAM stacked right on top of the processor: saves board space.' },
  dpd: { name: 'Deep power-down modes', tech: 'mem_dpd', pwr: 0.85, cost: 0.15, desc: 'Idle DRAM banks switch off completely.' },
  mcp: { name: 'Combo package (uMCP)', tech: 'mem_mcp', vol: 0.8, speed: 0.9, cost: -0.4, flash: true, desc: 'RAM and flash share one package: cheap and compact, a little slower.' },
  wb:  { name: 'SLC write cache', tech: 'mem_wb', speed: 1.35, cost: 0.3, flash: true, desc: 'Part of the flash runs as fast 1-bit cells to soak up writes.' },
  hpb: { name: 'Host performance booster', tech: 'mem_hpb', speed: 1.15, cost: 0.2, flash: true, desc: 'The phone caches the flash map in RAM: faster random reads.' },
};
const MEM_OPT_ORDER = ['pop', 'dpd', 'mcp', 'wb', 'hpb'];
const fmtMB = mb => {
  if (mb <= 0) return 'none';
  if (mb >= 1048576) return +(mb / 1048576).toFixed(1) + ' TB';
  if (mb >= 1024) return +(mb / 1024).toFixed(1) + ' GB';
  if (mb >= 1) return +mb.toFixed(mb < 10 ? 1 : 0) + ' MB';
  const kb = mb * 1024;
  if (kb >= 1) return +kb.toFixed(kb < 10 ? 1 : 0) + ' KB';
  return Math.round(kb * 1024) + ' B';
};

// ---- Body, ports & features ---------------------------------------------------------------
const MATERIALS = {
  plastic: { name: 'Plastic', tech: null, q: 0.62, cost: 4, dens: 1.2, therm: 0.9, wall: 1.3, drop: 0.85, metal: false },
  mg:      { name: 'Magnesium alloy', tech: 'body_mg', q: 0.8, cost: 11, dens: 1.8, therm: 1.1, wall: 0.9, drop: 0.85, metal: true },
  alu:     { name: 'Aluminum', tech: 'body_alu', q: 0.85, cost: 13, dens: 2.7, therm: 1.15, wall: 0.75, drop: 0.8, metal: true },
  glass:   { name: 'Glass + aluminum', tech: 'body_glass', q: 0.95, cost: 20, dens: 2.4, therm: 1.05, wall: 0.7, drop: 0.55, metal: false },
  steel:   { name: 'Glass + steel', tech: 'body_steel', q: 1.0, cost: 28, dens: 2.9, therm: 1.05, wall: 0.7, drop: 0.65, metal: false },
  ceramic: { name: 'Ceramic', tech: 'body_ceramic', q: 1.03, cost: 34, dens: 2.9, therm: 0.95, wall: 0.8, drop: 0.6, metal: false },
  ti:      { name: 'Titanium + glass', tech: 'body_ti', q: 1.10, cost: 40, dens: 2.25, therm: 0.95, wall: 0.7, drop: 0.75, metal: false },
};
const MATERIAL_ORDER = ['plastic', 'mg', 'alu', 'glass', 'steel', 'ceramic', 'ti'];
const FINISHES = {
  gloss:   { name: 'Gloss', tech: null, q: 1.0, cost: 0, rough: 0.18 },
  matte:   { name: 'Soft-touch matte', tech: 'fin_matte', q: 1.03, cost: 0.8, rough: 0.75 },
  brushed: { name: 'Brushed metal', tech: 'fin_brushed', q: 1.04, cost: 1.2, rough: 0.42, metalOnly: true },
  frosted: { name: 'Frosted glass', tech: 'fin_frosted', q: 1.05, cost: 1.5, rough: 0.55, glassOnly: true },
};
const WATER = {
  none: { name: 'None', tech: null, q: 0, cost: 0 },
  ip53: { name: 'Splash (IP53)', tech: 'body_ip53', q: .03, cost: 1 },
  ip67: { name: 'IP67', tech: 'body_ip67', q: .08, cost: 3.5 },
  ip68: { name: 'IP68', tech: 'body_ip68', q: .11, cost: 5.5 },
};
// ---- Body upgrades & decorations --------------------------------------------------------------
// q: looks multiplier, drop: toughness ×, therm: heat it can shed ×, wt: g, vol: cm³ inside, t: mm added to
// the body, cost: $ per unit at launch (gets cheaper), power: W
const FRAMES = {
  none:  { name: 'Shell only', tech: null, q: 1, drop: 1, therm: 1, wt: 0, cost: 0, desc: 'The case itself carries the load.' },
  mg:    { name: 'Magnesium chassis', tech: 'frame_mg', q: 1.01, drop: 1.06, therm: 1.04, wt: -4, cost: 2.2, desc: 'A die-cast magnesium skeleton: stiffer and lighter.' },
  steel: { name: 'Steel inner frame', tech: 'frame_steel', q: 1.02, drop: 1.12, therm: 1.06, wt: 9, cost: 3.2, desc: 'A stainless band holds everything together: survives drops, adds weight.' },
  alu:   { name: 'Aerospace aluminum frame', tech: 'frame_alu', q: 1.025, drop: 1.09, therm: 1.1, wt: 2, cost: 4, desc: 'Machined 7000-series aluminum: stiff, light, sheds heat.' },
  ti:    { name: 'Titanium chassis', tech: 'frame_ti', q: 1.04, drop: 1.15, therm: 1.02, wt: 1, cost: 9, desc: 'Grade-5 titanium: the strongest, the most premium – and the priciest.' },
};
const COOLING = {
  none:     { name: 'Passive', tech: null, therm: 1, vol: 0, wt: 0, cost: 0, power: 0, q: 1, desc: 'The body is the heat sink.' },
  graphite: { name: 'Graphite sheets', tech: 'cool_graphite', therm: 1.12, vol: 0.1, wt: 1, cost: 0.6, power: 0, q: 1, desc: 'Spread the chip\'s heat over the whole back.' },
  pipe:     { name: 'Heat pipe', tech: 'cool_pipe', therm: 1.25, vol: 0.5, wt: 4, cost: 1.8, power: 0, q: 1, desc: 'A copper pipe of boiling fluid carries heat away from the chip.' },
  vapor:    { name: 'Vapor chamber', tech: 'cool_vapor', therm: 1.4, vol: 0.8, wt: 6, cost: 3.5, power: 0, q: 1, desc: 'A flat chamber spreads heat over the whole frame.' },
  fan:      { name: 'Active fan', tech: 'cool_fan', therm: 1.85, vol: 2.4, wt: 9, cost: 6, power: 0.06, q: 0.97, desc: 'A tiny blower for gaming phones: full speed all day, but it hums and takes room.' },
};
const RUGGED = {
  none:   { name: 'Standard', tech: null, drop: 1, t: 0, wt: 0, cost: 0, q: 1, desc: 'An ordinary consumer body.' },
  bumper: { name: 'Corner bumpers', tech: 'rug_bumper', drop: 1.12, t: 0.6, wt: 6, cost: 1.2, q: 0.985, pts: 1.5, desc: 'Air-cushioned corners take the hit.' },
  mil:    { name: 'MIL-spec rugged', tech: 'rug_mil', drop: 1.3, t: 2.5, wt: 35, cost: 6, q: 0.9, pts: 5, desc: 'Rubber armor and a reinforced frame: survives 2 m onto concrete. Bulky.' },
};
const TEXTURES = {
  plain:   { name: 'Plain', tech: null, q: 1, wt: 0, cost: 0, desc: 'The material as it is.' },
  carbon:  { name: 'Carbon-fiber weave', tech: 'tex_carbon', q: 1.03, wt: -2, cost: 3, desc: 'A real carbon weave: light, technical, fast-looking.' },
  leather: { name: 'Leather back', tech: 'tex_leather', q: 1.04, wt: 3, cost: 4, desc: 'Stitched leather: warm, grippy, ages beautifully.' },
  wood:    { name: 'Wood veneer', tech: 'tex_wood', q: 1.03, wt: 1, cost: 3.5, desc: 'Real wood – every phone is unique.' },
  aramid:  { name: 'Aramid fiber', tech: 'tex_aramid', q: 1.03, wt: -1, cost: 2.5, desc: 'Bullet-proof-vest fiber: thin, light, invisible to radio waves.' },
  fabric:  { name: 'Fabric weave', tech: 'tex_fabric', q: 1.02, wt: 1, cost: 2, desc: 'A soft textile back.' },
  gradient: { name: 'Color gradient', tech: 'tex_gradient', q: 1.03, wt: 0, cost: 1.2, desc: 'Your body and accent colors fade into each other.' },
  clear:   { name: 'Translucent back', tech: 'tex_clear', q: 1.03, wt: 0, cost: 1.8, desc: 'See the parts inside.' },
  shift:   { name: 'Color-shift', tech: 'tex_shift', q: 1.04, wt: 0, cost: 2.5, desc: 'Iridescent nano-layers change color with the light.' },
};
const COATINGS = {
  none:    { name: 'None', tech: null, q: 1, drop: 1, water: 0, cost: 0, desc: 'Bare material.' },
  afp:     { name: 'Anti-fingerprint', tech: 'coat_afp', q: 1.015, drop: 1, water: 0, cost: 0.4, desc: 'Smudges wipe off; the back stays clean.' },
  nano:    { name: 'Water-repellent nano-coating', tech: 'coat_nano', q: 1.01, drop: 1, water: 0.02, cost: 0.6, desc: 'A molecular film inside and out: shrugs off splashes.' },
  ceramic: { name: 'Ceramic hard-coat', tech: 'coat_ceramic', q: 1.02, drop: 1.04, water: 0, cost: 1.5, desc: 'A hard layer that resists scratches and scuffs.' },
};
const FRAME_FINISH = {
  match:   { name: 'Body color', tech: null, q: 1, cost: 0, desc: 'The sides match the body.' },
  accent:  { name: 'Accent-color sides', tech: null, q: 1.005, cost: 0.2, desc: 'The frame in your accent color.' },
  polish:  { name: 'Mirror-polished', tech: 'ffin_polish', q: 1.015, cost: 0.8, desc: 'A mirror shine on the frame.' },
  pvd:     { name: 'PVD color coat', tech: 'ffin_pvd', q: 1.02, cost: 1.5, desc: 'A vapor-deposited metallic color that lasts.' },
  diamond: { name: 'Diamond-cut edges', tech: 'ffin_diamond', q: 1.025, cost: 1.8, desc: 'Sparkling chamfers cut with a diamond tool.' },
};
const LOGO_STYLES = {
  print:  { name: 'Printed', tech: null, q: 1, cost: 0, power: 0, desc: 'Ink on the back.' },
  emboss: { name: 'Embossed', tech: 'logo_emboss', q: 1.01, cost: 0.4, power: 0, desc: 'Pressed into the material.' },
  badge:  { name: 'Metal badge', tech: 'logo_badge', q: 1.015, cost: 0.9, power: 0, desc: 'A polished metal inlay.' },
  glow:   { name: 'Glowing logo', tech: 'logo_glow', q: 1.02, cost: 1.5, power: 0.01, desc: 'Lights up for calls and notifications.' },
};
const BODY_UPGRADES = { frame: FRAMES, cooling: COOLING, rugged: RUGGED, texture: TEXTURES, coating: COATINGS, framefin: FRAME_FINISH, logostyle: LOGO_STYLES };
const BODY_COLORS =['#1f2430', '#e8e8ea', '#b9a07a', '#7f98c4', '#c25d5d', '#4f8a64', '#d8a7c4', '#2f4b7c', '#e2c35a', '#9aa0a8', '#3a2f2a', '#f08a3c'];
// charging/data connectors: w × h opening on the edge (mm), the body thickness they need
const PORTS = {
  cord:     { name: 'Handset cord', tech: null, w: 9, h: 9, minT: 0, pts: 0, cost: 2, only: ['car', 'bag'] },
  barrel:   { name: 'DC barrel jack', tech: null, w: 7, h: 7, minT: 10, pts: 0, cost: 0.6 },
  edge:     { name: 'Edge connector', tech: 'port_edge', w: 16, h: 4, minT: 8, pts: 1, cost: 1.2 },
  miniusb:  { name: 'Mini-USB', tech: 'port_miniusb', w: 7, h: 3.2, minT: 6, pts: 3, cost: 0.8 },
  microusb: { name: 'Micro-USB', tech: 'port_microusb', w: 7, h: 2.5, minT: 4.5, pts: 4, cost: 0.6 },
  slim:     { name: 'Slim proprietary', tech: 'port_slim', w: 7.5, h: 1.6, minT: 3.6, pts: 5, cost: 1.6, excl: true },
  usbc:     { name: 'USB-C', tech: 'port_usbc', w: 8.4, h: 2.6, minT: 4.2, pts: 6, cost: 0.9 },
  none:     { name: 'Portless (wireless only)', tech: 'port_less', w: 0, h: 0, minT: 0, pts: 7, cost: 0, needsWireless: true },
};
const PORT_ORDER = ['cord', 'barrel', 'edge', 'miniusb', 'microusb', 'slim', 'usbc', 'none'];
const JACKS = {
  none: { name: 'None', tech: null, d: 0, minT: 0, pts: 0, cost: 0 },
  j25:  { name: '2.5 mm headset jack', tech: 'jack_25', d: 2.5, minT: 4.5, pts: 2, cost: 0.4 },
  j35:  { name: '3.5 mm headphone jack', tech: 'jack_35', d: 3.5, minT: 5.6, pts: 3, cost: 0.5 },
};
const SIMS = {
  none:  { name: 'No SIM (number in the phone)', tech: null, w: 0, h: 0, vol: 0, pts: 0, cost: 0 },
  full:  { name: 'Full-size SIM card', tech: 'sim_full', w: 54, h: 3, vol: 7, pts: 1, cost: 1.5 },
  mini:  { name: 'Mini-SIM', tech: 'sim_mini', w: 15, h: 2.5, vol: 1.2, pts: 1.5, cost: 0.8 },
  micro: { name: 'Micro-SIM', tech: 'sim_micro', w: 12, h: 1.8, vol: 0.6, pts: 1.6, cost: 0.6 },
  nano:  { name: 'Nano-SIM', tech: 'sim_nano', w: 9, h: 1.4, vol: 0.35, pts: 1.7, cost: 0.6 },
  esim:  { name: 'eSIM', tech: 'esim', w: 0, h: 0, vol: 0, pts: 2.2, cost: 0.4 },
};
const SIM_ORDER = ['none', 'full', 'mini', 'micro', 'nano', 'esim'];
const FINGERPRINT = {
  none: { name: 'None', pts: 0, cost: 0, tech: null },
  rear: { name: 'Fingerprint (rear/home)', pts: 6, cost: 6, tech: 'feat_fp', face: 'back' },
  side: { name: 'Fingerprint (power key)', pts: 7, cost: 5, tech: 'feat_fpside', face: 'right' },
  ud:   { name: 'Under-display (optical)', pts: 9, cost: 12, tech: 'feat_fpud' },
  us:   { name: 'Under-display (ultrasonic)', pts: 10, cost: 16, tech: 'feat_fpus' },
};
// touch phones: a home button and/or navigation keys below the screen. chin: mm of bezel they need,
// disp: how much of the screen stays usable (an on-screen bar eats some)
const NAV_HOME = {
  none:       { name: 'No home button', tech: null, chin: 0, cost: 0, pts: 0 },
  physical:   { name: 'Physical home button', tech: 'nav_home', chin: 14, cost: 0.8, pts: 1.5 },
  capacitive: { name: 'Solid-state home button', tech: 'nav_caphome', chin: 13, cost: 2, pts: 2 },
};
const NAV_KEYS = {
  none:       { name: 'None (home button only)', tech: null, chin: 0, cost: 0, pts: 0, disp: 1, design: 1 },
  physical:   { name: 'Physical keys', tech: 'nav_physkeys', chin: 9, cost: 0.8, pts: 1, disp: 1, design: 0.99 },
  capacitive: { name: 'Capacitive keys', tech: 'nav_capkeys', chin: 7.5, cost: 0.4, pts: 1.2, disp: 1, design: 1 },
  onscreen:   { name: 'On-screen navigation bar', tech: 'nav_onscreen', chin: 0, cost: 0, pts: 1, disp: 0.96, design: 1 },
  gesture:    { name: 'Gesture navigation', tech: 'nav_gesture', chin: 0, cost: 0, pts: 1.5, disp: 1, design: 1.005 },
};
// on/off extras: [key, tech, label, points, cost($), vol(cm³)]
const EXTRAS = [
  ['phonebook', 'feat_phonebook', 'Phonebook memory', 3, 1, 0],
  ['sms', 'feat_sms', 'Text messaging (SMS)', 5, 0.5, 0],
  ['vibra', 'feat_vibra', 'Vibrating alert', 2, 1.2, 0.3],
  ['games', 'feat_games', 'Built-in games', 3, 0.2, 0],
  ['ir', 'feat_ir', 'Infrared port', 2, 1.5, 0.2],
  ['wap', 'feat_wap', 'Mobile web (WAP)', 3, 0.5, 0],
  ['poly', 'feat_poly', 'Polyphonic ringtones', 3, 1.5, 0],
  ['bt', 'feat_bt', 'Bluetooth', 4, 5, 0.2],
  ['fm', 'feat_fm', 'FM radio', 2, 1.2, 0.1],
  ['mp3', 'feat_mp3', 'Music player', 4, 1.5, 0],
  ['wifi', 'feat_wifi', 'Wi-Fi', 5, 6, 0.2],
  ['gps', 'feat_gps', 'GPS', 4, 7, 0.2],
  ['accel', 'feat_accel', 'Motion sensors', 3, 1.5, 0],
  ['nfc', 'feat_nfc', 'NFC payments', 4, 3, 0.1],
  ['stylus', 'feat_stylus', 'Stylus', 3, 4, 1.0],
  ['stereo', 'feat_stereo', 'Stereo speakers', 4, 3, 0.6],
  ['haptic', 'feat_haptic', 'Linear haptics', 3, 2.5, 0.4],
  ['face3d', 'feat_face3d', '3D face unlock', 8, 25, 0.4],
  ['uwb', 'feat_uwb', 'Ultra-wideband', 2, 3, 0.1],
  ['sat', 'feat_sat', 'Satellite SOS', 5, 6, 0.2],
];
// ---- Add-ons: optional hardware, each researched -----------------------------------------------
// cost: $ per unit when it launches (it gets ~8%/year cheaper), vol: cm³, wt: g, pts: feature points,
// design: style multiplier, power: average W, el: has a part you place in the Layout editor (LAYOUT_TYPES),
// forms: 'handheld' (not car/bag), 'touch', 'keypad' or 'notflip'; needs: what else the phone must have
const ADDONS = {
  kblight:     { name: 'Backlit keypad', tech: 'add_kblight', cost: 0.4, vol: 0.05, wt: 0.5, pts: 1, power: 0.004, forms: 'keypad', desc: 'Keys you can find in the dark.' },
  lanyard:     { name: 'Lanyard loop', tech: 'add_lanyard', cost: 0.1, vol: 0.05, wt: 0.5, pts: 0.3, el: true, forms: 'handheld', desc: 'A loop for a wrist strap or a charm.' },
  led:         { name: 'Notification LED', tech: 'add_led', cost: 0.3, vol: 0.02, wt: 0.1, pts: 1, power: 0.001, el: true, forms: 'handheld', desc: 'Blinks when you missed a call or a message.' },
  wheel:       { name: 'Jog dial / scroll wheel', tech: 'add_wheel', cost: 1.5, vol: 0.6, wt: 2, pts: 2, el: true, forms: 'handheld', desc: 'Scroll through menus and lists with your thumb.' },
  torch:       { name: 'Flashlight LED', tech: 'add_torch', cost: 0.25, vol: 0.1, wt: 0.3, pts: 1, el: true, forms: 'handheld', desc: 'A bright LED for finding your keys in the dark.' },
  ptt:         { name: 'Push-to-talk key', tech: 'add_ptt', cost: 0.6, vol: 0.1, wt: 0.5, pts: 1.5, el: true, forms: 'handheld', desc: 'Walkie-talkie calls at the press of a key.' },
  camkey:      { name: 'Camera shutter key', tech: 'add_camkey', cost: 0.5, vol: 0.1, wt: 0.5, pts: 1.5, el: true, forms: 'handheld', needs: 'cam', desc: 'A two-stage shutter key, like a real camera.' },
  tvant:       { name: 'Mobile TV tuner', tech: 'add_tvant', cost: 6, vol: 0.8, wt: 4, pts: 2, power: 0.03, el: true, forms: 'handheld', needs: 'color', desc: 'Watch broadcast TV on a pull-out telescopic antenna.' },
  sos:         { name: 'Emergency SOS key', tech: 'add_sos', cost: 0.3, vol: 0.1, wt: 0.5, pts: 1, design: 0.995, el: true, forms: 'handheld', desc: 'One press calls for help – popular with older buyers.' },
  trackball:   { name: 'Trackball', tech: 'add_trackball', cost: 2, vol: 0.5, wt: 2, pts: 2, el: true, forms: 'handheld', desc: 'A tiny ball for moving through menus, web pages and email.' },
  prox:        { name: 'Proximity & light sensors', tech: 'add_prox', cost: 0.8, vol: 0.05, wt: 0.2, pts: 1.5, power: 0.001, el: true, forms: 'touch', desc: 'Turns the screen off at your ear and adapts its brightness.' },
  mute:        { name: 'Ring/silent switch', tech: 'add_mute', cost: 0.4, vol: 0.1, wt: 0.4, pts: 1, el: true, forms: 'handheld', desc: 'Silence the phone by feel, without looking.' },
  dualsim:     { name: 'Dual-SIM tray', tech: 'add_dualsim', cost: 1.2, vol: 0.4, wt: 1, pts: 2, el: true, forms: 'handheld', needs: 'sim', desc: 'Two numbers in one phone – huge in China, India and Africa.' },
  solar:       { name: 'Solar panel back', tech: 'add_solar', cost: 6, vol: 1, wt: 8, pts: 1, design: 0.97, el: true, forms: 'handheld', desc: 'Tops the battery up in daylight: +4% battery life.' },
  trackpad:    { name: 'Optical trackpad', tech: 'add_trackpad', cost: 2.5, vol: 0.4, wt: 1.5, pts: 2.5, el: true, forms: 'handheld', desc: 'A touch-sensitive nub for precise scrolling. Replaces the trackball.' },
  action:      { name: 'Programmable key', tech: 'add_action', cost: 0.8, vol: 0.1, wt: 0.5, pts: 1.5, el: true, forms: 'handheld', desc: 'One key for any shortcut you like.' },
  kickstand:   { name: 'Kickstand', tech: 'add_kickstand', cost: 1, vol: 0.6, wt: 5, pts: 1, design: 0.995, el: true, forms: 'handheld', needs: 'color', desc: 'Stands the phone up for video calls and films.' },
  hdmi:        { name: 'Video-out port', tech: 'add_hdmi', cost: 1.5, vol: 0.3, wt: 1, pts: 1.5, el: true, forms: 'handheld', needs: 'color', desc: 'A micro-HDMI port: plug the phone into a TV.' },
  baro:        { name: 'Barometer', tech: 'add_baro', cost: 0.8, vol: 0.02, wt: 0.1, pts: 1, forms: 'handheld', desc: 'Faster GPS fixes and floor-level location.' },
  projector:   { name: 'Pico projector', tech: 'add_projector', cost: 30, vol: 3, wt: 15, pts: 3, power: 0.04, design: 0.985, el: true, forms: 'handheld', needs: 'color', desc: 'Beams your photos and videos onto any wall.' },
  irblast:     { name: 'IR blaster', tech: 'add_irblast', cost: 0.5, vol: 0.05, wt: 0.2, pts: 1.5, el: true, forms: 'handheld', desc: 'A universal remote for TVs and air conditioners.' },
  frontspk:    { name: 'Front-firing speakers', tech: 'add_frontspk', cost: 2, vol: 0.8, wt: 3, pts: 2, design: 1.01, el: true, forms: 'touch', desc: 'A second grille below the screen: stereo that points at you.' },
  eink:        { name: 'E-ink back display', tech: 'add_eink', cost: 18, vol: 1.2, wt: 18, pts: 2.5, power: 0.002, design: 1.01, el: true, forms: 'touch', desc: 'An always-on, paper-like second screen on the back.' },
  hrm:         { name: 'Heart-rate sensor', tech: 'add_hrm', cost: 3, vol: 0.1, wt: 0.5, pts: 1.5, power: 0.002, el: true, forms: 'handheld', desc: 'Measures your pulse through a fingertip.' },
  uvsens:      { name: 'UV-index sensor', tech: 'add_uvsens', cost: 0.8, vol: 0.02, wt: 0.1, pts: 0.8, el: true, forms: 'handheld', desc: 'Warns you when the sun is strong.' },
  alertslider: { name: 'Three-stage alert slider', tech: 'add_alertslider', cost: 0.8, vol: 0.15, wt: 0.6, pts: 1.5, el: true, forms: 'handheld', desc: 'Ring, vibrate or silent with one flick. Replaces the mute switch.' },
  backscreen:  { name: 'Rear selfie display', tech: 'add_backscreen', cost: 14, vol: 1, wt: 10, pts: 3, power: 0.02, el: true, forms: 'notflip', needs: 'color', desc: 'A second screen on the back: selfies with the main camera.' },
  triggers:    { name: 'Gaming shoulder triggers', tech: 'add_triggers', cost: 3, vol: 0.2, wt: 1, pts: 2, el: true, forms: 'touch', desc: 'Pressure-sensitive buttons for games in landscape.' },
  privacy:     { name: 'Privacy kill switch', tech: 'add_privacy', cost: 0.6, vol: 0.08, wt: 0.3, pts: 1.5, el: true, forms: 'handheld', needs: 'anycam', desc: 'A hardware switch that cuts power to cameras and microphones.' },
  thermo:      { name: 'IR thermometer', tech: 'add_thermo', cost: 4, vol: 0.1, wt: 0.4, pts: 1, el: true, forms: 'handheld', desc: 'Point at anything to read its temperature.' },
  glyph:       { name: 'Light-strip back', tech: 'add_glyph', cost: 3, vol: 0.3, wt: 2, pts: 1.5, power: 0.01, design: 1.025, el: true, forms: 'touch', desc: 'Light strips on the back that pulse with calls and notifications.' },
};
// add-ons that make another one redundant (you fit one or the other)
const ADDON_REPLACES = { trackpad: 'trackball', alertslider: 'mute' };
const OS = {
  none:     { name: 'Hard-wired logic', pts: 0, fee: 0, tech: null },
  firmware: { name: 'Basic firmware', pts: 3, fee: 0, tech: 'os_firmware' },
  feature:  { name: 'Feature phone OS', pts: 8, fee: 1.5, tech: 'os_feature' },
  smart:    { name: 'Smartphone OS', pts: 14, fee: 6, tech: 'os_smart' },
  touch:    { name: 'Touch-first OS', pts: 22, fee: 4, tech: 'os_touch', needsTouch: true },
  modern:   { name: 'Modern mobile OS', pts: 28, fee: 3, tech: 'os_modern', needsTouch: true },
  ai:       { name: 'AI-native OS', pts: 33, fee: 4, tech: 'os_ai', needsTouch: true },
};
const OS_ORDER = ['none', 'firmware', 'feature', 'smart', 'touch', 'modern', 'ai'];

// ---- Layout elements (things you can move around the body) -------------------------------------
// faces: where it may go. w/h: size on the face (mm). ideal: where ergonomics wants it.
const LAYOUT_TYPES = {
  earpiece: { name: 'Earpiece', faces: ['front'], w: 10, h: 2.4, ideal: { front: [0.5, 0.95] }, desc: 'Must sit at the top of the front, far from the microphone.' },
  mic:      { name: 'Microphone', faces: ['bottom', 'front'], w: 1.6, h: 1.6, ideal: { bottom: [0.35, 0.5], front: [0.5, 0.04] }, desc: 'At the bottom, near the mouth.' },
  speaker:  { name: 'Loudspeaker', faces: ['bottom', 'back', 'front', 'top', 'left', 'right'], w: 9, h: 2.6, ideal: { bottom: [0.7, 0.5], back: [0.5, 0.12] }, desc: 'Bottom edge or back. Covered by a palm it sounds muffled.' },
  speaker2: { name: 'Second speaker', faces: ['top', 'front', 'bottom'], w: 9, h: 2.6, ideal: { top: [0.5, 0.5], front: [0.5, 0.95] }, desc: 'Stereo needs one at each end.' },
  power:    { name: 'Power key', faces: ['right', 'left', 'top'], w: 11, h: 3, button: true, ideal: { right: [0.62, 0.5], top: [0.75, 0.5] }, desc: 'Where the thumb rests: ~60% up the right edge.' },
  volume:   { name: 'Volume keys', faces: ['left', 'right'], w: 22, h: 3, button: true, ideal: { left: [0.68, 0.5], right: [0.5, 0.5] }, desc: 'Upper half of the left edge.' },
  port:     { name: 'Charging port', faces: ['bottom', 'top', 'left', 'right', 'back'], w: 8, h: 3, port: true, ideal: { bottom: [0.5, 0.5] }, desc: 'Bottom center: the cable stays out of the hand.' },
  jack:     { name: 'Headphone jack', faces: ['top', 'bottom', 'left', 'right'], w: 4, h: 4, port: true, ideal: { top: [0.25, 0.5], bottom: [0.25, 0.5] }, desc: 'Top or bottom edge.' },
  sim:      { name: 'SIM tray', faces: ['left', 'right', 'top', 'back'], w: 14, h: 2.5, ideal: { left: [0.4, 0.5], right: [0.35, 0.5], back: [0.5, 0.5] }, desc: 'Anywhere out of the grip.' },
  sd:       { name: 'Memory card slot', faces: ['left', 'right', 'top', 'back'], w: 12, h: 2, ideal: { left: [0.25, 0.5], right: [0.25, 0.5] }, desc: 'Side edge or under the back cover.' },
  cam:      { name: 'Rear cameras', faces: ['back'], w: 10, h: 10, ideal: { back: [0.25, 0.86] }, desc: 'Top corner of the back – where fingers will not cover it.' },
  flash:    { name: 'Flash', faces: ['back'], w: 4, h: 4, ideal: { back: [0.45, 0.88] }, desc: 'Right next to the camera.' },
  fcam:     { name: 'Front camera', faces: ['front'], w: 4, h: 4, ideal: { front: [0.5, 0.94] }, desc: 'Above the screen, near eye level.' },
  fp:       { name: 'Fingerprint sensor', faces: ['back', 'front'], w: 10, h: 10, ideal: { back: [0.5, 0.66], front: [0.5, 0.07] }, desc: 'Where the index finger lands: upper-middle of the back.' },
  antenna:  { name: 'External antenna', faces: ['top'], w: 8, h: 8, ideal: { top: [0.8, 0.5] }, desc: 'Top corner, away from the head and hand.' },
  logo:     { name: 'Logo', faces: ['back', 'front'], w: 24, h: 7, cosmetic: true, ideal: { back: [0.5, 0.42], front: [0.5, 0.97] }, desc: 'Purely cosmetic.' },
  led:      { name: 'Notification LED', faces: ['front', 'top'], w: 2, h: 2, ideal: { front: [0.8, 0.95] }, desc: 'Visible from the front.' },
  ir:       { name: 'Infrared port', faces: ['top'], w: 7, h: 4, ideal: { top: [0.4, 0.5] }, desc: 'Points away from you, at the other device.' },
  camkey:   { name: 'Camera shutter key', faces: ['right'], w: 6, h: 3, button: true, ideal: { right: [0.18, 0.5] }, desc: 'Lower right edge, like a real camera.' },
  action:   { name: 'Action key', faces: ['left', 'right'], w: 6, h: 3, button: true, ideal: { left: [0.85, 0.5] }, desc: 'Upper left edge.' },
  lanyard:  { name: 'Lanyard loop', faces: ['bottom', 'top'], w: 4, h: 3, ideal: { bottom: [0.88, 0.5] }, desc: 'A corner, where it will not dangle into the way.' },
  stylus:   { name: 'Stylus silo', faces: ['bottom', 'top'], w: 6, h: 5, ideal: { bottom: [0.85, 0.5] }, desc: 'A bottom corner.' },
  // add-ons (see ADDONS); the big back panels scale with the body in layoutSize()
  wheel:       { name: 'Scroll wheel', faces: ['right', 'left', 'top', 'front'], w: 9, h: 4, button: true, ideal: { right: [0.7, 0.5], left: [0.7, 0.5] }, desc: 'Under the thumb on the right edge.' },
  torch:       { name: 'Flashlight LED', faces: ['top', 'back'], w: 4, h: 4, ideal: { top: [0.5, 0.5] }, desc: 'Top edge: point the phone like a torch.' },
  ptt:         { name: 'Push-to-talk key', faces: ['left', 'right'], w: 9, h: 3, button: true, ideal: { left: [0.55, 0.5] }, desc: 'A big key on the left edge, under the index finger.' },
  tvant:       { name: 'TV antenna', faces: ['top'], w: 5, h: 5, ideal: { top: [0.15, 0.5] }, desc: 'Top corner: it pulls out upwards.' },
  sos:         { name: 'SOS key', faces: ['back', 'top', 'left', 'right'], w: 7, h: 7, button: true, ideal: { back: [0.5, 0.75] }, desc: 'Big and easy to find: on the back or the top.' },
  trackball:   { name: 'Trackball', faces: ['front'], w: 6, h: 6, ideal: {}, desc: 'Between the screen and the keys, or in the chin of a touch phone.' },
  trackpad:    { name: 'Optical trackpad', faces: ['front'], w: 7, h: 7, ideal: {}, desc: 'Between the screen and the keys, or in the chin of a touch phone.' },
  prox:        { name: 'Proximity sensor', faces: ['front'], w: 4, h: 1.6, ideal: { front: [0.8, 0.955] }, desc: 'Next to the earpiece, where your ear is.' },
  mute:        { name: 'Ring/silent switch', faces: ['left', 'right', 'top'], w: 6, h: 2.6, button: true, ideal: { left: [0.82, 0.5], right: [0.82, 0.5] }, desc: 'Top of an edge, where a finger finds it blindly.' },
  dualsim:     { name: 'Second SIM tray', faces: ['left', 'right', 'top', 'back'], w: 14, h: 2.5, ideal: { left: [0.35, 0.5], right: [0.2, 0.5] }, desc: 'Out of the grip, near the first one.' },
  solar:       { name: 'Solar panel', faces: ['back'], w: 40, h: 40, ideal: { back: [0.5, 0.3] }, desc: 'The lower back, away from the camera and the fingers.' },
  kickstand:   { name: 'Kickstand', faces: ['back'], w: 30, h: 4, ideal: { back: [0.5, 0.25] }, desc: 'Across the lower back.' },
  hdmi:        { name: 'Video-out port', faces: ['bottom', 'top', 'left', 'right'], w: 6.5, h: 2.5, port: true, ideal: { top: [0.3, 0.5], bottom: [0.25, 0.5] }, desc: 'Top or bottom edge, out of the hand.' },
  projector:   { name: 'Projector lens', faces: ['top', 'back'], w: 9, h: 6, ideal: { top: [0.5, 0.5] }, desc: 'Top edge, aimed at a wall. Needs a body at least 6 mm thick.' },
  irblast:     { name: 'IR blaster', faces: ['top'], w: 3.5, h: 2.5, ideal: { top: [0.7, 0.5] }, desc: 'On the top edge, pointing at the TV.' },
  frontspk:    { name: 'Front speaker grille', faces: ['front'], w: 12, h: 2.5, ideal: { front: [0.5, 0.03] }, desc: 'Below the screen, facing you.' },
  eink:        { name: 'E-ink display', faces: ['back'], w: 50, h: 80, ideal: { back: [0.5, 0.42] }, desc: 'Most of the back, below the cameras.' },
  hrm:         { name: 'Heart-rate sensor', faces: ['back'], w: 6, h: 6, ideal: { back: [0.5, 0.72] }, desc: 'Next to the camera, where a fingertip rests.' },
  uvsens:      { name: 'UV sensor', faces: ['back', 'front'], w: 3, h: 3, ideal: { back: [0.62, 0.78] }, desc: 'Anywhere that sees the sky.' },
  alertslider: { name: 'Alert slider', faces: ['left', 'right'], w: 8, h: 2.6, button: true, ideal: { right: [0.8, 0.5], left: [0.82, 0.5] }, desc: 'Top of an edge, above the volume or power key.' },
  backscreen:  { name: 'Rear display', faces: ['back'], w: 36, h: 22, ideal: { back: [0.5, 0.55] }, desc: 'Below the rear cameras.' },
  triggers:    { name: 'Shoulder triggers', faces: ['right', 'left'], w: 40, h: 2, ideal: { right: [0.5, 0.5] }, desc: 'Along the right edge – the top when you hold it sideways.' },
  privacy:     { name: 'Privacy switch', faces: ['left', 'right', 'top'], w: 5, h: 2.4, button: true, ideal: { left: [0.35, 0.5], right: [0.35, 0.5] }, desc: 'Anywhere on an edge, out of the grip.' },
  thermo:      { name: 'IR thermometer', faces: ['back', 'top'], w: 4, h: 4, ideal: { back: [0.62, 0.86] }, desc: 'Beside the rear camera, pointing away from you.' },
  glyph:       { name: 'Light strips', faces: ['back'], w: 40, h: 60, cosmetic: true, ideal: { back: [0.5, 0.5] }, desc: 'Around the back. Purely decorative, so other parts may sit inside it.' },
};
const LAYOUT_FACES = ['front', 'back', 'top', 'bottom', 'left', 'right'];

// ---- Research tree ----------------------------------------------------------------------------
// market: when it becomes industry standard (suppliers sell it, rivals use it). Everything must be
// researched before you can use it. Research before `market` is pricier and the result is exclusive
// (only your own plants can make it). lead: how many years before `market` you can start.
const TECHS = [];
const TECH = {};
function T(id, cat, name, market, k, days, desc, req, extra) {
  const t = Object.assign({ id, cat, name, market, k, days, desc, req: req || [], reqAny: null, lead: 2.5 }, extra || {});
  TECHS.push(t); TECH[id] = t;
}
const ladder = (caps, years, cat, label, k, days, desc, firstReq) => caps.forEach(([id, v], i) => {
  if (!id || i === 0) return;
  T(id, cat, label(v), years[i - 1], k, days, desc(v), i > 1 ? [caps[i - 1][0]] : (firstReq || []));
});

// network
T('net_imts', 'network', 'IMTS radio-telephone', 1964, 1, 60, 'Direct-dial mobile telephone over a few powerful city-wide transmitters.');
T('net_nmt', 'network', 'NMT / TACS analog cellular', 1981.75, 2.2, 120, 'Cellular networks: many small cells and automatic hand-offs. Used in Europe, Japan and China.', ['int_lsi'], { lead: 4 });
T('net_amps', 'network', 'AMPS analog cellular', 1983.8, 2.2, 120, 'The North American cellular standard (also Korea, Latin America, Oceania).', ['int_lsi'], { lead: 4 });
T('rf_stub', 'network', 'Helical stub antennas', 1990, 0.6, 40, 'A coiled antenna in a short nub instead of a long whip.');
T('rf_pa_gaas', 'network', 'GaAs power amplifiers', 1992, 1, 60, 'Gallium-arsenide transistors: −28% radio power.');
T('net_gsm', 'network', 'GSM', 1991.5, 2.5, 140, 'The digital standard that conquers the world: Europe, China and most countries.', ['chip_dsp'], { lead: 3.5 });
T('net_tdma', 'network', 'D-AMPS / PDC (TDMA)', 1992.7, 2, 120, 'Digital TDMA used by Bell-system carriers and Japan\'s incumbent.', ['chip_dsp'], { reqAny: ['net_amps', 'net_nmt'] });
T('net_cdma', 'network', 'cdmaOne (IS-95)', 1995.9, 2.6, 140, 'Spread-spectrum digital radio: US independents, Korea, later Japan and China.', ['chip_dsp'], { lead: 3 });
T('rf_bands2', 'network', 'Dual-band radios', 1997.5, 0.7, 45, 'Two RF bands: works on more networks.');
T('rf_internal', 'network', 'Internal antennas', 1998.5, 0.9, 60, 'Hide the antenna inside the body.', ['rf_stub']);
T('rf_bands3', 'network', 'Tri-band radios', 2000, 0.7, 45, 'A world phone: three bands.', ['rf_bands2']);
T('net_gprs', 'network', 'GPRS / EDGE packet data', 2000.5, 1.6, 90, 'Always-on mobile data for GSM networks.', ['net_gsm']);
T('net_1x', 'network', 'CDMA2000 1x', 2000.8, 1.6, 90, 'Faster data and capacity for CDMA networks.', ['net_cdma']);
T('net_umts', 'network', 'UMTS / W-CDMA (3G)', 2001.75, 2.6, 140, '3G for GSM networks: video calls and mobile internet.', ['net_gprs'], { lead: 3 });
T('net_evdo', 'network', 'CDMA2000 EV-DO (3G)', 2002.1, 2.2, 120, '3G broadband for CDMA networks.', ['net_1x']);
T('rf_bands4', 'network', 'Quad-band radios', 2003, 0.7, 45, 'Four bands: works on every GSM network.', ['rf_bands3']);
T('net_hspa', 'network', 'HSPA mobile broadband', 2006, 1.8, 100, '3.5G: megabits on UMTS networks.', ['net_umts']);
T('net_wimax', 'network', 'Mobile WiMAX', 2006.5, 2, 110, 'An early 4G contender backed by a few carriers. Will it last?', ['rf_mimo2'], { reqAny: ['net_hspa', 'net_evdo'] });
T('rf_bands6', 'network', '6-band radios', 2008, 0.8, 50, 'Covers 3G bands worldwide.', ['rf_bands4']);
T('rf_mimo2', 'network', '2×2 MIMO', 2008.5, 1.2, 70, 'Two antennas send two data streams at once.', ['rf_internal']);
T('net_tdscdma', 'network', 'TD-SCDMA', 2009.1, 1.6, 90, 'China\'s home-grown 3G standard.', ['net_gsm']);
T('net_lte', 'network', 'LTE (4G)', 2009.95, 3, 150, 'All-IP broadband radio. Both GSM and CDMA carriers converge on it.', ['rf_mimo2'], { reqAny: ['net_hspa', 'net_evdo', 'net_wimax'], lead: 3 });
T('rf_frame', 'network', 'Frame-integrated antennas', 2010.5, 1.2, 70, 'Split a metal frame into tuned antenna bands – metal bodies without dead spots.', ['rf_internal']);
T('rf_div', 'network', 'Receive diversity', 2005.5, 0.8, 45, 'A second receive antenna fills in signal fades: better reception.', ['rf_internal']);
T('rf_tuner', 'network', 'Antenna aperture tuners', 2012.8, 0.9, 50, 'The antenna retunes itself when a hand detunes it.', ['rf_div']);
T('rf_fem', 'network', 'Integrated RF front-end modules', 2016, 1, 60, 'Filters, switches and amplifiers in one module: less power, less space.', ['rf_tuner']);
T('rf_ai', 'network', 'AI antenna management', 2024, 1, 60, 'Machine-learned antenna switching and beam steering.', ['rf_fem']);
T('rf_bands10', 'network', '10-band radios', 2011, 0.8, 50, 'LTE bands differ in every country.', ['rf_bands6']);
T('rf_ca2', 'network', 'Carrier aggregation (2 carriers)', 2013.5, 1.2, 70, 'LTE-Advanced: bond two channels for double speed.', ['net_lte']);
T('rf_pa_et', 'network', 'Envelope-tracking PAs', 2013.5, 1, 60, 'The PA supply follows the signal: −22% radio power.', ['rf_pa_gaas']);
T('rf_bands16', 'network', '16-band radios', 2014, 0.8, 50, 'Global LTE roaming.', ['rf_bands10']);
T('rf_ca3', 'network', 'Carrier aggregation (3 carriers)', 2015.5, 1, 60, 'Three bonded channels.', ['rf_ca2']);
T('rf_mimo4', 'network', '4×4 MIMO', 2016.5, 1.2, 70, 'Four antennas, four streams: gigabit LTE.', ['rf_mimo2']);
T('rf_bands24', 'network', '24-band radios', 2017, 0.8, 50, 'Even more LTE bands.', ['rf_bands16']);
T('rf_ca5', 'network', 'Carrier aggregation (5 carriers)', 2017.8, 1, 60, 'Five bonded channels.', ['rf_ca3']);
T('net_nr', 'network', '5G NR', 2019.3, 3, 150, 'New Radio on sub-6 GHz bands: gigabit speeds and low latency.', ['net_lte', 'rf_mimo4'], { lead: 3 });
T('net_mmw', 'network', '5G mmWave', 2019.3, 2, 110, 'Millimetre-wave 5G: multi-gigabit, but only in a few dense cities.', ['net_nr']);
T('rf_bands32', 'network', '32-band radios', 2020, 0.8, 50, '5G bands on top of LTE.', ['rf_bands24']);
T('rf_bands48', 'network', '48-band radios', 2024, 0.9, 50, 'Every band on Earth.', ['rf_bands32']);
T('net_5ga', 'network', '5G-Advanced', 2025.5, 2, 110, 'AI-tuned 5G: faster uplink, better coverage.', ['net_nr']);
T('rf_mimo8', 'network', '8×8 MIMO', 2026, 1.2, 70, 'Eight antennas.', ['rf_mimo4']);
T('net_6g', 'network', '6G', 2030.5, 3.2, 160, 'Sub-THz radio and integrated sensing.', ['net_5ga', 'rf_mimo8']);

// display
T('disp_led', 'display', 'LED segment displays', 1972, 0.6, 40, 'Red glowing digits show the number you dial.');
T('disp_lcd', 'display', 'Segment LCD', 1978.5, 0.8, 50, 'Liquid-crystal digits: a fraction of the power of LEDs.');
T('disp_el', 'display', 'Electroluminescent backlight', 1987, 0.6, 40, 'A glowing film lets you read an LCD in the dark.', ['disp_lcd']);
T('disp_passive', 'display', 'Dot-matrix LCD', 1988.5, 1, 60, 'Passive-matrix pixels: letters, menus and icons.', ['disp_lcd']);
T('disp_stn', 'display', 'STN liquid crystal', 1990.5, 0.8, 50, 'Super-twisted nematic: crisp contrast on dot-matrix screens.', ['disp_passive']);
T('disp_glass', 'display', 'Glass cover lens', 1996, 0.5, 30, 'Scratch-resistant glass instead of an acrylic window.');
T('disp_ledbl', 'display', 'LED backlight', 1998.5, 0.8, 50, 'White LEDs and a light guide: bright, even lighting.', ['disp_el']);
T('disp_color', 'display', 'Color filters (CSTN)', 2000.5, 1.2, 70, 'Red, green and blue sub-pixels: 4,096 colors!', ['disp_stn', 'disp_ledbl']);
T('disp_asi', 'display', 'a-Si TFT active matrix', 2002.3, 1.4, 80, 'A thin-film transistor behind every pixel: bright, fast, 65k colors.', ['disp_color']);
T('disp_resistive', 'display', 'Resistive touchscreen', 2003.0, 1, 60, 'Pressure-sensitive layer. Works with a stylus.', ['disp_passive'], { lead: 10 });
T('disp_ltps', 'display', 'LTPS backplanes', 2006.0, 1.4, 80, 'Polysilicon transistors: sharper panels, and the foundation for OLED.', ['disp_asi']);
T('disp_capacitive', 'display', 'Capacitive multi-touch', 2007.0, 2, 110, 'Glass that senses fingers. Pinch to zoom.', ['disp_asi'], { lead: 4 });
T('disp_alusil', 'display', 'Strengthened cover glass', 2007.5, 1, 60, 'Ion-exchanged aluminosilicate glass survives keys and drops.', ['disp_glass']);
T('disp_ips', 'display', 'IPS LCD', 2009.5, 1.2, 70, 'Wide viewing angles and accurate color.', ['disp_asi']);
T('disp_oled', 'display', 'AMOLED', 2010.3, 2.2, 120, 'Self-emissive pixels: true blacks, thinner, efficient.', ['disp_ltps'], { lead: 3.5 });
T('disp_incell', 'display', 'In-cell touch', 2012.7, 1.2, 70, 'The touch sensor lives inside the panel: thinner and brighter.', ['disp_capacitive', 'disp_ltps']);
T('disp_alusil2', 'display', 'Toughened glass gen-2', 2013, 0.8, 50, 'Survives more drops on concrete.', ['disp_alusil']);
T('disp_curved', 'display', 'Curved-edge panels', 2014.8, 1.2, 70, 'The screen flows over the sides.', ['disp_oled']);
T('disp_tab13', 'display', '13" tablet panels', 2015.8, 0.8, 50, 'Laptop-sized tablet screens.', ['form_tablet']);
T('disp_fullview', 'display', 'Slim-bezel 18:9 panels', 2017.3, 1.5, 80, 'Bezels shrink and screens grow taller.', ['disp_ltps']);
T('disp_notch', 'display', 'Notch cut-outs', 2017.7, 0.8, 50, 'Wrap the screen around the sensors.', ['disp_fullview']);
T('disp_hdr', 'display', 'HDR & 10-bit color', 2018, 1, 60, 'Brighter highlights and a billion colors.', ['disp_oled']);
T('disp_oleo', 'display', 'Oleophobic coating', 2009.5, 0.5, 30, 'Fingerprints wipe straight off the glass.', ['disp_capacitive']);
T('disp_calib', 'display', 'Factory color calibration', 2012, 0.6, 35, 'Every panel measured and tuned on the line.', ['disp_ips']);
T('disp_t120', 'display', '120 Hz touch sampling', 2014.5, 0.6, 35, 'The touch layer reports twice per frame: snappier response.', ['disp_capacitive']);
T('disp_sapphire', 'display', 'Sapphire cover crystal', 2015, 1, 60, 'Lab-grown sapphire: almost impossible to scratch, expensive and brittle.', ['disp_alusil']);
T('disp_aod', 'display', 'Always-on display', 2016.2, 0.8, 45, 'Clock and notifications glow on a black OLED screen.', ['disp_oled']);
T('disp_alusil3', 'display', 'Toughened glass gen-3', 2016.5, 0.8, 50, 'Deeper ion exchange: survives drops from shoulder height.', ['disp_alusil2']);
T('disp_t240', 'display', '240 Hz touch sampling', 2018.5, 0.6, 35, 'Gaming-grade touch response.', ['disp_t120']);
T('disp_dc', 'display', 'DC dimming', 2019.4, 0.6, 35, 'Dim OLEDs by lowering the current instead of flickering.', ['disp_oled']);
T('disp_t480', 'display', '480 Hz touch sampling', 2020.6, 0.6, 35, 'Touch that feels instant.', ['disp_t240']);
T('disp_coe', 'display', 'Polarizer-free OLED', 2021.3, 1.2, 70, 'Color filters on the encapsulation: +30% light, −20% power.', ['disp_oled']);
T('disp_ceramic2', 'display', 'Glass-ceramic gen-2', 2023.8, 1, 60, 'Tougher nano-crystal cover glass.', ['disp_ceramic']);
T('disp_ar', 'display', 'Anti-reflective cover glass', 2023.9, 1.1, 60, 'A nano-layer cuts reflections by 75%.', ['disp_ceramic']);
T('disp_hbm', 'display', 'High-brightness mode', 2019, 0.8, 50, 'Drive the panel harder outdoors (drive up to 140%).', ['disp_oled']);
T('disp_punch', 'display', 'Punch-hole cameras', 2019.2, 1, 60, 'A tiny hole in the panel for the selfie camera.', ['disp_notch', 'disp_oled']);
T('disp_90', 'display', '90 Hz refresh', 2019.4, 1, 50, 'Smoother scrolling.', ['disp_ltps']);
T('disp_fold', 'display', 'Foldable OLED', 2019.5, 3, 150, 'Plastic OLED that bends hundreds of thousands of times.', ['disp_oled']);
T('disp_120', 'display', '120 Hz refresh', 2020.2, 1, 50, 'Silky-smooth high refresh.', ['disp_90']);
T('disp_ceramic', 'display', 'Glass-ceramic cover', 2020.8, 1.2, 70, 'Nano-crystals in the glass: 4× better drop performance.', ['disp_alusil2']);
T('disp_144', 'display', '144 Hz refresh', 2021.5, 0.9, 50, 'Gaming-grade smoothness.', ['disp_120']);
T('disp_udc', 'display', 'Under-display camera', 2021.6, 1.5, 80, 'The selfie camera hides behind the pixels.', ['disp_punch']);
T('disp_ltpo', 'display', 'LTPO backplanes', 2021.7, 1.6, 80, 'Variable 1–120 Hz: high refresh without the battery cost.', ['disp_oled', 'disp_120']);
T('disp_pwm', 'display', 'Low-flicker dimming', 2022, 0.7, 40, 'High-frequency PWM: easier on the eyes.', ['disp_oled']);
T('disp_tandem', 'display', 'Tandem OLED', 2024.4, 1.6, 80, 'Two stacked emitter layers: brighter and longer-lived.', ['disp_ltpo']);
T('disp_microled', 'display', 'MicroLED', 2031, 3, 160, 'Inorganic micro-LED panels.', ['disp_tandem']);
ladder(DISP_SIZE_CAPS, DISP_SIZE_YEARS, 'display', v => `${v}" screens`, 0.5, 40, v => `Lets you make screens up to ${v}" diagonal.`);
ladder(PPI_CAPS, PPI_YEARS, 'display', v => `${v} PPI panels`, 0.55, 40, v => `Pixel density up to ${v} pixels per inch.`, ['disp_passive']);

// camera
T('cam_cmos', 'camera', 'CMOS camera module', 2000.8, 1.5, 80, 'A tiny camera in the phone: 110,000 pixels!', ['chip_cpu'], { lead: 3 });
T('cam_mp1', 'camera', 'VGA camera (0.3 MP)', 2002, 0.8, 50, '640×480 photos you can send by MMS.', ['cam_cmos']);
T('lens_2', 'camera', '2-element lenses', 2002, 0.5, 30, 'A second lens element corrects distortion.', ['cam_cmos']);
T('cam_ccd', 'camera', 'CCD sensors', 2002.5, 1, 60, 'Charge-coupled devices: cleaner, but hungry and slow.', ['cam_cmos']);
T('cam_f1', 'camera', '1/6" sensors', 2003, 0.5, 30, 'Bigger sensors gather more light.', ['cam_cmos']);
T('cam_front', 'camera', 'Front camera', 2003.5, 0.8, 45, 'For video calls – and later, selfies.', ['cam_cmos']);
T('cam_mp2', 'camera', '1.3 MP sensors', 2004, 0.8, 50, 'Megapixel photos.', ['cam_mp1']);
T('cam_f2', 'camera', '1/5" sensors', 2004, 0.5, 30, 'Bigger sensors gather more light.', ['cam_f1']);
T('lens_3', 'camera', '3-element lenses', 2004, 0.5, 30, 'Sharper corners.', ['lens_2']);
T('ap_28', 'camera', 'f/2.8 apertures', 2004, 0.5, 30, 'Faster lenses let in more light.', ['lens_2']);
T('cam_af', 'camera', 'Autofocus (VCM)', 2004.5, 1, 60, 'A voice-coil motor moves the lens to focus.', ['cam_mp2']);
T('cam_flash', 'camera', 'LED flash', 2005, 0.6, 40, 'Light for indoor shots.', ['cam_cmos']);
T('cam_mp3', 'camera', '2 MP sensors', 2005.5, 0.8, 50, 'Good enough for prints.', ['cam_mp2']);
T('cam_f3', 'camera', '1/4" sensors', 2005.5, 0.5, 30, 'Bigger sensors gather more light.', ['cam_f2']);
T('cam_xenon', 'camera', 'Xenon flash', 2006, 0.8, 50, 'A real camera strobe: powerful but bulky.', ['cam_flash']);
T('cam_mp4', 'camera', '3.2 MP sensors', 2007, 0.8, 50, 'Replaces a cheap compact camera.', ['cam_mp3']);
T('lens_4', 'camera', '4-element lenses', 2007, 0.6, 35, 'Sharp across the frame.', ['lens_3']);
T('ap_24', 'camera', 'f/2.4 apertures', 2008, 0.6, 35, 'Even faster lenses.', ['ap_28']);
T('cam_f4', 'camera', '1/3.2" sensors', 2009.5, 0.6, 35, 'Bigger sensors gather more light.', ['cam_f3']);
T('cam_mp5', 'camera', '5 MP sensors', 2009.5, 0.8, 50, 'Detailed photos.', ['cam_mp4']);
T('cam_bsi', 'camera', 'Back-side illuminated sensors', 2010.5, 1.4, 80, 'Wiring behind the photodiodes: +70% light.', ['cam_cmos']);
T('lens_5', 'camera', '5-element lenses', 2010.5, 0.6, 35, 'Higher contrast and less flare.', ['lens_4']);
T('cam_f5', 'camera', '1/3" sensors', 2011, 0.6, 35, 'Bigger sensors gather more light.', ['cam_f4']);
T('cam_mp6', 'camera', '8 MP sensors', 2011, 0.8, 50, 'Phone photos rival point-and-shoots.', ['cam_mp5']);
T('ap_22', 'camera', 'f/2.2 apertures', 2011.5, 0.6, 35, 'Faster lenses.', ['ap_24']);
T('cam_ois', 'camera', 'Optical image stabilization', 2012.7, 1.2, 70, 'A gyro-steered lens: +1.6 stops in low light.', ['cam_af']);
T('cam_mp7', 'camera', '12–13 MP sensors', 2013, 0.8, 50, 'High-resolution sensors.', ['cam_mp6']);
T('cam_stacked', 'camera', 'Stacked sensors', 2013.5, 1.4, 80, 'Pixels on top, processing below: fast readout and HDR.', ['cam_bsi']);
T('cam_dualflash', 'camera', 'Dual-tone flash', 2013.7, 0.6, 35, 'Warm and cool LEDs match the room light.', ['cam_flash']);
T('cam_pdaf', 'camera', 'Phase-detect autofocus', 2014, 1, 60, 'Focus in a blink.', ['cam_af']);
T('lens_6', 'camera', '6-element lenses', 2014, 0.6, 35, 'Wide-aperture lenses that stay sharp.', ['lens_5']);
T('ap_20', 'camera', 'f/2.0 apertures', 2014, 0.6, 35, 'Faster lenses.', ['ap_22']);
T('cam_f6', 'camera', '1/2.55" sensors', 2014.5, 0.6, 35, 'Large-pixel main sensors.', ['cam_f5']);
T('cam_mp8', 'camera', '16 MP sensors', 2014.5, 0.8, 50, 'More detail.', ['cam_mp7']);
T('cam_laser', 'camera', 'Laser autofocus', 2014.8, 0.8, 50, 'A time-of-flight beam focuses even in the dark.', ['cam_af']);
T('cam_f7', 'camera', '1/2.3" sensors', 2016, 0.6, 35, 'Compact-camera sized sensors.', ['cam_f6']);
T('cam_mp9', 'camera', '20 MP sensors', 2016.5, 0.8, 50, 'More detail.', ['cam_mp8']);
T('ap_18', 'camera', 'f/1.8 apertures', 2016.5, 0.6, 35, 'Bright lenses for night shots.', ['ap_20', 'lens_5']);
T('cam_dpaf', 'camera', 'Dual-pixel autofocus', 2016.5, 1, 60, 'Every pixel focuses.', ['cam_pdaf']);
T('cam_multi', 'camera', 'Multi-camera modules', 2016.7, 1.5, 80, 'Ultra-wide and telephoto cameras beside the main one.', ['cam_af']);
T('lens_7', 'camera', '7-element lenses', 2017.5, 0.6, 35, 'Big sensors need complex lenses.', ['lens_6']);
T('cam_quad', 'camera', 'Quad-Bayer binning', 2019, 1.5, 80, 'Pixel groups merge 4-in-1 in low light.', ['cam_stacked']);
T('cam_mp10', 'camera', '48–50 MP sensors', 2019, 0.8, 50, 'Needs pixel binning to stay clean.', ['cam_mp9', 'cam_quad']);
T('cam_f8', 'camera', '1/2" sensors', 2019, 0.6, 35, 'Big sensors.', ['cam_f7']);
T('ap_16', 'camera', 'f/1.6 apertures', 2019, 0.6, 35, 'Very bright lenses.', ['ap_18', 'lens_6']);
T('cam_periscope', 'camera', 'Periscope zoom', 2019.2, 1.5, 80, 'A prism folds the light path sideways: 5× optical zoom in a thin phone.', ['cam_multi']);
T('cam_f9', 'camera', '1/1.7" sensors', 2019.6, 0.6, 35, 'Big sensors.', ['cam_f8']);
T('cam_mp11', 'camera', '64 MP sensors', 2019.7, 0.8, 50, 'More detail.', ['cam_mp10']);
T('cam_f10', 'camera', '1/1.5" sensors', 2020.5, 0.6, 35, 'Huge sensors.', ['cam_f9']);
T('cam_mp12', 'camera', '108 MP sensors', 2020.5, 0.8, 50, 'Medium-format resolution.', ['cam_mp11']);
T('cam_shift', 'camera', 'Sensor-shift stabilization', 2020.8, 1.2, 70, 'The whole sensor floats: +2.3 stops.', ['cam_ois']);
T('cam_f11', 'camera', '1/1.3" sensors', 2021, 0.6, 35, 'Huge sensors.', ['cam_f10']);
T('lens_8', 'camera', '8-element lenses', 2021.5, 0.7, 40, 'Eight molded aspheres.', ['lens_7']);
T('cam_f12', 'camera', '1-inch sensors', 2022.5, 0.8, 45, 'Compact-camera-sized sensors in a phone.', ['cam_f11']);
T('cam_mp13', 'camera', '200 MP sensors', 2022.5, 0.8, 50, 'More pixels than anyone needs.', ['cam_mp12']);
T('ap_14', 'camera', 'f/1.4 apertures', 2022.5, 0.7, 40, 'Fast as a DSLR prime.', ['ap_16', 'lens_7']);
T('cam_2layer', 'camera', '2-layer transistor pixels', 2023.5, 1.5, 80, 'Double the full-well: huge dynamic range.', ['cam_quad']);
T('cam_v720', 'camera', '720p HD video', 2009, 0.6, 35, 'High-definition video recording.', ['cam_mp4']);
T('cam_v1080', 'camera', '1080p video', 2011, 0.6, 35, 'Full HD video.', ['cam_v720']);
T('cam_v4k', 'camera', '4K video', 2014, 0.8, 45, 'Ultra-HD video: needs an 8 MP+ sensor.', ['cam_v1080']);
T('cam_coat', 'camera', 'Anti-flare lens coatings', 2016, 0.6, 35, 'Atomic-layer coatings stop flare and ghosting.', ['lens_5']);
T('cam_varap', 'camera', 'Variable aperture', 2018.2, 0.9, 50, 'Two f-stops in one phone lens.', ['ap_18']);
T('cam_tof', 'camera', '3D time-of-flight sensors', 2018.8, 0.9, 50, 'Infrared depth mapping for portraits and AR.', ['cam_laser']);
T('cam_macro', 'camera', 'Close-focus macro', 2019.5, 0.6, 35, 'Focus 2 cm from the subject.', ['cam_af']);
T('cam_v8k', 'camera', '8K video', 2020.2, 0.8, 45, '33 MP per frame: needs a huge sensor.', ['cam_v4k', 'cam_mp10']);
T('cam_gimbal', 'camera', 'Micro-gimbal stabilization', 2020.5, 1, 60, 'The whole camera module floats on a gimbal: +3 stops.', ['cam_ois']);
T('cam_apaf', 'camera', 'All-pixel autofocus', 2021, 0.8, 45, '2×2 on-chip lenses: every pixel focuses in every direction.', ['cam_dpaf']);
T('cam_spectral', 'camera', 'Multispectral color sensors', 2021.5, 0.6, 35, 'True-to-life white balance.', ['cam_multi']);
T('cam_cz', 'camera', 'Continuous optical zoom', 2023.2, 1.2, 70, 'Moving lens groups zoom smoothly.', ['cam_periscope']);

// battery
T('bat_nimh', 'battery', 'NiMH cells', 1990.5, 1, 60, '2.4× the energy of NiCd.');
T('bat_liion', 'battery', 'Li-ion cells', 1994.5, 1.6, 90, 'Lithium-ion: light, dense, no memory effect.', ['bat_nimh'], { lead: 4 });
T('bat_prism', 'battery', 'Prismatic cells', 1994.5, 0.7, 40, 'Flat aluminum cans pack better than round cells.', ['bat_liion']);
T('bat_fc5', 'battery', '5 W charging', 1997, 0.5, 30, 'Charge in hours, not overnight.');
T('bat_d1', 'battery', 'Better electrodes I', 1998, 0.5, 30, '+6% energy density for lithium cells.', ['bat_liion']);
T('bat_d2', 'battery', 'Better electrodes II', 2003, 0.5, 30, '+6% energy density.', ['bat_d1']);
T('bat_lipo', 'battery', 'Li-polymer pouch cells', 2004, 1.2, 70, 'Gel electrolyte in a foil pouch: any shape, +25% density.', ['bat_liion']);
T('bat_d3', 'battery', 'Better electrodes III', 2008, 0.5, 30, '+6% energy density.', ['bat_d2']);
T('bat_fc10', 'battery', '10 W charging', 2011, 0.5, 30, 'Faster charging.', ['bat_fc5']);
T('bat_qi', 'battery', 'Wireless charging', 2012.5, 1, 60, 'Qi inductive charging coil.', ['bat_fc5']);
T('bat_d4', 'battery', 'Better electrodes IV', 2013, 0.5, 30, '+6% energy density.', ['bat_d3']);
T('bat_v435', 'battery', '4.35 V cells', 2014.5, 0.7, 40, 'Charge higher for +6% energy (fewer cycles).', ['bat_lipo']);
T('bat_hv', 'battery', 'High-energy Li-Po', 2015, 1.2, 70, 'Denser cathodes: +33% energy density.', ['bat_lipo']);
T('bat_fc18', 'battery', '18 W fast charging', 2015, 0.6, 35, 'Quick charging.', ['bat_fc10']);
T('bat_v44', 'battery', '4.4 V cells', 2017, 0.7, 40, 'Even higher charge voltage.', ['bat_v435']);
T('bat_safety', 'battery', 'Battery safety systems', 2017, 1, 60, 'X-ray inspection, thicker separators, smarter BMS: −55% incident risk.', ['bat_lipo']);
T('bat_qi15', 'battery', '15 W wireless charging', 2017.7, 0.6, 35, 'Faster wireless.', ['bat_qi']);
T('bat_fc30', 'battery', '30 W fast charging', 2018, 0.6, 35, 'Half a battery in 30 minutes.', ['bat_fc18']);
T('bat_d5', 'battery', 'Better electrodes V', 2018, 0.5, 30, '+6% energy density.', ['bat_d4']);
T('bat_dual', 'battery', 'Dual-cell packs', 2019.5, 0.8, 45, 'Two cells in series halve the charging current.', ['bat_fc30']);
T('bat_v445', 'battery', '4.45 V cells', 2019.5, 0.7, 40, 'Maximum charge voltage.', ['bat_v44']);
T('bat_fc65', 'battery', '65 W fast charging', 2020, 0.7, 40, 'A full charge in 35 minutes.', ['bat_dual']);
T('bat_mag', 'battery', 'Magnetic wireless charging', 2020.8, 0.8, 45, 'Magnets align the coils: 25 W wireless.', ['bat_qi15']);
T('bat_fc120', 'battery', '120 W hyper charging', 2022, 0.8, 50, 'Full in under 20 minutes.', ['bat_fc65']);
T('bat_d6', 'battery', 'Better electrodes VI', 2023, 0.5, 30, '+6% energy density.', ['bat_d5']);
T('bat_sic', 'battery', 'Silicon-carbon anodes', 2023.5, 1.6, 90, 'Silicon stores 10× more lithium than graphite.', ['bat_hv']);
T('bat_stack', 'battery', 'Stacked electrodes', 2023, 1, 60, 'Square corners and lower resistance.', ['bat_lipo']);
T('bat_shaped', 'battery', 'Shaped cells', 2017.8, 0.8, 45, 'L-shaped and split cells fill the corners around the board.', ['bat_lipo']);
T('bat_bms', 'battery', 'Battery-health management', 2019.8, 0.6, 35, 'Optimized charging: +25% cycle life.', ['bat_safety']);
T('bat_multitab', 'battery', 'Multi-tab electrodes', 2020.3, 0.8, 45, 'Lower internal resistance: the cell accepts a faster charge.', ['bat_fc30']);
T('bat_graphene', 'battery', 'Graphene thermal layers', 2021, 0.8, 45, 'Heat-spreading film lets cells charge faster and safer.', ['bat_fc30']);
T('bat_bypass', 'battery', 'Bypass charging', 2023.3, 0.6, 35, 'Power the phone straight from the charger.', ['bat_bms']);
T('bat_fc240', 'battery', '240 W charging', 2025, 0.8, 50, 'Ten minutes to full.', ['bat_fc120']);
T('bat_solid', 'battery', 'Solid-state cells', 2032, 2.5, 140, 'Ceramic electrolyte: dense and non-flammable.', ['bat_sic']);
ladder(BAT_CAPS, BAT_CAP_YEARS, 'battery', v => `${v.toLocaleString('en-US')} mAh cells`, 0.45, 35, v => `Cells up to ${v.toLocaleString('en-US')} mAh (bag phones ×6, tablets ×2.2).`);

// memory
T('mem_dram', 'memory', 'Dynamic RAM', 1974, 0.6, 40, 'One transistor and a capacitor per bit: far denser than static RAM.');
DRAM_DIES.forEach((mb, i) => {
  if (i === 0) return;
  const label = mb >= 1024 ? (mb / 1024) + ' Gb' : mb >= 1 ? mb + ' Mb' : Math.round(mb * 1024) + ' Kb';
  T('dram_' + i, 'memory', `${label} DRAM dies`, DRAM_YEARS[i], 0.45, 35, `DRAM chips holding ${label}.`, i > 1 ? ['dram_' + (i - 1)] : ['mem_dram']);
});
T('mem_stack2', 'memory', '2-die stacking', 1999, 0.6, 40, 'Two memory dies in one package.');
T('mem_sdram', 'memory', 'Mobile SDRAM', 1998, 0.8, 45, 'Synchronous DRAM: a big bandwidth jump.', ['mem_dram']);
T('mem_stack4', 'memory', '4-die stacking', 2006, 0.6, 40, 'Four dies per package.', ['mem_stack2']);
T('mem_lp1', 'memory', 'LPDDR', 2006.5, 0.8, 45, 'Low-power double data rate DRAM.', ['mem_sdram']);
T('mem_lp2', 'memory', 'LPDDR2', 2010.5, 0.8, 45, 'Double the bandwidth.', ['mem_lp1']);
T('mem_stack8', 'memory', '8-die stacking', 2012.5, 0.7, 40, 'Eight dies per package.', ['mem_stack4']);
T('mem_lp3', 'memory', 'LPDDR3', 2013, 0.8, 45, 'Faster, lower voltage.', ['mem_lp2']);
T('mem_lp4', 'memory', 'LPDDR4', 2015, 0.9, 50, 'Two channels per die.', ['mem_lp3']);
T('mem_stack16', 'memory', '16-die stacking', 2016, 0.7, 40, 'Sixteen dies per package (flash).', ['mem_stack8']);
T('mem_lp4x', 'memory', 'LPDDR4X', 2017.5, 0.7, 40, 'Lower I/O voltage: −18% power.', ['mem_lp4']);
T('mem_lp5', 'memory', 'LPDDR5', 2020, 0.9, 50, 'High-speed DRAM.', ['mem_lp4x']);
T('mem_lp5x', 'memory', 'LPDDR5X', 2022.5, 0.8, 45, 'Even faster.', ['mem_lp5']);
T('mem_lp6', 'memory', 'LPDDR6', 2026.5, 0.9, 50, 'Next-gen mobile DRAM.', ['mem_lp5x']);
FLASH_DIES.forEach((mb, i) => {
  if (i === 0) return;
  const label = mb >= 1048576 ? (mb / 1048576) + ' Tb' : mb >= 1024 ? (mb / 1024) + ' Gb' : mb >= 1 ? mb + ' Mb' : Math.round(mb * 1024) + ' Kb';
  T('fl_' + i, 'memory', `${label} ${FLASH_NAMES[i]}`, FLASH_YEARS[i], 0.45, 35, `Non-volatile ${FLASH_NAMES[i]} dies of ${label}: phonebooks, apps and photos.`, i > 1 ? ['fl_' + (i - 1)] : []);
});
T('fl_mlc', 'memory', 'MLC flash', 2004, 0.7, 40, 'Two bits per cell: −40% cost per GB.', ['fl_6']);
T('if_emmc', 'memory', 'eMMC storage', 2008, 0.7, 40, 'Managed flash with a built-in controller.', ['fl_8']);
T('fl_tlc', 'memory', 'TLC flash', 2012.5, 0.7, 40, 'Three bits per cell.', ['fl_mlc']);
T('if_emmc5', 'memory', 'eMMC 5', 2014, 0.6, 35, 'Faster managed flash.', ['if_emmc']);
T('if_ufs2', 'memory', 'UFS 2 storage', 2015.5, 0.8, 45, 'Serial lanes: SSD-like speeds.', ['if_emmc5']);
T('fl_qlc', 'memory', 'QLC flash', 2019.5, 0.7, 40, 'Four bits per cell.', ['fl_tlc']);
T('if_ufs3', 'memory', 'UFS 3 storage', 2019.2, 0.8, 45, 'Twice as fast.', ['if_ufs2']);
T('if_ufs4', 'memory', 'UFS 4 storage', 2022.8, 0.8, 45, 'Twice as fast again.', ['if_ufs3']);
T('if_ufs5', 'memory', 'UFS 5 storage', 2027, 0.8, 45, 'Next-gen storage.', ['if_ufs4']);
T('mem_pop', 'memory', 'Package-on-package', 2007.5, 0.7, 40, 'RAM stacked on top of the processor.', ['mem_stack2']);
T('mem_dpd', 'memory', 'Deep power-down DRAM', 2011, 0.5, 30, 'Idle banks switch off: −15% memory power.', ['mem_lp1']);
T('mem_mcp', 'memory', 'Combo memory packages (uMCP)', 2014.5, 0.6, 35, 'RAM and flash in one cheap package.', ['if_emmc5']);
T('mem_wb', 'memory', 'SLC write cache', 2019.2, 0.6, 35, 'Fast 1-bit cache zone in the flash.', ['if_ufs2']);
T('mem_hpb', 'memory', 'Host performance booster', 2020.5, 0.6, 35, 'Flash map cached in RAM: faster reads.', ['if_ufs3']);
T('feat_sd', 'memory', 'Memory card slot', 2005, 0.5, 30, 'Expandable storage with microSD.', ['fl_7']);

// chip design
T('chip_cpu', 'chip', 'Microprocessor logic', 1971, 1, 60, 'A programmable CPU instead of hard-wired logic boards.');
ARCH_YEARS.forEach((y, i) => {
  if (i === 0) return;
  T('chip_arch' + (i + 1), 'chip', `CPU architecture v${i + 1}`, y, 0.6, 50, '+12% instructions per clock for every CPU, GPU and NPU block in your chips.', i > 1 ? ['chip_arch' + i] : ['chip_cpu']);
});
T('chip_dsp', 'chip', 'DSP block', 1989, 1.2, 70, 'Digital signal processing: needed for digital (2G) radio and voice codecs.', ['chip_cpu']);
T('chip_dvfs', 'chip', 'Dynamic voltage scaling', 1999, 0.8, 50, 'Chips slow down and lower voltage when idle: −15% power.', ['chip_cpu']);
T('chip_modem', 'chip', 'Integrated baseband', 1998, 1.4, 80, 'Put the modem on your SoC: no separate baseband chip.', ['chip_dsp']);
T('chip_isp', 'chip', 'Camera ISP block', 2002, 0.8, 50, 'Unlocks the image signal processor block.', ['cam_cmos']);
T('chip_gpu', 'chip', 'Graphics core block', 2004, 1.2, 70, 'Unlocks the GPU block: 3D games!');
T('chip_media', 'chip', 'Media engine block', 2004.5, 0.8, 50, 'Unlocks hardware audio/video codecs.');
T('chip_little', 'chip', 'big.LITTLE efficiency cores', 2011.5, 1, 60, 'Unlocks the efficiency core block.');
T('chip_64', 'chip', '64-bit CPU cores', 2013.7, 1.2, 70, '+15% CPU performance.', ['chip_arch17']);
T('chip_npu', 'chip', 'Neural engine block', 2017.7, 1.5, 80, 'Unlocks the NPU block for on-device AI.');
T('chip_rt', 'chip', 'Ray-tracing GPUs', 2023.3, 1.2, 70, '+20% GPU performance.', ['chip_gpu']);
T('chip_3d', 'chip', '3D chip stacking', 2027, 2, 110, 'Cache stacked on top of logic: +12% CPU and GPU.', ['chip_rt']);
// process design kits
NODES.forEach((n, i) => {
  if (i === 0) return;
  T('proc_' + n.nm, 'process', `${nodeLabel(n.nm)} design kit`, n.year, 1.3, 80,
    `Design custom chips on the ${nodeLabel(n.nm)} process. Researched early, you can build your own fab before foundries offer it.`, i > 1 ? ['proc_' + NODES[i - 1].nm] : ['chip_cpu']);
});

// design & form factors
T('int_hybrid', 'design', 'Thick-film hybrid circuits', 1976, 0.8, 50, 'Printed circuit modules: electronics −40% smaller.');
T('int_lsi', 'design', 'LSI logic', 1979, 1, 60, 'Large-scale integration: −45% electronics volume.', ['int_hybrid']);
T('int_vlsi', 'design', 'VLSI chipsets', 1982.5, 1.2, 70, 'Whole subsystems on a chip: −50%. A handheld finally fits.', ['int_lsi']);
T('form_brick', 'design', 'Handheld cellphones', 1983.7, 2.5, 150, 'A phone you can carry in one hand – if your electronics are small enough.', ['int_lsi'], { reqAny: ['net_amps', 'net_nmt'], lead: 4 });
T('port_edge', 'design', 'Edge connectors', 1983.7, 0.4, 25, 'A multi-pin connector for chargers and car kits.');
T('form_bag', 'design', 'Transportable bag phones', 1984.5, 1, 60, 'Radio and a big battery in a shoulder bag.', [], { reqAny: ['net_amps', 'net_nmt'] });
T('int_smt', 'design', 'Surface-mount boards', 1987, 1, 60, 'Parts soldered onto the board surface: −50%.', ['int_vlsi']);
T('form_flip', 'design', 'Flip phones', 1989.3, 1.2, 70, 'A hinged flap – later a full clamshell – folds the phone in half.', ['form_brick']);
T('int_asic', 'design', 'Custom ASICs', 1989, 1, 60, 'Application-specific chips: −60%. Pocketable flip phones arrive.', ['int_smt']);
T('form_candybar', 'design', 'Pocket candybar phones', 1991.5, 1.2, 70, 'A slim bar that fits in a pocket.', ['int_smt']);
T('sim_full', 'design', 'SIM cards', 1991.5, 0.6, 40, 'Your number on a smart card: swap phones freely (GSM).', ['net_gsm']);
T('add_kblight', 'design', 'Backlit keypads', 1994, 0.4, 25, 'LEDs under the keys: dial in the dark.');
T('add_lanyard', 'design', 'Lanyard loops', 1996.5, 0.3, 20, 'A loop for wrist straps and charms.');
T('add_wheel', 'design', 'Jog dials & scroll wheels', 1999.3, 0.6, 35, 'A thumb wheel on the edge to scroll through menus.');
T('add_torch', 'design', 'Flashlight LEDs', 2003.3, 0.3, 20, 'A bright white LED on the top edge.');
T('add_ptt', 'design', 'Push-to-talk keys', 2003.5, 0.5, 30, 'A walkie-talkie key: instant calls to a group.');
T('add_camkey', 'design', 'Camera shutter keys', 2004.5, 0.4, 25, 'A two-stage shutter key on the edge.', ['cam_cmos']);
T('add_sos', 'design', 'Emergency SOS keys', 2006.3, 0.3, 20, 'A big key that calls for help.');
T('add_trackball', 'design', 'Trackballs', 2006.7, 0.6, 35, 'A tiny rolling ball for navigation.');
T('add_mute', 'design', 'Ring/silent switches', 2007.5, 0.3, 20, 'A hardware switch to silence the phone.');
T('add_dualsim', 'design', 'Dual-SIM phones', 2007.8, 0.6, 35, 'Room for two SIM cards and two numbers.', ['sim_mini']);
T('add_solar', 'design', 'Solar charging panels', 2009.5, 0.8, 45, 'Photovoltaic cells on the back keep the battery topped up.');
T('add_trackpad', 'design', 'Optical trackpads', 2009.8, 0.5, 30, 'A touch-sensing nub replaces the trackball.', ['add_trackball']);
T('add_action', 'design', 'Programmable keys', 2010.5, 0.4, 25, 'A spare key the owner assigns to any shortcut.');
T('add_kickstand', 'design', 'Kickstands', 2010.5, 0.4, 25, 'A fold-out stand on the back.');
T('add_hdmi', 'design', 'Video-out ports', 2010.6, 0.5, 30, 'Micro-HDMI: play your videos on a TV.', ['disp_color']);
T('add_alertslider', 'design', 'Three-stage alert sliders', 2016.4, 0.4, 25, 'Ring, vibrate or silent with one flick.', ['add_mute']);
T('add_backscreen', 'design', 'Rear selfie displays', 2017.9, 1, 60, 'A second display on the back.', ['disp_color']);
T('add_triggers', 'design', 'Gaming shoulder triggers', 2018.9, 0.6, 35, 'Pressure-sensitive buttons along the edge.', ['form_touch']);
T('add_privacy', 'design', 'Privacy kill switches', 2019.5, 0.5, 30, 'Cut power to cameras and microphones in hardware.', ['cam_cmos']);
T('add_glyph', 'design', 'Light-strip backs', 2022.6, 0.6, 35, 'LED light strips on a transparent back.', ['form_touch']);
T('int_rfic', 'design', 'RF integrated circuits', 1993, 1.1, 60, 'Radio transceivers on silicon: −50%.', ['int_asic']);
T('jack_25', 'design', '2.5 mm headset jack', 1995, 0.4, 25, 'Plug in a hands-free headset.');
T('sim_mini', 'design', 'Mini-SIM', 1996, 0.5, 30, 'Stamp-sized SIM cards.', ['sim_full']);
T('int_csp', 'design', 'Chip-scale packages', 1997, 1, 60, 'Packages barely bigger than the die: −12%, and lighter boards.', ['int_rfic']);
T('body_mg', 'design', 'Magnesium alloy bodies', 1999, 0.9, 50, 'Light, stiff metal shells.');
T('int_hdi', 'design', 'HDI microvia boards', 2002, 1, 60, 'Laser-drilled microvias: −35%.', ['int_csp']);
T('form_qwerty', 'design', 'QWERTY messengers', 2002.5, 1, 60, 'A full thumb keyboard for email addicts.', ['form_candybar']);
T('jack_35', 'design', '3.5 mm headphone jack', 2004, 0.4, 25, 'Use any headphones.', ['jack_25']);
T('form_slider', 'design', 'Slider phones', 2004.5, 1, 60, 'Spring-loaded rails: the screen slides up over the keypad.', ['form_flip']);
T('body_alu', 'design', 'Aluminum bodies', 2004.5, 1.2, 70, 'Thin anodized metal shells. Feels premium, sheds heat.');
T('port_miniusb', 'design', 'Mini-USB', 2004.8, 0.5, 30, 'Charge and sync over USB.');
T('fin_brushed', 'design', 'Brushed metal finish', 2005, 0.5, 30, 'Fine linear grain on metal.', ['body_alu']);
T('body_ip53', 'design', 'Splash resistance', 2006, 0.8, 45, 'Gaskets that survive rain.');
T('fin_matte', 'design', 'Soft-touch matte finish', 2006, 0.4, 25, 'Velvety coating that does not show fingerprints.');
T('int_pop', 'design', 'Package-on-package', 2006, 1, 60, 'Memory stacked right on top of the SoC: −30%.', ['int_hdi']);
T('form_touch', 'design', 'Full-touch slate', 2007, 2.5, 120, 'Drop the keypad: the whole front is a screen.', [], { reqAny: ['disp_resistive', 'disp_capacitive'], lead: 14 });
T('port_microusb', 'design', 'Micro-USB', 2007.5, 0.5, 30, 'Thinner universal port.', ['port_miniusb']);
T('int_anylayer', 'design', 'Any-layer HDI', 2010, 1, 60, 'Every board layer interconnects: −20%.', ['int_pop']);
T('form_tablet', 'design', 'Tablets', 2010.25, 2, 100, 'A new device category: big touch slates.', ['form_touch']);
T('sim_micro', 'design', 'Micro-SIM', 2010.3, 0.4, 25, 'Smaller SIM trays.', ['sim_mini']);
T('body_glass', 'design', 'Glass sandwich design', 2010.5, 1.2, 70, 'Glass front and back around a metal frame.', ['body_alu']);
T('port_slim', 'design', 'Slim proprietary connector', 2012.7, 0.8, 45, 'Your own reversible 8-pin port. Accessory makers pay you royalties.', ['port_microusb']);
T('sim_nano', 'design', 'Nano-SIM', 2012.7, 0.4, 25, 'Barely bigger than the chip.', ['sim_micro']);
T('body_ip67', 'design', 'IP67 water resistance', 2014, 1, 60, 'Survives a dunk in 1 m of water.', ['body_ip53']);
T('port_usbc', 'design', 'USB-C', 2015.3, 0.6, 35, 'Reversible universal connector.', ['port_microusb']);
T('body_ip68', 'design', 'IP68 water resistance', 2016.5, 1, 60, 'Survives 30 min at 1.5 m+.', ['body_ip67']);
T('body_steel', 'design', 'Stainless steel frames', 2017, 1, 60, 'Polished steel bands.', ['body_glass']);
T('int_slp', 'design', 'Substrate-like PCB', 2017.7, 1, 60, 'Chip-substrate technology for the main board: −20%.', ['int_anylayer']);
T('body_ceramic', 'design', 'Ceramic bodies', 2018, 1, 70, 'Scratch-proof zirconia ceramic.', ['body_glass']);
T('esim', 'design', 'eSIM', 2018.7, 0.6, 35, 'No SIM tray at all.', ['sim_nano']);
T('fin_frosted', 'design', 'Frosted glass finish', 2019, 0.5, 30, 'Etched glass: silky and fingerprint-free.', ['body_glass']);
T('form_fold', 'design', 'Foldable phones', 2019.5, 3, 150, 'A hinge that folds a tablet-sized screen in half.', ['disp_fold', 'form_touch']);
T('int_sip', 'design', 'System-in-package', 2021, 1.2, 70, 'Everything on one module: −15%.', ['int_slp']);
T('body_ti', 'design', 'Titanium frames', 2023.7, 1.2, 70, 'Light and strong aerospace titanium.', ['body_steel']);
T('port_less', 'design', 'Portless design', 2026, 1, 60, 'No openings at all: charge wirelessly.', ['bat_mag']);
// body upgrades & decorations
T('rug_bumper', 'design', 'Shock-absorbing bumpers', 1994, 0.4, 25, 'Rubber-cushioned corners for work phones.');
T('logo_emboss', 'design', 'Embossed logos', 1995, 0.3, 20, 'Logos pressed into the shell.');
T('frame_mg', 'design', 'Magnesium chassis', 1998, 0.7, 40, 'A light die-cast skeleton inside the shell.', ['body_mg']);
T('rug_mil', 'design', 'MIL-spec rugged bodies', 2000.5, 0.8, 45, 'Armored phones for building sites and soldiers.', ['rug_bumper']);
T('coat_afp', 'design', 'Anti-fingerprint coatings', 2003, 0.4, 25, 'Oil-repellent films for shells and screens.');
T('tex_leather', 'design', 'Leather backs', 2003.5, 0.5, 30, 'Stitched leather for luxury phones.');
T('logo_badge', 'design', 'Metal badges', 2004, 0.3, 20, 'Polished metal logo inlays.', ['logo_emboss']);
T('tex_carbon', 'design', 'Carbon-fiber backs', 2005, 0.6, 35, 'Woven carbon: light and technical.');
T('frame_steel', 'design', 'Steel inner frames', 2006.5, 0.7, 40, 'A stainless band that carries the whole phone.');
T('tex_aramid', 'design', 'Aramid-fiber backs', 2009.5, 0.6, 35, 'Kevlar weave: thin, tough and radio-transparent.', ['tex_carbon']);
T('ffin_polish', 'design', 'Polished frames', 2008, 0.4, 25, 'Mirror-polished metal sides.', ['frame_steel']);
T('ffin_diamond', 'design', 'Diamond-cut chamfers', 2012.5, 0.5, 30, 'Sparkling edges cut with a diamond tool.', ['ffin_polish']);
T('cool_graphite', 'design', 'Graphite heat spreaders', 2011, 0.5, 30, 'Thin graphite sheets spread the chip\'s heat.');
T('coat_nano', 'design', 'Nano-coatings', 2012, 0.6, 35, 'Water-repellent molecular films inside and out.', ['coat_afp']);
T('tex_wood', 'design', 'Wood veneer backs', 2013, 0.4, 25, 'Real wood on a phone.');
T('frame_alu', 'design', 'Aerospace aluminum frames', 2014.5, 0.7, 40, 'Machined 7000-series aluminum frames.', ['body_alu']);
T('tex_fabric', 'design', 'Fabric backs', 2015, 0.4, 25, 'Soft textile covers.');
T('cool_pipe', 'design', 'Heat pipes', 2015.5, 0.6, 35, 'Copper pipes of boiling fluid carry heat away from the chip.', ['cool_graphite']);
T('ffin_pvd', 'design', 'PVD frame coatings', 2016.5, 0.5, 30, 'Vapor-deposited metallic colors.', ['ffin_polish']);
T('logo_glow', 'design', 'Glowing logos', 2016, 0.4, 25, 'A logo that lights up.', ['logo_badge']);
T('tex_gradient', 'design', 'Gradient color backs', 2018, 0.4, 25, 'Colors fading into each other under glass.', ['body_glass']);
T('cool_vapor', 'design', 'Vapor chambers', 2018.5, 0.8, 45, 'A flat chamber that spreads heat over the whole frame.', ['cool_pipe']);
T('cool_fan', 'design', 'Active cooling fans', 2020.5, 0.8, 45, 'A tiny blower for gaming phones.', ['cool_vapor']);
T('tex_clear', 'design', 'Translucent backs', 2019.5, 0.5, 30, 'Show off the parts inside.', ['body_glass']);
T('coat_ceramic', 'design', 'Ceramic hard-coats', 2020, 0.6, 35, 'Scratch-resistant ceramic layers.', ['coat_nano']);
T('tex_shift', 'design', 'Color-shift backs', 2021, 0.6, 35, 'Iridescent nano-layers that change color.', ['tex_gradient']);
T('frame_ti', 'design', 'Titanium chassis', 2023.5, 0.8, 45, 'A grade-5 titanium skeleton inside the body.', ['frame_alu']);

// features & software
T('feat_phonebook', 'features', 'Phonebook memory', 1983, 0.5, 30, 'Store names and numbers (needs some storage).', ['fl_1']);
T('os_firmware', 'features', 'Phone firmware', 1983, 1, 60, 'A microprocessor runs menus, memories and redial.', ['chip_cpu']);
T('feat_sms', 'features', 'Text messaging (SMS)', 1993, 1, 60, '160 characters at a time. Needs a digital network.', [], { reqAny: ['net_gsm', 'net_tdma', 'net_cdma'] });
T('feat_vibra', 'features', 'Vibrating alert', 1996, 0.5, 30, 'A tiny motor buzzes silently in your pocket.');
T('feat_games', 'features', 'Built-in games', 1997.5, 0.6, 35, 'Snake, anyone?', ['os_firmware']);
T('feat_ir', 'features', 'Infrared port', 1998, 0.5, 30, 'Beam contacts to another phone.');
T('add_led', 'features', 'Notification LEDs', 1998.5, 0.4, 25, 'A blinking light for missed calls and messages.');
T('feat_wap', 'features', 'Mobile web (WAP)', 1999.5, 0.8, 45, 'The internet, one line at a time.', ['feat_sms']);
T('feat_poly', 'features', 'Polyphonic ringtones', 2001.5, 0.6, 35, 'Ringtones with real chords.');
T('os_feature', 'features', 'Feature phone OS', 2002, 1.5, 80, 'Downloadable games, apps and themes.', ['os_firmware']);
T('feat_bt', 'features', 'Bluetooth', 2002.5, 0.8, 45, 'Wireless headsets and file sharing.');
T('feat_fm', 'features', 'FM radio', 2003, 0.5, 30, 'The headset cord is the antenna.');
T('add_tvant', 'features', 'Mobile TV tuners', 2005.5, 0.9, 50, 'Broadcast TV on your phone (DMB / DVB-H / 1seg).', ['disp_color']);
T('os_smart', 'features', 'Smartphone OS', 2004, 2, 100, 'Multitasking, email, office documents.', ['os_firmware'], { lead: 10 });
T('feat_mp3', 'features', 'Music player', 2004.5, 0.8, 45, 'Your music collection in your pocket.');
T('feat_wifi', 'features', 'Wi-Fi', 2006, 0.8, 45, 'Fast internet at home and in cafés.');
T('os_touch', 'features', 'Touch-first OS', 2007.5, 3, 120, 'An OS built for fingers, with an app store.', ['os_smart', 'disp_capacitive']);
T('feat_gps', 'features', 'GPS', 2007.5, 0.8, 45, 'Turn-by-turn navigation.');
T('feat_accel', 'features', 'Motion sensors', 2007.5, 0.6, 35, 'Accelerometer and gyro: auto-rotate, games.');
T('nav_home', 'features', 'Home button', 2007, 0.5, 30, 'One round button below the screen takes you home.', ['form_touch']);
T('nav_physkeys', 'features', 'Physical navigation keys', 2008.8, 0.4, 25, 'Home, back and menu keys you can press below the screen.', ['form_touch']);
T('nav_capkeys', 'features', 'Capacitive navigation keys', 2009.8, 0.5, 30, 'Touch-sensitive back/home/menu keys printed under the glass.', ['nav_physkeys']);
T('nav_onscreen', 'features', 'On-screen navigation bar', 2011.9, 0.6, 35, 'Navigation keys drawn on the display: no chin needed, but they eat screen space.', ['os_touch']);
T('nav_caphome', 'features', 'Solid-state home button', 2016.7, 0.6, 35, 'A pressure-sensing home button with a haptic click: no moving parts, easier to waterproof.', ['nav_home', 'feat_haptic']);
T('nav_gesture', 'features', 'Gesture navigation', 2017.7, 0.8, 45, 'Swipe from the edges instead of pressing keys: the whole front can be screen.', ['nav_onscreen']);
T('add_prox', 'features', 'Proximity & light sensors', 2007.4, 0.5, 30, 'Screen off at your ear, brightness that adapts.', ['form_touch']);
T('add_baro', 'features', 'Barometers', 2011.8, 0.4, 25, 'Air pressure for faster GPS fixes and floor detection.', ['feat_gps']);
T('add_projector', 'features', 'Pico projectors', 2012.5, 1.2, 70, 'A tiny laser projector in the phone.', ['disp_color']);
T('add_irblast', 'features', 'IR blasters', 2013.2, 0.4, 25, 'Infrared LED that controls TVs.');
T('add_frontspk', 'features', 'Front-firing speakers', 2013.2, 0.6, 35, 'Stereo speakers facing the listener.', ['feat_stereo']);
T('add_eink', 'features', 'E-ink back displays', 2013.9, 1.2, 70, 'An electronic-paper screen on the back.', ['form_touch']);
T('add_hrm', 'features', 'Heart-rate sensors', 2014.3, 0.6, 35, 'An optical pulse sensor.');
T('add_uvsens', 'features', 'UV-index sensors', 2014.8, 0.3, 20, 'Measures ultraviolet sunlight.');
T('add_thermo', 'features', 'IR thermometers', 2020.5, 0.5, 30, 'A contact-free infrared thermometer.');
T('feat_nfc', 'features', 'NFC payments', 2011, 0.8, 45, 'Tap-to-pay radio.');
T('feat_stylus', 'features', 'Stylus input', 2011.8, 0.8, 45, 'A pen that lives in the phone.', ['disp_capacitive']);
T('os_modern', 'features', 'Modern mobile OS', 2013, 2, 100, 'Polished, secure, cloud-synced.', ['os_touch']);
T('feat_stereo', 'features', 'Stereo speakers', 2013, 0.6, 35, 'Speakers at both ends.');
T('feat_fp', 'features', 'Fingerprint sensor', 2013.5, 1, 60, 'Capacitive fingerprint reader.');
T('feat_haptic', 'features', 'Linear haptics', 2015.5, 0.6, 35, 'Crisp, precise vibrations.', ['feat_vibra']);
T('feat_fpside', 'features', 'Side-key fingerprint', 2017, 0.6, 35, 'Fingerprint reader in the power key.', ['feat_fp']);
T('feat_face3d', 'features', '3D face unlock', 2017.7, 1.6, 90, 'Structured-light depth camera for secure face unlock.', ['form_touch']);
T('feat_fpud', 'features', 'Under-display fingerprint', 2019, 1, 60, 'Optical reader under the screen.', ['feat_fp']);
T('feat_fpus', 'features', 'Ultrasonic fingerprint', 2019.2, 1, 60, 'Sound waves map your finger in 3D, even when wet.', ['feat_fpud']);
T('feat_uwb', 'features', 'Ultra-wideband', 2019.7, 0.6, 35, 'Find things to the centimetre.');
T('feat_sat', 'features', 'Satellite SOS', 2022.7, 1.2, 70, 'Text emergency services from anywhere.', ['net_lte']);
T('os_ai', 'features', 'AI-native OS', 2024.5, 3, 120, 'An on-device assistant woven through everything.', ['os_modern', 'chip_npu']);
T('os_own', 'features', 'In-house operating system', 9999, 10, 240, 'Write your own OS: no more per-unit license fees.', ['os_smart'], { opens: 2004, never: true });

// manufacturing know-how (your own process improvements – no exclusivity)
T('mfg_qc1', 'manufacturing', 'Statistical quality control', 1980, 0.8, 45, 'Defect rates −30% on your own lines.');
T('mfg_auto1', 'manufacturing', 'Pick-and-place automation', 1985, 1, 60, 'Your own assembly costs −15%.', ['mfg_qc1']);
T('mfg_supply1', 'manufacturing', 'Global sourcing', 1990, 0.8, 45, 'All bought parts −4%.');
T('mfg_qc2', 'manufacturing', 'Six Sigma', 1995, 0.8, 45, 'Defect rates −30% more.', ['mfg_qc1']);
T('mfg_auto2', 'manufacturing', 'Lean production', 1998, 1, 60, 'Your own assembly costs −15% more.', ['mfg_auto1']);
T('mfg_supply2', 'manufacturing', 'Just-in-time logistics', 2000, 0.8, 45, 'All bought parts −4% more.', ['mfg_supply1']);
T('mfg_ramp', 'manufacturing', 'Fast production ramp', 2005, 0.8, 45, 'New production lines start 40% sooner.');
T('mfg_tooling', 'manufacturing', 'Rapid tooling', 2008, 1, 60, 'Part design tooling −25% cost and time.');
T('mfg_qc3', 'manufacturing', 'Machine-vision inspection', 2010, 0.9, 50, 'Defect rates −30% more.', ['mfg_qc2']);
T('mfg_supply3', 'manufacturing', 'Supplier co-design', 2012, 0.9, 50, 'All bought parts −4% more.', ['mfg_supply2']);
T('mfg_auto3', 'manufacturing', 'Robotic final assembly', 2015, 1.2, 70, 'Your own assembly costs −15% more.', ['mfg_auto2']);

// business know-how
T('biz_ads1', 'business', 'Television advertising', 1975, 0.8, 45, 'Marketing works 15% better.');
T('biz_retail1', 'business', 'Retail partnerships', 1985, 1, 60, 'Your brand reaches 15% more buyers.');
T('biz_pr', 'business', 'Press & reviewer relations', 1990, 0.8, 45, 'Reviews +0.3.');
T('biz_carrier', 'business', 'Carrier partnerships', 1995, 1.2, 70, 'Carriers stock and subsidize your phones: +15% reach.', ['biz_retail1']);
T('biz_ads2', 'business', 'Mass-market branding', 1996, 1, 60, 'Marketing works 15% better.', ['biz_ads1']);
T('biz_service', 'business', 'Global service network', 2000, 1, 60, 'Repairs everywhere: reputation recovers faster.');
T('biz_stores', 'business', 'Flagship stores', 2005, 1.2, 70, '+10% reach and +0.2 reviews.', ['biz_carrier']);
T('biz_ads3', 'business', 'Digital ad targeting', 2010, 1, 60, 'Marketing works 15% better.', ['biz_ads2']);
T('biz_online', 'business', 'Direct online sales', 2012, 1, 60, 'Sell direct: the retail cut drops from 30% to 25%.', ['biz_stores']);
T('biz_influencer', 'business', 'Creator program', 2016, 0.8, 45, 'Reviews +0.2, awareness grows faster.', ['biz_pr']);

const TECH_CATS = {
  network:  { name: 'Networks & radio', icon: '📶', factory: 'radio', note: 'Before it is standard, needs your own RF Module Plant.' },
  display:  { name: 'Displays', icon: '🖥️', factory: 'display', note: 'Before it is standard, needs your own Display Fab.' },
  camera:   { name: 'Cameras', icon: '📷', factory: 'camera', note: 'Before it is standard, needs your own Camera Module Plant.' },
  battery:  { name: 'Batteries', icon: '🔋', factory: 'battery', note: 'Before it is standard, needs your own Battery Plant.' },
  memory:   { name: 'Memory', icon: '💾', factory: 'memory', note: 'Before it is standard, needs your own Memory Fab.' },
  chip:     { name: 'Chip design', icon: '🧠', factory: null, note: 'Chip blocks and CPU architectures for processors you design in the 🛠️ Parts Lab (💠 Processor). Vendor chips come with the vendor\'s own architecture, so this only matters for your own chips – which skip the vendor\'s markup.' },
  process:  { name: 'Process nodes', icon: '💠', factory: 'fab', note: 'Design chips at a node; build a fab there early.' },
  design:   { name: 'Design & body', icon: '🧩', factory: 'assembly', note: 'Before it is standard, needs your own Assembly Plant.' },
  features: { name: 'Features & software', icon: '✨', factory: 'assembly', note: 'Before it is standard, needs your own Assembly Plant.' },
  manufacturing: { name: 'Manufacturing', icon: '⚙️', factory: null, note: 'Process know-how: takes effect as soon as it is researched.' },
  business: { name: 'Business', icon: '📈', factory: null, note: 'Know-how: takes effect as soon as it is researched.' },
};

// ---- Playstyles -----------------------------------------------------------------
const PLAYSTYLES = {
  brand: { name: 'Design House', icon: '🎨', tagline: 'Design phones people love and let others build them.',
    perks: ['−40% device development cost', '+50% marketing effect', '−15% contract manufacturing fees', 'Starts with 2% brand awareness', 'Part tech comes from suppliers: research is all design, features & business'],
    devMul: 0.6, mkMul: 1.5, feeMul: 0.85, aware: 0.02 },
  maker: { name: 'Manufacturer', icon: '🏭', tagline: 'Own the factories. Build cheap and sell capacity to rivals.',
    perks: ['Starts with a small assembly workshop', '−30% factory cost, −20% upkeep', 'In-house parts 10% cheaper', 'More and better supply contracts', 'Full research tree: invent every part technology yourself'],
    facMul: 0.7, upkeepMul: 0.8, inMul: 0.9, contractMul: 1.6 },
  tech: { name: 'Tech Pioneer', icon: '🔬', tagline: 'Out-invent everyone. Custom parts, exclusive tech, licensing.',
    perks: ['+50% research speed, −30% research cost', '+1 research slot', '−40% part tooling & chip tape-out cost', '+50% licensing royalties', 'Part tech comes from suppliers: build a plant to research its parts early'],
    rsSpeed: 1.5, rsCost: 0.7, rsSlot: 1, tapeMul: 0.6, royaltyMul: 1.5 },
};

// ---- Factories ----------------------------------------------------------------
// cost/upkeep are 2016 values scaled by ECON. cap: units per month.
const FACTORY_TYPES = {
  workshop: { name: 'Assembly Workshop', icon: '🛠️', cost: 70e3, days: 30, upkeep: 2.5e3, cap: 2500, unit: 'devices', spare: 2, pool: 'assembly', assemblyMul: 0.6,
    desc: 'A few benches and soldering stations. Builds your devices at ~60% of contract prices.' },
  assembly: { name: 'Assembly Plant', icon: '🏭', cost: 0.9e6, days: 60, upkeep: 50e3, cap: 40000, unit: 'devices', spare: 2.5, pool: 'assembly', assemblyMul: 0.4,
    desc: 'A proper production line: devices at ~40% of contract prices. Unlocks exclusive design & feature tech.' },
  radio:    { name: 'RF Module Plant', icon: '📶', cost: 3.5e6, days: 120, upkeep: 110e3, cap: 80000, unit: 'radio modules', spare: 1.5, pool: 'radio',
    desc: 'Builds radio modules from your designs at cost. Unlocks exclusive network tech.' },
  display:  { name: 'Display Fab', icon: '🖥️', cost: 14e6, days: 240, upkeep: 300e3, cap: 60000, unit: 'panels', spare: 5, pool: 'display',
    desc: 'Produces your display designs at cost. Unlocks exclusive display tech.' },
  camera:   { name: 'Camera Module Plant', icon: '📷', cost: 3e6, days: 120, upkeep: 110e3, cap: 100000, unit: 'camera modules', spare: 1.8, pool: 'camera',
    desc: 'Builds your camera designs at cost. Unlocks exclusive camera tech.' },
  battery:  { name: 'Battery Cell Plant', icon: '🔋', cost: 2.5e6, days: 120, upkeep: 90e3, cap: 60000, unit: 'cells', spare: 1.2, pool: 'battery',
    desc: 'Makes your battery designs at cost. Unlocks exclusive battery tech.' },
  memory:   { name: 'Memory Fab', icon: '💾', cost: 45e6, days: 360, upkeep: 1.3e6, cap: 250000, unit: 'memory sets', spare: 4.5, pool: 'memory',
    desc: 'DRAM + flash fabrication from your designs at cost. Unlocks exclusive memory tech.' },
  fab:      { name: 'Chip Fab', icon: '💠', cost: 0, days: 420, upkeep: 0, cap: 1000, unit: 'wafers',
    desc: 'A semiconductor fab locked to one process node. Wafers cost you ~30% of the foundry price.' },
  rnd:      { name: 'R&D Center', icon: '🧪', cost: 2e6, days: 90, upkeep: 150e3, cap: 0, unit: '',
    desc: 'Each level adds one parallel research project and +25% research speed.' },
};
const FACTORY_MAX_LEVEL = 5;
const PART_TYPES = ['display', 'camera', 'battery', 'memory', 'radio'];
const PART_INFO = {
  display: { name: 'Display', icon: '🖥️', lab: 'Display Lab', nre: 120e3, days: 60 },
  camera:  { name: 'Camera module', icon: '📷', lab: 'Camera Lab', nre: 60e3, days: 45 },
  battery: { name: 'Battery', icon: '🔋', lab: 'Battery Lab', nre: 40e3, days: 40 },
  memory:  { name: 'Memory package', icon: '💾', lab: 'Memory Lab', nre: 90e3, days: 50 },
  radio:   { name: 'Radio module', icon: '📶', lab: 'Radio Lab', nre: 80e3, days: 50 },
};

// ---- Contract manufacturers ------------------------------------------------------
// fee: multiplier on the era's assembly labor price. tier: most complex device they build.
// cap: units per month per client. lineFee: monthly fee while a line runs there (2016 dollars).
const PARTNERS = [
  { id: 'elmont', name: 'Elmont Radio Works', since: 1955, until: 2001, fee: 1.25, defect: 0.04, cap: 3000, lead: 30, tier: 2, lineFee: 12e3, minRev: 0,
    desc: 'A seasoned radio-equipment assembler. Builds car and bag phones by hand.' },
  { id: 'riverside', name: 'Riverside Workshop', since: 1976, fee: 1.35, defect: 0.05, cap: 6000, lead: 21, tier: 2, lineFee: 6e3, minRev: 0,
    desc: 'A small local assembler. No minimums, quality is so-so.' },
  { id: 'pearl', name: 'Pearl Delta Electronics', since: 1985, fee: 1.0, defect: 0.025, cap: 80000, lead: 30, tier: 3, lineFee: 40e3, minRev: 0,
    desc: 'A big Shenzhen assembler. Solid quality at scale.' },
  { id: 'honsheng', name: 'Hon Sheng Precision', since: 1998, fee: 0.85, defect: 0.008, cap: 2e6, lead: 45, tier: 5, lineFee: 400e3, minRev: 2e6,
    desc: 'The giant. Builds anything at enormous scale – for big clients only.' },
  { id: 'lumos', name: 'Lumos Contract Mfg.', since: 2003, fee: 0.95, defect: 0.015, cap: 300000, lead: 35, tier: 4, lineFee: 120e3, minRev: 150e3,
    desc: 'Modern lines that can build smartphones and metal bodies.' },
];
const TIER_NAMES = ['', 'basic', 'radio/color', 'smartphone', 'flagship', 'cutting-edge'];

// ---- Investors -------------------------------------------------------------------
// amounts are 2016 dollars (scaled by FUND); rev = monthly revenue needed to pitch
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
// aware: brand awareness over time. regions: where they sell (by year). forms: favourite form while fashionable.
const RIVALS = [
  { id: 'bellwether', name: 'Bellwether', color: '#c9a227', aware: [[1973, .55], [1983, .5], [1988, .3], [1992, .08]], skill: 0.97, priceMul: 1.06, rep: 7.6, month: 3,
    segs: { phone: ['mid', 'premium'] }, start: { phone: 1960 }, end: 1992.5, regions: [[1960, ['na']]], form: 'car',
    names: { phone: { mid: 'Bellwether MJ-{n}', premium: 'Bellwether Executive {n}' } } },
  { id: 'halcyon', name: 'Halcyon', color: '#e2504a', aware: [[1973, .45], [1983, .7], [1990, .8], [2004, .85], [2008, .6], [2012, .35], [2040, .2]], skill: 1.0, priceMul: 1.08, rep: 7.9, month: 6.5,
    segs: { phone: ['budget', 'premium', 'ultra'] }, start: { phone: 1965 }, regions: [[1965, ['na']], [1985, ['na', 'eu', 'ea', 'rw']], [1995, ['na', 'eu', 'ea', 'cn', 'rw']]], form: 'flip',
    names: { phone: { budget: 'Halcyon C{n}', premium: 'Halcyon Edge {n}', ultra: 'Halcyon Star {n}' } } },
  { id: 'nordvik', name: 'Nordvik', color: '#3d8bd9', aware: [[1981, .2], [1987, .45], [1994, .7], [1998, .85], [2007, .9], [2011, .7], [2014, .3], [2016, .1]], skill: 1.0, priceMul: 1.0, rep: 8.2, month: 2.5,
    segs: { phone: ['budget', 'mid', 'premium'] }, start: { phone: 1981 }, end: 2016.5, regions: [[1981, ['eu', 'rw']], [1994, ['na', 'eu', 'ea', 'cn', 'rw']]], form: 'candybar',
    names: { phone: { budget: 'Nordvik 1{n}00', mid: 'Nordvik 6{n}30', premium: 'Nordvik N{n}' } } },
  { id: 'kestrel', name: 'Kestrel', color: '#f4a63c', aware: [[1981, .3], [1990, .5], [2001, .55], [2012, .45], [2018, .3], [2021, .2]], skill: 0.96, priceMul: 0.95, rep: 7.5, month: 5.5,
    segs: { phone: ['budget', 'mid', 'premium'], tablet: ['budget'] }, start: { phone: 1981, tablet: 2012 }, end: 2021.3, regions: [[1981, ['eu']], [1995, ['na', 'eu', 'ea', 'cn', 'rw']]], form: 'slider',
    names: { phone: { budget: 'Kestrel E{n}', mid: 'Kestrel G{n}', premium: 'Kestrel X{n}' }, tablet: { budget: 'Kestrel Pad {n}' } } },
  { id: 'kaiden', name: 'Kaiden', color: '#e86fa8', aware: [[1979, .5], [1990, .55], [2000, .6], [2008, .4], [2012, .15]], skill: 1.0, priceMul: 1.04, rep: 7.8, month: 9,
    segs: { phone: ['mid', 'premium'] }, start: { phone: 1979 }, end: 2013, regions: [[1979, ['ea']]], form: 'flip',
    names: { phone: { mid: 'Kaiden P{n}', premium: 'Kaiden Prestige {n}' } } },
  { id: 'nova', name: 'Nova Mobile', color: '#5ea2f7', aware: [[1988, .1], [1996, .3], [2004, .65], [2010, .82], [2040, .85]], skill: 1.0, priceMul: 1.0, rep: 8.0, month: 2.5,
    segs: { phone: ['budget', 'mid', 'premium', 'ultra'], tablet: ['budget', 'mid', 'premium'] }, start: { phone: 1988, tablet: 2010.9 }, regions: [[1988, ['ea']], [1997, ['na', 'eu', 'ea', 'cn', 'rw']]],
    names: { phone: { budget: 'Nova A{n}', mid: 'Nova M{n}', premium: 'Nova S{n}', ultra: 'Nova S{n} Ultra' }, tablet: { budget: 'Nova Tab A{n}', mid: 'Nova Tab {n}', premium: 'Nova Tab S{n}' } } },
  { id: 'cobalt', name: 'Cobalt', color: '#9b6dd6', aware: [[1995, .15], [2003, .45], [2009, .5], [2015, .3], [2021, .1]], skill: 0.95, priceMul: 0.9, rep: 7.3, month: 7.5,
    segs: { phone: ['budget', 'mid', 'premium'] }, start: { phone: 1995 }, end: 2021.5, regions: [[1995, ['ea']], [2002, ['na', 'eu', 'ea', 'cn', 'rw']]], form: 'slider',
    names: { phone: { budget: 'Cobalt K{n}', mid: 'Cobalt G{n}', premium: 'Cobalt V{n}' } } },
  { id: 'keystone', name: 'Keystone', color: '#a98bf5', aware: [[1999, .3], [2005, .55], [2010, .66], [2013, .35], [2016, .08]], skill: 0.9, priceMul: 1.05, rep: 7.6, month: 4,
    segs: { phone: ['mid', 'premium'] }, start: { phone: 1999 }, end: 2016.5, regions: [[1999, ['na', 'eu']], [2006, ['na', 'eu', 'rw']]], form: 'qwerty',
    names: { phone: { mid: 'Keystone Curve {n}', premium: 'Keystone Bold {n}' } } },
  { id: 'orchard', name: 'Orchard', color: '#d4d8e0', aware: [[2007, .6], [2010, .8], [2040, .82]], skill: 1.05, priceMul: 1.18, rep: 8.6, month: 8.5,
    segs: { phone: ['premium', 'ultra'], tablet: ['mid', 'premium', 'ultra'] }, start: { phone: 2007.5, tablet: 2010.25 }, regions: [[2007, ['na', 'eu', 'ea', 'cn', 'rw']]],
    names: { phone: { premium: 'oPhone {n}', ultra: 'oPhone {n} Pro' }, tablet: { mid: 'oPad {n}', premium: 'oPad Air {n}', ultra: 'oPad Pro {n}' } } },
  { id: 'zenith', name: 'Zenith', color: '#3fd09a', aware: [[2011, .2], [2016, .45], [2022, .65], [2040, .7]], skill: 0.92, priceMul: 0.8, rep: 7.0, month: 10.5,
    segs: { phone: ['budget', 'mid', 'premium'], tablet: ['budget', 'mid'] }, start: { phone: 2011, tablet: 2012.5 }, regions: [[2011, ['cn']], [2014, ['cn', 'rw']], [2017, ['cn', 'rw', 'eu', 'ea']]],
    names: { phone: { budget: 'Zenith Lite {n}', mid: 'Zenith {n}', premium: 'Zenith {n} Pro' }, tablet: { budget: 'Zenith Pad Lite {n}', mid: 'Zenith Pad {n}' } } },
];

// ---- Chip vendors (sell off-the-shelf SoCs) ------------------------------------
const VENDORS = [
  { id: 'quasar', name: 'Quasar', series: 'Snapline', month: 1.5, tiers: ['budget', 'mid', 'flagship'] },
  { id: 'helix', name: 'Helix Semi', series: 'Dimension', month: 5.5, tiers: ['budget', 'mid'] },
  { id: 'arcadia', name: 'Arcadia', series: 'Exo', month: 9.5, tiers: ['mid', 'flagship'] },
];
// supplier brand names for standard parts (the mainstream maker of each)
const SUPPLIERS = { display: 'Lumina Panels', camera: 'Optix Imaging', battery: 'Voltacell', memory: 'Microbit Memory', radio: 'Aerial RF' };
// every part type has several suppliers, each releasing a range of models every year.
// lag: years behind the newest technology, mk: markup over what the part costs to make, month: release month
const PART_VENDORS = {
  display: [
    { id: 'lumina', name: 'Lumina Panels', series: 'Vista', style: 'main', month: 2, lag: 0.5, mk: 1.45, desc: 'The industry workhorse: proven panels in every size.' },
    { id: 'kiro', name: 'Kiro Display', series: 'Prism', style: 'premium', month: 8, lag: 0, mk: 1.6, desc: 'The newest panels first – sharper, brighter, thinner, pricier.' },
    { id: 'valor', name: 'Valor Optronics', series: 'Clear', style: 'budget', month: 5, lag: 1.5, mk: 1.32, desc: 'Older panel technology at a discount: thicker and dimmer, but cheap.' },
  ],
  camera: [
    { id: 'optix', name: 'Optix Imaging', series: 'OX', style: 'main', month: 3, lag: 0.5, mk: 1.45, desc: 'Balanced modules for every phone.' },
    { id: 'sennix', name: 'Sennix Optics', series: 'SX', style: 'bigsensor', month: 9, lag: 0, mk: 1.6, desc: 'Big sensors and stabilization: the best photos, but tall modules that stick out.' },
    { id: 'pixelway', name: 'PixelWay', series: 'PW', style: 'compact', month: 6, lag: 0.5, mk: 1.35, desc: 'Small, flat modules for thin phones – fewer pixels, less light.' },
  ],
  battery: [
    { id: 'volta', name: 'Voltacell', series: 'VC', style: 'main', month: 1, lag: 0.5, mk: 1.45, desc: 'Standard cells in every capacity.' },
    { id: 'slimcell', name: 'SlimCell', series: 'SL', style: 'thin', month: 7, lag: 0, mk: 1.5, desc: 'Ultra-thin cells for slim phones: smaller capacities and a higher price per Wh.' },
    { id: 'titan', name: 'Titan Power', series: 'TP', style: 'bulk', month: 4, lag: 1.5, mk: 1.32, desc: 'Big, cheap cells on older chemistry: thick, heavy and slower to charge.' },
  ],
  memory: [
    { id: 'microbit', name: 'Microbit Memory', series: 'MB', style: 'main', month: 2, lag: 0.5, mk: 1.45, desc: 'Mainstream RAM and storage combos.' },
    { id: 'corsa', name: 'Corsa Semiconductor', series: 'CX', style: 'fast', month: 10, lag: 0, mk: 1.6, desc: 'The newest, fastest memory in stacked packages that take little room.' },
    { id: 'densebyte', name: 'DenseByte', series: 'DB', style: 'budget', month: 6, lag: 1, mk: 1.32, desc: 'Lots of storage for little money: slower interfaces and more packages.' },
  ],
  radio: [
    { id: 'aerial', name: 'Aerial RF', series: 'AR', style: 'main', month: 4, lag: 0.5, mk: 1.45, desc: 'Radios for the networks people actually use.' },
    { id: 'wavecom', name: 'Wavecom', series: 'WX', style: 'premium', month: 9, lag: 0, mk: 1.6, desc: 'The newest networks first and every band: works everywhere.' },
    { id: 'kestrel', name: 'Kestrel Wireless', series: 'KW', style: 'budget', month: 6, lag: 1.5, mk: 1.32, desc: 'Cheap modules: fewer bands and an older generation.' },
  ],
};

// ---- Scripted world events ------------------------------------------------------
const EVENTS = [
  { start: 1973.8, end: 1974.6, title: 'Oil crisis', desc: 'Fuel rationing and a recession: car-phone demand −15%, investors cautious.', fx: { demand: 0.85, funding: 0.7 } },
  { start: 1980.0, end: 1980.9, title: 'Recession', desc: 'Double-digit interest rates: demand −10%.', fx: { demand: 0.9, funding: 0.8 } },
  { start: 1987.8, end: 1988.4, title: 'Black Monday', desc: 'Stock markets crash: funding rounds are much harder.', fx: { funding: 0.6 } },
  { start: 1988.1, end: 1989.2, title: 'DRAM shortage', desc: 'Chip trade quotas leave the world short of memory: DRAM prices +60%.', fx: { memory: 1.6 } },
  { start: 1990.6, end: 1991.4, title: 'Early-90s recession', desc: 'Demand −8%.', fx: { demand: 0.92 } },
  { start: 1993.5, end: 1994.2, title: 'Epoxy resin plant explosion', desc: 'The main supplier of chip-packaging resin burns down: memory +30%, chips +10%.', fx: { memory: 1.3, soc: 1.1 } },
  { start: 1997.5, end: 1998.6, title: 'Asian financial crisis', desc: 'Demand −6%, investors pull back.', fx: { demand: 0.94, funding: 0.8 } },
  { start: 1999.7, end: 2000.1, title: 'Taiwan earthquake', desc: 'Fabs in Hsinchu go dark for weeks: memory +25%, chips +10%.', fx: { memory: 1.25, soc: 1.1 } },
  { start: 2000.1, end: 2001.0, title: 'Tantalum capacitor shortage', desc: 'Every phone needs tantalum capacitors and there aren\'t enough: radio modules +18%, chips +8%, cameras +8%.', fx: { radio: 1.18, soc: 1.08, camera: 1.08 } },
  { start: 2000.25, end: 2002.0, title: 'Dot-com crash', desc: 'Tech stocks collapse. Funding rounds are harder to win.', fx: { funding: 0.6 } },
  { start: 2007.3, end: 2008.1, title: 'LCD panel shortage', desc: 'Flat-screen TVs swallow the panel fabs\' output: displays +12%.', fx: { display: 1.12 } },
  { start: 2008.70, end: 2009.60, title: 'Global financial crisis', desc: 'Consumers delay purchases: demand −12%. Investors pull back.', fx: { demand: 0.88, funding: 0.6 } },
  { start: 2009.90, end: 2010.70, title: 'OLED panel shortage', desc: 'Smartphone demand outruns the few AMOLED fabs: displays +15%.', fx: { display: 1.15 } },
  { start: 2011.20, end: 2011.80, title: 'Earthquake hits component suppliers', desc: 'Japanese wafer, battery-material and panel plants stop: displays and memory +20%, batteries +10%.', fx: { display: 1.2, memory: 1.2, battery: 1.1 } },
  { start: 2011.80, end: 2012.60, title: 'Thailand floods', desc: 'Factories under water: storage +15%, camera modules +10%.', fx: { memory: 1.15, camera: 1.1 } },
  { start: 2016.30, end: 2016.90, title: 'Image-sensor fab earthquake', desc: 'The biggest camera-sensor fab is damaged: camera modules +20%.', fx: { camera: 1.2 } },
  { start: 2017.00, end: 2018.80, title: 'DRAM & NAND price surge', desc: 'Data centers hoard memory: memory prices +45%.', fx: { memory: 1.45 } },
  { start: 2019.50, end: 2019.95, title: 'Export controls on fab chemicals', desc: 'Photoresist and etching-gas shipments are restricted: memory +12%, displays +8%.', fx: { memory: 1.12, display: 1.08 } },
  { start: 2020.20, end: 2020.75, title: 'Global pandemic', desc: 'Stores closed worldwide: demand −18%.', fx: { demand: 0.82 } },
  { start: 2020.75, end: 2022.30, title: 'Global chip shortage', desc: 'Foundry wafers +25%, off-the-shelf chips +20%, display drivers +15%, RF chips +12%, image sensors +8%.', fx: { wafer: 1.25, soc: 1.2, display: 1.15, radio: 1.12, camera: 1.08 } },
  { start: 2021.90, end: 2023.20, title: 'Lithium price spike', desc: 'Electric cars buy up lithium: battery cells +35%.', fx: { battery: 1.35 } },
  { start: 2025.50, end: 2026.30, title: 'AI data-center memory crunch', desc: 'Memory prices +35%.', fx: { memory: 1.35 } },
];

// ---- Goals (guided objectives) -----------------------------------------------------
const GOALS = [
  { id: 'proto', text: 'Build a prototype', hint: 'Phone Lab → 🧪 Prototype. Investors want to hold something.' },
  { id: 'raise', text: 'Raise money from investors', hint: 'Investors tab: start with friends & family, then pitch angels with your prototype.' },
  { id: 'launch1', text: 'Launch your first device', hint: 'Phone Lab → Develop & launch.' },
  { id: 'sold100', text: 'Sell 100 devices', hint: 'Production tab: a contract manufacturer builds them; marketing makes people want them.' },
  { id: 'research5', text: 'Research 5 new technologies', hint: 'Research unlocks networks, smaller electronics, better screens and more.' },
  { id: 'design1', text: 'Engineer your own component', hint: 'Parts Labs: design a display, camera, battery, memory or radio of your own.' },
  { id: 'handheld', text: 'Launch a handheld phone', hint: 'Research handheld cellphones and shrink the electronics enough to fit in a hand.' },
  { id: 'factory', text: 'Build your own factory', hint: 'Factories tab: a workshop or assembly plant cuts the contract fee.' },
  { id: 'review8', text: 'Launch a device that reviews 8.0+', hint: 'Beat rivals on quality for the price.' },
  { id: 'bench1', text: 'Top a benchmark leaderboard', hint: 'Benchmarks tab: beat every phone on sale in one category.' },
  { id: 'seriesA', text: 'Close a Series A', hint: 'Grow monthly revenue so big investors take you seriously.' },
  { id: 'chip', text: 'Tape out your own custom chip', hint: 'Parts Lab → 💠 Processor: pick a node and blocks, then send it to the foundry.' },
  { id: 'exclusive', text: 'Research a technology before it becomes industry standard', hint: 'Exclusive tech = an edge nobody can buy.' },
  { id: 'b2b', text: 'Earn money from another brand', hint: 'Supply contracts, selling your chips, or licensing your tech.' },
  { id: 'share5', text: 'Reach 5% of the worldwide phone market', hint: 'Market tab shows share by brand.' },
  { id: 'ipo', text: 'Take the company public', hint: 'An IPO raises a fortune – if your revenue is big enough.' },
  { id: 'fab', text: 'Build your own chip fab', hint: 'Expensive – but wafers cost you a third of foundry prices.' },
  { id: 'top1', text: 'Become the #1 phone brand by monthly sales', hint: 'Out-sell everyone.' },
  { id: 'worth10b', text: 'Reach a $10B net worth', hint: 'An empire!' },
];
