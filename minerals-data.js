// Mineral reference data for Scope · Detect.
// Facts are drawn from public USGS / industry reporting (see README sources).
// Spectral "profiles" use real published wavelengths (NIST Atomic Spectra
// Database, standard AAS analytical lines, NIOSH methods — see each
// mineral's `spectral.source`), plotted as a simple line/intensity chart.
// They are not full laboratory reflectance curves, but the wavelength
// positions themselves are real, sourced values, not invented ones.

const MINERALS = {
  cobalt: {
    name: 'Cobalt',
    symbol: 'Co',
    color: '#5b6ee8',
    summary:
      'A silvery-blue metal alloyed into battery cathodes to keep them stable through thousands of charge cycles.',
    componentImpact:
      'Used in the cathode of lithium-ion batteries (often as lithium cobalt oxide or NMC blends). Cobalt keeps the cathode structurally stable at high charge density, which is what lets a battery hold its capacity over thousands of charge cycles without overheating or breaking down.',
    miningNote:
      'The Democratic Republic of Congo accounts for roughly three-quarters of global cobalt production, more than any other single country.',
    regions: [
      { country: 'Democratic Republic of Congo', lat: -10.7, lng: 25.5, share: '~76% of global supply' },
      { country: 'Indonesia', lat: -2.5, lng: 118.0, share: 'fast-growing secondary source' },
      { country: 'Russia', lat: 61.5, lng: 90.0, share: 'minor producer' },
    ],
    spectral: {
      lines: [
        { nm: 240.7, intensity: 1.0 },
        { nm: 304.4, intensity: 0.55 },
        { nm: 346.6, intensity: 0.4 },
        { nm: 347.4, intensity: 0.35 },
        { nm: 391.0, intensity: 0.25 },
      ],
      source: 'Primary atomic-absorption line at 240.7 nm (cobalt hollow-cathode lamp), with secondary lines per standard AAS references.',
      hue: '#5b6ee8',
    },
  },
  lithium: {
    name: 'Lithium',
    symbol: 'Li',
    color: '#5effb0',
    summary:
      'The lightest metal, prized for storing huge amounts of energy relative to its weight.',
    componentImpact:
      'The core active material in the battery itself — lithium ions shuttle between the electrodes every time the device charges or discharges. It is what makes rechargeable batteries lightweight and fast-charging compared to older battery chemistries.',
    miningNote:
      'Australia, Chile, and China together produce roughly three-quarters of the world\u2019s lithium; much of it comes from Australian hard-rock mines and Chilean brine flats.',
    regions: [
      { country: 'Australia', lat: -25.0, lng: 122.0, share: 'largest producer, ~50%' },
      { country: 'Chile', lat: -23.5, lng: -68.3, share: 'major brine producer' },
      { country: 'China', lat: 32.0, lng: 95.0, share: 'major producer + refiner' },
      { country: 'Argentina', lat: -24.2, lng: -66.9, share: 'Lithium Triangle' },
    ],
    spectral: {
      lines: [
        { nm: 460.3, intensity: 0.25 },
        { nm: 497.2, intensity: 0.2 },
        { nm: 610.4, intensity: 0.45 },
        { nm: 670.8, intensity: 1.0 },
      ],
      source: 'Flame emission lines; 670.8 nm is the strong red line that gives lithium flames their crimson color.',
      hue: '#5effb0',
    },
  },
  tantalum: {
    name: 'Tantalum',
    symbol: 'Ta',
    color: '#ffb13c',
    summary:
      'A dense, heat-resistant metal that holds an electrical charge extremely well in a tiny amount of space.',
    componentImpact:
      'Used to make capacitors on the circuit board. Tantalum capacitors are small but hold a lot of charge, which lets them regulate stable voltage for the processor, memory, and radio even as power demand jumps around during normal use.',
    miningNote:
      'More than 40% of the world\u2019s tantalum comes from the Democratic Republic of Congo, with Rwanda and Brazil also significant producers.',
    regions: [
      { country: 'Democratic Republic of Congo', lat: -2.9, lng: 27.8, share: '~42% of global supply' },
      { country: 'Rwanda', lat: -1.9, lng: 29.9, share: 'major producer' },
      { country: 'Brazil', lat: -15.8, lng: -47.9, share: 'significant producer' },
    ],
    spectral: {
      lines: [
        { nm: 265.33, intensity: 1.0 },
        { nm: 265.66, intensity: 0.7 },
        { nm: 271.47, intensity: 1.0 },
        { nm: 293.36, intensity: 0.7 },
      ],
      source: 'Strongest neutral-tantalum (Ta I) emission lines per the NIST Atomic Spectra Database.',
      hue: '#ffb13c',
    },
  },
  tin: {
    name: 'Tin',
    symbol: 'Sn',
    color: '#9b8cf0',
    summary:
      'A soft, low-melting metal that has been used for joining metal parts for thousands of years.',
    componentImpact:
      'The base of nearly all lead-free solder, the material that physically bonds every chip, connector, and component to the circuit board. Without reliable solder, none of a device\u2019s other components could stay electrically connected.',
    miningNote:
      'Indonesia, China, and the Democratic Republic of Congo are among the largest tin producers, much of it mined as the ore cassiterite.',
    regions: [
      { country: 'Indonesia', lat: -0.8, lng: 117.0, share: 'top producer' },
      { country: 'China', lat: 23.4, lng: 108.3, share: 'major producer' },
      { country: 'Democratic Republic of Congo', lat: -6.5, lng: 27.0, share: 'significant producer' },
      { country: 'Peru', lat: -9.2, lng: -75.0, share: 'significant producer' },
    ],
    spectral: {
      lines: [
        { nm: 224.6, intensity: 1.0 },
        { nm: 235.5, intensity: 0.6 },
      ],
      source: 'Standard tin AAS analytical wavelengths (224.6 nm primary, 235.5 nm secondary).',
      hue: '#9b8cf0',
    },
  },
  tungsten: {
    name: 'Tungsten',
    symbol: 'W',
    color: '#ff6b5e',
    summary:
      'One of the hardest, most heat-resistant metals known, valued for components that need to survive vibration.',
    componentImpact:
      'Used in tiny vibration motors and some circuit interconnects. Its weight and durability make it ideal for the small spinning motor that produces haptic buzz, and as a wear-resistant lining inside some chip interconnects.',
    miningNote:
      'China dominates tungsten production, accounting for roughly 83% of global supply.',
    regions: [
      { country: 'China', lat: 27.0, lng: 113.0, share: '~83% of global supply' },
      { country: 'Vietnam', lat: 21.0, lng: 105.8, share: 'secondary producer' },
      { country: 'Russia', lat: 56.0, lng: 105.0, share: 'secondary producer' },
    ],
    spectral: {
      lines: [{ nm: 255.1, intensity: 1.0 }],
      source: 'Standard tungsten AAS analytical wavelength (NIOSH Method 7074).',
      hue: '#ff6b5e',
    },
  },
  gold: {
    name: 'Gold',
    symbol: 'Au',
    color: '#ffd75e',
    summary:
      'Prized for never corroding, which matters enormously for tiny electrical contacts.',
    componentImpact:
      'Plated onto connectors, circuit board contacts, and wire bonds inside chips. Gold never tarnishes, so it keeps a perfect, low-resistance electrical connection at points that would otherwise corrode and fail over a device\u2019s lifetime.',
    miningNote:
      'China, Australia, and Russia are the largest gold producers; mining occurs on every continent except Antarctica.',
    regions: [
      { country: 'China', lat: 35.0, lng: 103.0, share: 'top producer' },
      { country: 'Australia', lat: -30.0, lng: 121.5, share: 'major producer' },
      { country: 'Russia', lat: 60.0, lng: 100.0, share: 'major producer' },
      { country: 'South Africa', lat: -26.2, lng: 28.0, share: 'historic major producer' },
    ],
    spectral: {
      lines: [
        { nm: 242.8, intensity: 1.0 },
        { nm: 267.6, intensity: 0.5 },
      ],
      source: 'Standard gold AAS analytical wavelengths (242.8 nm primary, 267.6 nm secondary).',
      hue: '#ffd75e',
    },
  },
  rare_earths: {
    name: 'Rare Earth Elements',
    symbol: 'REE',
    color: '#e85bd0',
    summary:
      'A group of 17 elements whose magnetic and optical properties have no easy substitutes.',
    componentImpact:
      'Elements like neodymium and praseodymium form the powerful magnets in speakers, microphones, and vibration motors. Without them, a device\u2019s speaker would need to be far larger to produce the same sound.',
    miningNote:
      'China controls roughly 60\u201369% of global rare earth mining and an even larger share of the specialized refining needed to separate individual elements.',
    regions: [
      { country: 'China', lat: 41.8, lng: 109.9, share: '~69% of global supply' },
      { country: 'United States', lat: 35.5, lng: -115.5, share: 'Mountain Pass mine' },
      { country: 'Myanmar', lat: 21.9, lng: 95.9, share: 'significant producer' },
      { country: 'Australia', lat: -28.0, lng: 122.0, share: 'significant producer' },
    ],
    spectral: {
      lines: [
        { nm: 430.4, intensity: 0.6 },
        { nm: 521.0, intensity: 0.45 },
        { nm: 575.0, intensity: 0.5 },
        { nm: 740.0, intensity: 0.4 },
      ],
      source: 'Characteristic emission/absorption peaks of neodymium, the rare earth used in magnets — shown as a representative example since "rare earths" covers 17 distinct elements.',
      hue: '#e85bd0',
    },
  },
};

// Which minerals show up for each detected object, in display order.
const DEVICE_MINERAL_MAP = {
  phone: ['lithium', 'cobalt', 'tantalum', 'tin', 'gold', 'tungsten', 'rare_earths'],
  'mobile phone': ['lithium', 'cobalt', 'tantalum', 'tin', 'gold', 'tungsten', 'rare_earths'],
  'cell phone': ['lithium', 'cobalt', 'tantalum', 'tin', 'gold', 'tungsten', 'rare_earths'],
  laptop: ['lithium', 'cobalt', 'tantalum', 'tin', 'gold', 'tungsten', 'rare_earths'],
  notebook: ['lithium', 'cobalt', 'tantalum', 'tin', 'gold', 'tungsten', 'rare_earths'],
  headphones: ['rare_earths', 'tin', 'gold', 'lithium'],
  earphones: ['rare_earths', 'tin', 'gold', 'lithium'],
  headphone: ['rare_earths', 'tin', 'gold', 'lithium'],
  battery: ['lithium', 'cobalt'],
  'coin cell': ['lithium'],
  coincell: ['lithium'],
  '9v': ['lithium', 'cobalt'],
  drycell: ['lithium', 'cobalt'],
  'cylindrical battery': ['lithium', 'cobalt'],
};

/**
 * Look up the mineral list for a detected label. Falls back to a generic
 * electronics set if the label isn't recognized, so the panel never comes
 * up empty for an unmapped class name from the model.
 */
function getMineralsForLabel(label) {
  if (!label) return [];
  const key = String(label).trim().toLowerCase();

  if (DEVICE_MINERAL_MAP[key]) return DEVICE_MINERAL_MAP[key];

  // Loose contains-match for label variants like "smartphone" or "laptop_v2"
  for (const mapKey of Object.keys(DEVICE_MINERAL_MAP)) {
    if (key.includes(mapKey) || mapKey.includes(key)) {
      return DEVICE_MINERAL_MAP[mapKey];
    }
  }

  return ['lithium', 'cobalt', 'tin', 'gold'];
}

window.MINERALS = MINERALS;
window.getMineralsForLabel = getMineralsForLabel;
