(() => {
  const els = {
    select: document.getElementById('object-select'),
    analyzeBtn: document.getElementById('analyze-object'),
    state: document.getElementById('report-state'),
    content: document.getElementById('report-content'),
  };

  let selectedObject = '';
  let lastOptions = [];
  let loading = false;
  let clearOptionsTimer = null;

  const SOURCE_LINKS = [
    { label: 'USGS Critical Minerals', url: 'https://www.usgs.gov/mission-areas/national-minerals-information-center/critical-minerals' },
    { label: 'USGS Spectral Library', url: 'https://www.usgs.gov/labs/spec-lab/capabilities/spectral-library' },
    { label: 'EPA battery recycling guidance', url: 'https://www.epa.gov/recycle/used-household-batteries' },
    { label: 'Call2Recycle locator', url: 'https://www.call2recycle.org/locator/' },
    { label: 'Earth911 recycling search', url: 'https://search.earth911.com/' },
  ];

  const SENSOR_OPTIONS = {
    landsat: {
      name: 'Landsat 8/9',
      bands: ['Visible', 'NIR', 'SWIR 1.6 um', 'SWIR 2.2 um', 'Thermal'],
      bestFor: 'regional screening of iron oxides, vegetation masking, burn scars, and broad SWIR alteration patterns.',
      limits: 'Landsat pixels are broad and bands are wide, so it cannot confirm a specific critical mineral by itself.',
    },
    sentinel2: {
      name: 'Sentinel-2',
      bands: ['Visible', 'Red edge', 'NIR', 'SWIR 1.6 um', 'SWIR 2.2 um'],
      bestFor: 'higher-detail surface mapping, vegetation masking, iron oxide color, and some clay or moisture-related SWIR patterns.',
      limits: 'Sentinel-2 is useful for mapping alteration zones, but most critical minerals still need field or lab confirmation.',
    },
    aster: {
      name: 'ASTER',
      bands: ['Visible/NIR', 'SWIR', 'Thermal infrared'],
      bestFor: 'mineral exploration because its SWIR and thermal bands help separate clays, carbonates, silica, and iron oxides.',
      limits: 'ASTER is stronger for alteration minerals than for directly identifying metals inside ore minerals.',
    },
    hyperspectral: {
      name: 'Hyperspectral',
      bands: ['Many narrow VNIR bands', 'Many narrow SWIR bands'],
      bestFor: 'detailed spectral fingerprinting of minerals with narrow absorption features, especially clays, rare-earth minerals, and alteration halos.',
      limits: 'Hyperspectral data is powerful, but weathering, vegetation, mixing, and surface cover can still hide minerals.',
    },
  };

  const FALLBACK_MINERALS = {
    battery: [
      mineral('Lithium', 'Cathode active material and electrolyte salt', 'inside lithium-ion cell cathodes and electrolyte', 'High', 'Lithium-ion batteries depend on lithium chemistry and demand is supply-chain sensitive.', 'Spodumene and lithium-bearing clays show diagnostic SWIR hydroxyl/water features near 1410, 1910, and 2200 nm; elemental lithium is commonly verified by the 670.8 nm emission line in lab spectroscopy.', 'SWIR around 2200 nm for minerals; 670.8 nm for elemental emission.'),
      mineral('Cobalt', 'Stabilizes many high-energy cathodes', 'layered cathode material in some lithium-ion batteries', 'High', 'Cobalt improves performance but has concentrated supply and social-risk concerns.', 'Cobalt-bearing minerals can show visible to near-infrared crystal-field absorptions around 500 to 600 nm and near 1000 to 1200 nm depending on host mineral.', 'VNIR/SWIR around 550 nm and 1000 to 1200 nm.'),
      mineral('Nickel', 'Raises energy density in NMC and NCA cathodes', 'cathode active material in many rechargeable batteries', 'High', 'Battery-grade nickel has refining constraints and rising demand.', 'Nickel laterite minerals commonly show Fe-OH and Mg-OH absorptions near 1400, 1900, 2200, and 2300 nm.', 'SWIR near 2200 to 2350 nm.'),
      mineral('Graphite', 'Stores lithium ions during charging', 'anode coating on copper current collector', 'High', 'Natural graphite and synthetic graphite are strategic battery materials.', 'Graphite is dark and broadly absorptive with a mostly featureless VNIR/SWIR reflectance curve, so it is often identified by low reflectance plus lab Raman bands near 1350 and 1580 cm-1.', 'Raman spectroscopy near 1350 and 1580 cm-1; broadband VNIR darkness is supportive but not unique.'),
      mineral('Manganese', 'Supports cathode stability in NMC and alkaline cells', 'cathode material in NMC lithium-ion or manganese dioxide cells', 'Medium', 'Manganese is abundant but high-purity battery material can be supply constrained.', 'Manganese oxides are generally dark with broad visible absorptions and diagnostic lab features that vary by oxide phase.', 'Visible/NIR broad absorptions; lab XRF or Raman is usually more reliable.'),
    ],
    electronics: [
      mineral('Copper', 'Carries electrical current', 'circuit boards, wiring, coils, ports, and connectors', 'Medium', 'Copper is not always listed as critical, but electronics depend heavily on it and high-grade ore supply is pressured.', 'Copper oxides and carbonates can show absorptions near 900 nm and Al-OH/Cu-OH related SWIR features near 2200 to 2350 nm depending on mineral.', 'VNIR near 900 nm and SWIR near 2200 to 2350 nm.'),
      mineral('Tantalum', 'Stores and filters charge in capacitors', 'small capacitors on circuit boards', 'High', 'Tantalum has concentrated sources and is important for miniaturized electronics.', 'Tantalum minerals such as tantalite are dark, dense oxides with weak reflectance features; identification usually relies on XRF, LIBS, or Raman rather than simple VNIR reflectance.', 'XRF/LIBS elemental detection is preferred; VNIR reflectance is not strongly diagnostic.'),
      mineral('Tin', 'Solder joins components', 'solder joints on circuit boards', 'Medium', 'Tin is essential for solder and has supply-chain and recycling importance.', 'Cassiterite is commonly identified in lab or field by SWIR features affected by iron and hydroxyl-bearing alteration minerals, but elemental tin is better measured by XRF.', 'XRF for tin; SWIR alteration context around 2200 nm can help in ore mapping.'),
      mineral('Gold', 'Resists corrosion in high-reliability contacts', 'thin plating on connectors and some board contacts', 'Medium', 'Gold is valuable, recoverable, and used where stable conductivity matters.', 'Native gold has high reflectance in red/NIR and lower reflectance in blue-green, but in electronics it is usually too thin for remote spectral mapping.', 'Visible/NIR reflectance can identify native gold in lab settings; XRF is better for plated electronics.'),
      mineral('Rare earth elements', 'Enable strong magnets, vibration motors, speakers, and some displays', 'tiny magnets in speakers, haptics, motors, and sensors', 'High', 'Rare earth supply and separation capacity are geographically concentrated.', 'Nd and other rare-earth-bearing minerals can show narrow absorptions, including features near 580, 740, 800, and 870 nm depending on element and host.', 'High-resolution VNIR around 580 to 900 nm.'),
    ],
    vehicle: [
      mineral('Lithium', 'Stores energy in traction or accessory batteries', 'battery pack or smaller rechargeable cells', 'High', 'Vehicle electrification strongly increases lithium demand.', 'Lithium minerals show SWIR water and hydroxyl features around 1410, 1910, and 2200 nm; lab emission at 670.8 nm is diagnostic for Li.', 'SWIR near 2200 nm for minerals; 670.8 nm emission in lab.'),
      mineral('Platinum group metals', 'Catalyze exhaust reactions in gasoline vehicles', 'catalytic converter', 'High', 'PGMs are scarce and highly valuable recycling targets.', 'Platinum, palladium, and rhodium are best confirmed by XRF, ICP, or fire assay; they do not have simple diagnostic VNIR reflectance features in a converter.', 'XRF or lab assay, not VNIR reflectance.'),
      mineral('Rare earth elements', 'Make compact permanent magnets', 'motors, sensors, speakers, and some alternators', 'High', 'High-performance magnets depend on neodymium and dysprosium supply chains.', 'Rare-earth minerals may show narrow VNIR absorptions around 580 to 900 nm, especially for Nd-bearing phases.', 'High-resolution VNIR around 580 to 900 nm.'),
      mineral('Copper', 'Carries power and signals', 'wiring harnesses, motors, power electronics, and charging hardware', 'Medium', 'Electrified vehicles use large amounts of copper.', 'Copper minerals show VNIR/SWIR features near 900 nm and 2200 to 2350 nm depending on mineralogy.', 'VNIR near 900 nm and SWIR near 2200 to 2350 nm.'),
    ],
    general: [
      mineral('Aluminum', 'Lightweight frame, casing, or structural part', 'outer body, frame, heat sink, or housing', 'Medium', 'Aluminum is widely used because it is light, conductive, and recyclable.', 'Bauxite-associated minerals commonly show Al-OH absorptions near 2160 to 2210 nm in SWIR.', 'SWIR near 2160 to 2210 nm.'),
      mineral('Iron', 'Strength, screws, motors, and magnetic parts', 'fasteners, brackets, steel parts, or motors', 'Low', 'Iron is abundant, but it controls the structure of many products.', 'Iron oxides show strong visible and near-infrared absorptions, commonly near 530, 670, 870, and 900 nm depending on phase.', 'VNIR around 530 to 900 nm.'),
      mineral('Copper', 'Electrical conduction', 'wires, coils, motors, and circuit boards if present', 'Medium', 'Copper demand is rising with electrification.', 'Copper minerals can show features near 900 nm and SWIR features near 2200 to 2350 nm depending on mineral.', 'VNIR near 900 nm and SWIR near 2200 to 2350 nm.'),
    ],
  };

  const SUPPLY_LOCATIONS = {
    lithium: [
      location('Australia', -25.3, 133.8, 'Hard-rock spodumene mining'),
      location('Chile', -23.4, -68.8, 'Atacama brines'),
      location('Argentina', -24.8, -66.9, 'Lithium Triangle brines'),
      location('China', 32.1, 90.2, 'Brines and hard-rock supply'),
    ],
    cobalt: [
      location('DR Congo', -3.4, 23.6, 'Largest mined cobalt source'),
      location('Indonesia', -2.5, 121.0, 'Nickel-cobalt laterites'),
      location('Russia', 61.5, 105.3, 'Nickel-cobalt deposits'),
      location('Australia', -25.3, 133.8, 'Cobalt resources'),
    ],
    nickel: [
      location('Indonesia', -2.5, 121.0, 'Largest mined nickel source'),
      location('Philippines', 12.9, 122.0, 'Laterite nickel mining'),
      location('Russia', 61.5, 105.3, 'Sulfide nickel deposits'),
      location('Canada', 56.1, -106.3, 'Sulfide nickel districts'),
      location('Australia', -25.3, 133.8, 'Nickel resources'),
    ],
    graphite: [
      location('China', 35.9, 104.2, 'Dominant natural graphite producer'),
      location('Mozambique', -18.7, 35.5, 'Natural graphite mining'),
      location('Madagascar', -18.8, 46.9, 'Flake graphite deposits'),
      location('Brazil', -14.2, -51.9, 'Natural graphite production'),
    ],
    manganese: [
      location('South Africa', -30.6, 22.9, 'Kalahari manganese field'),
      location('Gabon', -0.8, 11.6, 'High-grade manganese ore'),
      location('Australia', -25.3, 133.8, 'Manganese mining'),
      location('Ghana', 7.9, -1.0, 'Manganese ore production'),
      location('Brazil', -14.2, -51.9, 'Manganese resources'),
    ],
    copper: [
      location('Chile', -30.0, -71.0, 'Largest mined copper source'),
      location('Peru', -9.2, -75.0, 'Major Andean copper mines'),
      location('DR Congo', -10.8, 26.0, 'Central African Copperbelt'),
      location('China', 35.9, 104.2, 'Mining and refining'),
      location('United States', 37.1, -113.5, 'Southwest copper districts'),
    ],
    tantalum: [
      location('DR Congo', -2.8, 28.0, 'Coltan/tantalite supply'),
      location('Rwanda', -1.9, 29.9, 'Tantalum concentrate production'),
      location('Brazil', -5.8, -60.2, 'Tantalum-bearing pegmatites'),
      location('Australia', -25.3, 133.8, 'Tantalum resources'),
    ],
    tin: [
      location('China', 25.0, 102.7, 'Major tin mining and smelting'),
      location('Indonesia', -2.2, 106.1, 'Bangka-Belitung tin belt'),
      location('Myanmar', 21.9, 96.1, 'Tin mining districts'),
      location('Peru', -14.0, -70.0, 'Andean tin deposits'),
      location('Bolivia', -17.0, -66.0, 'Historic tin belt'),
    ],
    gold: [
      location('China', 35.9, 104.2, 'Major gold producer'),
      location('Australia', -25.3, 133.8, 'Major gold producer'),
      location('Russia', 61.5, 105.3, 'Major gold producer'),
      location('Canada', 56.1, -106.3, 'Major gold districts'),
      location('United States', 39.0, -116.6, 'Nevada and western districts'),
    ],
    'rare earth elements': [
      location('China', 36.8, 105.0, 'Largest rare earth mining and separation hub'),
      location('United States', 35.5, -115.5, 'Mountain Pass rare earth mine'),
      location('Australia', -25.3, 133.8, 'Rare earth mining and projects'),
      location('Myanmar', 22.0, 98.0, 'Heavy rare earth ion-adsorption supply'),
    ],
    'platinum group metals': [
      location('South Africa', -25.5, 28.5, 'Bushveld Complex'),
      location('Russia', 69.3, 88.2, 'Norilsk nickel-PGM deposits'),
      location('Zimbabwe', -19.0, 29.8, 'Great Dyke PGM deposits'),
      location('Canada', 46.5, -81.0, 'Sudbury and related districts'),
    ],
    aluminum: [
      location('Australia', -17.5, 145.0, 'Bauxite mining'),
      location('Guinea', 10.4, -10.9, 'Major bauxite reserves'),
      location('China', 35.9, 104.2, 'Bauxite and aluminum refining'),
      location('Brazil', -3.5, -52.0, 'Amazon bauxite districts'),
      location('India', 21.0, 82.0, 'Bauxite mining'),
    ],
    iron: [
      location('Australia', -22.3, 118.0, 'Pilbara iron ore'),
      location('Brazil', -19.6, -43.9, 'Minas Gerais and Carajas'),
      location('China', 41.0, 119.0, 'Iron ore mining'),
      location('India', 21.0, 82.0, 'Iron ore mining'),
      location('Russia', 55.0, 60.0, 'Iron ore districts'),
    ],
  };

  function mineral(name, usage, location, criticality, why, spectralProfile, bestWavelengths) {
    return { name, usage, location, criticality, why, spectralProfile, bestWavelengths };
  }

  function location(name, lat, lon, note) {
    return { name, lat, lon, note };
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function objectKey(label) {
    const text = String(label || '').toLowerCase();
    if (/car|vehicle|truck|bike|scooter|motorcycle|ev/.test(text)) return 'vehicle';
    if (/battery|cell|power bank|powerbank/.test(text)) return 'battery';
    if (/phone|laptop|computer|tablet|keyboard|mouse|camera|speaker|screen|monitor|remote|watch|headphone|earbud|drone|circuit|electronic/.test(text)) return 'electronics';
    return 'general';
  }

  function mayContainBattery(label) {
    return /battery|cell|phone|laptop|tablet|camera|remote|watch|headphone|earbud|power|ev|vehicle|car|drone|toy|speaker/.test(String(label || '').toLowerCase());
  }

  function handleDetectionOptions(detections) {
    const hasDetections = Array.isArray(detections) && detections.length > 0;

    if (hasDetections) {
      if (clearOptionsTimer) {
        clearTimeout(clearOptionsTimer);
        clearOptionsTimer = null;
      }
      updateOptions(detections);
      return;
    }

    if (!lastOptions.length) {
      updateOptions([]);
      return;
    }

    if (clearOptionsTimer) return;
    clearOptionsTimer = setTimeout(() => {
      clearOptionsTimer = null;
      updateOptions([]);
    }, 4000);
  }

  function updateOptions(detections) {
    const unique = [];
    const seen = new Set();

    (detections || [])
      .slice()
      .sort((a, b) => (b.value || 0) - (a.value || 0))
      .forEach((d) => {
        const label = String(d.label || '').trim();
        const key = label.toLowerCase();
        if (!label || seen.has(key)) return;
        seen.add(key);
        unique.push({ label, value: d.value || 0 });
      });

    lastOptions = unique;
    els.select.innerHTML = '';

    if (!unique.length) {
      selectedObject = '';
      window.__selectedObject = '';
      els.select.disabled = true;
      els.analyzeBtn.disabled = true;
      els.select.appendChild(new Option('No detected objects yet', ''));
      return;
    }

    els.select.disabled = false;
    els.analyzeBtn.disabled = loading;

    unique.forEach((d) => {
      const confidence = d.value ? ` (${Math.round(d.value * 100)}%)` : '';
      els.select.appendChild(new Option(d.label + confidence, d.label));
    });

    if (!selectedObject || !unique.some((d) => d.label === selectedObject)) {
      selectedObject = unique[0].label;
    }
    els.select.value = selectedObject;
    window.__selectedObject = selectedObject;
  }

  async function analyzeSelected() {
    if (!selectedObject || loading) return;
    loading = true;
    els.analyzeBtn.disabled = true;
    els.state.hidden = false;
    els.content.hidden = true;
    els.state.textContent = 'Building mineral profile for ' + selectedObject + '...';

    let report = null;
    try {
      const response = await fetch('/api/mineral-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          object: selectedObject,
          detections: lastOptions,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.report) report = normalizeReport(data.report);
    } catch {
      report = null;
    }

    if (!report) {
      report = buildFallbackReport(selectedObject);
    }

    renderReport(report);
    loading = false;
    els.analyzeBtn.disabled = !selectedObject;
  }

  function buildFallbackReport(label) {
    const key = objectKey(label);
    const minerals = FALLBACK_MINERALS[key] || FALLBACK_MINERALS.general;
    return normalizeReport({
      object: label,
      summary: 'This is a representative critical-minerals profile based on common materials in this object type. Use Gemini chat for follow-up questions about a specific brand, model, or part.',
      minerals,
      mapLocations: minerals.slice(0, 5).map((m, i) => ({
        label: m.name,
        location: m.location,
        x: [24, 72, 48, 29, 68][i] || 50,
        y: [28, 36, 56, 72, 76][i] || 50,
      })),
      battery: mayContainBattery(label) ? batteryGuidance(label) : null,
      sources: SOURCE_LINKS,
    });
  }

  function inferBatteryType(label) {
    const text = String(label || '').toLowerCase();
    if (/car battery|lead acid|lead-acid|motorcycle battery/.test(text)) return 'lead-acid';
    if (/button|coin|key fob|hearing aid|calculator/.test(text)) return 'button-cell';
    if (/remote|alkaline|aa|aaa|flashlight|toy|clock|mouse|keyboard/.test(text)) return 'alkaline';
    if (/car|vehicle|truck|ev|scooter|bike|drone|phone|laptop|tablet|camera|watch|headphone|earbud|speaker|power bank|powerbank/.test(text)) return 'lithium-ion';
    return 'general rechargeable';
  }

  function batteryGuidance(label) {
    const type = inferBatteryType(label || selectedObject);
    const sharedWhere = [
      'Search nearby drop-off sites with Call2Recycle or Earth911.',
      'Many electronics retailers, municipal household hazardous waste sites, and campus e-waste programs accept batteries or battery-containing devices.',
    ];

    if (type === 'alkaline') {
      return {
        applies: true,
        type,
        why: 'This object most likely uses alkaline cells. Alkaline batteries contain zinc, manganese dioxide, and steel, so recycling can recover materials and keep large quantities of household batteries out of regular waste.',
        how: [
          'Remove AA, AAA, C, D, or 9V alkaline cells only if the battery compartment opens normally.',
          'Store cells in a dry container. Tape 9V terminals so they cannot touch metal or other batteries.',
          'Use a household battery recycling box or local hazardous waste collection site if your community collects alkaline batteries.',
          'Bag leaking batteries separately and ask your local waste program how to handle them.',
        ],
        where: sharedWhere,
      };
    }

    if (type === 'button-cell') {
      return {
        applies: true,
        type,
        why: 'This object may use a button or coin cell. These small batteries can be dangerous if swallowed and may contain lithium, silver oxide, zinc-air, or alkaline chemistries.',
        how: [
          'Remove the button cell only if the compartment is designed to open safely.',
          'Tape both sides of loose coin or button cells before storage or drop-off.',
          'Keep them away from children and pets while waiting to recycle them.',
          'Use a battery drop-off site, pharmacy collection option, electronics retailer, or household hazardous waste program.',
        ],
        where: sharedWhere,
      };
    }

    if (type === 'lead-acid') {
      return {
        applies: true,
        type,
        why: 'This object may use a lead-acid battery. Lead-acid batteries are highly recyclable but contain lead and sulfuric acid, so they need dedicated handling.',
        how: [
          'Keep the battery upright and avoid touching any leaking fluid.',
          'Take it to an auto-parts store, battery retailer, repair shop, or household hazardous waste site.',
          'Do not place lead-acid batteries in curbside recycling or trash.',
          'If cracked or leaking, contact your local hazardous waste program before transporting it.',
        ],
        where: [
          'Auto-parts stores and battery retailers commonly accept lead-acid batteries.',
          ...sharedWhere,
        ],
      };
    }

    if (type === 'lithium-ion') {
      return {
        applies: true,
        type,
        why: 'This object most likely uses a lithium-ion battery. Lithium-ion batteries can start fires if crushed, punctured, or short-circuited, and recycling can recover lithium, cobalt, nickel, copper, steel, and graphite.',
        how: [
          'Do not put lithium-ion batteries or battery-containing electronics in curbside trash or standard recycling bins.',
          'Power the device down. Remove the battery only if the object is designed for safe battery removal.',
          'Cover exposed terminals with clear tape and keep batteries cool, dry, and separated from metal objects.',
          'Recycle the whole device at an electronics collection site if the battery is built in.',
          'For damaged, swollen, leaking, hot, or smoking batteries, contact your city or county household hazardous waste program before moving them.',
        ],
        where: sharedWhere,
      };
    }

    return {
      applies: true,
      type,
      why: 'Battery recycling reduces fire risk, keeps battery chemicals out of regular waste streams, and recovers useful metals.',
      how: [
        'Identify the battery type from the label or product manual when possible.',
        'Cover exposed terminals with clear tape and keep batteries cool, dry, and separated from metal objects.',
        'Use a battery or electronics drop-off site instead of curbside trash.',
      ],
      where: sharedWhere,
    };
  }

  function normalizeReport(report) {
    const minerals = Array.isArray(report.minerals) ? report.minerals : [];
    const safeMinerals = minerals.map((m) => ({
      name: m.name || 'Unknown mineral',
      usage: m.usage || 'Used in this object.',
      location: m.location || 'Likely in an internal component.',
      criticality: m.criticality || 'Medium',
      why: m.why || 'Important to performance, supply chain, or recyclability.',
      spectralProfile: m.spectralProfile || 'No simple diagnostic reflectance profile is available for this material in this object form.',
      bestWavelengths: m.bestWavelengths || 'Use lab confirmation when reflectance is not diagnostic.',
      supplyLocations: normalizeSupplyLocations(m.supplyLocations, m.name),
    }));

    return {
      object: report.object || selectedObject || 'selected object',
      summary: report.summary || 'Likely critical minerals for the selected object.',
      minerals: safeMinerals.length ? safeMinerals : FALLBACK_MINERALS.general,
      mapLocations: Array.isArray(report.mapLocations) && report.mapLocations.length
        ? report.mapLocations
        : safeMinerals.slice(0, 5).map((m, i) => ({ label: m.name, location: m.location, x: 25 + i * 12, y: 35 + (i % 3) * 16 })),
      battery: report.battery && report.battery.applies ? report.battery : (mayContainBattery(report.object || selectedObject) ? batteryGuidance(report.object || selectedObject) : null),
      sources: Array.isArray(report.sources) && report.sources.length ? report.sources : SOURCE_LINKS,
    };
  }

  function criticalityClass(value) {
    const text = String(value || '').toLowerCase();
    if (text.includes('high')) return 'high';
    if (text.includes('low')) return 'low';
    return 'medium';
  }

  function renderReport(report) {
    els.state.hidden = true;
    els.content.hidden = false;

    const mineralsHtml = report.minerals.map((m) => `
      <article class="mineral-card">
        <h3>${escapeHtml(m.name)}</h3>
        <div class="mineral-meta">
          <span class="pill ${criticalityClass(m.criticality)}">${escapeHtml(m.criticality)} criticality</span>
          <span class="pill">${escapeHtml(m.location)}</span>
        </div>
        <p><strong>Use:</strong> ${escapeHtml(m.usage)}</p>
        <p><strong>Why critical:</strong> ${escapeHtml(m.why)}</p>
        ${renderMineralWorldMap(m)}
      </article>
    `).join('');

    const spectralRows = report.minerals.map((m) => `
      <tr>
        <td>${escapeHtml(m.name)}</td>
        <td>${escapeHtml(m.spectralProfile)}</td>
        <td>${escapeHtml(m.bestWavelengths)}</td>
      </tr>
    `).join('');

    const spectralVisuals = report.minerals.map((m) => renderSpectralVisual(m)).join('');
    const remoteSensingHtml = renderRemoteSensingMode(report, 'sentinel2');

    const mapNodes = report.mapLocations.slice(0, 7).map((node, index) => {
      const x = clamp(Number(node.x) || 50 + index * 5, 14, 86);
      const y = clamp(Number(node.y) || 42 + index * 6, 16, 84);
      return `
        <div class="map-node" style="left:${x}%;top:${y}%;">
          <strong>${escapeHtml(node.label || 'Mineral')}</strong>
          ${escapeHtml(node.location || 'Likely component location')}
        </div>
      `;
    }).join('');

    const batteryHtml = report.battery ? `
      <div class="panel">
        <h2>Battery recycling</h2>
        <p class="report-subtitle">${escapeHtml(report.battery.why || batteryGuidance(report.object).why)}</p>
        <ul class="recycling-list">
          ${(report.battery.how || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
          ${(report.battery.where || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
      </div>
    ` : '';

    const sourcesHtml = (report.sources || SOURCE_LINKS).map((source) => {
      const label = escapeHtml(source.label || source.url || 'Source');
      const url = escapeHtml(source.url || '#');
      return `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a></li>`;
    }).join('');

    els.content.innerHTML = `
      <div class="report-header">
        <div>
          <h2 class="report-title">${escapeHtml(report.object)}</h2>
          <p class="report-subtitle">${escapeHtml(report.summary)}</p>
        </div>
      </div>

      <div class="report-grid">
        <div class="panel">
          <h2>Critical minerals in this object</h2>
          <div class="mineral-list">${mineralsHtml}</div>
        </div>

        <div class="panel object-map">
          <h2>Component map</h2>
          <div class="map-stage">
            <div class="map-object"></div>
            ${mapNodes}
          </div>
        </div>
      </div>

      <div class="panel">
        <h2>Spectral profiles</h2>
        <div class="spectral-visual-grid">${spectralVisuals}</div>
        <table class="spectral-table">
          <thead>
            <tr>
              <th>Mineral or element</th>
              <th>Profile</th>
              <th>Best wavelengths or method</th>
            </tr>
          </thead>
          <tbody>${spectralRows}</tbody>
        </table>
      </div>

      ${remoteSensingHtml}

      ${batteryHtml}

      <div class="panel">
        <h2>Reference links</h2>
        <ul class="source-list">${sourcesHtml}</ul>
      </div>
    `;

    bindSensorControls(report);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeSupplyLocations(locations, mineralName) {
    const provided = Array.isArray(locations)
      ? locations
          .filter((item) => item && typeof item.name === 'string')
          .map((item) => ({
            name: item.name,
            lat: Number(item.lat),
            lon: Number(item.lon),
            note: item.note || item.role || item.description || '',
          }))
          .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon))
      : [];

    if (provided.length) return provided.slice(0, 6);
    return fallbackSupplyLocations(mineralName);
  }

  function fallbackSupplyLocations(mineralName) {
    const text = String(mineralName || '').toLowerCase();
    const key = Object.keys(SUPPLY_LOCATIONS).find((name) => text.includes(name));
    if (key) return SUPPLY_LOCATIONS[key];
    if (text.includes('pgm') || text.includes('platinum') || text.includes('palladium') || text.includes('rhodium')) {
      return SUPPLY_LOCATIONS['platinum group metals'];
    }
    if (text.includes('rare earth')) return SUPPLY_LOCATIONS['rare earth elements'];
    return [
      location('China', 35.9, 104.2, 'Major mineral processing hub'),
      location('Australia', -25.3, 133.8, 'Major mining country'),
      location('United States', 39.8, -98.6, 'Domestic resources and recycling'),
    ];
  }

  function renderMineralWorldMap(mineralData) {
    const locations = normalizeSupplyLocations(mineralData.supplyLocations, mineralData.name);
    const pins = locations.map((place, index) => {
      const x = lonToX(place.lon);
      const y = latToY(place.lat);
      const labelX = clamp(x + 2.5, 4, 84);
      const labelY = clamp(y - 2.5 + (index % 2) * 7, 8, 93);
      return `
        <circle class="supply-pin ${index > 2 ? 'secondary' : ''}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" />
        <text class="supply-label" x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}">${escapeHtml(place.name)}</text>
      `;
    }).join('');

    const notes = locations.slice(0, 4).map((place) => `${place.name}: ${place.note}`).join(' | ');

    return `
      <div class="mineral-map">
        <p class="mineral-map-title">Major global source regions</p>
        <svg viewBox="0 0 100 56" role="img" aria-label="World map showing major source regions for ${escapeHtml(mineralData.name)}">
          <line class="map-gridline" x1="0" y1="28" x2="100" y2="28" />
          <line class="map-gridline" x1="25" y1="0" x2="25" y2="56" />
          <line class="map-gridline" x1="50" y1="0" x2="50" y2="56" />
          <line class="map-gridline" x1="75" y1="0" x2="75" y2="56" />
          <path class="map-land" d="M7 14 C12 8 22 8 28 13 C31 17 30 23 25 25 C19 29 13 27 9 23 C6 20 4 17 7 14 Z" />
          <path class="map-land" d="M20 29 C25 30 30 35 31 42 C29 49 23 53 19 49 C16 44 14 36 20 29 Z" />
          <path class="map-land" d="M38 12 C46 8 57 10 64 15 C66 20 61 24 53 24 C45 25 37 21 35 17 C34 15 35 13 38 12 Z" />
          <path class="map-land" d="M48 24 C55 23 61 28 61 36 C60 45 54 51 48 48 C43 42 42 33 45 27 C46 26 47 25 48 24 Z" />
          <path class="map-land" d="M60 12 C72 7 88 10 94 18 C98 24 92 31 80 30 C70 29 61 25 58 19 C57 16 58 14 60 12 Z" />
          <path class="map-land" d="M76 37 C82 34 91 38 93 44 C91 51 82 53 76 49 C72 45 72 40 76 37 Z" />
          ${pins}
        </svg>
        <p class="supply-note">${escapeHtml(notes)}</p>
      </div>
    `;
  }

  function lonToX(lon) {
    return clamp(((Number(lon) + 180) / 360) * 100, 2, 98);
  }

  function latToY(lat) {
    return clamp(((90 - Number(lat)) / 180) * 56, 3, 53);
  }

  function renderRemoteSensingMode(report, activeSensorKey) {
    const sensor = SENSOR_OPTIONS[activeSensorKey] || SENSOR_OPTIONS.sentinel2;
    const tabs = Object.entries(SENSOR_OPTIONS).map(([key, option]) => `
      <button class="sensor-tab" type="button" data-sensor="${key}" aria-pressed="${key === activeSensorKey ? 'true' : 'false'}">${escapeHtml(option.name)}</button>
    `).join('');

    return `
      <div class="panel sensor-panel">
        <h2>Choose a remote sensing sensor</h2>
        <div class="sensor-tabs" role="group" aria-label="Remote sensing sensor options">${tabs}</div>
        <div id="sensor-readout">${renderSensorReadout(report, activeSensorKey, sensor)}</div>
      </div>
    `;
  }

  function renderSensorReadout(report, sensorKey, sensor = SENSOR_OPTIONS[sensorKey]) {
    const cards = report.minerals.map((mineralData) => {
      const result = sensorDetectability(mineralData.name, sensorKey);
      return `
        <article class="sensor-card">
          <div class="sensor-card-head">
            <h3>${escapeHtml(mineralData.name)}</h3>
            <span class="detectability ${escapeHtml(result.className)}">${escapeHtml(result.rating)}</span>
          </div>
          <p><strong>What this sensor can do:</strong> ${escapeHtml(result.note)}</p>
          <p><strong>Best target:</strong> ${escapeHtml(result.target)}</p>
        </article>
      `;
    }).join('');

    return `
      <div class="sensor-summary">
        <h3>${escapeHtml(sensor.name)}</h3>
        <p><strong>Best for:</strong> ${escapeHtml(sensor.bestFor)}</p>
        <p><strong>Limit:</strong> ${escapeHtml(sensor.limits)}</p>
        <div class="sensor-band-list">
          ${sensor.bands.map((band) => `<span class="sensor-band">${escapeHtml(band)}</span>`).join('')}
        </div>
      </div>
      <div class="sensor-mineral-grid">${cards}</div>
    `;
  }

  function bindSensorControls(report) {
    const readout = document.getElementById('sensor-readout');
    const buttons = Array.from(document.querySelectorAll('.sensor-tab'));
    if (!readout || !buttons.length) return;

    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.dataset.sensor || 'sentinel2';
        buttons.forEach((item) => {
          item.setAttribute('aria-pressed', String(item === button));
        });
        readout.innerHTML = renderSensorReadout(report, key, SENSOR_OPTIONS[key] || SENSOR_OPTIONS.sentinel2);
      });
    });
  }

  function sensorDetectability(mineralName, sensorKey) {
    const mineral = String(mineralName || '').toLowerCase();
    const isHyperspectral = sensorKey === 'hyperspectral';
    const isAster = sensorKey === 'aster';
    const isSentinel = sensorKey === 'sentinel2';
    const isLandsat = sensorKey === 'landsat';

    if (/iron|aluminum|copper/.test(mineral)) {
      if (isAster || isHyperspectral) {
        return detectability('Easy', 'easy', 'Can map iron oxides, clay alteration, carbonates, and SWIR alteration minerals that often point to mineralized zones.', 'visible/NIR iron color plus SWIR alteration around 2.2-2.35 um');
      }
      return detectability('Possible', 'possible', 'Can screen for broad iron oxide color and some SWIR alteration, but mixed pixels make exact mineral ID uncertain.', 'visible/NIR color and broad SWIR bands');
    }

    if (/lithium|nickel|cobalt|manganese/.test(mineral)) {
      if (isHyperspectral) {
        return detectability('Possible', 'possible', 'Can look for alteration minerals, laterites, clays, and hydration features associated with deposits, but it usually cannot see the metal directly.', 'SWIR hydroxyl/water absorptions near 1.4, 1.9, 2.2, and 2.3 um');
      }
      if (isAster) {
        return detectability('Possible', 'possible', 'Useful for mapping alteration and laterite patterns around deposits; confirmation still needs field sampling or lab work.', 'ASTER SWIR alteration bands and iron oxide ratios');
      }
      return detectability('Hard', 'hard', 'Broad multispectral bands can show surface color or alteration clues, but they are not specific enough to identify this mineral directly.', 'regional alteration screening rather than direct detection');
    }

    if (/rare earth/.test(mineral)) {
      if (isHyperspectral) {
        return detectability('Possible', 'possible', 'Narrow VNIR absorptions from some rare-earth-bearing minerals may be detectable with high spectral resolution.', 'narrow VNIR features around roughly 580-900 nm');
      }
      return detectability('Hard', 'hard', 'Most multispectral sensors do not have bands narrow enough for rare-earth spectral fingerprints.', 'general alteration mapping only');
    }

    if (/tin/.test(mineral)) {
      if (isAster || isHyperspectral) {
        return detectability('Possible', 'possible', 'Can map alteration minerals associated with tin systems, but cassiterite itself usually needs XRF or lab confirmation.', 'SWIR alteration near 2.2-2.35 um');
      }
      return detectability('Hard', 'hard', 'Can only provide broad geologic context, not direct tin identification.', 'regional context and iron/clay anomalies');
    }

    if (/graphite|tantalum|gold|platinum|palladium|rhodium/.test(mineral)) {
      if (isHyperspectral && /graphite/.test(mineral)) {
        return detectability('Hard', 'hard', 'Graphite can appear dark and absorptive, but many surfaces look similar; Raman or field sampling is still needed.', 'low reflectance targets plus field verification');
      }
      return detectability('Lab only', 'lab', 'This material does not have a reliable simple satellite reflectance signature in typical object or ore forms.', 'XRF, Raman, LIBS, assay, or field sampling');
    }

    if (isHyperspectral || isAster) {
      return detectability('Possible', 'possible', 'Can search for alteration minerals and surface patterns related to deposits, but direct identification is uncertain.', 'VNIR/SWIR alteration features');
    }

    return detectability('Hard', 'hard', 'This sensor is best for broad screening, not confirmation of a specific critical mineral.', 'regional color, vegetation, and alteration patterns');
  }

  function detectability(rating, className, note, target) {
    return { rating, className, note, target };
  }

  function renderSpectralVisual(mineralData) {
    const profile = spectralProfileFor(mineralData.name);
    const width = 420;
    const height = 210;
    const pad = { left: 46, right: 18, top: 18, bottom: 42 };
    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;
    const xFor = (value) => pad.left + ((value - profile.min) / (profile.max - profile.min)) * plotWidth;
    const yFor = (value) => pad.top + (1 - value) * plotHeight;
    const ticks = profile.ticks || evenlySpacedTicks(profile.min, profile.max, 5);

    let path = '';
    if (profile.kind === 'reflectance') {
      const points = [];
      const steps = 120;
      for (let i = 0; i <= steps; i += 1) {
        const wave = profile.min + (i / steps) * (profile.max - profile.min);
        const y = reflectanceValue(wave, profile);
        points.push(`${i === 0 ? 'M' : 'L'} ${xFor(wave).toFixed(1)} ${yFor(y).toFixed(1)}`);
      }
      path = `<path d="${points.join(' ')}" fill="none" stroke="#5effb0" stroke-width="2.5" stroke-linecap="round" />`;
    } else {
      path = profile.markers.map((marker) => {
        const x = xFor(marker.value);
        const peakHeight = marker.strength || 0.76;
        return `<line x1="${x.toFixed(1)}" y1="${yFor(0.08).toFixed(1)}" x2="${x.toFixed(1)}" y2="${yFor(peakHeight).toFixed(1)}" stroke="#5effb0" stroke-width="3" stroke-linecap="round" />`;
      }).join('');
    }

    const markerLines = profile.markers.map((marker, index) => {
      const x = xFor(marker.value);
      const labelY = pad.top + 12 + (index % 3) * 13;
      return `
        <line x1="${x.toFixed(1)}" y1="${pad.top}" x2="${x.toFixed(1)}" y2="${pad.top + plotHeight}" stroke="#ffb13c" stroke-width="1" stroke-dasharray="3 4" opacity="0.72" />
        <text x="${(x + 4).toFixed(1)}" y="${labelY}" class="spectral-marker-label">${escapeHtml(marker.label)}</text>
      `;
    }).join('');

    const tickLabels = ticks.map((tick) => {
      const x = xFor(tick);
      return `
        <line x1="${x.toFixed(1)}" y1="${pad.top + plotHeight}" x2="${x.toFixed(1)}" y2="${pad.top + plotHeight + 5}" stroke="#8b9594" />
        <text x="${x.toFixed(1)}" y="${height - 18}" text-anchor="middle" class="spectral-axis-label">${escapeHtml(formatTick(tick))}</text>
      `;
    }).join('');

    const yTicks = [0.2, 0.5, 0.8].map((tick) => `
      <line x1="${pad.left - 5}" y1="${yFor(tick).toFixed(1)}" x2="${pad.left}" y2="${yFor(tick).toFixed(1)}" stroke="#8b9594" />
      <text x="${pad.left - 9}" y="${(yFor(tick) + 3).toFixed(1)}" text-anchor="end" class="spectral-axis-label">${tick.toFixed(1)}</text>
    `).join('');

    return `
      <article class="spectral-visual-card">
        <h3>${escapeHtml(mineralData.name)}</h3>
        <svg class="spectral-plot" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(profile.title)}">
          <rect x="${pad.left}" y="${pad.top}" width="${plotWidth}" height="${plotHeight}" fill="#0c1011" />
          <g opacity="0.25">
            ${ticks.map((tick) => `<line x1="${xFor(tick).toFixed(1)}" y1="${pad.top}" x2="${xFor(tick).toFixed(1)}" y2="${pad.top + plotHeight}" stroke="#8b9594" />`).join('')}
            ${[0.2, 0.5, 0.8].map((tick) => `<line x1="${pad.left}" y1="${yFor(tick).toFixed(1)}" x2="${pad.left + plotWidth}" y2="${yFor(tick).toFixed(1)}" stroke="#8b9594" />`).join('')}
          </g>
          <line x1="${pad.left}" y1="${pad.top + plotHeight}" x2="${pad.left + plotWidth}" y2="${pad.top + plotHeight}" stroke="#8b9594" />
          <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotHeight}" stroke="#8b9594" />
          ${path}
          ${markerLines}
          ${tickLabels}
          ${yTicks}
          <text x="${pad.left + plotWidth / 2}" y="${height - 4}" text-anchor="middle" class="spectral-axis-label">${escapeHtml(profile.xLabel)}</text>
          <text x="14" y="${pad.top + plotHeight / 2}" transform="rotate(-90 14 ${pad.top + plotHeight / 2})" text-anchor="middle" class="spectral-axis-label">${escapeHtml(profile.yLabel)}</text>
        </svg>
        <p class="spectral-note">${escapeHtml(profile.note)}</p>
      </article>
    `;
  }

  function spectralProfileFor(name) {
    const text = String(name || '').toLowerCase();
    const reflectanceBase = {
      kind: 'reflectance',
      min: 400,
      max: 2500,
      xLabel: 'Wavelength (nm)',
      yLabel: 'Relative reflectance',
      baseline: 0.72,
      slope: 0.04,
      markers: [],
      ticks: [400, 900, 1400, 1900, 2400],
    };

    if (text.includes('lithium')) {
      return {
        ...reflectanceBase,
        title: 'Lithium mineral SWIR absorption profile',
        baseline: 0.74,
        markers: [
          { value: 670.8, label: 'Li 670.8', depth: 0.06, width: 14 },
          { value: 1410, label: '1410', depth: 0.14, width: 55 },
          { value: 1910, label: '1910', depth: 0.2, width: 70 },
          { value: 2200, label: '2200', depth: 0.24, width: 58 },
        ],
        note: 'Representative lithium-bearing mineral curve: SWIR hydroxyl/water absorptions plus the 670.8 nm lithium emission line used in lab spectroscopy.',
      };
    }
    if (text.includes('cobalt')) {
      return {
        ...reflectanceBase,
        title: 'Cobalt-bearing mineral VNIR profile',
        baseline: 0.62,
        markers: [
          { value: 550, label: '500-600', depth: 0.18, width: 90 },
          { value: 1100, label: '1000-1200', depth: 0.16, width: 125 },
        ],
        note: 'Cobalt crystal-field absorptions vary by host mineral, but visible and near-infrared bands are commonly diagnostic.',
      };
    }
    if (text.includes('nickel')) {
      return {
        ...reflectanceBase,
        title: 'Nickel laterite SWIR profile',
        baseline: 0.7,
        markers: [
          { value: 1400, label: '1400', depth: 0.12, width: 55 },
          { value: 1900, label: '1900', depth: 0.18, width: 65 },
          { value: 2200, label: '2200', depth: 0.16, width: 48 },
          { value: 2300, label: '2300', depth: 0.2, width: 50 },
        ],
        note: 'Representative nickel-bearing laterite profile with water, Fe-OH, and Mg-OH related SWIR absorptions.',
      };
    }
    if (text.includes('graphite')) {
      return labProfile('Graphite Raman peaks', 'Raman shift (cm-1)', 'Relative intensity', 1000, 1800, [
        { value: 1350, label: 'D 1350', strength: 0.72 },
        { value: 1580, label: 'G 1580', strength: 0.9 },
      ], 'Graphite is mostly dark and featureless in VNIR/SWIR reflectance; Raman D and G bands are more diagnostic.');
    }
    if (text.includes('manganese')) {
      return {
        ...reflectanceBase,
        title: 'Manganese oxide broad visible absorptions',
        baseline: 0.5,
        markers: [
          { value: 520, label: 'broad VIS', depth: 0.16, width: 130 },
          { value: 650, label: 'broad VIS', depth: 0.12, width: 120 },
          { value: 900, label: 'NIR', depth: 0.1, width: 135 },
        ],
        note: 'Manganese oxides are commonly dark with broad visible absorptions; lab methods are preferred for exact phase identification.',
      };
    }
    if (text.includes('copper')) {
      return {
        ...reflectanceBase,
        title: 'Copper mineral VNIR/SWIR profile',
        baseline: 0.68,
        markers: [
          { value: 900, label: '900', depth: 0.18, width: 95 },
          { value: 2200, label: '2200', depth: 0.16, width: 55 },
          { value: 2350, label: '2350', depth: 0.13, width: 45 },
        ],
        note: 'Copper oxide/carbonate and hydroxyl-bearing alteration minerals often show VNIR and SWIR absorptions near these regions.',
      };
    }
    if (text.includes('tantalum')) {
      return labProfile('Tantalum lab detection', 'Method energy channel', 'Relative response', 0, 10, [
        { value: 2.1, label: 'LIBS', strength: 0.74 },
        { value: 5.7, label: 'XRF', strength: 0.88 },
      ], 'Tantalum minerals are not reliably identified by simple VNIR reflectance; XRF, LIBS, Raman, or lab assay is preferred.');
    }
    if (text.includes('tin')) {
      return {
        ...reflectanceBase,
        title: 'Tin ore context profile',
        baseline: 0.63,
        markers: [
          { value: 2200, label: 'Al-OH', depth: 0.18, width: 55 },
          { value: 2350, label: 'alteration', depth: 0.12, width: 50 },
        ],
        note: 'Cassiterite itself is often confirmed by XRF; SWIR is most useful for mapping associated alteration minerals.',
      };
    }
    if (text.includes('gold')) {
      return {
        ...reflectanceBase,
        title: 'Native gold visible/NIR reflectance trend',
        baseline: 0.46,
        slope: 0.28,
        markers: [
          { value: 520, label: 'low blue-green', depth: 0.12, width: 110 },
          { value: 700, label: 'red rise', depth: -0.1, width: 130 },
        ],
        note: 'Native gold reflects strongly in red/NIR and less in blue-green; plated electronics are usually better checked by XRF.',
      };
    }
    if (text.includes('rare earth')) {
      return {
        ...reflectanceBase,
        title: 'Rare earth VNIR narrow absorptions',
        baseline: 0.66,
        markers: [
          { value: 580, label: '580', depth: 0.18, width: 18 },
          { value: 740, label: '740', depth: 0.16, width: 20 },
          { value: 800, label: '800', depth: 0.14, width: 18 },
          { value: 870, label: '870', depth: 0.13, width: 22 },
        ],
        note: 'Nd and other rare-earth-bearing minerals can show narrow VNIR absorptions; high spectral resolution is important.',
      };
    }
    if (text.includes('platinum') || text.includes('palladium') || text.includes('rhodium')) {
      return labProfile('Platinum group metals lab detection', 'Method channel', 'Relative response', 0, 10, [
        { value: 2.6, label: 'XRF', strength: 0.86 },
        { value: 6.4, label: 'ICP/fire assay', strength: 0.92 },
      ], 'PGMs in catalytic converters do not have simple diagnostic VNIR reflectance features; XRF or lab assay is the practical route.');
    }
    if (text.includes('aluminum')) {
      return {
        ...reflectanceBase,
        title: 'Aluminum hydroxyl SWIR profile',
        baseline: 0.72,
        markers: [
          { value: 2160, label: '2160', depth: 0.17, width: 42 },
          { value: 2210, label: '2210', depth: 0.2, width: 45 },
        ],
        note: 'Bauxite-associated Al-OH minerals have strong SWIR absorptions near 2160 to 2210 nm.',
      };
    }
    if (text.includes('iron')) {
      return {
        ...reflectanceBase,
        title: 'Iron oxide VNIR profile',
        baseline: 0.58,
        markers: [
          { value: 530, label: '530', depth: 0.16, width: 85 },
          { value: 670, label: '670', depth: 0.12, width: 80 },
          { value: 870, label: '870', depth: 0.18, width: 85 },
          { value: 900, label: '900', depth: 0.13, width: 70 },
        ],
        note: 'Iron oxides show visible and near-infrared crystal-field and charge-transfer absorptions, varying by hematite/goethite phase.',
      };
    }

    return {
      ...reflectanceBase,
      title: 'Representative VNIR/SWIR feature plot',
      markers: [
        { value: 900, label: 'VNIR', depth: 0.1, width: 100 },
        { value: 2200, label: 'SWIR', depth: 0.14, width: 60 },
      ],
      note: 'Representative feature plot. For exact identification, compare a measured spectrum with a reference spectral library.',
    };
  }

  function labProfile(title, xLabel, yLabel, min, max, markers, note) {
    return {
      kind: 'lab',
      title,
      xLabel,
      yLabel,
      min,
      max,
      markers,
      ticks: evenlySpacedTicks(min, max, 5),
      note,
    };
  }

  function reflectanceValue(wavelength, profile) {
    const normalized = (wavelength - profile.min) / (profile.max - profile.min);
    let value = (profile.baseline || 0.68) + (normalized - 0.5) * (profile.slope || 0.03);
    for (const marker of profile.markers) {
      const width = marker.width || 60;
      const depth = marker.depth || 0.12;
      const distance = (wavelength - marker.value) / width;
      value -= depth * Math.exp(-0.5 * distance * distance);
    }
    return clamp(value, 0.08, 0.95);
  }

  function evenlySpacedTicks(min, max, count) {
    const ticks = [];
    for (let i = 0; i < count; i += 1) {
      ticks.push(min + ((max - min) / (count - 1)) * i);
    }
    return ticks;
  }

  function formatTick(value) {
    if (Math.abs(value) >= 100) return String(Math.round(value));
    return String(Number(value.toFixed(1)));
  }

  els.select.addEventListener('change', () => {
    selectedObject = els.select.value;
    window.__selectedObject = selectedObject;
  });

  els.analyzeBtn.addEventListener('click', analyzeSelected);

  window.addEventListener('detectionsupdated', (event) => {
    handleDetectionOptions(event.detail && event.detail.detections);
  });

  handleDetectionOptions(window.__latestDetections || []);
})();
