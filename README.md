# 归山（原型）

修仙叙事 RPG 原型：同一扇门，三次回来。

- 设计文档：[docs/01-原型设计文档.md](docs/01-原型设计文档.md)
- 流程图：[docs/02-三次返回流程图.md](docs/02-三次返回流程图.md)
- 样章：[docs/03-样章.md](docs/03-样章.md)
- 剧本语法：[content/README.md](content/README.md)

## 结构

| 目录 | 内容 |
|---|---|
| `content/` | 剧本（纯文本，和程序分开） |
| `src/` | 网页内核：解析器、剧情引擎、界面、存档 |
| `web/` | 页面和样式 |
| `ios/` | iOS 外壳（全屏 WKWebView，存档写入 App 文档目录） |
| `.github/workflows/` | 每次推送到 main 自动打包未签名 IPA |

## 本地运行

```bash
npm install
npm run build        # 输出到 dist/www，可直接用浏览器打开 index.html
npm run check-story  # 只检查剧本
```

## 安装到 iPhone

1. 推送到 `main` 后，GitHub Actions 会自动打包。
2. 在仓库的 Releases 里找到「最新测试版」，下载 `Guishan-unsigned.ipa`（Actions 运行页的 Artifacts 里也有）。
3. 用全能签、Sideloadly、爱思助手或 TrollStore 自签安装。
   - 免费 Apple ID 签名 7 天后过期，重签即可，存档不会丢。

## 美术（占位）

当前画面全部由代码生成（`src/art.ts`）：水墨远山、雾、宣纸纹理、场景器物和人物剪影。
场景写法：`@scene 名称 | 副标题 | 时辰/状态`，时辰可选 `dawn` `day` `dusk` `night` `snow` `spring`，例如 `@scene 温家旧门 | 槐荫村东 | dusk/torn`。
正式美术到位后，替换 `renderScene` / `renderFigure` 为图片即可。

字体：霞鹜文楷（SIL OFL 1.1），构建时自动下载并只保留用到的字，许可见 `web/fonts/OFL.txt`。
