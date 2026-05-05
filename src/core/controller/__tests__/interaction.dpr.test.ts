import { describe, expect, it } from 'vitest'
import { InteractionController } from '@/core/controller/interaction'
import type { KLineData } from '@/types/price'

function createChartStub(args: {
  dpr: number
  plotWidth: number
  plotHeight: number
  paneByY?: Array<{
    id: string
    top: number
    height: number
    candleHitTest: boolean
  }>
}) {
  const container = document.createElement('div') as HTMLDivElement
  Object.defineProperty(container, 'scrollLeft', { configurable: true, writable: true, value: 0 })
  Object.defineProperty(container, 'clientWidth', { configurable: true, value: 320 })
  Object.defineProperty(container, 'clientHeight', { configurable: true, value: 200 })
  Object.defineProperty(container, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 0, top: 0, width: 320, height: 200 }),
  })

  const data: KLineData[] = [
    {
      timestamp: '2026-01-01',
      open: 10,
      high: 12,
      low: 8,
      close: 11,
      volume: 1000,
    },
    {
      timestamp: '2026-01-02',
      open: 11,
      high: 13,
      low: 9,
      close: 12,
      volume: 1200,
    },
  ]

  const paneDefs = args.paneByY ?? [{ id: 'main', top: 0, height: 160, candleHitTest: true }]
  const paneRenderers = paneDefs.map((paneDef) => ({
    getPane: () => ({
      id: paneDef.id,
      top: paneDef.top,
      height: paneDef.height,
      capabilities: {
        showPriceAxisTicks: true,
        showCrosshairPriceLabel: true,
        candleHitTest: paneDef.candleHitTest,
        supportsPriceTranslate: true,
      },
      yAxis: {
        yToPrice: (y: number) => y,
        priceToY: (p: number) => p,
        getPaddingTop: () => 0,
        getPaddingBottom: () => 0,
        getPriceOffset: () => 0,
      },
    }),
  }))

  const markerManager = {
    hitTest: () => null,
    setHover: () => undefined,
    hitTestCustomMarker: () => null,
  }

  const chart = {
    getDom: () => ({ container }),
    getViewport: () => ({
      viewWidth: 320,
      viewHeight: 200,
      plotWidth: args.plotWidth,
      plotHeight: args.plotHeight,
      scrollLeft: 0,
      dpr: args.dpr,
    }),
    getCurrentDpr: () => args.dpr,
    getMarkerManager: () => markerManager,
    getPaneRenderers: () => paneRenderers,
    getData: () => data,
    translatePrice: () => undefined,
    scheduleDraw: () => undefined,
  }

  return chart
}

describe('InteractionController DPR consumption', () => {
  it('uses viewport plot bounds for hit boundary checks', () => {
    const chart = createChartStub({ dpr: 2, plotWidth: 100, plotHeight: 80 })
    const interaction = new InteractionController(chart as never)

    interaction.setKLinePositions([0, 10], { start: 0, end: 2 }, 10)

    interaction.onMouseMove({ clientX: 50, clientY: 40 } as MouseEvent)
    expect(interaction.crosshairPos).not.toBeNull()

    interaction.onMouseMove({ clientX: 120, clientY: 40 } as MouseEvent)
    expect(interaction.crosshairPos).toBeNull()
    expect(interaction.crosshairIndex).toBeNull()
  })

  it('uses current DPR in kWidthLogical = kWidthPx / dpr path', () => {
    const chartDpr1 = createChartStub({ dpr: 1, plotWidth: 300, plotHeight: 160 })
    const interactionDpr1 = new InteractionController(chartDpr1 as never)
    interactionDpr1.setKLinePositions([0, 10], { start: 0, end: 2 }, 10)

    interactionDpr1.onMouseMove({ clientX: 8, clientY: 40 } as MouseEvent)
    expect(interactionDpr1.crosshairIndex).toBe(0)

    const chartDpr2 = createChartStub({ dpr: 2, plotWidth: 300, plotHeight: 160 })
    const interactionDpr2 = new InteractionController(chartDpr2 as never)
    interactionDpr2.setKLinePositions([0, 10], { start: 0, end: 2 }, 10)

    interactionDpr2.onMouseMove({ clientX: 8, clientY: 40 } as MouseEvent)
    expect(interactionDpr2.crosshairIndex).toBe(1)
  })
})

describe('InteractionController pane capability gating', () => {
  it('does not set hoveredIndex when pointer is in indicator pane', () => {
    const chart = createChartStub({
      dpr: 1,
      plotWidth: 300,
      plotHeight: 200,
      paneByY: [
        { id: 'main', top: 0, height: 100, candleHitTest: true },
        { id: 'sub_MACD', top: 100, height: 100, candleHitTest: false },
      ],
    })
    const interaction = new InteractionController(chart as never)

    interaction.setKLinePositions([0, 10], { start: 0, end: 2 }, 10)
    interaction.onMouseMove({ clientX: 5, clientY: 140 } as MouseEvent)

    expect(interaction.activePaneId).toBe('sub_MACD')
    expect(interaction.hoveredIndex).toBeNull()
  })

  it('sets hoveredIndex when candle is hit in price pane', () => {
    const chart = createChartStub({
      dpr: 1,
      plotWidth: 300,
      plotHeight: 200,
      paneByY: [
        { id: 'main', top: 0, height: 100, candleHitTest: true },
        { id: 'sub_MACD', top: 100, height: 100, candleHitTest: false },
      ],
    })
    const interaction = new InteractionController(chart as never)

    interaction.setKLinePositions([0, 10], { start: 0, end: 2 }, 10)
    interaction.onMouseMove({ clientX: 5, clientY: 10 } as MouseEvent)

    expect(interaction.activePaneId).toBe('main')
    expect(interaction.crosshairIndex).not.toBeNull()
    expect(interaction.hoveredIndex).toBe(interaction.crosshairIndex)
  })

  it('clears hoveredIndex when moving from price pane to indicator pane', () => {
    const chart = createChartStub({
      dpr: 1,
      plotWidth: 300,
      plotHeight: 200,
      paneByY: [
        { id: 'main', top: 0, height: 100, candleHitTest: true },
        { id: 'sub_MACD', top: 100, height: 100, candleHitTest: false },
      ],
    })
    const interaction = new InteractionController(chart as never)

    interaction.setKLinePositions([0, 10], { start: 0, end: 2 }, 10)
    interaction.onMouseMove({ clientX: 5, clientY: 10 } as MouseEvent)
    expect(interaction.hoveredIndex).toBe(interaction.crosshairIndex)

    interaction.onMouseMove({ clientX: 5, clientY: 140 } as MouseEvent)
    expect(interaction.activePaneId).toBe('sub_MACD')
    expect(interaction.hoveredIndex).toBeNull()
  })
})
