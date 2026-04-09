/**
 * 根据面板高度计算网格线/价格标签数量
 * @param height 面板高度（逻辑像素）
 * @param isMain 是否为主图面板
 * @returns tick 数量
 */
export function calculateTickCount(height: number, isMain: boolean): number {
    if (isMain) {
        // 主图：根据高度动态计算，范围 4-8
        return Math.max(4, Math.min(8, Math.round(height / 80)))
    } else {
        // 副图：固定 2 条
        return 2
    }
}
