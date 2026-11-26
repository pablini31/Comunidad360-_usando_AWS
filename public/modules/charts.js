const registry = new Map();

export function destroyAllCharts() {
  for (const chart of registry.values()) {
    try {
      chart.destroy();
    } catch {}
  }
  registry.clear();
}

export function renderChart(canvasOrId, config) {
  const el = typeof canvasOrId === 'string' ? document.getElementById(canvasOrId) : canvasOrId;
  if (!el || typeof window.Chart === 'undefined') return null;

  const key = el.id || String(Math.random());
  if (registry.has(key)) {
    try {
      registry.get(key).destroy();
    } catch {}
    registry.delete(key);
  }

  const chart = new window.Chart(el, config);
  registry.set(key, chart);
  return chart;
}

export function buildDoughnutConfig({ labels, data, colors, cutout = '68%', dark = false }) {
  return {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors,
          borderColor: dark ? '#11123b' : '#ffffff',
          borderWidth: 2,
          hoverOffset: 7,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 16,
            boxWidth: 9,
            font: { family: "'Space Grotesk', sans-serif", size: 12, weight: '500' },
            color: dark ? '#cbd5f5' : '#4a453e',
          },
        },
        tooltip: {
          backgroundColor: dark ? '#090a18' : '#1b1917',
          padding: 11,
          cornerRadius: 8,
          titleFont: { family: "'Space Grotesk', sans-serif", size: 12, weight: '700' },
          bodyFont: { family: "'Space Grotesk', sans-serif", size: 12 },
        },
      },
    },
  };
}

export function buildBarConfig({ labels, data, color, horizontal = false, yFormat, valueSuffix = '', dark = false }) {
  const gridColor = dark ? 'rgba(255, 255, 255, 0.08)' : '#eae4db';
  const tickColor = dark ? '#a8b0d8' : '#6b6359';
  return {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: color,
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 38,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: horizontal ? 'y' : 'x',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: dark ? '#090a18' : '#1b1917',
          padding: 11,
          cornerRadius: 8,
          callbacks: {
            label: (ctx) => {
              const val = horizontal ? ctx.parsed.x : ctx.parsed.y;
              if (yFormat) return ` ${yFormat(val)}`;
              return ` ${val}${valueSuffix}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: horizontal, color: gridColor },
          border: { display: false },
          ticks: {
            color: tickColor,
            font: { family: "'Space Grotesk', sans-serif", size: 11 },
          },
        },
        y: {
          grid: { display: !horizontal, color: gridColor },
          border: { display: false },
          ticks: {
            color: tickColor,
            font: { family: "'Space Grotesk', sans-serif", size: 11 },
            ...(yFormat && !horizontal ? { callback: yFormat } : {}),
          },
        },
      },
    },
  };
}
