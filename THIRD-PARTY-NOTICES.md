# Third-party notices

本包在 `vendor/` 下内嵌第三方源代码，并在发布时把它们作为 bundled dependencies
以真实文件形式放进 tarball 的 `node_modules/` 下。三者均为 **MIT** 许可。

## pi-hashline-edit-pro

- **版本**：4.3.4（本地镜像，未跟随上游 tag）
- **上游**：https://github.com/YuGiMob/pi-hashline-edit-pro
- **版权**：Copyright (c) 2026 RimuruW and Yugimob
- **许可**：MIT —— 完整文本见 `vendor/hashline/LICENSE`
- **本仓库的角色**：只读镜像。本仓库不修改其实现，只在胶水层（`src/`）适配其
  模型侧 schema 与终端渲染。上游同步走 `npm run vendor:pull`。

## @zhcsyncer/pi-tool-display-intent

- **版本**：0.9.0（fork of `feat/per-turn-layout`；上游最新为 0.10.0）
- **上游**：https://github.com/zhcsyncer/pi-extensions
- **fork**：https://github.com/CodingOX/pi-extensions（分支 `feat/per-turn-layout`）
- **版权**：
  - Copyright (c) 2026 zhcsyncer
  - Copyright (c) 2026 MasuRii（原始 pi-tool-display 作者）
  - Copyright (c) 2026 Mert Deveci（pi-tool-display-summary 作者）
- **许可**：MIT —— 完整文本见 `vendor/display-intent/LICENSE` 与 `UPSTREAM_LICENSE`
- **本仓库的角色**：**fork，不是镜像**。含本地独占工作（`per-turn` 工具账本布局、
  open ledger 时钟、per-runtime owner 生命周期）。这些改动不随上游同步自动合并，
  详细理由与雷区见 `docs/upstream-sync.md`。

## 传递依赖

`pi-hashline-edit-pro` 的运行时依赖会一并打入 tarball：

| 包 | 许可 |
| :--- | :--- |
| `diff` | BSD-3-Clause |
| `file-type` | MIT |
| `typebox` | MIT |
| `xxhash-wasm` | MIT |
| `strtok3` / `token-types` / `@tokenizer/*` / `@borewit/text-codec` / `ieee754` / `uint8array-extras` / `debug` / `ms` | MIT |

各自的许可文本随其包一同发布（在 tarball 内的 `node_modules/<pkg>/` 下）。
