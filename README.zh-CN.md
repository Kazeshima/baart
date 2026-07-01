# BAART

[English](README.md) | [简体中文](README.zh-CN.md)

**BAART** 是 **Blue Archive Arena Rating Tool（蔚蓝档案竞技场评级工具）**，用于记录、比较和分享《蔚蓝档案》学生 PvP 评价的非官方桌面应用。

应用从 [SchaleDB](https://schaledb.com) 读取学生资料，将五个用户评分维度组合为综合分，并可导出紧凑版或完整版 SVG、PNG 评级卡片。

## 功能

- 使用本地化的 SchaleDB 数据搜索学生。
- 显示职责、攻击与防御类型、武器、射程、掩体、装备和地形适应信息。
- 按 S 至 E 对五个竞技场维度评分。
- 自动计算或手动指定五级综合评级。
- 本地保存评级，并通过 JSON 导入或导出。
- 导出紧凑版和完整版 SVG、PNG 评级卡片。
- 将所有已评级学生批量导出为 ZIP。
- 支持简体中文、英文以及深色、浅色主题。
- 通过 Tauri 使用 Windows 原生文件对话框。

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

构建 Web 生产版本：

```powershell
npm run build
```

构建独立可执行文件和安装程序：

```powershell
npm run tauri build
```

## 评级数据

评级会自动保存到浏览器或 WebView 的本地存储中。JSON 功能可保存便携评级文件，或读取已有文件。导出的评级卡片只包含展示内容，不包含编辑控件。

## 数据与图片

学生数据、立绘、图标和游戏相关 UI 素材均从 [SchaleDB](https://schaledb.com) 请求。本仓库不重新分发这些素材。

## 免责声明

BAART 是非官方同人工具，与 Nexon Games、Yostar 或 SchaleDB 无隶属或授权关系。《蔚蓝档案》及相关素材的权利归各自所有者所有。

## 许可证

应用源代码采用 [MIT License](LICENSE)。该许可证不适用于第三方游戏数据或图片素材。
