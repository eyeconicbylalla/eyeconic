export const CHART_DARK_DEFAULTS = {
  color: '#94A3B8',
  plugins: {
    legend: {
      labels: {
        color: '#CBD5E1',
        font: { family: 'Inter, system-ui, sans-serif' },
      },
    },
    tooltip: {
      backgroundColor: '#18222E',
      titleColor: '#F8FAFC',
      bodyColor: '#CBD5E1',
      borderColor: 'rgba(255,255,255,0.08)',
      borderWidth: 1,
    },
  },
  scales: {
    x: {
      grid: { color: '#263445' },
      ticks: { color: '#94A3B8' },
      border: { color: '#263445' },
    },
    y: {
      grid: { color: '#263445' },
      ticks: { color: '#94A3B8' },
      border: { color: '#263445' },
    },
  },
};

export const CHART_DARK_BAR_COLORS = {
  without: '#1E2A38',
  withEyeconic: '#18B6A4',
};
