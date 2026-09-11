import type { WatchtowerClient } from "./client";

/** Outcomes where nothing was written and the caller should offer a retry, not treat this as a hard error. */
export const RETRYABLE_STATUSES = new Set(["UNDETERMINED", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT"]);

/** Terminal states — polling stops here. */
const TERMINAL_STATUSES = new Set([
  "ACCEPTED", "FINALIZED", "UNDETERMINED", "CANCELED",
  "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT",
]);

export interface LifecycleUpdate {
  status: string;
  hash: string;
  retryable: boolean;
}

/**
 * Polls a submitted transaction and reports every real consensus stage
 * (PROPOSING → COMMITTING → REVEALING → ACCEPTED → FINALIZED) via onUpdate,
 * instead of a generic spinner. Resolves once a terminal state is reached —
 * including UNDETERMINED / *_TIMEOUT, which are retryable outcomes, not
 * exceptions, so the caller decides what to do next.
 */
export async function pollTransactionLifecycle(
  client: WatchtowerClient,
  hash: string,
  onUpdate: (update: LifecycleUpdate) => void,
  opts: { intervalMs?: number; maxAttempts?: number } = {}
): Promise<LifecycleUpdate> {
  const interval = opts.intervalMs ?? 4000;
  const maxAttempts = opts.maxAttempts ?? 120; // ~8 min ceiling for slow consensus rounds

  let lastStatus = "";
  let consecutiveFetchFailures = 0;
  const maxConsecutiveFailures = 5; // ~20s of transient network blips before giving up

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let tx;
    try {
      tx = await client.getTransaction({ hash: hash as any });
      consecutiveFetchFailures = 0;
    } catch (e) {
      // A single flaky fetch (RPC hiccup, brief disconnect) must not kill the
      // whole poll and surface a raw network error while the transaction is
      // still genuinely progressing on-chain — just retry next tick, up to a
      // cap so a truly dead connection doesn't spin forever.
      consecutiveFetchFailures++;
      if (consecutiveFetchFailures >= maxConsecutiveFailures) {
        throw e;
      }
      await sleep(interval);
      continue;
    }

    const status = (tx?.statusName as string) || (tx?.status as string) || "PENDING";

    if (status !== lastStatus) {
      lastStatus = status;
      onUpdate({ status, hash, retryable: RETRYABLE_STATUSES.has(status) });
    }

    if (TERMINAL_STATUSES.has(status)) {
      return { status, hash, retryable: RETRYABLE_STATUSES.has(status) };
    }

    await sleep(interval);
  }

  return { status: "TIMED_OUT_POLLING", hash, retryable: true };
}

/**
 * Waits for FINALIZED specifically (used where the caller needs the
 * post-appeal-window guarantee, not just ACCEPTED).
 */
export async function waitForTx(
  client: WatchtowerClient,
  hash: string,
  status: string = "FINALIZED"
) {
  return client.waitForTransactionReceipt({
    hash: hash as any,
    status: status as any,
    interval: 5000,
    retries: 120,
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
