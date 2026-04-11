/**
 * 渲染器插件管理器
 */

import type {
  RendererPlugin,
  RenderContext,
  PaneInfo,
  RendererPluginWithHost,
  PluginHost,
} from './types'

/** 渲染器错误事件（裁剪后，不含大数据） */
export interface RendererErrorEvent {
  name: string
  error: { message: string; stack?: string }
  paneId: string
  timestamp: number
}

/** 内部缓存 key（模块私有，避免与外部 paneId 冲突） */
const GLOBAL_CACHE_KEY = Symbol('renderer:global-cache')

/**
 * 渲染器插件管理器
 *
 * 启用状态优先级：
 * 1. setEnabled() 运行时设置的状态（enabledState 中存在）
 * 2. 插件初始 enabled 字段
 * 3. 默认启用（enabled !== false）
 */
export class RendererPluginManager {
  private plugins: Map<string, RendererPlugin> = new Map()
  private pluginHost: PluginHost | null = null

  // 启用状态（独立存储，避免修改原始插件对象，支持多实例隔离）
  private enabledState: Map<string, boolean> = new Map()

  // 分组缓存：paneId -> 渲染器列表
  private groupCache: Map<string | symbol, RendererPlugin[]> = new Map()

  // 合并缓存：paneId -> pane+global 合并后的渲染器列表
  private mergedCache: Map<string | symbol, RendererPlugin[]> = new Map()

  // 已知的 paneId 集合（用于动态 pane 管理）
  private knownPaneIds: Set<string> = new Set(['main'])

  private cacheInvalid = true
  private onInvalidate: (() => void) | null = null

  /** 设置重绘回调（由 Chart 注入） */
  setInvalidateCallback(cb: () => void): void {
    this.onInvalidate = cb
  }

  /** 设置 PluginHost（用于支持 RendererPluginWithHost） */
  setPluginHost(host: PluginHost): void {
    this.pluginHost = host
  }

  /** 添加已知的 paneId */
  addKnownPaneId(paneId: string): void {
    this.knownPaneIds.add(paneId)
    this.cacheInvalid = true
  }

  /** 移除 paneId */
  removeKnownPaneId(paneId: string): void {
    this.knownPaneIds.delete(paneId)
    this.cacheInvalid = true
  }

  /** 获取所有已知的 paneId */
  getKnownPaneIds(): string[] {
    return Array.from(this.knownPaneIds)
  }

  /** 注册渲染器插件 */
  register(plugin: RendererPlugin | RendererPluginWithHost): void {
    if (this.plugins.has(plugin.name)) {
      console.warn(`Renderer plugin "${plugin.name}" already registered`)
      return
    }

    this.plugins.set(plugin.name, plugin)
    // 初始化启用状态（仅当初始值有定义时存储）
    if (plugin.enabled !== undefined) {
      this.enabledState.set(plugin.name, plugin.enabled)
    }
    this.cacheInvalid = true

    // 如果是 RendererPluginWithHost，调用 onInstall
    const withHost = plugin as RendererPluginWithHost
    if (withHost.onInstall && this.pluginHost) {
      try {
        withHost.onInstall(this.pluginHost)
      } catch (e) {
        console.error(`[RendererPlugin] ${plugin.name} onInstall error:`, e)
      }
    }

    // 注册后自动触发重绘
    this.onInvalidate?.()
  }

  /** 移除渲染器插件 */
  unregister(name: string): void {
    const plugin = this.plugins.get(name)
    if (!plugin) return

    // 调用卸载回调
    if (plugin.onUninstall) {
      try {
        plugin.onUninstall()
      } catch (e) {
        console.error(`[RendererPlugin] ${plugin.name} onUninstall error:`, e)
      }
    }

    this.plugins.delete(name)
    this.enabledState.delete(name)
    this.cacheInvalid = true

    // 卸载后自动触发重绘
    this.onInvalidate?.()
  }

  /** 清空所有插件 */
  clear(): void {
    for (const plugin of this.plugins.values()) {
      if (plugin.onUninstall) {
        try {
          plugin.onUninstall()
        } catch (e) {
          console.error(`[RendererPlugin] ${plugin.name} onUninstall error:`, e)
        }
      }
    }
    this.plugins.clear()
    this.enabledState.clear()
    this.groupCache.clear()
    this.mergedCache.clear()
    this.cacheInvalid = false
  }

  /**
   * 归并两个已排序数组 O(n)
   * 优先级相同时，pane 专属渲染器（a）先于 global 渲染器（b）
   */
  private mergeSorted(a: RendererPlugin[], b: RendererPlugin[]): RendererPlugin[] {
    const result: RendererPlugin[] = []
    let i = 0,
      j = 0
    while (i < a.length && j < b.length) {
      // 优先级相同时，a（pane 专属）优先
      if (a[i]!.priority <= b[j]!.priority) result.push(a[i++]!)
      else result.push(b[j++]!)
    }
    return [...result, ...a.slice(i), ...b.slice(j)]
  }

  /** 重建缓存（统一管理所有缓存逻辑） */
  private rebuildCache(): void {
    if (!this.cacheInvalid) return

    this.groupCache.clear()
    this.mergedCache.clear()

    // 按 paneId 分组
    for (const plugin of this.plugins.values()) {
      const cacheKey = typeof plugin.paneId === 'symbol' ? GLOBAL_CACHE_KEY : plugin.paneId
      if (!this.groupCache.has(cacheKey)) {
        this.groupCache.set(cacheKey, [])
      }
      this.groupCache.get(cacheKey)!.push(plugin)
    }

    // 对每组排序
    for (const [, list] of this.groupCache) {
      list.sort((a, b) => a.priority - b.priority)
    }

    // 预构建合并缓存
    const globalRenderers = this.groupCache.get(GLOBAL_CACHE_KEY) ?? []

    // 为每个已知 paneId 构建合并缓存
    for (const paneId of this.knownPaneIds) {
      const paneRenderers = this.groupCache.get(paneId) ?? []
      const merged = this.mergeSorted(paneRenderers, globalRenderers)
      this.mergedCache.set(paneId, merged)
    }

    // 缓存纯 global 渲染器作为 fallback
    this.mergedCache.set(GLOBAL_CACHE_KEY, [...globalRenderers])

    this.cacheInvalid = false
  }

  /** 获取指定 pane 的渲染器（已缓存，无穿透） */
  getRenderers(paneId: string): RendererPlugin[] {
    this.rebuildCache()

    // 有专属缓存用专属，否则用 global fallback
    let cached = this.mergedCache.get(paneId)
    if (!cached) {
      // fallback 到 global 渲染器，并缓存结果
      cached = this.mergedCache.get(GLOBAL_CACHE_KEY) ?? []
      this.mergedCache.set(paneId, cached)
    }

    // 根据启用状态过滤，同时排除系统渲染器
    return cached.filter((p) => {
      // 系统渲染器不通过 getRenderers 返回，只能通过 renderPlugin 单独渲染
      if (p.isSystem) return false

      const state = this.enabledState.get(p.name)
      return state !== undefined ? state : p.enabled !== false
    })
  }

  /** 渲染指定 pane（带错误隔离） */
  render(paneId: string, context: RenderContext): RendererErrorEvent[] {
    const renderers = this.getRenderers(paneId)
    const errors: RendererErrorEvent[] = []

    for (const renderer of renderers) {
      try {
        renderer.draw(context)
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e))
        console.error(`[RendererPlugin] ${renderer.name} draw error:`, error)
        // 裁剪错误事件，不含大数据
        errors.push({
          name: renderer.name,
          error: { message: error.message, stack: error.stack },
          paneId: context.pane.id,
          timestamp: Date.now(),
        })
      }
    }

    return errors
  }

  /** 渲染指定名称的插件（带错误隔离，用于系统渲染器） */
  renderPlugin(name: string, context: RenderContext): RendererErrorEvent[] {
    const plugin = this.plugins.get(name)
    if (!plugin) return []

    // 检查启用状态
    const state = this.enabledState.get(name)
    const isEnabled = state !== undefined ? state : plugin.enabled !== false
    if (!isEnabled) return []

    const errors: RendererErrorEvent[] = []
    try {
      plugin.draw(context)
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e))
      console.error(`[RendererPlugin] ${name} draw error:`, error)
      errors.push({
        name,
        error: { message: error.message, stack: error.stack },
        paneId: context.pane.id,
        timestamp: Date.now(),
      })
    }

    return errors
  }

  /** 启用/禁用渲染器（修改独立状态，不影响原始插件对象） */
  setEnabled(name: string, enabled: boolean): void {
    if (!this.plugins.has(name)) return
    this.enabledState.set(name, enabled)
    this.onInvalidate?.()
  }

  /** 更新配置（自动触发重绘） */
  updateConfig(name: string, config: Record<string, unknown>): boolean {
    const plugin = this.plugins.get(name)
    if (!plugin?.setConfig) return false

    plugin.setConfig(config)
    this.onInvalidate?.()
    return true
  }

  /** 获取所有渲染器插件 */
  getAllPlugins(): RendererPlugin[] {
    return Array.from(this.plugins.values())
  }

  /** 获取指定渲染器 */
  getPlugin<T extends RendererPlugin = RendererPlugin>(name: string): T | undefined {
    return this.plugins.get(name) as T | undefined
  }

  /** 通知数据更新（跳过禁用的插件） */
  notifyDataUpdate(data: unknown[], range: { start: number; end: number }): void {
    for (const plugin of this.plugins.values()) {
      if (!plugin.onDataUpdate) continue

      // 检查启用状态，跳过禁用的插件
      const state = this.enabledState.get(plugin.name)
      const isEnabled = state !== undefined ? state : plugin.enabled !== false
      if (!isEnabled) continue

      try {
        plugin.onDataUpdate(data, range)
      } catch (e) {
        console.error(`[RendererPlugin] ${plugin.name} onDataUpdate error:`, e)
      }
    }
  }

  /** 通知尺寸变化 */
  notifyResize(paneId: string, pane: PaneInfo): void {
    const renderers = this.getRenderers(paneId)
    for (const renderer of renderers) {
      if (renderer.onResize) {
        try {
          renderer.onResize(pane)
        } catch (e) {
          console.error(`[RendererPlugin] ${renderer.name} onResize error:`, e)
        }
      }
    }
  }
}
