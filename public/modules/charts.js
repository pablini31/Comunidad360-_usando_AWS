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

export function buildDoughnutConfig({ labels, data, colors, cutout = '66%' }) {
  return {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors,
          borderColor: '#ffffff',
          borderWidth: 2,
          hoverOffset: 6,
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
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 12, weight: '500' },
            color: '#475569',
          },
        },
        tooltip: {
          backgroundColor: '#0f172a',
          padding: 10,
          cornerRadius: 8,
          titleFont: { family: "'Plus Jakarta Sans', sans-serif", size: 12, weight: '700' },
          bodyFont: { family: "'Plus Jakarta Sans', sans-serif", size: 12 },
        },
      },
    },
  };
}

export function buildBarConfig({ labels, data, color, horizontal = false, yFormat, valueSuffix = '' }) {
  const gridColor = '#e9eef5';
  const tickColor = '#64748b';
  return {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: color,
          borderRadius: 7,
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
          backgroundColor: '#0f172a',
          padding: 10,
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
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 },
          },
        },
        y: {
          grid: { display: !horizontal, color: gridColor },
          border: { display: false },
          ticks: {
            color: tickColor,
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 },
            ...(yFormat && !horizontal ? { callback: yFormat } : {}),
          },
        },
      },
    },
  };
}
