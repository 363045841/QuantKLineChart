# kmap - Financial Charting Library

English | [简体中文](README.md)

A financial charting library based on Vue 3 and Canvas, focusing on high-performance K-line (candlestick) chart rendering. The library supports horizontal scrolling, moving average (MA) display, and financial data retrieval from multiple sources including **BaoStock** and AKTools.

![pasted-image-1775748542822.webp](https://files.seeusercontent.com/2026/04/09/u0nK/pasted-image-1775748542822.webp)

## Features

- **Canvas-based**: High-performance K-line chart rendering using Canvas
- **Responsive Design**: Adapts to different screen sizes, supports all device pixel ratios (DPR) for crisp rendering
- **Wick Handling**: Unified DPR coordinate calculation ensures wicks are perfectly centered and crisp across all DPR screens
- **Pixel Alignment**: Unified coordinate source with physical-level pixel alignment, eliminating sub-pixel rendering for sharp, crisp lines
- **Framework-agnostic**: Core logic is completely independent, not tied to any specific framework
- **Plugin Architecture**: Renderer plugins support dynamic registration, configuration and lifecycle management
- **Volume-Price Annotation**: Automatically identifies and annotates four patterns: volume-price rise, divergence, etc.

## Tech Stack

- [Vue 3](https://vuejs.org/) - Progressive JavaScript Framework
- [Rolldown Vite](https://vite.dev/guide/rolldown) - Next-generation frontend build tool
- [TypeScript](https://www.typescriptlang.org/)
- [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [Vitest](https://vitest.dev/) - Unit testing framework

## Project Structure

```
src/
├── api/                     # API interface definitions
│   └── data/                # Data source interfaces
├── components/              # Vue components
│   ├── KLineChart.vue       # K-line chart main component
│   ├── IndicatorSelector.vue # Indicator selector
│   └── IndicatorParams.vue  # Indicator parameter editor
├── core/                    # Core rendering engine
│   ├── chart.ts             # Chart controller
│   ├── renderers/           # Renderer plugins
│   │   ├── candle.ts        # K-line renderer
│   │   ├── ma.ts            # MA renderer
│   │   ├── boll.ts          # BOLL renderer
│   │   ├── macd.ts          # MACD renderer
│   │   ├── volume.ts        # Volume renderer
│   │   └── ...              # Other renderers
│   ├── theme/               # Theme configuration
│   ├── marker/              # Marker system
│   └── utils/               # Core utilities
├── plugin/                  # Plugin system
│   ├── types.ts             # Type definitions
│   ├── PluginHost.ts        # Plugin host
│   ├── EventBus.ts          # Event bus
│   ├── HookSystem.ts        # Hook system
│   └── rendererPluginManager.ts  # Renderer manager
├── types/                   # Type definitions
└── utils/                   # Utility functions
```

## Data Sources

- [BaoStock](http://baostock.com/) - Open-source financial data API, supports 100,000 API calls per day
- [AKTools](https://github.com/akfamily/aktools) - Open-source financial data API library (may have anti-scraping limitations)

## Install via NPM

```bash
npm i @363045841yyt/klinechart
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev
```

## Usage Example

```vue
<template>
  <KLineChart
    :data="klineData"
    :kWidth="10"
    :kGap="2"
    :yPaddingPx="60"
    :showMA="{ ma5: true, ma10: true, ma20: true }"
    :autoScrollToRight="true"
  />
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import KLineChart from '@/components/KLineChart.vue'
import type { KLineData } from '@/types/price'

const klineData = ref<KLineData[]>([])

onMounted(async () => {
  // Fetch K-line data from data source
  const data = await fetchKLineData('baostock', {
    symbol: 'sh.601360',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    period: 'daily',
    adjust: 'qfq',
  })
  klineData.value = data
})
</script>
```

## Data Source Configuration

### BaoStock (Recommended)

Free and open-source Python securities data interface.

```bash
uv pip install baostock
git clone https://github.com/363045841/stockbao.git
python server.py  # Start service
```

### AKTools

Python-based open-source financial data interface.

```bash
uv pip install aktools
uv run python -m aktools  # Start service
```

> ⚠️ Note: AKTools connects directly to API, frequent requests may trigger anti-scraping mechanisms

### Component Props

| Prop | Type | Default | Description |
|------|------|--------|------|
| data | KLineData[] | [] | K-line data array |
| kWidth | number | 10 | K-line body width |
| kGap | number | 2 | K-line gap |
| yPaddingPx | number | 60 | Y-axis padding pixels |
| showMA | MAFlags | { ma5: true, ma10: true, ma20: true } | Moving average configuration |
| autoScrollToRight | boolean | true | Auto-scroll to right after data update |

## Environment Requirements

- Node.js: ^20.19.0 || >=22.12.0
- pnpm: Package manager
- Python: For running data source service (optional)
- uv: Python package manager

## Build & Deployment

```bash
pnpm build    # Production build
pnpm preview  # Preview production build
```

## Related Links

- [Vue.js Documentation](https://vuejs.org/guide/introduction.html)
- [Vite Documentation](https://vite.dev/guide/)
- [BaoStock Documentation](http://baostock.com/)
- [AKTools Documentation](https://github.com/akfamily/aktools)
- [Canvas API MDN](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [Vitest Documentation](https://vitest.dev/)

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE) file for details.
