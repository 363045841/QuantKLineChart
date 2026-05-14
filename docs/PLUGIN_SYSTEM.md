# 插件系统设计与使用指南

## 一、背景与目标

KMap 是一个基于 Vue 3 + TypeScript + Canvas 的 K 线图表库。为了提升可扩展性，我们从独立的 MVP 原型项目 (`pluginmvp`) 迁移了一套最小化插件系统，实现以下目标：

1. **解耦扩展能力** - 渲染器、指标、数据源等可通过插件扩展
2. **统一通信机制** - 提供事件总线和钩子系统，插件间松耦合通信
3. **最小侵入性** - 保持现有代码稳定，通过组合方式集成

---

## 二、迁移过程

### 2.1 原型项目架构分析

MVP 插件系统 (`pluginmvp`) 采用模块化设计，核心组件：

```
pluginmvp/src/
├── core/
│   ├── types.ts           # 类型定义
│   ├── PluginHost.ts      # 插件宿主（核心管理类）
│   └── PluginRegistry.ts  # 插件注册表
├── events/
│   └── EventBus.ts        # 发布-订阅事件总线
├── hooks/
│   └── HookSystem.ts      # 钩子系统（支持优先级）
├── config/
│   └── ConfigManager.ts   # 插件配置管理
└── index.ts               # 导出入口
```

**核心概念：**
- **PluginHost** - 宿主，管理插件生命周期，暴露 API 给插件使用
- **Plugin** - 插件接口，包含 `name`、`version`、`install()`、`uninstall()`
- **EventBus** - 发布-订阅模式，插件间松耦合通信
- **HookSystem** - 拦截点扩展，支持优先级排序
- **ConfigManager** - 插件级别配置隔离

### 2.2 迁移策略

**选择组合模式而非继承：**

```typescript
// ✅ 组合模式（采用）
class Chart {
  private pluginHost: PluginHostImpl
  
  get plugin() {
    return this.pluginHost
  }
}

// ❌ 继承模式（未采用）
class Chart extends PluginHostImpl { ... }
```

组合模式的优点：
- 职责分离：Chart 专注渲染，PluginHost 专注插件管理
- 解耦：插件系统可独立测试、复用
- 扩展灵活：未来可替换或升级插件系统

### 2.3 迁移步骤

**Step 1: 创建目录结构**

```
kmap/src/plugin/
├── index.ts           # 导出入口
├── types.ts           # 类型定义
├── PluginHost.ts      # 插件宿主
├── PluginRegistry.ts  # 插件注册表
├── EventBus.ts        # 事件总线
├── HookSystem.ts      # 钩子系统
└── ConfigManager.ts   # 配置管理器
```

**Step 2: 复制并修改导入路径**

原项目使用 `.js` 后缀，改为 TypeScript 无后缀：

```typescript
// 原
import type { Plugin } from './types.js'

// 改
import type { Plugin } from './types'
```

**Step 3: 集成到 Chart 类**

```typescript
// chart.ts
import { createPluginHost, type PluginHostImpl } from '@/plugin'

export class Chart {
  private pluginHost: PluginHostImpl

  constructor(dom: ChartDom, opt: ChartOptions) {
    // ...
    this.pluginHost = createPluginHost()
  }

  get plugin(): PluginHostImpl {
    return this.pluginHost
  }

  async destroy() {
    // ...
    await this.pluginHost.destroy()
  }
}
```

**Step 4: 暴露到组件**

```typescript
// KLineChart.vue
defineExpose({
  scheduleRender,
  scrollToRight,
  get plugin() {
    return chartRef.value?.plugin
  },
})
```

---

## 三、插件系统架构

### 3.1 核心接口

```typescript
// 插件接口
interface Plugin extends PluginMeta {
  name: string
  version: string
  description?: string
  author?: string
  install(host: PluginHost, config?: Record<string, unknown>): void | Promise<void>
  uninstall?(): void | Promise<void>
}

// 插件宿主接口（暴露给插件使用的 API）
interface PluginHost {
  readonly events: {
    on<T>(event: string, handler: (data: T) => void): void
    off<T>(event: string, handler: (data: T) => void): void
    emit<T>(event: string, data: T): void
    once<T>(event: string, handler: (data: T) => void): void
  }

  readonly hooks: {
    tap<T, R>(hookName: string, fn: (ctx: T) => R | Promise<R>, priority?: number): void
    untap(hookName: string, fn: HookFn): void
    call<T, R>(hookName: string, context: T): Promise<R[]>
    callSync<T, R>(hookName: string, context: T): R[]
  }

  getConfig<K>(pluginName: string, key: string, defaultValue?: K): K
  setConfig(pluginName: string, key: string, value: unknown): void
  getPlugin<T extends Plugin>(name: string): T | undefined
  log(level: 'info' | 'warn' | 'error', message: string, ...args: unknown[]): void
}
```

### 3.2 生命周期

```
┌─────────────┐    use()     ┌────────────┐
│   Created   │ ───────────▶ │ Registered │
└─────────────┘              └────────────┘
                                  │
                     install()    │
                     ─────────────┼────────────▶ ┌───────────┐
                     emit events  │              │ Installed │
                     call hooks   │              └───────────┘
                                  │                    │
                                  │      remove()      │
                                  │  ◀─────────────────┤
                                  │                    │
                                  │                    ▼
                                  │              ┌───────────┐
                                  └─────────────▶│ Destroyed │
                                                 └───────────┘
```

**生命周期钩子：**
- `plugin:beforeInstall` - 插件安装前
- `plugin:afterInstall` - 插件安装后
- `plugin:beforeUninstall` - 插件卸载前
- `plugin:afterUninstall` - 插件卸载后

### 3.3 通信机制

**1. EventBus - 发布订阅**

```typescript
// 订阅事件
host.events.on('chart:draw', (data) => {
  console.log('Chart drawn', data)
})

// 发布事件
host.events.emit('chart:draw', { timestamp: Date.now() })

// 一次性订阅
host.events.once('chart:init', () => {
  console.log('Chart initialized (only once)')
})
```

**2. HookSystem - 拦截扩展**

```typescript
// 注册钩子（优先级越小越先执行）
host.hooks.tap('chart:beforeDraw', (ctx) => {
  console.log('Before draw', ctx.chart)
  return ctx
}, 10)

// 触发钩子
await host.hooks.call('chart:beforeDraw', { chart })

// 同步触发
host.hooks.callSync('chart:beforeDraw', { chart })
```

**3. getPlugin - 直接调用**

```typescript
interface AnalyticsPlugin extends Plugin {
  track(event: string, data: unknown): void
}

const analytics = host.getPlugin<AnalyticsPlugin>('analytics')
analytics?.track('user_click', { x: 100, y: 200 })
```

---

## 四、插件使用方法

### 4.1 安装插件

```vue
<template>
  <KLineChart ref="chartRef" :data="kdata" />
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { Plugin } from '@/plugin'

const chartRef = ref()

const myPlugin: Plugin = {
  name: 'my-plugin',
  version: '1.0.0',
  description: '我的自定义插件',
  
  install(host, config) {
    console.log('Plugin installed with config:', config)
    
    // 监听事件
    host.events.on('chart:draw', () => {
      console.log('Chart rendered!')
    })
    
    // 注册钩子
    host.hooks.tap('chart:beforeDraw', (ctx) => {
      // 在绘制前做些事情
      return ctx
    })
  },
  
  uninstall() {
    console.log('Plugin removed')
  }
}

onMounted(async () => {
  // 安装插件
  await chartRef.value.plugin.use(myPlugin, { enabled: true })
  
  // 查看已安装插件
  const plugins = chartRef.value.plugin.getPlugins()
  console.log('Installed plugins:', plugins)
})
</script>
```

### 4.2 移除插件

```typescript
await chartRef.value.plugin.remove('my-plugin')
```

### 4.3 查看插件状态

```typescript
const host = chartRef.value.plugin

// 获取所有插件
const plugins = host.getPlugins()
// [{ plugin: {...}, config: {...}, state: 'installed' }]

// 获取单个插件
const myPlugin = host.getPlugin('my-plugin')

// 获取插件状态
const state = host.getState('my-plugin') // 'installed' | 'registered' | 'error'
```

---

## 五、插件开发指南

### 5.1 基本结构

```typescript
import type { Plugin, PluginHost } from '@/plugin'

export interface MyPluginConfig {
  enabled?: boolean
  threshold?: number
}

export class MyPlugin implements Plugin {
  name = 'my-plugin'
  version = '1.0.0'
  description = '插件描述'
  
  private host?: PluginHost
  private config: MyPluginConfig = { enabled: true, threshold: 100 }
  
  async install(host: PluginHost, config?: Record<string, unknown>) {
    this.host = host
    
    // 合并配置
    if (config) {
      this.config = { ...this.config, ...config }
    }
    
    // 读取配置
    const threshold = host.getConfig('my-plugin', 'threshold', 100)
    
    // 注册事件监听
    host.events.on('chart:draw', this.onChartDraw)
    
    // 注册钩子
    host.hooks.tap('chart:beforeDraw', this.beforeDraw, 10)
    
    // 初始化逻辑...
  }
  
  async uninstall() {
    // 清理事件监听
    this.host?.events.off('chart:draw', this.onChartDraw)
    
    // 清理资源...
  }
  
  private onChartDraw = (data: unknown) => {
    console.log('Chart draw event:', data)
  }
  
  private beforeDraw = (ctx: { chart: Chart }) => {
    // 处理逻辑
    return ctx
  }
  
  // 暴露公共方法供其他插件调用
  public doSomething() {
    return 'result'
  }
}

// 导出工厂函数
export function createMyPlugin(config?: MyPluginConfig): Plugin {
  return new MyPlugin()
}
```

### 5.2 最佳实践

**1. 事件命名规范**

```typescript
// 推荐：模块:动作
'chart:draw'
'chart:resize'
'data:update'
'interaction:click'
'plugin:install'

// 避免
'draw'
'update'
'click'
```

**2. 钩子命名规范**

```typescript
// 推荐：before/after + 动作
'chart:beforeDraw'
'chart:afterDraw'
'data:beforeUpdate'
'data:afterUpdate'

// 状态变更
'indicator:calculate'
'renderer:draw'
```

**3. 清理资源**

```typescript
async uninstall() {
  // 移除事件监听
  this.host?.events.off('chart:draw', this.handler)
  
  // 清除定时器
  if (this.timer) {
    clearInterval(this.timer)
    this.timer = null
  }
  
  // 释放引用
  this.host = undefined
}
```

**4. 错误处理**

```typescript
async install(host: PluginHost, config?: Record<string, unknown>) {
  try {
    // 初始化逻辑
  } catch (error) {
    host.log('error', 'Failed to initialize:', error)
    throw error // 重新抛出，让宿主处理
  }
}
```

### 5.3 插件类型定义

```typescript
// 扩展 Plugin 接口以暴露公共方法
export interface AnalyticsPlugin extends Plugin {
  track(event: string, data?: Record<string, unknown>): void
  identify(userId: string): void
}

// 使用
const analytics = host.getPlugin<AnalyticsPlugin>('analytics')
analytics?.track('page_view', { page: 'chart' })
```

---

## 六、Renderer 与插件系统的适配分析

### 6.1 当前 Renderer 架构

```
src/core/renderers/
├── candle.ts           # K 线渲染器
├── gridLines.ts        # 网格线渲染器
├── ma.ts               # MA 均线渲染器
├── crosshair.ts        # 十字线渲染器
├── lastPrice.ts        # 最新价格线渲染器
├── extremaMarkers.ts   # 极值点标记渲染器
├── subVolume.ts        # 副图成交量渲染器
└── yAxis.ts            # Y 轴渲染器
```

**当前接口定义 (`src/core/layout/pane.ts`)：**

```typescript
export interface PaneRenderer {
  draw(args: {
    ctx: CanvasRenderingContext2D
    pane: Pane
    data: KLineData[]
    range: VisibleRange
    scrollLeft: number
    kWidth: number
    kGap: number
    dpr: number
    paneWidth: number
    kLinePositions: number[]
    markerManager?: MarkerManager
  }): void
}
```

**使用方式：**

```typescript
// KLineChart.vue
chart.setPaneRenderers('main', [
  GridLinesRenderer,
  ExtremaMarkersRenderer,
  createMARenderer(props.showMA),
  CandleRenderer,
  LastPriceLineRenderer,
])
```

### 6.2 适配方案

**方案 A：Renderer 作为插件（推荐）**

将渲染器封装为插件，通过钩子注册到渲染链：

```typescript
// 定义渲染器插件接口
interface RendererPlugin extends Plugin {
  priority: number  // 渲染顺序
  paneId: 'main' | 'sub' | string
  draw(ctx: RenderContext): void
}

// 示例：MA 均线插件
const MARendererPlugin: RendererPlugin = {
  name: 'ma-renderer',
  version: '1.0.0',
  priority: 30,  // 数字越大越后渲染
  
  async install(host) {
    // 注册渲染钩子
    host.hooks.tap('pane:render', (ctx) => {
      if (ctx.paneId === 'main') {
        this.draw(ctx)
      }
      return ctx
    }, this.priority)
  },
  
  draw(ctx) {
    // 绘制 MA 线
  }
}

// 使用
await chart.plugin.use(MARendererPlugin)
```

**方案 B：插件管理渲染器（轻量适配）**

保持现有渲染器不变，通过插件动态注册/移除：

```typescript
const indicatorPlugin: Plugin = {
  name: 'indicator-manager',
  version: '1.0.0',
  
  install(host) {
    // 提供注册渲染器的 API
    host.events.on('indicator:add', (indicator) => {
      const chart = this.getChart()
      const renderer = this.createRenderer(indicator)
      chart.addRenderer(indicator.paneId, renderer)
    })
    
    host.events.on('indicator:remove', (indicatorId) => {
      // 移除渲染器
    })
  }
}
```

### 6.3 推荐扩展点

| 扩展点 | 触发时机 | 用途 |
|--------|----------|------|
| `chart:beforeDraw` | 绘制前 | 预处理数据、调整配置 |
| `chart:afterDraw` | 绘制后 | 后处理、性能统计 |
| `pane:beforeRender` | Pane 渲染前 | 插入自定义渲染 |
| `pane:afterRender` | Pane 渲染后 | 叠加层绘制 |
| `data:beforeUpdate` | 数据更新前 | 数据转换、过滤 |
| `data:afterUpdate` | 数据更新后 | 指标计算 |
| `interaction:click` | 点击事件 | 自定义交互 |
| `interaction:hover` | 悬停事件 | 自定义提示 |

### 6.4 添加扩展点示例

修改 `Chart.draw()` 方法：

```typescript
draw() {
  // 触发绘制前钩子
  this.pluginHost.hooks.callSync('chart:beforeDraw', { chart: this })
  
  // 重置 Marker 标记
  this.markerManager.clear()
  
  // ... 现有渲染逻辑 ...
  
  // 触发绘制后钩子
  this.pluginHost.hooks.callSync('chart:afterDraw', { chart: this })
  
  // 发送事件
  this.pluginHost.events.emit('chart:draw', { timestamp: Date.now() })
}
```

---

## 七、完整示例：自定义指标插件

```typescript
import type { Plugin, PluginHost } from '@/plugin'
import type { KLineData } from '@/types/price'

interface BOLLConfig {
  period: number
  stdDev: number
}

export class BOLLIndicatorPlugin implements Plugin {
  name = 'boll-indicator'
  version = '1.0.0'
  description = '布林带指标'
  
  private host?: PluginHost
  private config: BOLLConfig = { period: 20, stdDev: 2 }
  
  async install(host: PluginHost, config?: Record<string, unknown>) {
    this.host = host
    
    if (config) {
      this.config = { ...this.config, ...config as BOLLConfig }
    }
    
    // 监听数据更新，计算指标
    host.events.on('data:afterUpdate', this.calculateBOLL)
    
    // 注册渲染钩子
    host.hooks.tap('pane:afterRender', this.renderBOLL, 50)
    
    host.log('info', `BOLL indicator installed (period: ${this.config.period})`)
  }
  
  async uninstall() {
    this.host?.events.off('data:afterUpdate', this.calculateBOLL)
    this.host?.hooks.untap('pane:afterRender', this.renderBOLL)
  }
  
  private calculateBOLL = (data: { klineData: KLineData[] }) => {
    const { period, stdDev } = this.config
    const closes = data.klineData.map(d => d.close)
    
    // 计算 SMA
    const sma = this.calculateSMA(closes, period)
    
    // 计算标准差
    const std = this.calculateStd(closes, period)
    
    // 计算上下轨
    const upper = sma.map((v, i) => v + std[i] * stdDev)
    const lower = sma.map((v, i) => v - std[i] * stdDev)
    
    // 存储结果供渲染使用
    this.bollData = { sma, upper, lower }
    
    this.host?.events.emit('boll:calculated', this.bollData)
  }
  
  private renderBOLL = (ctx: RenderContext) => {
    if (!this.bollData || ctx.paneId !== 'main') return
    
    const { sma, upper, lower } = this.bollData
    const { ctx: canvasCtx, range, kLinePositions } = ctx
    
    // 绘制布林带
    this.drawBollBands(canvasCtx, sma, upper, lower, range, kLinePositions)
  }
  
  // ... 其他辅助方法 ...
  
  private bollData?: { sma: number[], upper: number[], lower: number[] }
  
  // 获取最新布林带数据（供其他插件使用）
  getBOLLData() {
    return this.bollData
  }
}

// 使用
import { BOLLIndicatorPlugin } from './plugins/boll-indicator'

const bollPlugin = new BOLLIndicatorPlugin()
await chart.plugin.use(bollPlugin, { period: 20, stdDev: 2 })

// 其他插件获取数据
const bollData = chart.plugin.getPlugin<BOLLIndicatorPlugin>('boll-indicator')?.getBOLLData()
```

---

## 八、总结

### 已完成

- ✅ 插件系统核心迁移（EventBus、HookSystem、ConfigManager、PluginHost）
- ✅ 集成到 Chart 类（组合模式）
- ✅ 暴露到 Vue 组件（defineExpose）
- ✅ 单元测试覆盖（14 个测试用例全部通过）

### 待扩展

- 🔲 Chart 类添加扩展点（beforeDraw、afterDraw 等）
- 🔲 Renderer 插件化封装
- 🔲 指标插件系统
- 🔲 交互插件系统
- 🔲 主题插件系统

### 设计原则

1. **最小侵入** - 不破坏现有代码结构
2. **按需扩展** - 扩展点按实际需要逐步添加
3. **类型安全** - 完整的 TypeScript 类型支持
4. **测试驱动** - 核心功能有单元测试覆盖
