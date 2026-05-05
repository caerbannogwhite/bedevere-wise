/**
 * Caches the startup probe result for the stats_duck (ggsql VISUALIZE)
 * parser extension. Set during BedevereApp.initAsync; read by
 * TabManager.executeVisualize when a VISUALIZE query parse-fails so the
 * user-facing error names the actual cause instead of "check the console".
 *
 * `undefined` means the probe ran cleanly (or hasn't run yet).
 */
let statsDuckFailureReason: string | undefined;

export function setStatsDuckFailureReason(reason: string | undefined): void {
  statsDuckFailureReason = reason;
}

export function getStatsDuckFailureReason(): string | undefined {
  return statsDuckFailureReason;
}
