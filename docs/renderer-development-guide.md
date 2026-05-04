# 渲染器开发指南（Renderer Plugin Guide）

本文档基于当前仓库实现，指导如何在 KMap 中开发、注册、调试渲染器插件。

## 1. 先理解运行模型

渲染器不是直接挂在 Vue 上，而是通过 `Chart -> RendererPluginManager` 进入统一调度。

关键链路：
1. `KLineChart.vue` 创建 `Chart` 并 `useRenderer(...)` 注册插件。
2. `Chart.draw()` 每帧构建 `RenderContext`。
3. `RendererPluginManager.render(paneId, context)` 按优先级执行业务渲染器。
4. `isSystem` 渲染器通过 `renderPlugin(name, context)` 单独调度（例如 `timeAxis`）。

---

## 2. 核心接口（必须遵守）

定义位置：`src/plugin/types.ts`

```ts
interface RendererPlugin {
  readonly name: string
  paneId: string | symbol
  priority: number
  enabled?: boolean
  isSystem?: boolean

  draw(context: RenderContext): void

  onDataUpdate?(data: unknown[], range: { start: number; end: number }): void
  onResize?(pane: PaneInfo): void
  getConfig?(): Record<string, unknown>
  setConfig?(config: Record<string, unknown>): void
  onUninstall?(): void
}
```

扩展接口（可选）：
```ts
interface RendererPluginWithHost extends RendererPlugin {
  onInstall?(host: PluginHost): void
  getDeclaredNamespaces?(): string[]
}
```

---

## 3. 新渲染器开发步骤

### 步骤 1：确定渲染目标 pane

常见选择：
- `'main'`：主图
- `'sub_XXX'`：副图（如 `sub_MACD`）
- `GLOBAL_PANE_ID`：所有 pane
- 特殊系统面板（如时间轴）建议 `isSystem: true` + 单独调度

### 步骤 2：选择优先级

推荐常量：`RENDERER_PRIORITY`（`src/plugin/types.ts`）

- `GRID`(10)：网格
- `INDICATOR`(30)：指标线
- `MAIN`(50)：主图实体
- `OVERLAY`(80)：标记层
- `FOREGROUND`(100)：前景层
- `SYSTEM_*`：系统层（轴、边框、十字线）

经验：有遮挡关系时，后画的优先级要更大。

### 步骤 3：实现 `draw(context)`

最小模板：

```ts
import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'

export function createMyRenderer(): RendererPlugin {
  return {
    name: 'myRenderer',
    paneId: 'main',
    priority: RENDERER_PRIORITY.INDICATOR,

    draw(context: RenderContext) {
      const { ctx, pane, data, range, scrollLeft, dpr, kLinePositions } = context
      if (range.end <= range.start) return

      ctx.save()
      ctx.translate(-scrollLeft, 0)

      // 在这里绘制

      ctx.restore()
    },
  }
}
```

### 步骤 4：在组件中注册

位置参考：`src/components/KLineChart.vue:779`

```ts
chart.useRenderer(createMyRenderer())
```

如果支持配置更新：
```ts
chart.updateRendererConfig('myRenderer', { color: '#ff0' })
```

---

## 4. RenderContext 使用要点

`RenderContext` 关键字段：
- `ctx`：当前 pane 的 plot canvas 上下文（按逻辑坐标绘制）。
- `pane`：当前 pane 几何与 yAxis 映射能力。
- `data`：全量数据。
- `range`：当前可见索引区间（只画这个区间）。
- `scrollLeft`：世界坐标偏移，通常要 `translate(-scrollLeft, 0)`。
- `dpr`：当前有效 DPR（来自 Chart 统一决策）。
- `kLinePositions`：可见区 K 线左边界坐标（已与主渲染链对齐）。
- `yAxisCtx/xAxisCtx`：系统渲染器可使用的额外画布上下文。

关键原则：
- **不要自己读 `window.devicePixelRatio`**，统一使用 `context.dpr`。
- **不要自己重算 kline x 坐标**，优先使用 `kLinePositions`。
- 只处理 `range.start ~ range.end`，避免全量遍历。

---

## 5. 生命周期钩子何时用

### `onDataUpdate`
适合：缓存预计算结果（例如指标数组）。

### `onResize`
适合：pane 尺寸变化时重建局部缓存（注意该回调可覆盖 system renderer）。

### `onInstall`（RendererPluginWithHost）
适合：拿到 `PluginHost`，注册事件、读写共享状态。

### `onUninstall`
适合：清理内存引用、定时器、外部句柄。

---

## 6. 渲染器间通信（推荐模式）

当 A 渲染器的结果要被 B 渲染器消费时：
1. A 在 `draw` 或 `onDataUpdate` 里 `host.setSharedState(namespace, state, ownerId)`。
2. B 在 `draw` 里 `host.getSharedState(namespace)`。
3. A 实现 `getDeclaredNamespaces()` 让框架在卸载时自动清理。

参考实现：
- 生产状态：`src/core/renderers/Indicator/macd.ts:219`
- 消费状态：`src/core/renderers/Indicator/scale/macd_scale.ts:35`

---

## 7. System 渲染器约定

当渲染时机不能走普通 pane 主循环时，使用 system renderer：
- 设置 `isSystem: true`
- 用 `renderPlugin(name, context)` 单独触发

示例：`src/core/renderers/timeAxis.ts:23`。

注意：
- `render(paneId)` 会排除 system renderer。
- `notifyResize` 仍会通知已启用 system renderer（当前实现语义）。

---

## 8. 性能与稳定性实践

1. **只绘制可见区间**：严格依赖 `range`。
2. **减少对象分配**：高频路径少创建临时对象。
3. **缓存可缓存计算**：参数或数据未变化时复用。
4. **异常隔离**：尽量在插件内部避免抛错；管理器虽有隔离，但错误会进入 `renderer:error` 事件。
5. **像素对齐**：线条/柱体使用现有 `pixelAlign` 工具，避免模糊。

---

## 9. 调试与验证清单

### 功能验证
- 注册后是否按预期显示。
- `setRendererEnabled(name, false)` 是否立即生效。
- `updateRendererConfig` 后是否触发重绘并体现变化。
- 切换缩放/滚动/跨屏 DPR 时是否仍清晰对齐。

### 生命周期验证
- 删除渲染器后 `onUninstall` 是否执行。
- 使用共享状态时，卸载后状态是否被清理。

### 错误观测
监听：
```ts
chart.plugin.events.on('renderer:error', ({ paneId, errors }) => {
  // 上报或打印
})
```

---

## 10. 常见坑

1. `name` 重复：后注册会被拒绝。
2. 忘记 `ctx.save()/restore()`：污染后续渲染器状态。
3. 直接改 `pane` 结构：`pane` 视图是只读语义，不要写入。
4. 用 `window.devicePixelRatio` 做计算：会与主链路 DPR 脱节。
5. system renderer 误走普通渲染链：导致不绘制或时机错误。

---

## 11. 参考文件

- `src/plugin/types.ts`：渲染器接口定义
- `src/plugin/rendererPluginManager.ts`：调度与生命周期
- `src/core/chart.ts`：主渲染链入口
- `src/core/renderers/candle.ts`：主图绘制示例
- `src/core/renderers/gridLines.ts`：全局 pane 绘制示例
- `src/core/renderers/timeAxis.ts`：system renderer 示例
- `src/core/renderers/Indicator/macd.ts`：共享状态生产示例
- `src/core/renderers/Indicator/scale/macd_scale.ts`：共享状态消费示例
