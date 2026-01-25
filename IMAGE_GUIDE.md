# AutoOj 图片使用指南

本文档说明如何在 AutoOj 系统中使用本地图片。

## 图片存放位置

所有本地图片应存放在以下目录：

```
personal-website/
├── public/
│   └── images/          # 图片目录
│       ├── screenshots/    # 截图
│       ├── diagrams/       # 流程图
│       └── logos/          # Logo
```

## 创建图片目录

```bash
mkdir -p public/images/screenshots
mkdir - public/images/diagrams
mkdir - public/images/logos
```

## Markdown 中引用本地图片

### 基本语法

```markdown
![图片描述](/images/文件名.png)
```

### 示例

```markdown
![系统界面截图](/images/screenshots/homepage.png)

![架构图](/images/diagrams/architecture.png)

![Logo](/images/logos/logo.png)
```
### 控制图片大小

```markdown
<!-- 固定宽度 -->
![图片](/images/screenshot.png =600px)

<!-- 固定宽度高度 -->
![图片](/images/screenshot.png =600x400)

<!-- 响应式图片 -->
![图片](/images/screenshot.png)
```

## 推荐的图片格式

- **截图**: PNG (推荐) 或 JPG
- **图表**: PNG 或 SVG
- **照片**: JPG 或 PNG
- **图标**: SVG 或 PNG

## 图片命名建议

- 使用小写字母
- 用连字符分隔单词
- 使用描述性名称

```
✅ 好的命名:
- homepage-screenshot.png
- login-interface.png
- system-architecture-diagram.png

❌ 不好的命名:
- IMG_001.png
- 1.png
- 截图(1).png
```

## 添加新图片的步骤

1. 将图片文件复制到 `public/images/` 目录
2. 在 Markdown 文件中使用相对路径引用
3. 如果图片较大，建议先压缩优化
4. 提交代码查看效果

## 常见问题

### Q: 图片无法显示？

A: 检查以下几点：
- 图片文件是否在 `public/` 目录下
- 文件名是否正确（区分大小写）
- 路径是否以 `/` 开头

### Q: 如何优化图片？

A: 建议使用以下工具：
- TinyPNG (https://tinypng.com/) - PNG 压缩
- Squoosh (https://squoosh.app/) - 图片压缩和转换

### Q: 支持哪些图片格式？

A: 支持所有常见格式：
- PNG / JPG / JPEG / GIF / SVG / WebP

## 更新教程

修改 `public/tutorial.md` 文件后，刷新页面即可看到更新效果。
