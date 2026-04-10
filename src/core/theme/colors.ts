/**
 * 统一颜色配置
 * 所有文本颜色集中管理，确保视觉一致性
 */

/**
 * 文本颜色标准
 */
export const TEXT_COLORS = {
    /** 
     * 主要文本：深石墨色 
     * 对应你原来的 hsl(210, 9%, 31%)，作为视觉重心
     */
    PRIMARY: 'hsl(210, 9%, 31%)',

    /** 
     * 次要文本：灰蓝色调 
     * 用于副标题、正文
     */
    SECONDARY: 'hsl(210, 9%, 35%)',

    /** 
     * 辅助文本：用于标签、占位符
     */
    TERTIARY: 'hsl(210, 8%, 50%)',

    /** 
     * 弱文本/禁用状态：用于页脚、失效信息
     */
    WEAK: 'hsl(210, 7%, 65%)',

    /** 
     * 反白文字：92% 不透明度的纯白
     * 这种做法很好，避免了纯白刺眼
     */
    WHITE: 'rgba(255, 255, 255, 0.92)',
} as const;

/**
 * 涨跌颜色（股票配色）
 */
export const PRICE_COLORS = {
    /** 上涨颜色（红） */
    UP: 'rgba(214, 10, 34, 1)',
    UP_LIGHT: 'rgba(214, 10, 34, 0.92)',
    UP_TICK: 'hsl(0, 60%, 50%)',

    /** 下跌颜色（绿） */
    DOWN: 'rgba(3, 123, 102, 1)',
    DOWN_LIGHT: 'rgba(3, 123, 102, 0.92)',
    DOWN_TICK: 'hsl(150, 30%, 60%)',

    /** 中性颜色 */
    NEUTRAL: 'rgba(0, 0, 0, 0.78)',

    /** 最新价颜色 */
    LAST_PRICE: 'rgb(183, 22, 22)',
} as const

/**
 * 十字线标签背景颜色
 */
export const TAG_BG_COLORS = {
    /** 白色背景 */
    WHITE: 'rgb(255, 255, 255)',

    /** 浅灰背景 */
    LIGHT_GRAY: 'rgba(255, 255, 255, 0.92)',

    /** 纯白背景 */
    PURE_WHITE: '#ffffff',

    /** 激活状态背景 */
    ACTIVE: '#1890ff',
    ACTIVE_HOVER: '#40a9ff',

    /** 悬停背景 */
    HOVER: '#f0f0f0',
} as const

/**
 * 边框颜色
 */
export const BORDER_COLORS = {
    /** 深色边框 */
    DARK: 'rgba(0, 0, 0, 0.12)',

    /** 中色边框 */
    MEDIUM: 'rgba(0, 0, 0, 0.10)',

    /** 浅色边框 */
    LIGHT: 'rgba(0, 0, 0, 0.08)',

    /** 分隔线 */
    SEPARATOR: 'rgba(0, 0, 0, 0.10)',

    /** 按钮边框 */
    BUTTON: '#d0d0d0',
} as const

/**
 * 网格线颜色
 */
export const GRID_COLORS = {
    /** 水平网格线 */
    HORIZONTAL: 'rgba(0, 0, 0, 0.06)',

    /** 垂直网格线 */
    VERTICAL: 'rgba(0, 0, 0, 0.12)',
} as const

/**
 * 均线颜色
 */
export const MA_COLORS = {
    MA5: 'rgba(255, 193, 37, 1)',
    MA10: 'rgba(190, 131, 12, 1)',
    MA20: 'rgba(69, 112, 249, 1)',
    MA30: 'rgba(76, 175, 80, 1)',
    MA60: 'rgba(156, 39, 176, 1)',
} as const

/**
 * 布林带颜色
 */
export const BOLL_COLORS = {
    /** 上轨颜色 */
    UPPER: 'rgba(178, 34, 34, 1)',
    /** 中轨颜色（与 MA20 相同） */
    MIDDLE: 'rgba(69, 112, 249, 1)',
    /** 下轨颜色 */
    LOWER: 'rgba(34, 139, 34, 1)',
    /** 带状区域填充 */
    BAND_FILL: 'rgba(100, 149, 237, 0.1)',
} as const

/**
 * MACD 颜色
 */
export const MACD_COLORS = {
    /** DIF 线颜色（快线）- 与 MA20 相同 */
    DIF: 'rgba(69, 112, 249, 1)',
    /** DEA 线颜色（慢线）- 橙色 */
    DEA: 'rgba(255, 152, 0, 1)',
    /** MACD 柱上涨颜色 */
    BAR_UP: 'rgba(214, 10, 34, 1)',
    /** MACD 柱下跌颜色 */
    BAR_DOWN: 'rgba(3, 123, 102, 1)',
} as const

/**
 * RSI 颜色
 */
export const RSI_COLORS = {
    RSI1: 'rgba(69, 112, 249, 1)',
    RSI2: 'rgba(255, 152, 0, 1)',
    RSI3: 'rgba(156, 39, 176, 1)',
} as const

/**
 * CCI 颜色
 */
export const CCI_COLORS = {
    CCI: 'rgba(69, 112, 249, 1)',
    /** 超买线 +100 */
    OVERBOUGHT: 'rgba(214, 10, 34, 0.5)',
    /** 超卖线 -100 */
    OVERSOLD: 'rgba(3, 123, 102, 0.5)',
} as const

/**
 * KDJ/STOCH 颜色
 */
export const KDJ_COLORS = {
    K: 'rgba(69, 112, 249, 1)',
    D: 'rgba(255, 152, 0, 1)',
    J: 'rgba(156, 39, 176, 1)',
} as const

/**
 * MOM 颜色
 */
export const MOM_COLORS = {
    MOM: 'rgba(69, 112, 249, 1)',
    ZERO: 'rgba(0, 0, 0, 0.2)',
} as const

/**
 * WMSR 颜色
 */
export const WMSR_COLORS = {
    WMSR: 'rgba(69, 112, 249, 1)',
    /** 超买线 -20 */
    OVERBOUGHT: 'rgba(214, 10, 34, 0.5)',
    /** 超卖线 -80 */
    OVERSOLD: 'rgba(3, 123, 102, 0.5)',
} as const

/**
 * KST 颜色
 */
export const KST_COLORS = {
    KST: 'rgba(69, 112, 249, 1)',
    SIGNAL: 'rgba(255, 152, 0, 1)',
} as const

/**
 * 十字线颜色
 */
export const CROSSHAIR_COLORS = {
    /** 十字线颜色 */
    LINE: 'rgba(0, 0, 0, 0.28)',

    /** 十字线标签背景 */
    LABEL_BG: 'rgb(0, 0, 0)',

    /** 十字线标签文本 */
    LABEL_TEXT: 'rgba(255, 255, 255, 0.92)',
} as const

/**
 * 日志颜色
 */
export const LOG_COLORS = {
    INFO: 'background:#164586;color:#fff;',
    SUCCESS: 'background:#389e0d;color:#fff;',
    WARN: 'background:#d46b08;color:#fff;',
    ERROR: 'background:#cf1322;color:#fff;',
    CONSOLE: '#666',
} as const

/**
 * 工具函数：根据涨跌返回颜色
 */
export function getPriceColor(type: 'up' | 'down' | 'neutral') {
    switch (type) {
        case 'up':
            return PRICE_COLORS.UP
        case 'down':
            return PRICE_COLORS.DOWN
        case 'neutral':
            return PRICE_COLORS.NEUTRAL
    }
}

/**
 * 工具函数：根据涨跌百分比返回颜色
 */
export function getTickColor(changePercent: number) {
    return changePercent >= 0 ? PRICE_COLORS.UP_TICK : PRICE_COLORS.DOWN_TICK
}
