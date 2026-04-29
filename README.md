# kmap - 金融图表绘制库

[English](README_EN.md) | 简体中文

这是一个基于 Canvas 的金融图表绘制库，提供 Vue 组件封装。专注于高性能 K 线图渲染，支持**语义化 JSON 配置**，便于 AI Agent 直接控制图表渲染。特性包括横向滚动、多种技术指标（MA/BOLL/MACD/RSI 等）、自定义标记标注、多数据源支持（BaoStock、东方财富）。

![YU8@~$21%{NBJLGIZ}KTKED.png](https://files.seeusercontent.com/2026/04/29/akQ8/YU821NBJLGIZKTKED.png)
![(ZOS$O}EP(_NKI273RXBV17.png](https://files.seeusercontent.com/2026/04/29/olU0/ZOSOEP_NKI273RXBV17.png)
![1TIVL2M~[(}TWFB_O}JZJ]6.png](https://files.seeusercontent.com/2026/04/29/a6rH/1TIVL2MTWFB_OJZJ6.png)


## 功能特性

- **基于 Canvas**：使用 Canvas 实现高性能的 K 线图绘制
- **响应式设计**：适配不同屏幕尺寸，支持所有设备像素比（DPR），不同 DPR 下绘制清晰
- **影线处理**：统一 DPR 坐标计算，底层保证影线在不同 DPR 屏幕下绝对居中并绘制清晰
- **像素对齐**：统一坐标源，在物理坐标层面实现像素对齐，消除亚像素渲染，确保线条锐利清晰
- **框架无关**：核心逻辑完全独立，不依赖特定框架
- **插件化架构**：渲染器插件支持动态注册、配置和生命周期管理
- **量价关系标注**：自动识别并标注量价齐升、量价背离、量增价跌、量缩价跌四种形态

### Agent 语义化控制

- **JSON 配置驱动**：通过 `semanticConfig` prop 接收 JSON 配置，AI Agent 可直接控制图表渲染
- **自定义标记**：支持 6 种预设形状（arrow_up、arrow_down、flag、circle、rectangle、diamond），标记大小随 K 线缩放自适应
- **完整指标支持**：主图 MA/BOLL，副图 MACD/RSI/CCI/STOCH 等
- **安全校验**：JSON Schema 校验、原型污染防护、颜色 XSS 防护、输入边界检查
- **日期友好格式**：使用 `YYYY-MM-DD` 自然日期格式，便于 Agent 输出

## 技术栈

- [Vue 3](https://vuejs.org/) - 渐进式 JavaScript 框架
- [Rolldown Vite](https://cn.vite.dev/guide/rolldown) - 下一代前端构建工具，极速构建
- [TypeScript](https://www.typescriptlang.org/)
- [Canvas API](https://developer.mozilla.org/zh-CN/docs/Web/API/Canvas_API)
- [Vitest](https://vitest.dev/) - 单元测试框架

## 项目结构

```
src/
├── api/                     # API 接口定义
│   └── data/                # 数据源接口
├── components/              # Vue 组件
│   ├── KLineChart.vue       # K 线图主组件
│   ├── IndicatorSelector.vue # 指标选择器
│   └── IndicatorParams.vue  # 指标参数编辑
├── core/                    # 核心渲染引擎
│   ├── chart.ts             # 图表控制器
│   ├── renderers/           # 渲染器插件
│   │   ├── candle.ts        # K 线渲染器
│   │   ├── ma.ts            # MA 均线渲染器
│   │   ├── boll.ts          # BOLL 布林带渲染器
│   │   ├── macd.ts          # MACD 指标渲染器
│   │   ├── volume.ts        # 成交量渲染器
│   │   └── ...              # 其他渲染器
│   ├── theme/               # 主题配置
│   ├── marker/              # 标记点系统
│   └── utils/               # 核心工具
├── semantic/                # 语义化配置模块（Agent 控制）
│   ├── types.ts             # 类型定义
│   ├── schema.json          # JSON Schema
│   ├── validator.ts         # 校验器
│   ├── controller.ts        # 控制器
│   └── drawShape.ts         # 形状绘制
├── plugin/                  # 插件系统
│   ├── types.ts             # 类型定义
│   ├── PluginHost.ts        # 插件宿主
│   ├── EventBus.ts          # 事件总线
│   ├── HookSystem.ts        # 钩子系统
│   └── rendererPluginManager.ts  # 渲染器管理
├── types/                   # 类型定义
└── utils/                   # 工具函数
```

## 数据源

- [BaoStock](http://baostock.com/) - 开源金融数据接口，每日支持十万次 API 调用
- [AKTools](https://github.com/akfamily/aktools) - 开源金融数据接口库（可能存在反爬限制）

## 使用 NPM 安装组件库

```bash
npm i @363045841yyt/klinechart
```

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
```

## 使用示例

```vue
<template>
  <KLineChart
    :data="klineData"
    :kWidth="10"
    :kGap="2"
    :yPaddingPx="60"
    :showMA="{ ma5: true, ma10: true, ma20: true }"
    :autoScrollToRight="true"
  />
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import KLineChart from '@/components/KLineChart.vue'
import type { KLineData } from '@/types/price'

const klineData = ref<KLineData[]>([])

onMounted(async () => {
  // 从数据源获取 K 线数据
  const data = await fetchKLineData('baostock', {
    symbol: 'sh.601360',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    period: 'daily',
    adjust: 'qfq',
  })
  klineData.value = data
})
</script>
```

### 语义化 JSON 控制（Agent 模式）

通过 `semanticConfig` prop，AI Agent 可以用 JSON 配置完整控制图表渲染：

```vue
<template>
  <KLineChart :semanticConfig="config" />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { SemanticChartConfig } from '@363045841yyt/klinechart'

const config = ref<SemanticChartConfig>({
  version: '1.0.0',
  data: {
    source: 'baostock',
    symbol: '600519',
    exchange: 'SH',
    startDate: '2025-01-01',
    endDate: '2025-04-18',
    period: 'daily',
    adjust: 'qfq',
  },
  indicators: {
    main: [{ type: 'MA', enabled: true, params: { periods: [5, 10, 20] } }],
    sub: [{ type: 'MACD', enabled: true }],
  },
  markers: {
    customMarkers: [
      {
        id: 'buy_001',
        date: '2025-02-15',
        shape: 'arrow_up',
        label: { text: '买入' },
        style: { fillColor: '#52c41a' },
      },
    ],
  },
})
</script>
```

详细配置说明请参阅 [语义化配置文档](./docs/semantic-config.md)。

## 数据源配置

### BaoStock（推荐）

免费开源的 Python 证券数据接口，每日支持十万次 API 调用。

```bash
uv pip install baostock
git clone https://github.com/363045841/stockbao.git
python server.py  # 启动服务
```

### AKTools

基于 Python 的开源财经数据接口，数据来源于东方财富等公开渠道。

```bash
uv pip install aktools
uv run python -m aktools  # 启动服务
```

> ⚠️ 注意：AKTools 采取直连 API，频繁请求可能触发反爬机制

### 组件属性

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| data | KLineData[] | [] | K 线数据数组 |
| semanticConfig | SemanticChartConfig | - | 语义化配置（Agent 模式，唯一数据源） |
| kWidth | number | 10 | K 线实体宽度 |
| kGap | number | 2 | K 线间距 |
| yPaddingPx | number | 60 | Y 轴上下留白像素 |
| showMA | MAFlags | { ma5: true, ma10: true, ma20: true } | 移动平均线配置 |
| autoScrollToRight | boolean | true | 数据更新后自动滚动到最右侧 |

## 环境要求

- Node.js: ^20.19.0 || >=22.12.0
- pnpm: 包管理器
- Python: 用于运行数据源服务（可选）
- uv: Python 包管理器

## 构建与部署

```bash
pnpm build    # 生产环境构建
pnpm preview  # 预览生产包
```

## 相关链接

- [Vue.js 官方文档](https://vuejs.org/guide/introduction.html)
- [Vite 官方文档](https://vite.dev/guide/)
- [BaoStock 官方文档](http://baostock.com/)
- [AKTools 官方文档](https://github.com/akfamily/aktools)
- [Canvas API MDN 文档](https://developer.mozilla.org/zh-CN/docs/Web/API/Canvas_API)
- [Vitest 官方文档](https://vitest.dev/)
- [语义化配置文档](./docs/semantic-config.md) - Agent JSON 配置说明

## 许可证

本项目采用 MIT 许可证，详情请见 [LICENSE](./LICENSE) 文件。
