/**
 * 插件系统核心类型定义
 */

/** 插件生命周期状态 */
export enum PluginState {
  Registered = 'registered',
  Installed = 'installed',
  Error = 'error',
}

/** 插件配置 */
export interface PluginConfig {
  enabled?: boolean
  priority?: number
  [key: string]: unknown
}

/** 插件元信息 */
export interface PluginMeta {
  name: string
  version: string
  description?: string
  author?: string
}

/** 插件接口 */
export interface Plugin extends PluginMeta {
  /** 安装插件 */
  install(host: PluginHost, config?: Record<string, unknown>): void | Promise<void>
  /** 卸载插件 */
  uninstall?(): void | Promise<void>
}

/** 插件描述符（注册时使用） */
export interface PluginDescriptor {
  plugin: Plugin
  config?: PluginConfig
  state: PluginState
  error?: Error
}

/** Hook 函数类型 */
export type HookFn<T = unknown, R = unknown> = (context: T) => R | Promise<R>

/** Hook 调用选项 */
export interface HookCallOptions {
  throwOnError?: boolean
}

/** Hook 描述符 */
export interface HookDescriptor<T = unknown, R = unknown> {
  name: string
  fn: HookFn<T, R>
  priority: number
}

/** 事件处理器 */
export type EventHandler<T = unknown> = (data: T) => void

/** 插件日志器 */
export interface PluginLogger {
  info(message?: unknown, ...optionalParams: unknown[]): void
  warn(message?: unknown, ...optionalParams: unknown[]): void
  error(message?: unknown, ...optionalParams: unknown[]): void
}

/** 插件宿主接口（暴露给插件使用的 API） */
export interface PluginHost {
  /** 事件总线 */
  readonly events: {
    on<T = unknown>(event: string, handler: EventHandler<T>): void
    off<T = unknown>(event: string, handler: EventHandler<T>): void
    emit<T = unknown>(event: string, data: T): void
    once<T = unknown>(event: string, handler: EventHandler<T>): void
  }

  /** Hook 系统 */
  readonly hooks: {
    tap<T = unknown, R = unknown>(
      hookName: string,
      fn: HookFn<T, R>,
      priority?: number
    ): void
    untap(hookName: string, fn: HookFn): void
    call<T = unknown, R = unknown>(hookName: string, context: T, options?: HookCallOptions): Promise<R[]>
    callSync<T = unknown, R = unknown>(hookName: string, context: T, options?: HookCallOptions): R[]
  }

  /** 获取配置 */
  getConfig<K = unknown>(pluginName: string, key: string, defaultValue?: K): K

  /** 设置配置 */
  setConfig(pluginName: string, key: string, value: unknown): void

  /** 获取其他插件 */
  getPlugin<T extends Plugin = Plugin>(name: string): T | undefined

  /** 日志工具 */
  log(level: 'info' | 'warn' | 'error', message: string, ...args: unknown[]): void

  // ============ 状态存储 API ============

  /** 设置共享状态 */
  setSharedState<T extends BaseIndicatorState>(namespace: string, state: T, ownerId?: string): void

  /** 获取共享状态 */
  getSharedState<T extends BaseIndicatorState>(namespace: string): T | undefined

  /** 清除共享状态 */
  clearSharedState(namespace: string): void

  /** 注册状态拥有者 */
  registerStateOwner(ownerId: string, namespaces: string[]): void

  /** 按拥有者清除状态 */
  clearByOwner(ownerId: string): void
}

// ============ 渲染器插件类型 ============

/** Pane 信息接口 */
export interface PaneInfo {
  id: string
  top: number
  height: number
  yAxis: {
    priceToY(price: number): number
    yToPrice(y: number): number
    getPaddingTop(): number
    getPaddingBottom(): number
    getPriceOffset(): number
  }
  priceRange: {
    maxPrice: number
    minPrice: number
  }
}

/**
 * 创建 PaneInfo 的只读包装
 *
 * 设计决策：
 * - 使用 Readonly<T> 类型标注而非 Object.freeze，避免热路径上的运行时开销
 * - yAxis 方法通过闭包包装，隔离原始函数引用
 * - 依赖团队代码规范约束插件行为，而非运行时强制
 */
export function wrapPaneInfo(pane: {
  id: string
  top: number
  height: number
  yAxis: PaneInfo['yAxis']
  priceRange: PaneInfo['priceRange']
}): Readonly<PaneInfo> {
  return {
    id: pane.id,
    top: pane.top,
    height: pane.height,
    yAxis: {
      priceToY: (price) => pane.yAxis.priceToY(price),
      yToPrice: (y) => pane.yAxis.yToPrice(y),
      getPaddingTop: () => pane.yAxis.getPaddingTop(),
      getPaddingBottom: () => pane.yAxis.getPaddingBottom(),
      getPriceOffset: () => pane.yAxis.getPriceOffset(),
    },
    priceRange: pane.priceRange,
  }
}

/** 渲染上下文 */
/** MarkerManager 接口（用于 RenderContext） */
export interface MarkerManagerLike {
  getCustomMarkers(): unknown[]
  setCustomMarkerPosition(id: string, x: number, y: number, size: number, shape: string): void
}

export interface RenderContext {
  ctx: CanvasRenderingContext2D
  pane: PaneInfo
  data: unknown[]
  range: { start: number; end: number }
  scrollLeft: number
  kWidth: number
  kGap: number
  dpr: number
  paneWidth: number
  kLinePositions: number[]
  markerManager?: MarkerManagerLike
  // 可选的其他 Canvas 上下文
  yAxisCtx?: CanvasRenderingContext2D
  xAxisCtx?: CanvasRenderingContext2D
  borderCtx?: CanvasRenderingContext2D
}

/** 全局 Pane ID（渲染到所有 pane） */
export const GLOBAL_PANE_ID = Symbol('global-pane')

/** 优先级推荐范围 */
export const RENDERER_PRIORITY = {
  SYSTEM_YAXIS: -20, // Y轴（系统级）
  SYSTEM_XAXIS: -20, // X轴（系统级）
  BACKGROUND: 0, // 背景层
  GRID: 10, // 网格线
  /**
   * 指标渲染器（MACD, RSI 等）
   * 所有指标渲染器必须使用此优先级或 ≤30 的值
   */
  INDICATOR: 30,
  /**
   * 指标刻度渲染器（依赖于前方 INDICATOR 的状态）
   * 所有刻度渲染器必须使用此优先级或 ≥35 的值，
   * 确保每次绘制时指标更新先于刻度。
   */
  INDICATOR_SCALE: 35,
  MAIN: 50, // 主图（K线）
  OVERLAY: 80, // 叠加层（标记点）
  FOREGROUND: 100, // 前景层（价格线）
  SYSTEM_BORDER: 120, // 边框（系统级）
  SYSTEM_CROSSHAIR: 150, // 十字线（系统级）
} as const

/** 渲染器插件接口（独立定义，不继承 Plugin） */
export interface RendererPlugin {
  /** 唯一标识 */
  readonly name: string

  /** 版本号 */
  readonly version?: string

  /** 描述 */
  readonly description?: string

  /** 调试用显示名称 */
  readonly debugName?: string

  /** 渲染目标 pane（'main' | 'sub' | GLOBAL_PANE_ID 表示所有） */
  paneId: string | symbol

  /** 渲染优先级（数字越大越后渲染） */
  priority: number

  /** 是否启用（仅作为初始值，运行时状态由 Manager 管理） */
  enabled?: boolean

  /**
   * 是否为系统渲染器
   * 系统渲染器不会通过 getRenderers() 返回，只能通过 renderPlugin() 单独渲染
   * 用于时间轴、全局边框等需要单独控制渲染时机的场景
   */
  isSystem?: boolean

  /** 渲染方法 */
  draw(context: RenderContext): void

  /** 数据更新时回调 */
  onDataUpdate?(data: unknown[], range: { start: number; end: number }): void

  /** 容器尺寸变化时回调 */
  onResize?(pane: PaneInfo): void

  /** 获取配置 */
  getConfig?(): Record<string, unknown>

  /** 设置配置 */
  setConfig?(config: Record<string, unknown>): void

  /** 卸载时清理资源 */
  onUninstall?(): void
}

/** 带插件系统能力的渲染器（可选） */
export interface RendererPluginWithHost extends RendererPlugin {
  /** 安装时获取 PluginHost 访问权限 */
  onInstall?(host: PluginHost): void
  /** 声明该渲染器所拥有的状态命名空间，卸载时框架会自动清理 */
  getDeclaredNamespaces?(): string[]
}

// ============ 状态存储类型 ============

/** 指标渲染器状态基类 */
export interface BaseIndicatorState {
  timestamp: number
}
