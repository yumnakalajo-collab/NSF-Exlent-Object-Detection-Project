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
      mineral('Graphite', 'Stores lithium ions during charging', 'anode coating on copper current collector', 'High', 'Natural graphite and synthetic graphite are strategic battery materials.', 'Graphite is dark and broadly absorptive with a mostly featureless VNIR/SWIR reflectance curve, so it is often identified by low reflectance plus lab Raman bands near 1350 and 1580 cm-1.', 'Raman spectroscopy near 1350 and 1580 cm-1; broadband VNIR darkness is supportive but not unique.')
    ],
    electronics: [
      mineral('Copper', 'Carries electrical current', 'circuit boards, wiring, coils, ports, and connectors', 'Medium', 'Copper is essential for board paths, high connectivity traces and energy networks.', 'Copper oxides and carbonates can show absorptions near 900 nm and Al-OH/Cu-OH related SWIR features near 2200 to 2350 nm depending on mineral.', 'VNIR near 900 nm and SWIR near 2200 to 2350 nm.'),
      mineral('Tantalum', 'Stores and filters charge in capacitors', 'small capacitors on circuit boards', 'High', 'Tantalum has concentrated sources and is important for miniaturized electronics.', 'Tantalum minerals such as tantalite are dark, dense oxides with weak reflectance features; identification usually relies on XRF, LIBS, or Raman rather than simple VNIR reflectance.', 'XRF/LIBS elemental detection is preferred; VNIR reflectance is not strongly diagnostic.'),
      mineral('Tin', 'Solder joins components', 'solder joints on circuit boards', 'Medium', 'Tin is essential for solder joints and component assembly frameworks.', 'Cassiterite is commonly identified in lab or field by SWIR features affected by iron and hydroxyl-bearing alteration minerals, but elemental tin is better measured by XRF.', 'XRF for tin; SWIR alteration context around 2200 nm can help in ore mapping.')
    ],
    general: [
      mineral('Silicon', 'Semiconductors and logic gates', 'integrated computer chips and processing wafers', 'Medium', 'Crucial baseline asset backing global transistor fabrication lines.', 'High signature transparency bands paired with specific standard structural profiling thresholds.', 'Spectral baseline validation matches.')
    ]
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

  window.addEventListener('detectionsupdated', (e) => {
    updateOptions(e.detail.detections);
  });

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
      els.select.appendChild(new Option('No tracked assets', ''));
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

  els.select.addEventListener('change', (e) => {
    selectedObject = e.target.value;
    window.__selectedObject = selectedObject;
  });

  els.analyzeBtn.addEventListener('click', () => {
    analyzeSelected();
  });

  async function analyzeSelected() {
    if (!selectedObject || loading) return;
    loading = true;
    els.analyzeBtn.disabled = true;
    els.state.hidden = false;
    els.content.hidden = true;
    els.state.textContent = 'Building diagnostic mineral profile for ' + selectedObject + '...';

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
      if (response.ok && data.report) report = data.report;
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
    return {
      object: label,
      summary: 'Automated mineral profile for this item configuration. Use Gemini chat to interrogate specialized technical parts.',
      minerals,
      battery: mayContainBattery(label) ? batteryGuidance(label) : null,
      sources: SOURCE_LINKS,
    };
  }

  function batteryGuidance(label) {
    const text = String(label || '').toLowerCase();
    let specificWhy = 'Cells risk localized thermal fires if crushed or compressed; safe physical sorting recovers expensive base metals.';
    let specificHow = [
      'Do not throw rechargeable batteries into standard garbage or local municipal disposal bins.',
      'Tape down exposed metal clip pins with electrical tape and place them in structured containers.',
      'Route whole systems to specialized computer hazardous facilities if internal elements cannot be dislodged cleanly.'
    ];

    if (/phone|laptop|tablet/.test(text)) {
      specificWhy = `This ${label} uses thin Lithium-polymer geometries. Internal packaging safeguards must remain undisturbed during local structural recycling transitions.`;
      specificHow.unshift('Wipe all user data caches or shred local components completely prior to structural asset transfer.');
    } else if (/vehicle|car|ev/.test(text)) {
      specificWhy = `Electric vehicle modular arrays represent major technical mineral concentrations requiring authorized dismantling workflows.`;
      specificHow = [
        'High voltage lines introduce physical shock safety considerations; avoid cutting array components without diagnostic testing tools.',
        'Contact primary manufacturer logistics portals to evaluate second-life power cell array allocation scenarios.'
      ];
    } else if (/remote|toy|watch|mouse|keyboard/.test(text)) {
      specificWhy = `Small utility units hide volatile coin or small standard cells that generate toxic leakage patterns inside open sorting bins.`;
      specificHow = [
        'Depress release triggers to inspect, decouple and capture secondary hidden cells cleanly.',
        'Isolate leaking components inside sealed bags prior to drop box distribution actions.'
      ];
    }

    return { why: specificWhy, how: specificHow };
  }

  function renderReport(report) {
    els.state.hidden = true;
    els.content.hidden = false;
    
    let html = `<div style="font-size:14px; line-height:1.5; display:flex; flex-direction:column; gap:14px;">
      <div><strong>Target Stream:</strong> ${escapeHtml(report.object)}</div>
      <p style="margin:0; color:var(--ink-dim); font-size:13px;">${escapeHtml(report.summary)}</p>`;

    if (report.battery) {
      html += `<div style="border-left: 2px solid var(--idle); padding-left: 10px; margin: 4px 0;">
        <h4 style="margin:0 0 4px 0; color:var(--idle); font-size:12px; font-family:var(--font-mono); text-transform:uppercase;">BATTERY RECYCLING STANDARD</h4>
        <p style="margin:0 0 6px 0; font-size:13px;"><strong>Risk Factor:</strong> ${escapeHtml(report.battery.why)}</p>
        <p style="margin:0 0 2px 0; font-size:13px;"><strong>Action Steps:</strong></p>
        <ul style="margin:0; padding-left:16px; font-size:13px; color:var(--ink-dim);">
          ${report.battery.how.map(h => `<li>${escapeHtml(h)}</li>`).join('')}
        </ul>
      </div>`;
    }

    if (Array.isArray(report.minerals)) {
      html += `<div><strong>Mineral Profiles:</strong>`;
      report.minerals.forEach(m => {
        html += `<div style="margin-top:8px; border-bottom: 1px solid var(--panel-border); padding-bottom:8px;">
          <span style="color:var(--signal); font-weight:500;">${escapeHtml(m.name)}</span> (${escapeHtml(m.criticality || 'Medium')})<br/>
          <span style="font-size:12px; color:var(--ink-dim);"><strong>Location:</strong> ${escapeHtml(m.location)}</span><br/>
          <span style="font-size:12px; color:var(--ink-dim);"><strong>Spectral:</strong> ${escapeHtml(m.spectralProfile || m.spectral || '')}</span>
        </div>`;
      });
      html += `</div>`;
    }

    html += `<div style="margin-top:4px;"><strong>Reference Catalogs:</strong><br/>`;
    report.sources.forEach(src => {
      html += `<a href="${src.url}" target="_blank" rel="noopener" style="color:var(--signal); text-decoration:none; display:inline-block; margin-right:12px; font-size:12px;">${escapeHtml(src.label)} &rarr;</a>`;
    });
    html += `</div></div>`;

    els.content.innerHTML = html;
  }
})();
