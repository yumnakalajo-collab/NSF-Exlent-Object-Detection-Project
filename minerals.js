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

  const SOURCE_LINKS = [
    { label: 'USGS Critical Minerals', url: 'https://www.usgs.gov/mission-areas/national-minerals-information-center/critical-minerals' },
    { label: 'USGS Spectral Library', url: 'https://www.usgs.gov/labs/spec-lab/capabilities/spectral-library' },
    { label: 'EPA battery recycling guidance', url: 'https://www.epa.gov/recycle/used-household-batteries' },
    { label: 'Call2Recycle locator', url: 'https://www.call2recycle.org/locator/' },
    { label: 'Earth911 recycling search', url: 'https://search.earth911.com/' },
  ];

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

  function mineral(name, usage, location, criticality, why, spectralProfile, bestWavelengths) {
    return { name, usage, location, criticality, why, spectralProfile, bestWavelengths };
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
      battery: mayContainBattery(label) ? batteryGuidance() : null,
      sources: SOURCE_LINKS,
    });
  }

  function batteryGuidance() {
    return {
      applies: true,
      why: 'Batteries can start fires if crushed or punctured, and recycling recovers valuable materials such as lithium, cobalt, nickel, copper, steel, and graphite.',
      how: [
        'Do not put rechargeable lithium-ion batteries in curbside trash or standard recycling bins.',
        'Cover exposed terminals with clear tape and keep batteries cool, dry, and separated from metal objects.',
        'Use a battery drop-off site for loose rechargeable batteries. If the battery is built into a device, recycle the whole device at an electronics or battery collection site.',
        'For damaged, swollen, leaking, or hot batteries, contact your city or county household hazardous waste program before transporting them.',
      ],
      where: [
        'Search nearby drop-off sites with Call2Recycle or Earth911.',
        'Many electronics retailers, municipal household hazardous waste sites, and campus e-waste programs accept rechargeable batteries.',
      ],
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
    }));

    return {
      object: report.object || selectedObject || 'selected object',
      summary: report.summary || 'Likely critical minerals for the selected object.',
      minerals: safeMinerals.length ? safeMinerals : FALLBACK_MINERALS.general,
      mapLocations: Array.isArray(report.mapLocations) && report.mapLocations.length
        ? report.mapLocations
        : safeMinerals.slice(0, 5).map((m, i) => ({ label: m.name, location: m.location, x: 25 + i * 12, y: 35 + (i % 3) * 16 })),
      battery: report.battery && report.battery.applies ? report.battery : (mayContainBattery(report.object || selectedObject) ? batteryGuidance() : null),
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
        <p class="report-subtitle">${escapeHtml(report.battery.why || batteryGuidance().why)}</p>
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

      ${batteryHtml}

      <div class="panel">
        <h2>Reference links</h2>
        <ul class="source-list">${sourcesHtml}</ul>
      </div>
    `;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
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
    updateOptions(event.detail && event.detail.detections);
  });

  updateOptions(window.__latestDetections || []);
})();
