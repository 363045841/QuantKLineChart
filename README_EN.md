# kmap - Financial Charting Library

English | [简体中文](README.md)

A financial charting library based on Vue 3 and Canvas, focusing on high-performance K-line (candlestick) chart rendering. The library supports horizontal scrolling, moving average (MA) display, and financial data retrieval from multiple sources including **BaoStock** and AKTools.

[NPM](https://www.npmjs.com/package/@363045841yyt/klinechart) | [GitHub](https://github.com/363045841/KLineChartQuant)

## Features

- **Canvas-based**: High-performance K-line chart rendering using Canvas
- **Responsive Design**: Adapts to different screen sizes, supports all device pixel ratios (DPR) for crisp rendering
- **ResizeObserver-driven HD Rendering**: Single-chain automatic maintenance of Canvas size and DPR, ensuring consistently crisp drawing during browser zoom, cross-screen dragging, and container resizing
- **Wick Handling**: Unified DPR coordinate calculation ensures wicks are perfectly centered and crisp across all DPR screens
- **Pixel Alignment**: Unified coordinate source with physical-level pixel alignment, eliminating sub-pixel rendering for sharp, crisp lines
- **Framework-agnostic**: Core logic is completely independent, not tied to any specific framework
- **Plugin Architecture**: Renderer plugins support dynamic registration, configuration and lifecycle management
- **Volume-Price Annotation**: Automatically identifies and annotates four patterns: volume-price rise, divergence, etc.

![pasted-image-1777718129484.webp](https://files.seeusercontent.com/2026/05/02/Lm0w/pasted-image-1777718129484.webp)
![(ZOS$O}EP(_NKI273RXBV17.png](https://files.seeusercontent.com/2026/04/29/olU0/ZOSOEP_NKI273RXBV17.png)
![YU8@~$21%{NBJLGIZ}KTKED.png](https://files.seeusercontent.com/2026/04/29/akQ8/YU821NBJLGIZKTKED.png)

### Agent Semantic Control

- **JSON Configuration Driven**: Accepts JSON configuration via `semanticConfig` prop, allowing AI Agents to directly control chart rendering
- **Custom Markers**: Supports 6 preset shapes (arrow_up, arrow_down, flag, circle, rectangle, diamond), marker size auto-adapts with K-line scaling
- **Comprehensive Indicators**: Main chart MA/BOLL/EXPMA/ENE, sub-chart MACD/RSI/CCI/STOCH/MOM/WMSR/KST/FASTK/VOLUME
- **Security Validation**: JSON Schema validation, prototype pollution protection, color XSS protection, input boundary checking
- **Date-Friendly Format**: Uses `YYYY-MM-DD` natural date format for easy Agent output

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
├── semantic/                # Semantic configuration module (Agent control)
│   ├── types.ts             # Type definitions
│   ├── schema.json          # JSON Schema
│   ├── validator.ts         # Validator
│   ├── controller.ts        # Controller
│   └── drawShape.ts         # Shape drawing
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
  <KLineChart :semanticConfig="config" />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import KLineChart from '@/components/KLineChart.vue'
import type { SemanticChartConfig } from '@/semantic'

const config = ref<SemanticChartConfig>({
  version: '1.0.0',
  data: {
    source: 'baostock',
    symbol: '601360',
    exchange: 'SH',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    period: 'daily',
    adjust: 'qfq',
  },
  indicators: {
    main: [{ type: 'MA', enabled: true, params: { periods: [5, 10, 20] } }],
    sub: [{ type: 'MACD', enabled: true }],
  },
  chart: {
    kWidth: 10,
    kGap: 2,
    autoScrollToRight: true,
  },
})
</script>
```

### Semantic JSON Control (Agent Mode)

Through the `semanticConfig` prop, AI Agents can fully control chart rendering with JSON configuration:

```vue
<template>
  <KLineChart :semanticConfig="config" />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { SemanticChartConfig } from '@363045841yyt/klinechart'

const config = ref<SemanticChartConfig>({
  version: '1.0.0',
  data: {
    source: 'baostock',
    symbol: '600519',
    exchange: 'SH',
    startDate: '2025-01-01',
    endDate: '2025-04-18',
    period: 'daily',
    adjust: 'qfq',
  },
  indicators: {
    main: [{ type: 'MA', enabled: true, params: { periods: [5, 10, 20] } }],
    sub: [{ type: 'MACD', enabled: true }],
  },
  markers: {
    customMarkers: [
      {
        id: 'buy_001',
        date: '2025-02-15',
        shape: 'arrow_up',
        label: { text: 'Buy' },
        style: { fillColor: '#52c41a' },
      },
    ],
  },
})
</script>
```

For detailed configuration, please refer to [Semantic Configuration Documentation](./docs/semantic-config.md).

## Data Source Configuration

### BaoStock (Recommended)

Free and open-source Python securities data interface.

```bash
# Option 1: Manual install and start
uv pip install baostock
git clone https://github.com/363045841/stockbao.git
cd stockbao
uv run python ./server.py

# Option 2: Use built-in project script (requires stockbao in parent directory)
pnpm stockbao
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
| semanticConfig | SemanticChartConfig | - | **Required**. Semantic configuration (the only control source) |
| kWidth | number | 10 | K-line body width |
| kGap | number | 2 | K-line gap |
| yPaddingPx | number | 0 | Y-axis padding pixels |
| minKWidth | number | 2 | Minimum K-line width |
| maxKWidth | number | 50 | Maximum K-line width |
| rightAxisWidth | number | 0 | Right price axis width |
| bottomAxisHeight | number | 24 | Bottom time axis height |
| priceLabelWidth | number | 60 | Price label extra width (for displaying change percentage) |

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

- [NPM Package](https://www.npmjs.com/package/@363045841yyt/klinechart)
- [GitHub Repository](https://github.com/363045841/KLineChartQuant)
- [Vue.js Documentation](https://vuejs.org/guide/introduction.html)
- [Vite Documentation](https://vite.dev/guide/)
- [BaoStock Documentation](http://baostock.com/)
- [AKTools Documentation](https://github.com/akfamily/aktools)
- [Canvas API MDN](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [Vitest Documentation](https://vitest.dev/)
- [Semantic Configuration Documentation](./docs/semantic-config.md)
- [Architecture Documentation (ResizeObserver Refactored)](./docs/architecture.md)
- [System Architecture Overview](./docs/system-architecture-overview.md)
- [Renderer Development Guide](./docs/renderer-development-guide.md)

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE) file for details.
