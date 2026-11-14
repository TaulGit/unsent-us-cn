# 手机应用图标素材

- 生成方式：内置 `image_gen`，非 CLI/API fallback。
- 成品：`assets/app-icons.webp`，900 × 600 像素，3 列 × 2 行，每格 300 × 300。
- 原始生成图保留在 Codex 默认生成目录，工程只保存消费用 WebP。
- 后处理：项目 `sharp` 将生成图等比缩为 900 × 600，WebP quality 92；没有重绘或用 SVG/emoji 替代。
- 检视：六格位置、尺寸、材质与留白一致；实物不跨格，无可读文字、标签或标志。

## 图集顺序与 CSS

按阅读顺序：消息信封、胶片照片、手写笔记本、账单票据、录音机耳机、线索夹。

使用 `background-size: 300% 200%`。六格 `background-position` 依次为：

```text
0% 0%      50% 0%      100% 0%
0% 100%    50% 100%    100% 100%
```

## 最终生成 Prompt

```text
Use case: product-mockup. Asset type: one final production raster spritesheet of six richly detailed app icons for a Chinese nostalgic friendship investigation game. Create a strict 3-column by 2-row regular grid, total canvas exactly 3:2 landscape (1536 by 1024 preferred), six equal square cells with absolutely no gutters, no outer margin, no labels, no captions, no readable text, no logos, no watermark. Each square cell has the same deep ink-green rounded-square background filling its entire cell, subtly tactile and softly lit; CSS will crop each cell separately. Render each central icon as an exquisite photorealistic miniature still life with real paper fibres, aged brass, translucent film, leather and worn plastic, studio product photography, warm amber highlights, soft natural contact shadows, coherent dark-green / brass / cream palette, NOT flat vectors, NOT SVG style, NOT emoji, NOT simple geometric pictograms. Each object grouping is centered, occupies about seventy percent of its square cell with equal breathing room, and never crosses cell boundaries. Reading order is strict. Top-left: one folded cream-paper message envelope with an amber-gold wax seal. Top-middle: two overlapping vintage photographic film prints with a small translucent film edge. Top-right: an open handwritten paper notebook, its marks completely illegible and decorative with no identifiable letters or words. Bottom-left: a long folded cream receipt and a small account slip with indistinct tiny marks only, no readable text or numbers. Bottom-middle: a compact vintage portable digital audio recorder with a neatly looped set of wired headphones, no brand or readable labels. Bottom-right: a small cream document folder containing several paper sheets held together with a weathered brass paperclip. All six cells should have consistent scale, lighting, perspective and material quality. This is a usable game asset spritesheet, not a presentation board.
```
