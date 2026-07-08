# BAART

[English](README.md) | [简体中文](README.zh-CN.md)

**BAART** 是 **Blue Archive Arena Rating Tool（蔚蓝档案竞技场评级工具）**，用于记录、比较和分享《蔚蓝档案》学生 PvP 评价的非官方桌面应用。

应用从 [SchaleDB](https://schaledb.com) 读取学生资料，将五个用户评分维度组合为综合分，并可导出紧凑版或完整版 SVG、PNG 评级卡片。

## 功能

- 使用本地化的 SchaleDB 数据搜索学生。
- 显示职责、攻击与防御类型、武器、射程、掩体、装备和地形适应信息。
- 按 S 至 E 对五个竞技场维度评分。
- 自动计算或手动指定五级综合评级，并默认使用全体共用的归一化百分比权重。
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

五个维度权重以归一化百分比保存，总和始终为 100%。默认使用全体共用权重，因此每个学生采用同一套计分公式；也可切换到单独设置模式，为特定学生保留独立权重。每个权重既可拖动滑杆，也可直接输入百分比数字。调整一个均衡器式控件时，其他四个维度会按当前权重比例反向调整；综合分按 `sum(维度分 × 权重百分比) / 100` 计算。旧 JSON 中的不计、半权重和全权重会自动迁移为等价的归一化占比。

雷达动画可分别调整机械扫描、扫描余辉、数据点显示、扫描后多边形显示、信息块入场、综合评级显示、辉光和评论滚动。默认扫描时长为 1.5 秒；每个维度会在扫描线经过对应轴后，直接在最终位置淡入显示，高分 S/A 仍保留波纹强调效果。长评论会在评论块入场后开始滚动，并在“适配停留时长”模式下于淡出前抵达底部；仍可切换为固定像素/秒速度。

浅色主题会对攻击/防御类型、掩体、地形和适应力图标增加对比处理，使图标中的白色区域在浅色背景和导出卡片中仍然可见。

渲染并行度默认值为自适应。BAART 会根据本机 CPU 预测一个保守的 worker 数，控制面板也提供基准测试按钮，可反复渲染短图片序列样本，为当前机器和输出目标选择最快且稳定的设置。基准测试进度以“步骤”显示：一个 IO 写入测试、多轮并行度候选，以及 PNG/JPEG 格式对比。最佳结果会自动应用，自动、100% 和固定 worker 数选项仍保留用于手动调整。基准测试报告会分类瓶颈；“浏览器场景渲染或图片编码”表示磁盘写入速度已明显高于实际渲染速度。

MP4、无损 PNG 序列和可选的有损 JPEG 序列支持 720p、1080p 与 4K。PNG/JPEG 帧通过 Remotion 的 [`renderFrames()`](https://www.remotion.dev/docs/renderer/render-frames) API 直接从 React 合成渲染，绝不会从已编码视频中截取。这是 Remotion 官方 [`--sequence`](https://www.remotion.dev/docs/cli/render#--sequence) 命令的程序化对应方式。MP4 使用 `renderMedia()` 渲染。渲染质量默认使用“平衡”；“高质量”保留较重的评论遮罩，“快速”会减少阴影和辉光等昂贵效果以提升图片序列输出速度。

在 Windows x64 桌面应用中，MP4 使用系统原生“另存为”对话框；PNG/JPEG 图片序列使用系统文件夹对话框，并创建新的 `<名称>-frames` 子文件夹，不会覆盖已有序列。绝对保存路径仅保留在本机状态中，不会写入便携项目清单。首次渲染会把 Remotion 兼容的 Chrome for Testing 下载到 BAART 可写的应用缓存 `renderer-runtime/node_modules/.remotion` 中，之后复用该缓存。学生立绘和 UI 图标也会缓存到本机渲染缓存，避免逐帧重复从 SchaleDB 读取图片。因此首次渲染需要联网，但不会向安装目录写入文件。

浏览器开发模式使用本地主机渲染 API，并将结果写入已忽略的 `video-output/` 目录。`npm run dev` 和 `npm run video:preview` 都会提供该 API；若服务器错误返回 HTML 等非 JSON 内容，界面会显示明确的传输错误。

无需打开控制面板也可渲染已保存项目：

```powershell
npm run video:render -- path\to\project.baart-video.json
```

打包后的 Tauri 应用包含固定版本的 Node 运行时、Remotion 渲染模块、Windows 合成器二进制文件和预构建合成包，无需用户另行安装 Node.js，也无需运行本地主机服务即可渲染。目前独立渲染器仅支持 Windows x64，并会明显增加可执行文件和安装包体积。

渲染失败时，界面会保留底层 Node 或 Remotion 错误，并附带进程退出码。警告和浏览器重试信息会显示在独立可滚动的渲染日志区域中，不会占用进度摘要行。可运行 `npm run renderer:smoke` 独立验证打包运行时而不使用开发环境的 `node_modules`；添加 `-- --fresh-browser` 可验证全新 Chrome 下载及缓存复用。

在 Windows 上，BAART 会在调用 Node.js 前将 Tauri 的 `\\?\` 原样资源路径转换为普通盘符或 UNC 路径，避免 Node 把盘符误判为脚本入口，同时保留应用内部对 Unicode 和长路径的支持。

如需使用真实测试评级数据 profiling 渲染流程，可运行：

```powershell
npm run video:profile -- --quick --frames=180
```

该工具使用 Remotion 原生帧管线渲染有限长度的 1080p/60 样本，并把报告写入已忽略的 `.cache/video-profile/` 目录。报告包含渲染 FPS、输出字节数、MB/s、纯 IO 写入测试以及瓶颈分类。可用 `--case=full-8,full-12` 比较指定案例，用 `--case=full-adaptive-jpeg` 对比较轻图像格式以诊断 PNG 编码开销，用 `--case=fast-quality-mode-adaptive` 测量快速质量模式，用 `--ui-language=en --theme=light` 检查其他布局，或去掉 `--quick` 运行完整的模块/并行度 sweep。最近的本机样本显示，纯 IO 写入速度比实际渲染快数百倍，因此当前瓶颈主要是浏览器场景渲染和 PNG/JPEG 编码，而不是创建或写入图片文件。

## 评级数据

评级会自动保存到浏览器或 WebView 的本地存储中。JSON 功能可保存便携评级文件，或读取已有文件。导出的评级卡片只包含展示内容，不包含编辑控件。

## 数据与图片

学生数据、立绘、图标和游戏相关 UI 素材均从 [SchaleDB](https://schaledb.com) 请求。本仓库不重新分发这些素材。

## 免责声明

BAART 是非官方同人工具，与 Nexon Games、Yostar 或 SchaleDB 无隶属或授权关系。《蔚蓝档案》及相关素材的权利归各自所有者所有。

## 许可证

应用源代码采用 [MIT License](LICENSE)。该许可证不适用于第三方游戏数据或图片素材。
