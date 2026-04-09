import { describe, it, expect, vi } from 'vitest'
import { createPluginHost, type Plugin } from '@/plugin'

describe('Plugin System', () => {
  describe('PluginHost', () => {
    it('should create plugin host', () => {
      const host = createPluginHost()
      expect(host).toBeDefined()
      expect(host.events).toBeDefined()
      expect(host.hooks).toBeDefined()
    })

    it('should install and remove plugin', async () => {
      const host = createPluginHost()

      const testPlugin: Plugin = {
        name: 'test',
        version: '1.0.0',
        install: vi.fn(),
        uninstall: vi.fn(),
      }

      await host.use(testPlugin)
      expect(testPlugin.install).toHaveBeenCalledWith(host, { enabled: true, priority: 0 })
      expect(host.getPlugin('test')).toBe(testPlugin)

      await host.remove('test')
      expect(testPlugin.uninstall).toHaveBeenCalled()
      expect(host.getPlugin('test')).toBeUndefined()
    })

    it('should prevent duplicate plugin installation', async () => {
      const host = createPluginHost()

      const plugin: Plugin = {
        name: 'duplicate',
        version: '1.0.0',
        install: vi.fn(),
      }

      await host.use(plugin)
      await expect(host.use(plugin)).rejects.toThrow('already installed')
    })
  })

  describe('EventBus', () => {
    it('should emit and receive events', () => {
      const host = createPluginHost()
      const handler = vi.fn()

      host.events.on('test:event', handler)
      host.events.emit('test:event', { data: 'hello' })

      expect(handler).toHaveBeenCalledWith({ data: 'hello' })
    })

    it('should support once() handler', () => {
      const host = createPluginHost()
      const handler = vi.fn()

      host.events.once('test:once', handler)
      host.events.emit('test:once', { data: 1 })
      host.events.emit('test:once', { data: 2 })

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith({ data: 1 })
    })

    it('should support off() to remove handler', () => {
      const host = createPluginHost()
      const handler = vi.fn()

      host.events.on('test:off', handler)
      host.events.emit('test:off', {})
      expect(handler).toHaveBeenCalledTimes(1)

      host.events.off('test:off', handler)
      host.events.emit('test:off', {})
      expect(handler).toHaveBeenCalledTimes(1)
    })
  })

  describe('HookSystem', () => {
    it('should call hooks in priority order', async () => {
      const host = createPluginHost()
      const order: number[] = []

      host.hooks.tap('test:hook', () => { order.push(2) }, 2)
      host.hooks.tap('test:hook', () => { order.push(1) }, 1)
      host.hooks.tap('test:hook', () => { order.push(3) }, 3)

      await host.hooks.call('test:hook', {})

      expect(order).toEqual([1, 2, 3])
    })

    it('should support synchronous hooks', () => {
      const host = createPluginHost()
      const results = host.hooks.callSync('test:sync', { value: 10 })
      expect(results).toEqual([])
    })

    it('should pass context to hook functions', async () => {
      const host = createPluginHost()

      host.hooks.tap<{ x: number }, number>('test:transform', (ctx) => {
        return ctx.x * 2
      })

      const results = await host.hooks.call('test:transform', { x: 5 })
      expect(results).toEqual([10])
    })
  })

  describe('ConfigManager', () => {
    it('should get and set config', () => {
      const host = createPluginHost()

      host.setConfig('my-plugin', 'threshold', 100)
      expect(host.getConfig('my-plugin', 'threshold')).toBe(100)
      expect(host.getConfig('my-plugin', 'missing', 'default')).toBe('default')
    })
  })

  describe('Plugin Communication', () => {
    it('should allow plugins to communicate via events', async () => {
      const host = createPluginHost()
      const received: string[] = []

      const emitterPlugin: Plugin = {
        name: 'emitter',
        version: '1.0.0',
        install(host) {
          setTimeout(() => {
            host.events.emit('greeting', 'hello from emitter')
          }, 10)
        },
      }

      const listenerPlugin: Plugin = {
        name: 'listener',
        version: '1.0.0',
        install(host) {
          host.events.on<string>('greeting', (msg) => {
            received.push(msg)
          })
        },
      }

      await host.use(listenerPlugin)
      await host.use(emitterPlugin)

      // Wait for async emit
      await new Promise((r) => setTimeout(r, 20))

      expect(received).toContain('hello from emitter')
    })

    it('should allow plugins to communicate via getPlugin', async () => {
      const host = createPluginHost()

      interface ServicePlugin extends Plugin {
        getService(): string
      }

      const servicePlugin: ServicePlugin = {
        name: 'service',
        version: '1.0.0',
        install() {},
        getService() {
          return 'service-result'
        },
      }

      const consumerPlugin: Plugin = {
        name: 'consumer',
        version: '1.0.0',
        install(host) {
          const service = host.getPlugin<ServicePlugin>('service')
          if (service) {
            host.setConfig('consumer', 'serviceResult', service.getService())
          }
        },
      }

      await host.use(servicePlugin)
      await host.use(consumerPlugin)

      expect(host.getConfig('consumer', 'serviceResult')).toBe('service-result')
    })
  })

  describe('Plugin Lifecycle', () => {
    it('should trigger lifecycle hooks', async () => {
      const host = createPluginHost()
      const events: string[] = []

      host.hooks.tap('plugin:beforeInstall', () => events.push('beforeInstall'))
      host.hooks.tap('plugin:afterInstall', () => events.push('afterInstall'))
      host.hooks.tap('plugin:beforeUninstall', () => events.push('beforeUninstall'))
      host.hooks.tap('plugin:afterUninstall', () => events.push('afterUninstall'))

      const plugin: Plugin = {
        name: 'lifecycle',
        version: '1.0.0',
        install() {},
        uninstall() {},
      }

      await host.use(plugin)
      await host.remove('lifecycle')

      expect(events).toEqual([
        'beforeInstall',
        'afterInstall',
        'beforeUninstall',
        'afterUninstall',
      ])
    })

    it('should destroy host and cleanup all plugins', async () => {
      const host = createPluginHost()
      const uninstalled: string[] = []

      const plugin1: Plugin = {
        name: 'p1',
        version: '1.0.0',
        install() {},
        uninstall() { uninstalled.push('p1') },
      }

      const plugin2: Plugin = {
        name: 'p2',
        version: '1.0.0',
        install() {},
        uninstall() { uninstalled.push('p2') },
      }

      await host.use(plugin1)
      await host.use(plugin2)
      await host.destroy()

      expect(uninstalled).toContain('p1')
      expect(uninstalled).toContain('p2')
      expect(host.getPlugins()).toHaveLength(0)
    })
  })
})
