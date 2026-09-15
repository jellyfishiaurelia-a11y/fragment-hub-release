# 灵感碎片 · 剧情与番外便签系统 (Fragment Hub for SillyTavern)

> 🎨 **SillyTavern（酒馆）原生第三方扩展插件**  
> 专为角色扮演、剧情伏笔、突发灵感、对话碎片与番外小短文设计的极简莫兰迪便签管理系统。

---

## 🌟 核心特性

- **🎭 酒馆原生沉浸式大弹窗**：点击酒馆输入框旁的「魔法棒 / 扩展菜单 (Extensions Menu)」列表项即可随时呼出，支持 `ESC` 快捷关闭，不遮挡、不干扰主聊天界面。
- **⚡ 一键填入酒馆输入框（专属彩蛋）**：便签卡片与编辑区均配备专属「填入输入框」按钮，点击即可直接把灵感正文无缝填入酒馆当前 `#send_textarea` / `#chat_input`，自动触发输入事件与高度适应。
- **🏷️ 分类与多标签智能筛选**：
  - 支持多分类计数气泡快速切换。
  - 支持常用标签池多选筛选，内置 **AND（全部匹配）/ OR（任一匹配）** 逻辑即时切换。
  - 编辑时支持**实时标签输入模糊联想**与**历史标签库一键点选添加**。
- **📦 批量管理操作**：支持一键全选/多选便签，批量修改所属分类、批量追加新标签、批量清理删除。
- **🔍 双重查找与替换引擎**：
  - **单篇查找替换**：支持镜面双层高亮同步层（当前项高亮、其他项柔和高亮）、上一个/下一个快捷定位与精准替换。
  - **全局批量替换**：支持全库或限定分类范围内的关键词批量替换，实时统计受影响便签数。
- **↩️ 撤回 (Ctrl+Z) 与重做 (Ctrl+Y)**：内置编辑历史快照栈，告别误删误改。
- **🛡️ 敏感词一键遮罩打码**：支持自定义敏感词库持久化管理，开启后在列表卡片与卡片导出中均呈现纯黑遮罩方块保护。
- **🖼️ 5 款莫兰迪高清排版卡片导出**：
  - 内置 5 款低饱和度莫兰迪色系（暖杏、豆沙青、迷雾蓝、丁香紫、暗炭灰）。
  - 支持上下平滑滚动长图预览。
  - 支持生成 2.5x Retina 高清 PNG 下载、手机端长按保存相册、一键复制排版文本。
- **💾 数据双重安全持久化**：
  - 数据自动同步保存至 SillyTavern 服务端 `extension_settings`。
  - 浏览器 LocalStorage 本地双重冗余备份。
  - 支持全量 JSON 备份文件一键导出，以及增量合并 / 全量覆盖导入恢复。

---

## 🚀 安装方法

### 方式一：酒馆扩展管理器在线安装（推荐）

1. 将本仓库推送到你的 GitHub（例如 `https://github.com/jellyfishiaurelia-a11y/fragment-hub-release`）。
2. 打开 SillyTavern（酒馆）网页。
3. 点击顶栏右上角 **「扩展 / Extensions」** 菜单（拼图图标）。
4. 在 **「安装第三方扩展 / Install Third-Party Extension」** 输入框中，粘贴你的 GitHub 仓库 URL。
5. 点击 **Install** 即可自动下载并启用。

### 方式二：手动放入酒馆目录

1. 下载或克隆本仓库到 SillyTavern 的第三方插件目录：
   ```bash
   cd SillyTavern/public/scripts/extensions/third-party
   git clone https://github.com/jellyfishiaurelia-a11y/fragment-hub-release.git sillytavern-fragment-hub
   ```
2. 刷新 SillyTavern 网页，即可在魔法棒菜单中看到 **「灵感便签 (Fragment Hub)」**。

---

## 📂 插件目录结构

```text
sillytavern-fragment-hub/
├── manifest.json       # 扩展插件元数据清单
├── index.js            # 核心控制器（响应式数据管理、DOM 挂载、酒馆输入框联动）
├── style.css           # 莫兰迪低饱和度主题样式表（隔离作用域）
├── template.html       # 模块化 UI 模板与各层模态弹窗结构
├── README.md           # 说明文档
└── assets/
    └── icon.svg        # 极简矢量图标
```

---

## ⌨️ 常用快捷键

| 快捷键 | 功能 |
| :--- | :--- |
| `ESC` | 关闭当前弹窗 / 退出灵感便签 |
| `Ctrl + S` | 在编辑器中快速保存当前便签 |
| `Ctrl + Z` | 在编辑器中撤回上一步输入 |
| `Ctrl + Y` / `Ctrl + Shift + Z` | 在编辑器中重做下一步输入 |

---

## 📄 开源许可证

MIT License.
