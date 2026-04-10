/**
 * 指标渲染器导出入口
 */

// MA 均线
export { createMARendererPlugin, type MAFlags } from './ma'
export { createMALegendRendererPlugin } from './maLegend'

// BOLL 布林带
export { createBOLLRendererPlugin, calcBOLLAtIndex, type BOLLConfig } from './boll'
export { createBOLLLegendRendererPlugin, type BOLLLegendConfig } from './bollLegend'

// MACD
export { createMACDRendererPlugin, calcMACDAtIndex, type MACDConfig } from './macd'
export { createMACDLegendRendererPlugin, type MACDLegendOptions } from './macdLegend'

// RSI 相对强弱指标
export { createRSIRendererPlugin, calcRSIAtIndex, type RSIConfig } from './rsi'

// CCI 顺势指标
export { createCCIRendererPlugin, calcCCIAtIndex, type CCIConfig } from './cci'

// STOCH 随机指标
export { createSTOCHRendererPlugin, calcSTOCHAtIndex, type STOCHConfig } from './stoch'

// MOM 动量指标
export { createMOMRendererPlugin, calcMOMAtIndex, type MOMConfig } from './mom'

// WMSR 威廉指标
export { createWMSRRendererPlugin, calcWMSRAtIndex, type WMSRConfig } from './wmsr'

// KST 确知指标
export { createKSTRendererPlugin, calcKSTAtIndex, type KSTConfig } from './kst'

// FASTK 快速随机指标
export { createFASTKRendererPlugin, calcFASTKAtIndex, type FASTKConfig } from './fastk'
