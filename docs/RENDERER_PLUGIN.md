# 渲染器插件化指南

本文档介绍 K 线图表库的渲染器插件系统，包括如何使用、如何开发自定义渲染器插件，以及插件化后的渲染流程。

## 概述

渲染器插件系统允许开发者以插件形式注册渲染器，动态控制渲染内容的显示、隐藏、优先级和配置。

### 核心概念

| 概念 | 说明 |
|------|------|
| **RendererPlugin** | 渲染器插件接口，定义渲染器的名称、目标 pane、优先级和绘制方法 |
| **RendererPluginManager** | 渲染器插件管理器，负责注册、排序、启用/禁用和渲染调度 |
| **paneId** | 渲染目标面板标识，如 `'main'`（主图）、`'sub'`（副图）或 `GLOBAL_PANE_ID`（所有面板） |
| **priority** | 渲染优先级，数值越小越先渲染（类似 z-index） |

---

## 快速开始

### 安装渲染器插件

```typescript
import { Chart } from '@/core/chart'
import { 
  createCandleRenderer,
  createMARendererPlugin,
  createGridLinesRendererPlugin
} from '@/core/renderers'

const chart = new Chart(dom, options)

// 安装渲染器
chart.useRenderer(createGridLinesRendererPlugin())
chart.useRenderer(createCandleRenderer())
chart.useRenderer(createMARendererPlugin({ ma5: true, ma10: true }))
```

### 动态配置

```typescript
// 更新 MA 配置（自动触发重绘）
chart.updateRendererConfig('ma', { 
  ma5: false, 
  ma20: false 
})

// 启用/禁用渲染器
chart.setRendererEnabled('candle', false)
```

### 查询渲染器

```typescript
// 获取指定渲染器
const maRenderer = chart.getRenderer('ma')

// 获取所有渲染器
const allRenderers = chart.getAllRenderers()

// 获取渲染器配置
const config = maRenderer?.getConfig?.()
```

---

## 内置渲染器插件

| 工厂函数 | 名称 | paneId | 优先级 | 说明 |
|----------|------|--------|--------|------|
| `createCandleRenderer()` | candle | main | 50 | K线蜡烛图 |
| `createMARendererPlugin(config?)` | ma | main | 30 | MA均线 |
| `createGridLinesRendererPlugin()` | gridLines | GLOBAL | 10 | 网格线 |
| `createVolumeRendererPlugin()` | volume | sub | 50 | 成交量柱 |
| `createLastPriceLineRendererPlugin()` | lastPriceLine | main | 100 | 最新价虚线 |
| `createExtremaMarkersRendererPlugin()` | extremaMarkers | main | 80 | 极值标记 |

### 优先级常量

```typescript
import { RENDERER_PRIORITY } from '@/plugin'

RENDERER_PRIORITY.BACKGROUND  // 0   - 背景层
RENDERER_PRIORITY.GRID        // 10  - 网格线
RENDERER_PRIORITY.INDICATOR   // 30  - 指标（MA、BOLL等）
RENDERER_PRIORITY.MAIN        // 50  - 主图（K线）
RENDERER_PRIORITY.OVERLAY     // 80  - 叠加层（标记点）
RENDERER_PRIORITY.FOREGROUND  // 100 - 前景层（价格线）
```

---

## 开发自定义渲染器

### 基本结构

```typescript
import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'

export function createMyRenderer(): RendererPlugin {
  return {
    name: 'myRenderer',
    version: '1.0.0',
    description: '自定义渲染器',
    paneId: 'main',
    priority: RENDERER_PRIORITY.INDICATOR,

    draw(context: RenderContext) {
      const { ctx, pane, data, range, scrollLeft, kLinePositions } = context
      
      // 实现绘制逻辑
      ctx.save()
      ctx.translate(-scrollLeft, 0)
      
      // ... 绘制代码 ...
      
      ctx.restore()
    },
  }
}
```

### RenderContext 接口

```typescript
interface RenderContext {
  ctx: CanvasRenderingContext2D  // Canvas 上下文（已设置 DPR 缩放）
  pane: PaneInfo                 // 面板信息
  data: KLineData[]              // K线数据
  range: { start: number; end: number }  // 可见范围
  scrollLeft: number             // 滚动偏移
  kWidth: number                 // K线宽度
  kGap: number                   // K线间隔
  dpr: number                    // 设备像素比
  paneWidth: number              // 面板宽度
  kLinePositions: number[]       // K线 X 坐标数组
  markerManager?: MarkerManager  // 标记管理器
}

interface PaneInfo {
  id: string
  top: number
  height: number
  yAxis: {
    priceToY(price: number): number
    yToPrice(y: number): number
    getPaddingTop(): number
    getPaddingBottom(): number
  }
  priceRange: { maxPrice: number; minPrice: number }
}
```

### 支持配置的渲染器

```typescript
export function createConfigurableRenderer(
  initialConfig: { color?: string; lineWidth?: number } = {}
): RendererPlugin {
  let config = {
    color: '#FF0000',
    lineWidth: 2,
    ...initialConfig,
  }

  return {
    name: 'configurableRenderer',
    paneId: 'main',
    priority: RENDERER_PRIORITY.INDICATOR,

    draw(context: RenderContext) {
      const { ctx } = context
      ctx.strokeStyle = config.color
      ctx.lineWidth = config.lineWidth
      // ... 绘制逻辑 ...
    },

    getConfig() {
      return { ...config }
    },

    setConfig(newConfig: Record<string, unknown>) {
      config = { ...config, ...newConfig }
    },

    onUninstall() {
      // 清理资源
    },
  }
}
```

### 全局渲染器

渲染到所有面板（如水印、覆盖层）：

```typescript
import { GLOBAL_PANE_ID, RENDERER_PRIORITY } from '@/plugin'

export function createWatermarkRenderer(): RendererPlugin {
  return {
    name: 'watermark',
    paneId: GLOBAL_PANE_ID,  // 渲染到所有面板
    priority: RENDERER_PRIORITY.FOREGROUND,

    draw(context: RenderContext) {
      const { ctx, paneWidth, pane } = context
      ctx.save()
      ctx.globalAlpha = 0.1
      ctx.font = '24px Arial'
      ctx.fillStyle = '#999'
      ctx.textAlign = 'center'
      ctx.fillText('KMAP', paneWidth / 2, pane.height / 2)
      ctx.restore()
    },
  }
}
```

---

## 渲染流程

### 流程图

```
Chart.draw()
│
├── 1. 计算视口（computeViewport）
│   └── 获取 scrollLeft、plotWidth、dpr 等
│
├── 2. 计算可见范围（getVisibleRange）
│   └── 确定 start、end 索引
│
├── 3. 计算 K 线坐标（calcKLinePositions）
│   └── 生成 kLinePositions 数组
│
└── 4. 遍历面板渲染
    │
    ├── 4.1 更新价格范围（pane.updateRange）
    │
    ├── 4.2 清空 Canvas + 设置 DPR 缩放
    │
    ├── 4.3 绘制 Y 轴刻度（createYAxisRenderer）
    │
    └── 4.4 插件渲染器绘制
        │
        ├── rendererPluginManager.render(paneId, context)
        │   │
        │   ├── 获取该面板的渲染器列表（已按优先级排序）
        │   │
        │   └── 依次调用 renderer.draw(context)
        │       └── 错误隔离：单个渲染器异常不影响其他渲染器
        │
        └── 发送渲染错误事件（renderer:error）
```

### 渲染顺序

同一面板内，渲染器按优先级从小到大依次渲染：

```
priority 10  ─→ 网格线（先绘制，在最底层）
priority 30  ─→ MA均线
priority 50  ─→ K线蜡烛图
priority 80  ─→ 极值标记
priority 100 ─→ 最新价线（最后绘制，在最顶层）
```

### 生命周期

```
注册（register）
  └── 触发 onInstall（如果实现了 RendererPluginWithHost）
        └── 自动触发重绘

运行时
  ├── draw() - 每帧调用
  ├── onDataUpdate() - 数据更新时调用
  ├── onResize() - 尺寸变化时调用
  ├── setConfig() - 配置更新时调用
  └── setEnabled() - 启用/禁用时调用

卸载（unregister）
  └── 触发 onUninstall
        └── 自动触发重绘
```

---

## API 参考

### Chart 渲染器 API

| 方法 | 说明 |
|------|------|
| `useRenderer(plugin, config?)` | 安装渲染器插件 |
| `removeRenderer(name)` | 移除渲染器插件 |
| `getRenderer<T>(name)` | 获取渲染器插件 |
| `updateRendererConfig(name, config)` | 更新配置（自动重绘） |
| `setRendererEnabled(name, enabled)` | 启用/禁用渲染器 |
| `getAllRenderers()` | 获取所有渲染器 |

### RendererPlugin 接口

```typescript
interface RendererPlugin {
  // 必需属性
  readonly name: string        // 唯一标识
  paneId: string | typeof GLOBAL_PANE_ID  // 目标面板
  priority: number             // 渲染优先级
  
  // 必需方法
  draw(context: RenderContext): void
  
  // 可选属性
  readonly version?: string
  readonly description?: string
  readonly debugName?: string
  enabled?: boolean
  
  // 可选生命周期
  onDataUpdate?(data: KLineData[], range: VisibleRange): void
  onResize?(pane: PaneInfo): void
  onUninstall?(): void
  
  // 可选配置
  getConfig?(): Record<string, unknown>
  setConfig?(config: Record<string, unknown>): void
}
```

### 事件

```typescript
// 监听渲染错误
chart.plugin.events.on('renderer:error', ({ paneId, errors }) => {
  errors.forEach(({ name, error }) => {
    console.error(`Renderer ${name} error in ${paneId}:`, error.message)
  })
})
```

---

## 最佳实践

### 1. 使用工厂函数

每个 Chart 实例应使用独立的渲染器实例：

```typescript
// ❌ 错误：共享实例会导致状态污染
const renderer = createCandleRenderer()
chart1.useRenderer(renderer)
chart2.useRenderer(renderer)

// ✅ 正确：每个实例创建独立的渲染器
chart1.useRenderer(createCandleRenderer())
chart2.useRenderer(createCandleRenderer())
```

### 2. 利用优先级控制层级

```typescript
// 自定义叠加层应该在 K 线之上
chart.useRenderer({
  name: 'myOverlay',
  paneId: 'main',
  priority: RENDERER_PRIORITY.OVERLAY + 10, // 比极值标记更高
  draw(context) { /* ... */ },
})
```

### 3. 响应数据变化

```typescript
// 需要预计算数据的渲染器
export function createCalculationRenderer(): RendererPlugin {
  let cachedData: Map<number, number> = new Map()

  return {
    name: 'calculationRenderer',
    paneId: 'main',
    priority: RENDERER_PRIORITY.INDICATOR,

    onDataUpdate(data, range) {
      // 数据变化时更新缓存
      cachedData.clear()
      for (let i = range.start; i < range.end; i++) {
        // 计算并缓存
      }
    },

    draw(context) {
      // 使用缓存数据绘制
    },
  }
}
```

### 4. 清理资源

```typescript
export function createResourceRenderer(): RendererPlugin {
  let imageData: ImageData | null = null

  return {
    name: 'resourceRenderer',
    paneId: 'main',
    priority: RENDERER_PRIORITY.MAIN,

    draw(context) {
      if (!imageData) {
        imageData = context.ctx.createImageData(100, 100)
      }
      // 使用 imageData ...
    },

    onUninstall() {
      imageData = null  // 释放资源
    },
  }
}
```

---

## 迁移指南

### 从 setPaneRenderers 迁移

```typescript
// 旧 API（已废弃）
chart.setPaneRenderers('main', [
  GridLinesRenderer,
  CandleRenderer,
  createMARenderer({ ma5: true }),
])

// 新 API
chart.useRenderer(createGridLinesRendererPlugin())
chart.useRenderer(createCandleRenderer())
chart.useRenderer(createMARendererPlugin({ ma5: true }))
```

### 从 PaneRenderer 接口迁移

```typescript
// 旧接口
const OldRenderer: PaneRenderer = {
  draw({ ctx, pane, data, range, scrollLeft, kWidth, dpr }) {
    // ...
  },
}

// 新接口
function createNewRenderer(): RendererPlugin {
  return {
    name: 'newRenderer',
    paneId: 'main',
    priority: RENDERER_PRIORITY.MAIN,
    draw(context: RenderContext) {
      const { ctx, pane, data, range, scrollLeft, kWidth, dpr } = context
      // 相同的绘制逻辑
    },
  }
}
```

---

## 示例：完整的 BOLL 指标渲染器

```typescript
import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'

interface BOLLConfig {
  period: number
  multiplier: number
  showUpper: boolean
  showMiddle: boolean
  showLower: boolean
}

export function createBOLLRenderer(initialConfig: Partial<BOLLConfig> = {}): RendererPlugin {
  const config: BOLLConfig = {
    period: 20,
    multiplier: 2,
    showUpper: true,
    showMiddle: true,
    showLower: true,
    ...initialConfig,
  }

  // 计算 BOLL 数据
  function calculateBOLL(data: KLineData[], range: { start: number; end: number }) {
    const result: { upper: number[]; middle: number[]; lower: number[] } = {
      upper: [],
      middle: [],
      lower: [],
    }

    for (let i = range.start; i < range.end; i++) {
      if (i < config.period - 1) {
        result.upper.push(NaN)
        result.middle.push(NaN)
        result.lower.push(NaN)
        continue
      }

      // 计算中间线（MA）
      let sum = 0
      for (let j = i - config.period + 1; j <= i; j++) {
        sum += data[j]!.close
      }
      const ma = sum / config.period

      // 计算标准差
      let variance = 0
      for (let j = i - config.period + 1; j <= i; j++) {
        variance += Math.pow(data[j]!.close - ma, 2)
      }
      const std = Math.sqrt(variance / config.period)

      result.middle.push(ma)
      result.upper.push(ma + config.multiplier * std)
      result.lower.push(ma - config.multiplier * std)
    }

    return result
  }

  return {
    name: 'boll',
    version: '1.0.0',
    description: 'BOLL 布林带指标',
    debugName: 'BOLL',
    paneId: 'main',
    priority: RENDERER_PRIORITY.INDICATOR,

    draw(context: RenderContext) {
      const { ctx, pane, data, range, scrollLeft, dpr, kLinePositions } = context
      const klineData = data as KLineData[]
      
      if (klineData.length < config.period) return

      const bollData = calculateBOLL(klineData, range)

      ctx.save()
      ctx.translate(-scrollLeft, 0)

      const drawLine = (values: number[], color: string) => {
        ctx.beginPath()
        ctx.strokeStyle = color
        ctx.lineWidth = 1

        let started = false
        for (let i = 0; i < values.length; i++) {
          const val = values[i]
          if (Number.isNaN(val)) continue

          const x = kLinePositions[i]
          const y = pane.yAxis.priceToY(val)

          if (!started) {
            ctx.moveTo(x, y)
            started = true
          } else {
            ctx.lineTo(x, y)
          }
        }
        ctx.stroke()
      }

      // 绘制上轨
      if (config.showUpper) {
        drawLine(bollData.upper, '#FF6B6B')
      }

      // 绘制中轨
      if (config.showMiddle) {
        drawLine(bollData.middle, '#4ECDC4')
      }

      // 绘制下轨
      if (config.showLower) {
        drawLine(bollData.lower, '#45B7D1')
      }

      ctx.restore()
    },

    getConfig() {
      return { ...config }
    },

    setConfig(newConfig: Record<string, unknown>) {
      Object.assign(config, newConfig)
    },
  }
}
```

使用方式：

```typescript
chart.useRenderer(createBOLLRenderer({ period: 20, multiplier: 2 }))
chart.updateRendererConfig('boll', { showUpper: false })
```
