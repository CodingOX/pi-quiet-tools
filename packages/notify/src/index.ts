/**
 * @pi-quiet-tools/notify —— 可独立安装的 Pi 扩展入口。
 *
 * 把子代理完成通知从「多行 + transcript 路径 + 结果预览」压成一行状态。
 * 只依赖 Pi 的 registerMessageRenderer 与 pi-tui，和 display-intent / hashline
 * 都没有耦合，因此可以单独放置到 Pi 后使用。
 *
 * ⚠️ 不要同时安装「主包」和「本包」：Pi 对同一 customType 只取加载序列中的
 * 第一个渲染器（见 quiet-subagent-notifications.ts 顶部说明）。多装一份不会报错，
 * 只是后注册的那份被静默忽略 —— 属于无收益的重复安装。
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { installQuietSubagentNotificationRenderer } from "./quiet-subagent-notifications.js";

export default function notifyExtension(pi: ExtensionAPI): void {
  installQuietSubagentNotificationRenderer(pi);
}

export {
  formatQuietSubagentNotifications,
  installQuietSubagentNotificationRenderer,
} from "./quiet-subagent-notifications.js";
