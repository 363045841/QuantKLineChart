/**
 * 语义化图表配置模块
 * 用于 Agent 通过 JSON 控制图表渲染
 */

// 类型定义
export type {
  SemanticChartConfig,
  DataConfig,
  IndicatorsConfig,
  MainIndicatorConfig,
  SubIndicatorConfig,
  SubIndicatorType,
  MAParams,
  BOLLParams,
  MarkersConfig,
  CustomMarker,
  MarkerShapeType,
  MarkerStyle,
  MarkerLabel,
  LegendConfig,
  ChartOptions,
  ThemeConfig,
  ApplyResult,
  ValidationResult,
  SecurityResult,
} from './types'

// 控制器
export { SemanticChartController, type SemanticEventType } from './controller'

// 校验器
export {
  SemanticConfigValidator,
  sanitizeParams,
  sanitizeColor,
  validateColor,
  validateSymbol,
} from './validator'

// 形状绘制
export { drawShape, drawLabel, hitTestShape } from './drawShape'
