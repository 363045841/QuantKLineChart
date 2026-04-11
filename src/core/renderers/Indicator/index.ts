/**
 * 指标渲染器导出入口
 */

import type { RendererPlugin } from '@/plugin'
import { createVolumeRendererPlugin } from '../subVolume'

// MA 均线
export { createMARendererPlugin, type MAFlags } from './ma'
export { createMALegendRendererPlugin } from './maLegend'

// BOLL 布林带
export { createBOLLRendererPlugin, calcBOLLAtIndex, type BOLLConfig } from './boll'
export { createBOLLLegendRendererPlugin, type BOLLLegendConfig } from './bollLegend'

// MACD
export { createMACDRendererPlugin, calcMACDAtIndex, type MACDConfig, type MACDRendererOptions, getMACDTitleInfo } from './macd'
export { createMACDLegendRendererPlugin, type MACDLegendOptions } from './macdLegend'

// RSI 相对强弱指标
export { createRSIRendererPlugin, calcRSIAtIndex, type RSIConfig, type RSIRendererOptions, getRSITitleInfo } from './rsi'

// CCI 顺势指标
export { createCCIRendererPlugin, calcCCIAtIndex, type CCIConfig, type CCIRendererOptions, getCCITitleInfo } from './cci'

// STOCH 随机指标
export { createSTOCHRendererPlugin, calcSTOCHAtIndex, type STOCHConfig, type STOCHRendererOptions, getSTOCHTitleInfo } from './stoch'

// MOM 动量指标
export { createMOMRendererPlugin, calcMOMAtIndex, type MOMConfig, type MOMRendererOptions, getMOMTitleInfo } from './mom'

// WMSR 威廉指标
export { createWMSRRendererPlugin, calcWMSRAtIndex, type WMSRConfig, type WMSRRendererOptions, getWMSRTitleInfo } from './wmsr'

// KST 确知指标
export { createKSTRendererPlugin, calcKSTAtIndex, type KSTConfig, type KSTRendererOptions, getKSTTitleInfo } from './kst'

// FASTK 快速随机指标
export { createFASTKRendererPlugin, calcFASTKAtIndex, type FASTKConfig, type FASTKRendererOptions, getFASTKTitleInfo } from './fastk'

/**
 * 副图指标类型
 */
export type SubIndicatorType = 'VOLUME' | 'MACD' | 'RSI' | 'CCI' | 'STOCH' | 'MOM' | 'WMSR' | 'KST' | 'FASTK'

/**
 * 渲染器工厂选项
 */
export interface IndicatorRendererOptions {
    /** 指标类型 */
    indicatorId: SubIndicatorType
    /** 目标 pane ID */
    paneId: string
}

// 导入各个创建函数用于工厂函数
import { createMACDRendererPlugin } from './macd'
import { createRSIRendererPlugin } from './rsi'
import { createCCIRendererPlugin } from './cci'
import { createSTOCHRendererPlugin } from './stoch'
import { createMOMRendererPlugin } from './mom'
import { createWMSRRendererPlugin } from './wmsr'
import { createKSTRendererPlugin } from './kst'
import { createFASTKRendererPlugin } from './fastk'

/**
 * 创建副图指标渲染器（统一工厂函数）
 */
export function createSubIndicatorRenderer(options: IndicatorRendererOptions): RendererPlugin {
    const { indicatorId, paneId } = options

    switch (indicatorId) {
        case 'VOLUME':
            return createVolumeRendererPlugin({ paneId })
        case 'MACD':
            return createMACDRendererPlugin({ paneId })
        case 'RSI':
            return createRSIRendererPlugin({ paneId })
        case 'CCI':
            return createCCIRendererPlugin({ paneId })
        case 'STOCH':
            return createSTOCHRendererPlugin({ paneId })
        case 'MOM':
            return createMOMRendererPlugin({ paneId })
        case 'WMSR':
            return createWMSRRendererPlugin({ paneId })
        case 'KST':
            return createKSTRendererPlugin({ paneId })
        case 'FASTK':
            return createFASTKRendererPlugin({ paneId })
        default:
            throw new Error(`Unknown indicator: ${indicatorId}`)
    }
}
