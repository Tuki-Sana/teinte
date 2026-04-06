/** 開発者向けコンソールログの共通プレフィックス */
const LOG_PREFIX = "[ImageDataAnalyzer]";

/**
 * ユーザー向けトーストとは別に、デバッグ・サポート用にコンソールへ出す。
 */
export function logAppError(context: string, error: unknown): void {
  console.error(`${LOG_PREFIX} ${context}`, error);
}
