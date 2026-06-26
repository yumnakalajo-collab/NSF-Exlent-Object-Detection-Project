// Minimal world map renderer. Draws a simplified continent silhouette
// (not survey-accurate, just enough to orient pins visually) and plots
// glowing pins for mining regions using an equirectangular lat/lng projection.

(() => {
  const VIEW_W = 1000;
  const VIEW_H = 500;

  // Equirectangular projection: lng -180..180 -> x 0..1000, lat 90..-90 -> y 0..500
  function project(lat, lng) {
    const x = ((lng + 180) / 360) * VIEW_W;
    const y = ((90 - lat) / 180) * VIEW_H;
    return { x, y };
  }

  // Simplified continent outlines (rough silhouettes, not geographic data).
  // Each is a closed polygon in lat/lng pairs, intentionally low-fidelity —
  // this is a stylized backdrop for the pins, not a navigational map.
  const CONTINENTS = [
    // North America
    [[71,-156],[66,-165],[60,-145],[55,-130],[48,-125],[40,-124],[32,-117],[25,-110],
     [18,-95],[21,-87],[30,-81],[35,-76],[45,-67],[47,-52],[60,-65],[68,-95],[71,-156]],
    // South America
    [[12,-72],[5,-77],[-5,-81],[-18,-70],[-30,-71],[-40,-73],[-55,-68],[-52,-58],
     [-34,-54],[-23,-43],[-8,-35],[2,-50],[10,-62],[12,-72]],
    // Africa
    [[37,10],[32,-8],[20,-17],[14,-17],[4,-8],[5,5],[0,9],[-5,12],[-18,12],[-26,15],
     [-34,19],[-30,30],[-22,35],[-12,40],[0,42],[10,45],[15,38],[22,37],[30,33],[33,25],[37,10]],
    // Europe
    [[71,25],[66,18],[60,5],[55,-6],[48,-5],[44,-1],[42,3],[37,-9],[40,15],[45,13],
     [48,18],[52,21],[55,30],[60,30],[68,33],[71,25]],
    // Asia
    [[71,35],[68,60],[66,90],[70,150],[62,180],[55,165],[45,145],[35,130],[25,122],
     [18,108],[8,100],[5,95],[8,80],[20,72],[25,62],[35,50],[40,45],[45,38],[55,40],
     [60,35],[71,35]],
    // Australia
    [[-12,130],[-14,143],[-20,149],[-28,153],[-35,150],[-38,141],[-35,136],[-32,115],
     [-22,114],[-15,124],[-12,130]],
  ];

  function continentPath(points) {
    return points
      .map(([lat, lng], i) => {
        const { x, y } = project(lat, lng);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ') + ' Z';
  }

  function buildBasemap() {
    return CONTINENTS.map(
      (poly) =>
        `<path d="${continentPath(poly)}" fill="#1a2122" stroke="#2a3334" stroke-width="1.5"/>`
    ).join('');
  }

  /**
   * Render the world map with pins for the given list of minerals.
   * `minerals` is an array of mineral keys (e.g. ['lithium', 'cobalt']).
   * Pulls region data + color from window.MINERALS.
   */
  function renderWorldMap(svgEl, mineralKeys) {
    const minerals = window.MINERALS || {};
    let pinsHtml = '';
    let legendHtml = '';
    const seen = new Set();

    mineralKeys.forEach((key) => {
      const mineral = minerals[key];
      if (!mineral || !mineral.regions) return;

      mineral.regions.forEach((region) => {
        const { x, y } = project(region.lat, region.lng);
        const title = `${mineral.name} — ${region.country} (${region.share})`;
        pinsHtml += `
          <g class="map-pin">
            <circle class="map-pin-glow" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" fill="${mineral.color}" opacity="0.25"/>
            <circle class="map-pin-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${mineral.color}" stroke="#0b0e0f" stroke-width="1.5">
              <title>${escapeXml(title)}</title>
            </circle>
          </g>`;
      });

      if (!seen.has(key)) {
        seen.add(key);
        legendHtml += `
          <span class="legend-item">
            <span class="legend-dot" style="background:${mineral.color}; color:${mineral.color};"></span>
            ${escapeXml(mineral.name)}
          </span>`;
      }
    });

    svgEl.innerHTML = buildBasemap() + pinsHtml;

    return legendHtml;
  }

  function escapeXml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  window.renderWorldMap = renderWorldMap;
})();
