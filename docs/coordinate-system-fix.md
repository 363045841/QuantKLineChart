# K 线图坐标系统统一修复实录

## 背景

在开发 K 线图组件时，我们遇到了一系列与坐标计算相关的问题：

1. **ExtremaMarkers 首次加载位置偏移**：极值标记在首次加载时位置不正确
2. **左侧空白区域**：刚进入页面时，面板左侧出现空白区域
3. **无法滚动到最右侧**：刚打开应用未缩放时，无法滚动到最右侧 K 线

这些问题看似独立，但根源都是**坐标计算方式不统一**。

---

## 问题分析

### 坐标系统的核心概念

K 线图渲染涉及两个坐标空间：

- **逻辑像素（Logical Pixels）**：CSS 像素，用于 DOM 元素尺寸、滚动位置等
- **物理像素（Physical Pixels）**：设备真实像素，用于 Canvas 渲染，由 `devicePixelRatio (dpr)` 决定

在高 DPI 屏幕上（如 Retina 显示器，dpr=2），一个逻辑像素对应多个物理像素。为了渲染清晰，Canvas 尺寸需要按 dpr 放大。

### 原有代码的问题

#### 问题一：K 线宽度奇数化处理不一致

为了保证 K 线影线居中显示，实际渲染时会将 `kWidthPx`（物理像素）强制调整为奇数：

```typescript
// src/core/utils/klineConfig.ts
export function calcKWidthPx(kWidth: number, dpr: number): number {
    let kWidthPx = Math.round(kWidth * dpr)
    if (kWidthPx % 2 === 0) {
        kWidthPx += 1  // 偶数变奇数
    }
    return Math.max(1, kWidthPx)
}
```

但部分代码没有使用这个统一函数，导致：

| 计算位置 | 原始公式 | 结果 (kWidth=10, dpr=2) |
|---------|---------|------------------------|
| 渲染器 | `calcKWidthPx(10, 2)` | 21 物理像素 |
| viewport.ts | `Math.round(10 * 2)` | 20 物理像素 |

**差 1 个物理像素，累积后导致坐标偏移。**

#### 问题二：多处重复计算 K 线位置

在修复前，K 线 X 坐标在多个地方独立计算：

```typescript
// 渲染器 extremaMarkers.ts（修复前）
const unit = kWidth + kGap
const centerX = (i: number) => kGap + i * unit + kWidth / 2

// 渲染器 gridLines.ts（修复前）
const unit = kWidth + kGap
const worldX = kGap + idx * unit + kWidth / 2

// 渲染器 lastPrice.ts（修复前）
const unit = kWidth + kGap
const startX = kGap + range.start * unit
const endX = kGap + range.end * unit
```

每处计算都假设 `unit = kWidth + kGap`，但实际渲染使用的是 `kWidthPx(奇数) + kGapPx`。

#### 问题三：滚动宽度计算不匹配

Vue 组件中的 `totalWidth` 计算：

```typescript
// KLineChart.vue（修复前）
const totalWidth = computed(() => {
  const n = props.data?.length ?? 0
  const plotWidth = currentKGap.value + n * (currentKWidth.value + currentKGap.value)
  return plotWidth + yAxisTotalWidth
})
```

这个公式使用原始逻辑像素值，但实际渲染使用物理像素对齐后的值：

**数值示例**（kWidth=10, kGap=2, dpr=2, n=100）：

| 计算方式 | plotWidth | 差异 |
|---------|-----------|------|
| 原始公式 | `2 + 100 * (10 + 2) = 1202` | - |
| 物理像素对齐 | `(4 + 100 * 25) / 2 = 1252` | +50 像素 |

滚动容器宽度不足 50 像素，导致无法滚动到最右侧。

---

## 解决方案

### 核心思路：统一坐标数据源

**原则：所有 K 线 X 坐标计算都基于 `kLinePositions` 数组。**

```
kLinePositions[i] = 第 i 根 K 线的起始 X 坐标（逻辑像素）
```

这个数组由 `Chart.calcKLinePositions()` 统一计算，使用 `getPhysicalKLineConfig()` 确保物理像素对齐。

### 修复一：创建统一的物理像素配置工具

新建 `src/core/utils/klineConfig.ts`：

```typescript
/**
 * K 线物理像素配置工具函数
 * 用于统一渲染、交互、视口计算的坐标系统
 */

export function calcKWidthPx(kWidth: number, dpr: number): number {
    let kWidthPx = Math.round(kWidth * dpr)
    if (kWidthPx % 2 === 0) {
        kWidthPx += 1
    }
    return Math.max(1, kWidthPx)
}

export function getPhysicalKLineConfig(kWidth: number, kGap: number, dpr: number) {
    const kWidthPx = calcKWidthPx(kWidth, dpr)
    const kGapPx = Math.round(kGap * dpr)
    const unitPx = kWidthPx + kGapPx
    const startXPx = kGapPx

    // 转回逻辑像素（供需要逻辑像素的地方使用）
    const kWidthLogical = kWidthPx / dpr
    const kGapLogical = kGapPx / dpr
    const unitLogical = unitPx / dpr
    const startXLogical = startXPx / dpr

    return {
        kWidthPx, kGapPx, unitPx, startXPx,
        kWidthLogical, kGapLogical, unitLogical, startXLogical,
    }
}
```

### 修复二：统一 getVisibleRange 计算

修改 `src/core/viewport/viewport.ts`：

```typescript
export function getVisibleRange(
    scrollLeft: number,
    viewWidth: number,
    kWidth: number,
    kGap: number,
    totalDataCount: number,
    dpr: number = 1
): { start: number; end: number } {
    // 使用统一的物理像素配置，确保与 calcKLinePositions 完全一致
    const { unitPx, startXPx } = getPhysicalKLineConfig(kWidth, kGap, dpr)

    const scrollLeftPx = scrollLeft * dpr
    const viewWidthPx = viewWidth * dpr

    const start = Math.max(0, Math.floor((scrollLeftPx - startXPx) / unitPx) - 1)
    const end = Math.min(totalDataCount, Math.ceil((scrollLeftPx + viewWidthPx - startXPx) / unitPx) + 1)

    return { start, end }
}
```

### 修复三：渲染器使用 kLinePositions

**extremaMarkers.ts**：

```typescript
// 修复前
const unit = kWidth + kGap
const centerX = (i: number) => kGap + i * unit + kWidth / 2

// 修复后
const getCenterX = (i: number) => {
    const localIdx = i - range.start
    if (localIdx < 0 || localIdx >= kLinePositions.length) return 0
    return kLinePositions[localIdx]! + kWidth / 2
}
```

**gridLines.ts**：

```typescript
// 修复前
const unit = kWidth + kGap
const worldX = kGap + idx * unit + kWidth / 2

// 修复后
const localIdx = idx - range.start
if (localIdx < 0 || localIdx >= kLinePositions.length) continue
const worldX = kLinePositions[localIdx]! + kWidth / 2
```

**lastPrice.ts**：

```typescript
// 修复前
const unit = kWidth + kGap
const startX = kGap + range.start * unit
const endX = kGap + range.end * unit

// 修复后
const startX = kLinePositions[0] ?? 0
const endX = (kLinePositions[kLinePositions.length - 1] ?? 0) + kWidth
```

### 修复四：滚动宽度计算对齐

**KLineChart.vue**：

```typescript
// 修复前
const totalWidth = computed(() => {
  const n = props.data?.length ?? 0
  const plotWidth = currentKGap.value + n * (currentKWidth.value + currentKGap.value)
  const yAxisTotalWidth = props.rightAxisWidth + props.priceLabelWidth
  return plotWidth + yAxisTotalWidth
})

// 修复后
const totalWidth = computed(() => {
  const n = props.data?.length ?? 0
  const dpr = window.devicePixelRatio || 1

  const { startXPx, unitPx } = getPhysicalKLineConfig(
    currentKWidth.value,
    currentKGap.value,
    dpr
  )

  const plotWidth = (startXPx + n * unitPx) / dpr
  const yAxisTotalWidth = props.rightAxisWidth + props.priceLabelWidth
  return plotWidth + yAxisTotalWidth
})
```

**chart.ts** 的 `getContentWidth()` 方法也做了相同修复。

---

## 数据流总结

修复后的坐标计算数据流：

```
┌─────────────────────────────────────────────────────────────┐
│                    Chart.draw()                              │
│                                                              │
│  1. getPhysicalKLineConfig(kWidth, kGap, dpr)               │
│     └── 返回物理像素对齐的配置                                │
│                                                              │
│  2. getVisibleRange(scrollLeft, plotWidth, ...)             │
│     └── 使用统一的 unitPx, startXPx                         │
│                                                              │
│  3. calcKLinePositions(range)                               │
│     └── 基于 getPhysicalKLineConfig 计算                    │
│     └── 返回 kLinePositions 数组                             │
│                                                              │
│  4. 传递给所有渲染器：                                        │
│     ├── CandleRenderer                                       │
│     ├── ExtremaMarkersRenderer ← 使用 kLinePositions        │
│     ├── GridLinesRenderer      ← 使用 kLinePositions        │
│     └── LastPriceLineRenderer  ← 使用 kLinePositions        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 关键经验

### 1. 避免重复计算

当同一个值在多处被计算时，应该提取为单一数据源。K 线位置计算就是一个典型例子——从"每处独立计算"变为"统一计算，分发使用"。

### 2. 注意单位转换边界

在逻辑像素和物理像素之间转换时，必须明确：
- 哪些值是逻辑像素
- 哪些值是物理像素
- 转换时机（何时乘/除 dpr）

### 3. 整数运算的副作用

`calcKWidthPx` 的奇数化处理是为了视觉效果（影线居中），但它会导致实际值与原始值不同。所有依赖这个值的计算都必须使用同一份配置。

### 4. 循环依赖的解决

最初 `viewport.ts` 需要导入 `chart.ts` 的函数，而 `chart.ts` 又导入了 `viewport.ts`。解决方法是提取共享逻辑到独立文件 `klineConfig.ts`：

```
chart.ts ─────┐
              ├──► klineConfig.ts
viewport.ts ──┘
```

---

## 修改文件清单

| 文件 | 修改内容 |
|------|---------|
| `src/core/utils/klineConfig.ts` | 新建，提取物理像素配置工具函数 |
| `src/core/chart.ts` | 移除原函数定义，改为导入并重导出；修复 `getContentWidth()` |
| `src/core/viewport/viewport.ts` | 使用 `getPhysicalKLineConfig` 计算 `unitPx` |
| `src/core/renderers/extremaMarkers.ts` | 改用 `kLinePositions` 计算坐标 |
| `src/core/renderers/gridLines.ts` | 改用 `kLinePositions` 计算坐标 |
| `src/core/renderers/lastPrice.ts` | 改用 `kLinePositions` 计算坐标 |
| `src/components/KLineChart.vue` | `totalWidth` 使用 `getPhysicalKLineConfig` |

---

## 验证结果

修复后验证：

- ✅ 首次加载时左侧无空白区域
- ✅ ExtremaMarkers 位置正确
- ✅ 可以滚动到最右侧 K 线
- ✅ 缩放后边界正确
- ✅ 十字线与 K 线对齐
