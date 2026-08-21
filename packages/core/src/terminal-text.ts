const OSC_SEQUENCE_PATTERN = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const ANSI_SEQUENCE_PATTERN = /\x1b\[[0-9;]*[a-zA-Z]/g;

/**
 * 终端渲染会插入控制序列；业务判断必须基于用户实际看到的文本。
 * 保留空白和框线，供依赖原始布局的账本时间线使用。
 */
export function stripTerminalSequences(line: string): string {
  return line
    .replace(OSC_SEQUENCE_PATTERN, "")
    .replace(ANSI_SEQUENCE_PATTERN, "");
}

/**
 * 适用于只关心文字语义的判断，例如 Tools 账本标题和间距。
 */
export function visibleTerminalText(line: string): string {
  return stripTerminalSequences(line).replace(/\s+/g, " ").trim();
}
