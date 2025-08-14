'use client';

import dynamic from 'next/dynamic';
import type { PlotData, Layout, Config } from 'plotly.js';

const Plot = dynamic(() => import('react-plotly.js'), { 
  ssr: false,
  loading: () => <div className="w-full h-full flex items-center justify-center">Loading chart...</div>
});

interface PlotlyChartProps {
  data: Partial<PlotData>[];
  layout?: Partial<Layout>;
  config?: Partial<Config>;
  className?: string;
}

export function PlotlyChart({ 
  data, 
  layout = {}, 
  config = {}, 
  className = '' 
}: PlotlyChartProps) {
  const defaultLayout = {
    autosize: true,
    margin: { l: 50, r: 30, t: 50, b: 50 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { 
      family: 'system-ui, sans-serif', 
      size: 12,
      color: 'hsl(var(--foreground))'
    },
    xaxis: {
      gridcolor: 'hsl(var(--border))',
      zerolinecolor: 'hsl(var(--border))',
      tickcolor: 'hsl(var(--muted-foreground))',
      linecolor: 'hsl(var(--border))'
    },
    yaxis: {
      gridcolor: 'hsl(var(--border))',
      zerolinecolor: 'hsl(var(--border))',
      tickcolor: 'hsl(var(--muted-foreground))',
      linecolor: 'hsl(var(--border))'
    },
    ...layout,
  };

  const defaultConfig: Partial<Config> = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'] as unknown as Config['modeBarButtonsToRemove'],
    ...config,
  };

  return (
    <div className={`w-full h-full ${className}`}>
      <Plot
        data={data}
        layout={defaultLayout}
        config={defaultConfig}
        style={{ width: '100%', height: '100%' }}
        useResizeHandler
      />
    </div>
  );
}