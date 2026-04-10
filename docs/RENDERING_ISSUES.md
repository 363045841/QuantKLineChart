# 常见渲染错误

1.水平参考线宽度与副图不一致
**成因**：`ctx.translate(-scrollLeft, 0)` 后，水平线 X 坐标仍用 `0` 到 `paneWidth`，应该用 `scrollLeft` 到 `scrollLeft + paneWidth`。
