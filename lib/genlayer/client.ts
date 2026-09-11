import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { env } from "../config/env";

export type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: any[]) => void) => void;
  removeListener: (event: string, handler: (...args: any[]) => void) => void;
};

export type WatchtowerClient = ReturnType<typeof createClient>;

export function createWatchtowerClient(opts: {
  account?: `0x${string}`;
  provider?: EthereumProvider;
}) {
  return createClient({
    chain: studionet,
    account: opts.account,
    provider: opts.provider as any,
  });
}

export function getContractAddress(): `0x${string}` {
  const addr = env.contractAddress;
  if (!addr) throw new Error("Contract address not configured");
  return addr as `0x${string}`;
}
