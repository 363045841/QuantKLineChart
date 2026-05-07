# K 线图缩放架构

## 核心设计原则

**单一数据源**: `zoomLevel` 是唯一真值，`kWidth` 始终由 `zoomLevel` 派生。

```
┌─────────────────────────────────────────┐
│           Chart (状态源)                │
│  currentZoomLevel ──► zoomLevelToKWidth │
│       (1~20)              ▼             │
│                      kWidth = f(level)  │
└───────────────────┬─────────────────────┘
                    │
                    │ getOption().kWidth
                    ▼
┌─────────────────────────────────────────┐
│         Vue 组件 (派生视图)             │
│     totalWidth = computed(() => ...)    │
└─────────────────────────────────────────┘
```

## 缩放比例公式

### 级别到宽度转换

```typescript
kWidth = minKWidth + (level - 1) / (zoomLevelCount - 1) * (maxKWidth - minKWidth)
```

**当前配置**:
- `zoomLevelCount = 20` (20 个离散档位)
- `minKWidth = 2` px
- `maxKWidth = 50` px
- `initialZoomLevel = 1` (初始为最小级别)

**各档位对应宽度**:

| 档位 | 公式 | kWidth (px) |
|------|------|-------------|
| 1 | `2 + 0/19 * 48` | 2.0 |
| 5 | `2 + 4/19 * 48` | 12.1 |
| 10 | `2 + 9/19 * 48` | 24.7 |
| 15 | `2 + 14/19 * 48` | 37.4 |
| 20 | `2 + 19/19 * 48` | 50.0 |

### 间隙计算

```typescript
kGap = PHYS_K_GAP / dpr  // PHYS_K_GAP = 3px (物理像素)
```

## 数据流

### 初始化流程

```
Vue onMounted
    │
    ├── new Chart({ zoomLevels: 20, initialZoomLevel: 1 })
    │       │
    │       ├── zoomLevelCount = 20
    │       ├── currentZoomLevel = 1
    │       ├── kWidth = zoomLevelToKWidth(1) = 2
    │       └── kGap = 3 / dpr
    │
    ├── setOnZoomChange(callback)
    │
    └── totalWidth 计算 (从 chart.getOption() 读取)
```

### 缩放操作流程

**滚轮缩放**:
```
用户滚轮
    │
    ▼
zoomAt(deltaY)
    │
    ├── currentZoomLevel += delta (±1)
    ├── kWidth = zoomLevelToKWidth(level)
    ├── 计算 scrollLeft 校正
    │
    └── onZoomChange(level, kWidth, kGap, scrollLeft)
            │
            ▼
        Vue: 更新 scrollLeft
        Vue: applyZoom(level) ──► Chart 更新状态
        Vue: scheduleRender() ──► totalWidth 重新计算
```

**程序化缩放**:
```
chartRef.zoomToLevel(5)
    │
    ▼
Chart.zoomToLevel(5)
    │
    ├── currentZoomLevel = 5
    ├── kWidth = zoomLevelToKWidth(5) = 12.1
    │
    └── onZoomChange(5, 12.1, kGap, scrollLeft)
```

## API 参考

### Chart 层

```typescript
// 缩放控制
zoomToLevel(level: number, anchorX?: number): void
zoomIn(anchorX?: number): void
zoomOut(anchorX?: number): void
getZoomLevel(): number          // 当前级别 (1~20)
getZoomLevelCount(): number     // 总级别数 (20)

// 状态监听
setOnZoomLevelChange(cb: (level: number, kWidth: number) => void): void
setOnZoomChange(cb: (level, kWidth, kGap, scrollLeft) => void): void

// 应用缩放（外部调用）
applyZoom(level: number): void
```

### Vue 组件层

```typescript
// Props
zoomLevels?: number      // 默认 20
initialZoomLevel?: number // 默认 1

// Events
@zoomLevelChange(level: number, kWidth: number): void

// Expose
zoomToLevel(level: number, anchorX?: number): void
zoomIn(): void
zoomOut(): void
getZoomLevel(): number
```

## 渲染器使用 zoomLevel

```typescript
// RenderContext 包含 zoomLevel 和 zoomLevelCount
draw(context: RenderContext) {
    const { zoomLevel, zoomLevelCount, kWidth } = context
    
    // 示例：小缩放下隐藏标记
    const MIN_ZOOM_FOR_MARKER = 4
    if (zoomLevel >= MIN_ZOOM_FOR_MARKER) {
        drawMarker()
    }
}
```
