# 语义化配置文档

本文档描述 `SemanticChartConfig` 的完整 JSON Schema，供 AI Agent 生成配置时参考。

## 完整配置结构

```typescript
interface SemanticChartConfig {
  version: `${number}.${number}.${number}`  // semver 版本号，如 "1.0.0"
  data: DataConfig                          // 数据配置（必需）
  indicators?: IndicatorsConfig             // 指标配置
  markers?: MarkersConfig                   // 标记配置
  chart?: ChartOptions                      // 图表选项
  theme?: ThemeConfig                       // 主题配置
}
```

---

## 数据配置 (DataConfig)

```typescript
interface DataConfig {
  source: 'baostock' | 'dongcai'   // 数据源
  symbol: string                    // 股票代码（6位数字）
  exchange?: 'SH' | 'SZ' | 'BJ'     // 交易所（可选，自动识别）
  startDate: string                 // 开始日期 YYYY-MM-DD
  endDate: string                   // 结束日期 YYYY-MM-DD
  period: PeriodType                // K线周期
  adjust: 'qfq' | 'hfq' | 'none'    // 复权方式
}

type PeriodType = 'daily' | 'weekly' | 'monthly' | '5min' | '15min' | '30min' | '60min'
```

### 示例

```json
{
  "source": "baostock",
  "symbol": "600519",
  "exchange": "SH",
  "startDate": "2025-01-01",
  "endDate": "2025-04-18",
  "period": "daily",
  "adjust": "qfq"
}
```

### 字段说明

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| source | string | 是 | 数据源：`baostock`（推荐）或 `dongcai` |
| symbol | string | 是 | 6位股票代码，如 `"600519"` |
| exchange | string | 否 | 交易所：`SH`(上交所)、`SZ`(深交所)、`BJ`(北交所)，不填则自动识别 |
| startDate | string | 是 | 开始日期，格式 `YYYY-MM-DD` |
| endDate | string | 是 | 结束日期，格式 `YYYY-MM-DD` |
| period | string | 是 | K线周期：`daily`、`weekly`、`monthly`、`5min`、`15min`、`30min`、`60min` |
| adjust | string | 是 | 复权方式：`qfq`(前复权)、`hfq`(后复权)、`none`(不复权) |

### 交易所代码规则

| 交易所 | 代码前缀 |
|--------|----------|
| SH | 600、601、603、605、688 |
| SZ | 000、001、002、003、300、301 |
| BJ | 83、87、43、82 |

---

## 指标配置 (IndicatorsConfig)

```typescript
interface IndicatorsConfig {
  main?: MainIndicatorConfig[]   // 主图指标
  sub?: SubIndicatorConfig[]     // 副图指标
}
```

### 主图指标

```typescript
type MainIndicatorConfig =
  | { type: 'MA'; enabled: boolean; params?: { periods: number[] } }
  | { type: 'BOLL'; enabled: boolean; params?: { period?: number; multiplier?: number } }
```

#### MA 均线

```json
{
  "type": "MA",
  "enabled": true,
  "params": {
    "periods": [5, 10, 20, 60]
  }
}
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| periods | number[] | [5, 10, 20, 30, 60] | 均线周期数组，最多5个，范围1-250 |

#### BOLL 布林带

```json
{
  "type": "BOLL",
  "enabled": true,
  "params": {
    "period": 20,
    "multiplier": 2
  }
}
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| period | number | 20 | 计算周期，范围1-100 |
| multiplier | number | 2 | 标准差倍数，范围0.1-5 |

### 副图指标

```typescript
type SubIndicatorConfig =
  | { type: 'VOLUME'; enabled: boolean }
  | { type: 'MACD'; enabled: boolean; params?: { fast?: number; slow?: number; signal?: number } }
  | { type: 'RSI'; enabled: boolean; params?: { period1?: number; period2?: number; period3?: number } }
  | { type: 'CCI'; enabled: boolean; params?: { period?: number } }
  | { type: 'STOCH'; enabled: boolean; params?: { n?: number; m?: number } }
  | { type: 'MOM'; enabled: boolean; params?: { period?: number } }
  | { type: 'WMSR'; enabled: boolean; params?: { period?: number } }
  | { type: 'KST'; enabled: boolean; params?: { ... } }
  | { type: 'FASTK'; enabled: boolean; params?: { period?: number } }
```

#### MACD

```json
{
  "type": "MACD",
  "enabled": true,
  "params": {
    "fast": 12,
    "slow": 26,
    "signal": 9
  }
}
```

#### RSI

```json
{
  "type": "RSI",
  "enabled": true,
  "params": {
    "period1": 6,
    "period2": 12,
    "period3": 24
  }
}
```

---

## 标记配置 (MarkersConfig)

```typescript
interface MarkersConfig {
  showVolumePriceMarkers?: boolean     // 显示量价关系标记
  showExtremaMarkers?: boolean         // 显示极值点标记
  customMarkers?: CustomMarker[]       // 自定义标记
}
```

### 自定义标记 (CustomMarker)

```typescript
interface CustomMarker {
  id: string                           // 唯一标识
  date: string                         // 日期 YYYY-MM-DD 或 YYYY-MM-DD HH:mm
  shape: MarkerShapeType               // 形状
  groupKey?: string                    // 图例分组键
  offset?: { x?: number; y?: number }  // 位置偏移
  style?: MarkerStyle                  // 样式
  label?: MarkerLabel                  // 文本标注
  metadata?: Record<string, unknown>   // 元数据
}

type MarkerShapeType = 'arrow_up' | 'arrow_down' | 'flag' | 'circle' | 'rectangle' | 'diamond'
```

### 示例

```json
{
  "markers": {
    "showExtremaMarkers": true,
    "customMarkers": [
      {
        "id": "buy_001",
        "date": "2025-02-15",
        "shape": "arrow_up",
        "groupKey": "buy_signal",
        "style": {
          "fillColor": "#52c41a",
          "size": 16
        },
        "label": {
          "text": "买入",
          "fontSize": 12
        },
        "metadata": {
          "reason": "MACD金叉",
          "confidence": 0.85
        }
      }
    ]
  }
}
```

### 形状说明

| 形状 | 说明 | 默认位置 |
|------|------|----------|
| arrow_up | 向上箭头 | K线上方 |
| arrow_down | 向下箭头 | K线下方 |
| flag | 旗帜 | K线上方 |
| circle | 圆形 | K线下方 |
| rectangle | 矩形 | K线下方 |
| diamond | 菱形 | K线下方 |

### 样式配置 (MarkerStyle)

```typescript
interface MarkerStyle {
  fillColor?: string     // 填充颜色，如 "#52c41a"
  strokeColor?: string   // 边框颜色
  textColor?: string     // 文字颜色
  size?: number          // 大小（像素），范围4-50，默认12
  lineWidth?: number     // 线宽，范围0.5-10
  opacity?: number       // 透明度，范围0-1
}
```

### 标签配置 (MarkerLabel)

```typescript
interface MarkerLabel {
  text: string                          // 文本内容
  position?: 'left' | 'right' | 'top' | 'bottom' | 'inside'  // 位置
  align?: 'start' | 'center' | 'end'    // 对齐方式
  fontSize?: number                     // 字号，范围8-24
  offset?: { x?: number; y?: number }   // 偏移
}
```

### 标签位置规则

- 默认情况下，标记在 K 线上方 → 文字在标记上方；标记在 K 线下方 → 文字在标记下方
- 可通过 `position` 字段强制指定位置

---

## 图表选项 (ChartOptions)

```typescript
interface ChartOptions {
  kWidth?: number            // K线宽度，范围2-50，默认10
  kGap?: number              // K线间距，范围0-20，默认2
  autoScrollToRight?: boolean // 自动滚动到最右侧
}
```

---

## 主题配置 (ThemeConfig)

```typescript
interface ThemeConfig {
  priceUpColor?: string   // 上涨颜色，格式 #RRGGBB
  priceDownColor?: string // 下跌颜色，格式 #RRGGBB
}
```

---

## 完整示例

```json
{
  "version": "1.0.0",
  "data": {
    "source": "baostock",
    "symbol": "600519",
    "exchange": "SH",
    "startDate": "2025-01-01",
    "endDate": "2025-04-18",
    "period": "daily",
    "adjust": "qfq"
  },
  "indicators": {
    "main": [
      { "type": "MA", "enabled": true, "params": { "periods": [5, 10, 20, 60] } },
      { "type": "BOLL", "enabled": false }
    ],
    "sub": [
      { "type": "MACD", "enabled": true },
      { "type": "RSI", "enabled": true, "params": { "period1": 6, "period2": 12 } }
    ]
  },
  "markers": {
    "showExtremaMarkers": true,
    "customMarkers": [
      {
        "id": "buy_001",
        "date": "2025-02-15",
        "shape": "arrow_up",
        "groupKey": "buy_signal",
        "style": { "fillColor": "#52c41a", "size": 16 },
        "label": { "text": "买入" },
        "metadata": { "reason": "MACD金叉" }
      },
      {
        "id": "sell_001",
        "date": "2025-03-20",
        "shape": "arrow_down",
        "groupKey": "sell_signal",
        "style": { "fillColor": "#ff4d4f", "size": 16 },
        "label": { "text": "卖出" },
        "metadata": { "reason": "BOLL上轨压力" }
      }
    ]
  },
  "chart": {
    "kWidth": 10,
    "kGap": 2
  }
}
```

---

## 安全限制

| 限制项 | 值 | 说明 |
|--------|-----|------|
| JSON大小 | 64KB | 防止解析DoS |
| 自定义标记数量 | 100 | 防止渲染压力 |
| 主图指标数量 | 5 | 防止视觉混乱 |
| 副图指标数量 | 5 | 防止布局压力 |
| 标签文本长度 | 50字符 | 自动截断 |
