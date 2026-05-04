# KMap 系统架构综述（2026-05）

本文面向当前仓库的实际实现，给出系统级架构评审结论、核心链路与模块职责。

## 1. 架构评审结论

整体结论：当前系统已形成“Vue 壳层 + Chart 核心 + 插件渲染 + 语义化控制”的分层架构，职责边界清晰，扩展性良好。

主要优点：
- **DPR/尺寸真源统一**：`Chart` 内通过 `ResizeObserver` 统一维护尺寸与 DPR，绘制和交互共享 viewport。
- **渲染扩展机制成熟**：渲染器插件化后，优先级、启停、配置更新和错误隔离都集中在 `RendererPluginManager`。
- **生命周期一致性提升**：插件安装/卸载、hook 调用、配置与状态清理语义基本一致。
- **语义化入口稳定**：`SemanticChartController` 作为外部 JSON 配置入口，负责校验与应用，降低 UI 直连核心逻辑的耦合。

主要风险/改进点：
- `SemanticChartController` 仍有较多 `console.log` 调试输出，建议按环境分级。
- `docs/PLUGIN_SYSTEM.md` 与部分现状有时间差，建议以 `docs/architecture.md` + 本文为准。
- 语义化配置对渲染器名称（如 `ma`/`boll`）存在隐式约定，建议后续收敛为常量。

---

## 2. 分层与职责

### 2.1 Vue 组件层

入口：`src/components/KLineChart.vue`

职责：
- 维护容器 DOM（滚动容器、canvas layer、xAxis canvas）。
- 创建并持有 `Chart` 实例。
- 绑定交互事件（pointer/wheel/scroll）并转发到 `InteractionController`。
- 管理 tooltip、hover、指标开关等响应式 UI 状态。
- 初始化并驱动 `SemanticChartController`。

非职责：
- 不直接管理 Canvas 物理像素尺寸。
- 不独立做 resize 计算与 DPR 推断。

### 2.2 Core 核心层

核心入口：`src/core/chart.ts`

职责：
- 管理图表状态：数据、viewport、pane 布局、渲染调度。
- 统一计算 `dpr / plotWidth / plotHeight / scrollLeft`。
- 驱动渲染主链路（可见范围、K 线坐标、逐 pane 绘制、时间轴绘制）。
- 托管插件宿主（`PluginHost`）与渲染器插件管理器（`RendererPluginManager`）。

子模块：
- `src/core/controller/interaction.ts`：拖拽、缩放、hover、crosshair、marker hit test。
- `src/core/paneRenderer.ts`：每个 pane 的 plot/yAxis canvas 尺寸与 DOM 布局承载。
- `src/core/layout/pane.ts`：pane 价格轴、范围与高度模型。
- `src/core/viewport/viewport.ts`：可视区索引与价格范围计算。
- `src/core/renderers/*`：内置渲染器插件实现。

### 2.3 Plugin 子系统

目录：`src/plugin/*`

职责拆分：
- `PluginHost`：插件生命周期、hooks、events、config、共享状态统一宿主。
- `HookSystem`：优先级调度 + 可选严格错误抛出（`throwOnError`）。
- `EventBus`：发布订阅通信。
- `ConfigManager`：配置与默认值管理（卸载时清理）。
- `StateStore`：跨渲染器共享状态与 owner 清理。
- `RendererPluginManager`：渲染器注册、分组缓存、渲染调度、resize/dataUpdate 通知。

### 2.4 语义化控制层

目录：`src/semantic/*`

职责：
- 校验外部 JSON 配置（schema + 安全规则）。
- 拉取数据源（`src/api/data/*`）。
- 将语义配置映射为图表渲染器配置、副图布局、markers。

---

## 3. 渲染与交互主链路

### 3.1 视口与 DPR 链路

入口：`Chart.computeViewport()`

关键流程：
1. 从 `ResizeObserver` 更新 `observedSize + preciseDpr`。
2. 通过 `getEffectiveDpr()` 选择有效 DPR（优先 preciseDpr）。
3. 计算 `viewWidth/viewHeight/plotWidth/plotHeight/scrollLeft`。
4. 应用 `MAX_CANVAS_PIXELS` 上限，必要时主动降低 DPR。
5. 同步 xAxis canvas 物理尺寸并产出 `viewport`。

结论：绘制与交互在同一 viewport 下运行，降低跨缩放偏移与模糊。

### 3.2 单帧渲染链路

入口：`Chart.draw()`

流程：
1. `computeViewport()`
2. `getVisibleRange(...)`
3. `calcKLinePositions(...)`
4. `interaction.setKLinePositions(...)`
5. 遍历 pane：更新价格范围、清空画布、构建 `RenderContext`、调用 `rendererPluginManager.render(paneId)`
6. 单独调用 `rendererPluginManager.renderPlugin('timeAxis')`
7. 通过 `plugin.events.emit('renderer:error')` 上报渲染错误

### 3.3 交互链路

入口：`InteractionController`

特性：
- 指针事件统一转为容器坐标。
- 命中边界优先使用 `chart.getViewport()` 的 plot 尺寸。
- 缩放通过 `Chart.zoomAt()` + `setOnZoomChange()` 保证 `kWidth/kGap/scrollLeft` 同帧一致落地。
- marker 与 custom marker 命中集中在 `MarkerManager`。

---

## 4. 渲染器插件体系（当前语义）

### 4.1 渲染器分类

- **业务渲染器**：如 `candle`、`ma`、`boll`、`extremaMarkers`。
- **系统渲染器**：如 `timeAxis`（`isSystem: true`，单独时机绘制）。
- **全局渲染器**：`paneId = GLOBAL_PANE_ID`，对所有 pane 生效（如网格线、十字线）。

### 4.2 渲染调度语义

- `render(paneId)`：返回并绘制该 pane + global 的**业务渲染器**（排除 `isSystem`）。
- `renderPlugin(name)`：按名称单独绘制（用于系统渲染器）。
- `notifyResize(paneId, pane)`：通知当前 pane + global 的已启用渲染器，**包含 system 渲染器**。
- `notifyDataUpdate(...)`：通知所有已启用且实现了 `onDataUpdate` 的渲染器。

### 4.3 共享状态机制

- 指标渲染器可通过 `PluginHost.setSharedState` 发布状态。
- 依赖方渲染器（如 MACD 刻度）通过 `getSharedState` 读取。
- `RendererPluginWithHost.getDeclaredNamespaces()` + `registerStateOwner` 支持按 owner 自动清理。

---

## 5. 插件生命周期与错误策略

插件生命周期入口：`PluginHost.use/remove/destroy`

策略：
- 生命周期 hooks：`beforeInstall/afterInstall/beforeUninstall/afterUninstall`。
- 关键路径使用 `throwOnError: true`，hook 失败会阻断安装/卸载。
- 非关键 hook 默认容错：记录错误并继续执行。
- `ConfigManager.clear(pluginName)` 同时清理 config 与 defaults，避免卸载后残留默认值。

---

## 6. 已知约束

1. 类型检查中仍有部分历史问题（见现有工程说明），不由本架构本身引入。
2. 浏览器若不支持 `devicePixelContentBoxSize`，DPR 会回退到 `window.devicePixelRatio`。
3. 超大视口下可能触发 `MAX_CANVAS_PIXELS`，表现为 DPR 被主动下调。
4. 语义化层对渲染器名存在命名约定，重命名渲染器时需同步 `semantic/controller.ts`。

---

## 7. 关键文件索引

- `src/components/KLineChart.vue`：UI 组装入口
- `src/core/chart.ts`：核心调度与 viewport
- `src/core/controller/interaction.ts`：交互命中与十字线
- `src/core/paneRenderer.ts`：pane canvas 尺寸
- `src/core/viewport/viewport.ts`：可视范围计算
- `src/plugin/PluginHost.ts`：插件宿主与生命周期
- `src/plugin/rendererPluginManager.ts`：渲染器调度
- `src/plugin/HookSystem.ts`：hook 调度与错误策略
- `src/plugin/ConfigManager.ts`：配置生命周期
- `src/semantic/controller.ts`：语义化配置应用
