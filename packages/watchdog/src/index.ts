/**
 * @pi-quiet-tools/watchdog —— 可独立安装的 Pi 扩展入口。
 *
 * 抽成独立包的原因：看门狗与 display-intent / hashline 没有任何耦合，
 * 只依赖 Pi 的事件与一个纯文本判定（./assistant-text.ts）。它被主包
 * pi-quiet-tools 作为 bundle 依赖装载，也可以单独放置到 Pi 后使用。
 *
 * ⚠️ 不要同时安装「主包」和「本包」：两者会各自注册一套事件处理器，
 * 结果是同一次 bash 失控被 nudge 两次。Pi 的路径去重只对同一路径生效，
 * bundle 内的副本与独立安装的副本是两个不同路径，不会被合并。
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { installHostWatchdog } from "./host-watchdog.js";

export default function watchdogExtension(pi: ExtensionAPI): void {
  installHostWatchdog(pi);
}

export { installHostWatchdog } from "./host-watchdog.js";
export {
  createWatchdog,
  DEFAULT_WATCHDOG_LIMITS,
  HOST_WATCHDOG_POLICY,
  CHILD_WATCHDOG_POLICY,
  NUDGE_INSTRUCTION,
  HARD_STOP_INSTRUCTION,
  CHILD_NUDGE_INSTRUCTION,
  CHILD_HARD_STOP_INSTRUCTION,
} from "./host-watchdog.js";
