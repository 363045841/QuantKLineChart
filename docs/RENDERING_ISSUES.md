# 常见渲染错误

1. 水平参考线宽度与副图不一致
成因：ctx.translate(-scrollLeft, 0) 后，水平线 X 坐标仍用 0 到 paneWidth，应该用 scrollLeft 到 scrollLeft + paneWidth。

2. 快速缩放时出现 K 线残影（向右滚动的一帧）
现象：缩放开始和缩放结束中间插入了一个向右滚动后的一帧，然后又渲染当前位置的正确缩放结果帧，导致向右滚动的这一帧残影。

- 成因：zoomAt() 中 this.opt（kWidth/kGap）立即同步更新，但 container.scrollLeft 在 onZoomChange 回调中异步等待 nextTick + RAF 才落地。中间 RAF 触发 draw() 时，渲染使用新 kWidth + 旧 scrollLeft，导致可视范围计算错误产生残影。

- 修复：延迟更新 this.opt，在 onZoomChange 回调中等 scrollLeft 落地后再调用 applyZoom(kWidth, kGap) 原子性更新。确保 draw() 永远看到一致的 (kWidth, kGap, scrollLeft) 三元组。

- 相关文件：
1. src/core/chart.ts — zoomAt() / applyZoom()
2. src/components/KLineChart.vue — setOnZoomChange 回调