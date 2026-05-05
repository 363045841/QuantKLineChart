import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Chart, type ChartDom, type ChartOptions } from '@/core/chart'

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = []
  static failWithDevicePixelBox = false

  private callback: ResizeObserverCallback
  observe = vi.fn((target: Element, options?: ResizeObserverOptions) => {
    if (options?.box === 'device-pixel-content-box' && ResizeObserverMock.failWithDevicePixelBox) {
      throw new Error('device-pixel-content-box not supported')
    }
  })
  disconnect = vi.fn()

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    ResizeObserverMock.instances.push(this)
  }

  emit(entry: Partial<ResizeObserverEntry>) {
    this.callback([entry as ResizeObserverEntry], this as unknown as ResizeObserver)
  }

  static reset() {
    ResizeObserverMock.instances = []
    ResizeObserverMock.failWithDevicePixelBox = false
  }
}

const defaultOptions: ChartOptions = {
  kWidth: 10,
  kGap: 2,
  yPaddingPx: 0,
  rightAxisWidth: 0,
  bottomAxisHeight: 24,
  minKWidth: 2,
  maxKWidth: 50,
  panes: [{ id: 'main', ratio: 1 }],
  priceLabelWidth: 60,
}

function createCanvasContextStub() {
  return {
    setTransform: vi.fn(),
    scale: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 40 })),
  } as unknown as CanvasRenderingContext2D
}

function createDom(width: number, height: number): ChartDom {
  const container = document.createElement('div')
  const canvasLayer = document.createElement('div')
  const xAxisCanvas = document.createElement('canvas')

  Object.defineProperty(container, 'clientWidth', { configurable: true, value: width })
  Object.defineProperty(container, 'clientHeight', { configurable: true, value: height })
  Object.defineProperty(container, 'scrollLeft', { configurable: true, writable: true, value: 0 })

  container.appendChild(canvasLayer)
  canvasLayer.appendChild(xAxisCanvas)

  return {
    container: container as HTMLDivElement,
    canvasLayer: canvasLayer as HTMLDivElement,
    xAxisCanvas,
  }
}

describe('Chart DPR pipeline', () => {
  const originalResizeObserver = globalThis.ResizeObserver
  const originalDevicePixelRatio = window.devicePixelRatio
  const originalGetContext = HTMLCanvasElement.prototype.getContext

  beforeEach(() => {
    ResizeObserverMock.reset()
    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver

    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      writable: true,
      value: 1,
    })

    HTMLCanvasElement.prototype.getContext = vi.fn(() => createCanvasContextStub()) as unknown as typeof HTMLCanvasElement.prototype.getContext
  })

  afterEach(async () => {
    globalThis.ResizeObserver = originalResizeObserver
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      writable: true,
      value: originalDevicePixelRatio,
    })
    HTMLCanvasElement.prototype.getContext = originalGetContext
    vi.restoreAllMocks()
  })

  it('falls back to default observe when device-pixel-content-box observe fails', async () => {
    ResizeObserverMock.failWithDevicePixelBox = true
    const chart = new Chart(createDom(1000, 600), defaultOptions)

    const ro = ResizeObserverMock.instances[0]
    expect(ro).toBeDefined()
    expect(ro?.observe).toHaveBeenCalledTimes(2)
    expect(ro?.observe).toHaveBeenNthCalledWith(1, chart.getDom().container, { box: 'device-pixel-content-box' })
    expect(ro?.observe).toHaveBeenNthCalledWith(2, chart.getDom().container)

    await chart.destroy()
  })

  it('prefers precise DPR from ResizeObserver devicePixelContentBoxSize', async () => {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      writable: true,
      value: 1,
    })

    const chart = new Chart(createDom(1000, 600), defaultOptions)
    const ro = ResizeObserverMock.instances[0]

    ro?.emit({
      contentRect: { width: 1000, height: 600 } as DOMRectReadOnly,
      devicePixelContentBoxSize: [{ inlineSize: 2000, blockSize: 1200 }] as unknown as ResizeObserverSize[],
      contentBoxSize: [{ inlineSize: 1000, blockSize: 600 }] as unknown as ResizeObserverSize[],
    })

    expect(chart.getCurrentDpr()).toBe(2)

    await chart.destroy()
  })

  it('falls back to rounded window.devicePixelRatio when precise DPR is unavailable', async () => {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      writable: true,
      value: 1.234,
    })

    const chart = new Chart(createDom(1000, 600), defaultOptions)
    const ro = ResizeObserverMock.instances[0]

    ro?.emit({
      contentRect: { width: 1000, height: 600 } as DOMRectReadOnly,
      contentBoxSize: [{ inlineSize: 1000, blockSize: 600 }] as unknown as ResizeObserverSize[],
    })

    expect(chart.getCurrentDpr()).toBe(Math.round(1.234 * 64) / 64)

    await chart.destroy()
  })

  it('clamps DPR to at least 1', async () => {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      writable: true,
      value: 0.5,
    })

    const chart = new Chart(createDom(1000, 600), defaultOptions)
    const ro = ResizeObserverMock.instances[0]

    ro?.emit({
      contentRect: { width: 1000, height: 600 } as DOMRectReadOnly,
      contentBoxSize: [{ inlineSize: 1000, blockSize: 600 }] as unknown as ResizeObserverSize[],
    })

    expect(chart.getCurrentDpr()).toBe(1)

    await chart.destroy()
  })

  it('reduces viewport DPR when requested pixels exceed MAX_CANVAS_PIXELS', async () => {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      writable: true,
      value: 3,
    })

    const chart = new Chart(createDom(6000, 4000), defaultOptions)
    chart.resize()

    const viewport = chart.getViewport()
    expect(viewport).not.toBeNull()
    expect(viewport!.dpr).toBeLessThan(3)

    await chart.destroy()
  })

  it('disconnects ResizeObserver on destroy', async () => {
    const chart = new Chart(createDom(1000, 600), defaultOptions)
    const ro = ResizeObserverMock.instances[0]

    await chart.destroy()

    expect(ro?.disconnect).toHaveBeenCalledTimes(1)
  })
})

describe('Chart pane layout regressions', () => {
  const originalResizeObserver = globalThis.ResizeObserver
  const originalDevicePixelRatio = window.devicePixelRatio
  const originalGetContext = HTMLCanvasElement.prototype.getContext

  beforeEach(() => {
    ResizeObserverMock.reset()
    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver

    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      writable: true,
      value: 1,
    })

    HTMLCanvasElement.prototype.getContext = vi.fn(() => createCanvasContextStub()) as unknown as typeof HTMLCanvasElement.prototype.getContext
  })

  afterEach(async () => {
    globalThis.ResizeObserver = originalResizeObserver
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      writable: true,
      value: originalDevicePixelRatio,
    })
    HTMLCanvasElement.prototype.getContext = originalGetContext
    vi.restoreAllMocks()
  })

  it('allocates initial pane ratios as 3:1:1 for main+MACD+RSI', async () => {
    const chart = new Chart(createDom(1000, 600), defaultOptions)
    chart.resize()

    expect(chart.createSubPane('MACD')).toBe(true)
    expect(chart.createSubPane('RSI')).toBe(true)

    const specs = chart.getPaneLayoutSpecs().filter((pane) => pane.visible !== false)
    expect(specs).toHaveLength(3)

    const byId = new Map(specs.map((pane) => [pane.id, pane]))
    expect(byId.get('main')?.ratio ?? 0).toBeCloseTo(7 / 12, 6)
    expect(byId.get('sub_MACD')?.ratio ?? 0).toBeCloseTo(5 / 24, 6)
    expect(byId.get('sub_RSI')?.ratio ?? 0).toBeCloseTo(5 / 24, 6)

    await chart.destroy()
  })

  it('keeps indicator pane heights equal for main+MACD+RSI', async () => {
    const chart = new Chart(createDom(1000, 600), defaultOptions)
    chart.resize()
    chart.createSubPane('MACD')
    chart.createSubPane('RSI')
    chart.resize()

    const panes = chart.getPaneRenderers().map((renderer) => renderer.getPane())
    const macd = panes.find((pane) => pane.id === 'sub_MACD')
    const rsi = panes.find((pane) => pane.id === 'sub_RSI')

    expect(macd).toBeDefined()
    expect(rsi).toBeDefined()
    expect(Math.abs((macd?.height ?? 0) - (rsi?.height ?? 0))).toBeLessThanOrEqual(1)

    await chart.destroy()
  })

  it('keeps visible ratio sum at 1 after boundary resize', async () => {
    const chart = new Chart(createDom(1000, 800), defaultOptions)
    chart.resize()
    chart.createSubPane('MACD')
    chart.createSubPane('RSI')
    chart.resize()

    const resized = chart.resizePaneBoundary('sub_MACD', 20)
    expect(resized).toBe(true)

    const visible = chart.getPaneLayoutSpecs().filter((pane) => pane.visible !== false)
    const sum = visible.reduce((acc, pane) => acc + pane.ratio, 0)
    expect(sum).toBeCloseTo(1, 6)

    await chart.destroy()
  })

  it('returns false and keeps layout unchanged for invalid boundary resize input', async () => {
    const chart = new Chart(createDom(1000, 600), defaultOptions)
    chart.resize()
    chart.createSubPane('MACD')
    chart.createSubPane('RSI')
    chart.resize()

    const before = chart.getPaneLayoutSpecs()
    const invalidId = chart.resizePaneBoundary('missing-pane-id', 20)
    const zeroDelta = chart.resizePaneBoundary('main', 0)
    const after = chart.getPaneLayoutSpecs()

    expect(invalidId).toBe(false)
    expect(zeroDelta).toBe(false)
    expect(after).toEqual(before)

    await chart.destroy()
  })

  it('normalizes only visible panes in updatePaneLayout', async () => {
    const chart = new Chart(createDom(1000, 800), defaultOptions)
    chart.updatePaneLayout([
      { id: 'main', ratio: 3, visible: true, role: 'price' },
      { id: 'sub_MACD', ratio: 1, visible: true, role: 'indicator' },
      { id: 'sub_RSI', ratio: 100, visible: false, role: 'indicator' },
    ])

    const specs = chart.getPaneLayoutSpecs()
    const main = specs.find((pane) => pane.id === 'main')
    const macd = specs.find((pane) => pane.id === 'sub_MACD')
    const rsi = specs.find((pane) => pane.id === 'sub_RSI')

    expect((main?.ratio ?? 0) + (macd?.ratio ?? 0)).toBeCloseTo(1, 6)
    expect(main?.ratio ?? 0).toBeGreaterThan(macd?.ratio ?? 0)
    expect(rsi?.ratio).toBeCloseTo(5 / 24, 6)
    expect(rsi?.visible).toBe(false)

    await chart.destroy()
  })
})
