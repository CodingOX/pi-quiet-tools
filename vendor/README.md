# vendor/ —— 第三方只读镜像

本目录存放**上游源代码的只读镜像**。它们不是本仓库的产物，也不在这里演进的代码。

```text
vendor/
├── hashline/         pi-hashline-edit-pro 的镜像（上游：YuGiMob/pi-hashline-edit-pro）
└── display-intent/   pi-tool-display-intent 的镜像（上游：zhcsyncer/pi-extensions）
```

## 规则

> ⚠️ **禁止在本目录做本地修改。**
> 决策记录：hashline 采用「vendored 只读镜像」而非 fork，目的是让上游同步保持成
> **目录级覆盖**（冲突面为零），而不是一次真正的 merge。

需要改变这两个上游的**行为**时，只在主包（`src/`）里做胶水层适配；不要改 vendor。

## 为什么包名保持上游原名

两个镜像的 `package.json` 保留上游包名（`pi-hashline-edit-pro`、
`@zhcsyncer/pi-tool-display-intent`）。这样主包的 import 语句与上游完全一致，
上游同步进来时不需要改任何调用点。

它们是 workspace 内的 `file:` 依赖，**不会被发布**到 npm；用户装主包时随主包一起到位。

## 同步方式

上游发布新版本后：

```bash
npm run vendor:pull            # 拉取上游最新 tag，显示将覆盖的文件
npm run vendor:pull -- --check # 只看状态，不落地
```

同步后必须核对两处**契约**，它们是主包赖以工作的假设（改动会让胶水静默失效）：

| 契约 | 位置 | 主包依赖它的什么 |
| :--- | :--- | :--- |
| 工具名清单 | `hashline/package.json` + `hashline/index.ts` | `src/hashline-tools.ts` 的分类必须覆盖上游注册的全部工具名 |
| 补丁键名 | `display-intent/src/*.ts` 的 `Symbol.for(...)` | 主包按这些键读写 display-intent 的补丁状态（账本、thinking 占位） |

`npm test` 的 contract 测试会卡住工具名漂移；补丁键名漂移需要人工核对。
