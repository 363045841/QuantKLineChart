// src/index.ts
import type { App } from 'vue'
import './style.css'

import { KLineChart } from './components'

// 导出插件系统
export * from './plugin'

// 导出组件和类型
export { KLineChart }
export type { KLineData } from './types/price'

export const KMapPlugin = {
    install(app: App) {
        app.component('KLineChart', KLineChart)
    },
}