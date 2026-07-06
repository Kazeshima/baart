# BAART

[English](README.md) | [简体中文](README.zh-CN.md)

**BAART** 是 **Blue Archive Arena Rating Tool（蔚蓝档案竞技场评级工具）**，用于记录、比较和分享《蔚蓝档案》学生 PvP 评价的非官方桌面应用。

应用从 [SchaleDB](https://schaledb.com) 读取学生资料，将五个用户评分维度组合为综合分，并可导出紧凑版或完整版 SVG、PNG 评级卡片。

## 功能

- 使用本地化的 SchaleDB 数据搜索学生。
- 显示职责、攻击与防御类型、武器、射程、掩体、装备和地形适应信息。
- 按 S 至 E 对五个竞技场维度评分。
- 自动计算或手动指定五级综合评级，并可为每个维度设置不计、半权重或全权重。
- 本地保存评级，并通过 JSON 导入或导出。
- 导出紧凑版和完整版 SVG、PNG 评级卡片。
- 将所有已评级学生批量导出为 ZIP。
- 支持简体中文、英文以及深色、浅色主题。
- 通过 Tauri 使用 Windows 原生文件对话框。
- 提供可配置的 Remotion 视频工作室，以 16:9 竞技场攻略形式预览和渲染全部已评级学生。

## 技术栈

- [React](https://react.dev/) 与 [Vite](https://vite.dev/)
- [Zustand](https://zustand-demo.pmnd.rs/) 本地状态管理
- [Tauri 2](https://tauri.app/) 与 Rust 后端
- 学生数据和图片来自 [SchaleDB](https://schaledb.com)

## 开发

环境要求：

- Node.js 18 或更高版本
- Rust 1.77.2 或更高版本
- Tauri 的 Windows 构建依赖

安装依赖并运行 Web 界面：

```powershell
npm install
npm run dev
```

运行桌面应用：

```powershell
npm run tauri dev
```

在 Windows x64 上，Tauri 命令会自动准备独立渲染器：下载并校验固定版本的 Node.js 24.18.0，安装仅用于生产渲染的 Remotion 依赖，并预构建合成包。生成的运行时文件不会纳入 Git。

构建 Web 生产版本：

```powershell
npm run build
```

构建独立可执行文件和安装程序：

```powershell
npm run tauri build
```

## 视频工作室

启动评级工具、视频工作室和本地渲染 API：

```powershell
npm run video:preview
```

普通的 `npm run dev` 也会提供渲染 API。如需直接在 Remotion Studio 中检查合成，可运行：

```powershell
npm run video:studio
```

视频工作室可从本地存储或评级 JSON 读取数据。`.baart-video.json` 项目清单会保存标准化评级、已解析的学生资料、手动顺序、语言、主题、时间、特效、分辨率和输出设置，以便重复生成相同结果。学生可按评级时间、综合分、ID、学校分组排序，也可拖放手动排序。

雷达动画可分别调整机械扫描、数据点缓动展开和扫描后多边形显示的时长。默认扫描时长为 1.5 秒，每个维度会在扫描线经过对应轴时开始显示。

MP4 和无损 PNG 序列支持 720p、1080p 与 4K。PNG 帧通过 Remotion 的 [`renderFrames()`](https://www.remotion.dev/docs/renderer/render-frames) API 直接从 React 合成渲染，绝不会从已编码视频中截取。这是 Remotion 官方 [`--sequence`](https://www.remotion.dev/docs/cli/render#--sequence) 命令的程序化对应方式。MP4 使用 `renderMedia()` 渲染。

在 Windows x64 桌面应用中，MP4 使用系统原生“另存为”对话框；PNG 图片序列使用系统文件夹对话框，并创建新的 `<名称>-frames` 子文件夹，不会覆盖已有序列。绝对保存路径仅保留在本机状态中，不会写入便携项目清单。首次渲染会下载 Remotion 兼容的 Chrome for Testing，之后复用缓存，因此首次渲染需要联网。

浏览器开发模式使用本地主机渲染 API，并将结果写入已忽略的 `video-output/` 目录。`npm run dev` 和 `npm run video:preview` 都会提供该 API；若服务器错误返回 HTML 等非 JSON 内容，界面会显示明确的传输错误。

无需打开控制面板也可渲染已保存项目：

```powershell
npm run video:render -- path\to\project.baart-video.json
```

打包后的 Tauri 应用包含固定版本的 Node 运行时、Remotion 渲染模块、Windows 合成器二进制文件和预构建合成包，无需用户另行安装 Node.js，也无需运行本地主机服务即可渲染。目前独立渲染器仅支持 Windows x64，并会明显增加可执行文件和安装包体积。

## 评级数据

评级会自动保存到浏览器或 WebView 的本地存储中。JSON 功能可保存便携评级文件，或读取已有文件。导出的评级卡片只包含展示内容，不包含编辑控件。

## 数据与图片

学生数据、立绘、图标和游戏相关 UI 素材均从 [SchaleDB](https://schaledb.com) 请求。本仓库不重新分发这些素材。

## 免责声明

BAART 是非官方同人工具，与 Nexon Games、Yostar 或 SchaleDB 无隶属或授权关系。《蔚蓝档案》及相关素材的权利归各自所有者所有。

## 许可证

应用源代码采用 [MIT License](LICENSE)。该许可证不适用于第三方游戏数据或图片素材。
