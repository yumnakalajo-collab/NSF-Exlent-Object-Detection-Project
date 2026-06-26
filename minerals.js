(() => {
  const els = {
    select: document.getElementById('object-select'),
    analyzeBtn: document.getElementById('analyze-object'),
    state: document.getElementById('report-state'),
    content: document.getElementById('report-content'),
  };

  let selectedObject = '';
  let lastOptions = [];

  const SOURCE_LINKS = [
    { label: 'USGS Critical Minerals', url: 'https://www.usgs.gov/mission-areas/national-minerals-information-center/critical-minerals' },
    { label: 'USGS Spectral Library', url: 'https://www.usgs.gov/labs/spec-lab/capabilities/spectral-library' },
    { label: 'EPA battery recycling guidance', url: 'https://www.epa.gov/recycle/used-household-batteries' },
    { label: 'Call2Recycle locator', url: 'https://www.call2recycle.org/locator/' },
    { label: 'Earth911 recycling search', url: 'https://search.earth911.com/' },
  ];

  const FALLBACK_MINERALS = {
    general: [
      { name: 'Silicon', use: 'Semiconductors and logic gates', location: 'Quartz quarry reserves worldwide' }
    ]
  };

  window.addEventListener('detectionsupdated', (e) => {
    const labels = Array.from(new Set(e.detail.detections.map(d => d.label)));
    updateSelectOptions(labels);
  });

  function updateSelectOptions(options) {
    if (JSON.stringify(options) === JSON.stringify(lastOptions)) return;
    lastOptions = options;

    els.select.innerHTML = '';
    if (options.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = 'No objects detected';
      opt.value = '';
      els.select.appendChild(opt);
      selectedObject = '';
      window.__selectedObject = '';
      return;
    }

    options.forEach(opt => {
      const el = document.createElement('option');
      el.value = opt;
      el.textContent = opt;
      els.select.appendChild(el);
    });
    
    if (!options.includes(selectedObject)) {
      selectedObject = options[0];
      window.__selectedObject = selectedObject;
      runAnalysis(selectedObject);
    }
  }

  els.select.addEventListener('change', (e) => {
    selectedObject = e.target.value;
    window.__selectedObject = selectedObject;
    if (selectedObject) runAnalysis(selectedObject);
  });

  function objectKey(label) {
    const l = label.toLowerCase();
    if (l.includes('battery')) return 'battery';
    if (l.includes('phone') || l.includes('laptop')) return 'electronics';
    return 'general';
  }

  function mayContainBattery(label) {
    const text = label.toLowerCase();
    return /battery|phone|laptop|tablet|mouse|keyboard|watch|toy|vehicle|car/.test(text);
  }

  function runAnalysis(label) {
    els.state.textContent = `Analyzing ${label}...`;
    els.content.hidden = true;

    setTimeout(() => {
      const report = buildFallbackReport(label);
      renderReport(report);
    }, 400);
  }

  function buildFallbackReport(label) {
    const key = objectKey(label);
    const minerals = FALLBACK_MINERALS[key] || FALLBACK_MINERALS.general;
    return {
      object: label,
      summary: `This is a representative critical-minerals profile based on materials commonly found within a ${label}. Use Gemini chat for configuration inquiries.`,
      minerals,
      battery: mayContainBattery(label) ? batteryGuidance(label) : null,
      sources: SOURCE_LINKS,
    };
  }

  function batteryGuidance(label) {
    const text = String(label || '').toLowerCase();
    
    let specificWhy = 'Batteries can start fires if crushed or punctured, and recycling recovers valuable materials such as lithium, cobalt, nickel, copper, steel, and graphite.';
    let specificHow = [
      'Do not put rechargeable lithium-ion batteries in curbside trash or standard recycling bins.',
      'Cover exposed terminals with clear tape and keep batteries cool, dry, and separated from metal objects.',
      'Use a battery drop-off site for loose rechargeable batteries. If the battery is built into a device, recycle the whole device at an electronics or battery collection site.',
      'For damaged, swollen, leaking, or hot batteries, contact your city or county household hazardous waste program before transporting them.'
    ];

    if (/phone|laptop|tablet/.test(text)) {
      specificWhy = `This ${label} utilizes high-density Lithium-ion polymer cells. Safe processing prevents extreme thermal events during waste compaction and allows rare cobalt recapture.`;
      specificHow.unshift(`Ensure your personal data is completely wiped or the storage drive is shredded before dropping the device off at an electronics recycling collection point.`);
    } else if (/car|vehicle|ev/.test(text)) {
      specificWhy = `Electric vehicle packs represent major quantities of critical minerals. Specialized high-voltage dismantling channels are strictly required rather than standard recycling centers.`;
      specificHow = [
        'Never attempt to remove or puncture an EV traction battery module yourself due to lethal voltage thresholds.',
        'Coordinate disposal directly with a certified automotive recycler or designated dealership extraction network.',
        'Packs are often qualified for second-life residential or industrial grid-storage installations prior to full base-metal chemical recovery.'
      ];
    } else if (/remote|toy|watch|mouse|keyboard/.test(text)) {
      specificWhy = `Small items like a ${label} often hide coin cells or alkaline/NiMH batteries that leach heavy chemicals if left corroding in traditional landfills.`;
      specificHow = [
        'Carefully unclip the rear structural compartment and extract the loose cells.',
        'If components have leaked or accumulated white alkaline crust, handle with protective gloves and place them inside a separate sealed plastic baggie.',
        'Drop loose cells into dedicated hardware retail collection boxes or household collection centers.'
      ];
    }

    return {
      applies: true,
      why: specificWhy,
      how: specificHow,
    };
  }

  function renderReport(report) {
    els.state.textContent = '';
    els.content.hidden = false;
    
    let html = `<div style="font-size:14px; line-height:1.6; display:flex; flex-direction:column; gap:16px;">
      <div><strong>Detected Asset:</strong> ${report.object}</div>
      <p style="margin:0; color:var(--ink-dim); font-size:13px;">${report.summary}</p>`;

    if (report.battery) {
      html += `<div style="border-left: 3px solid var(--idle); padding-left: 12px; margin: 8px 0;">
        <h4 style="margin:0 0 6px 0; color:var(--idle); font-size:13px; font-family:var(--font-mono);">BATTERY RECYCLING PROTOCOL</h4>
        <p style="margin:0 0 8px 0; font-size:13px;"><strong>Why:</strong> ${report.battery.why}</p>
        <p style="margin:0 0 4px 0; font-size:13px;"><strong>Steps:</strong></p>
        <ul style="margin:0; padding-left:18px; font-size:13px; color:var(--ink-dim);">
          ${report.battery.how.map(h => `<li>${h}</li>`).join('')}
        </ul>
      </div>`;
    }

    html += `<div><strong>Reference Resources:</strong><br/>`;
    report.sources.forEach(src => {
      html += `<a href="${src.url}" target="_blank" rel="noopener" style="color:var(--signal); text-decoration:none; display:inline-block; margin-right:12px; font-size:12px;">${src.label} &rarr;</a>`;
    });
    html += `</div></div>`;

    els.content.innerHTML = html;
  }
})();
