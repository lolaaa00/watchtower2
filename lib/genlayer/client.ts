import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { env } from "../config/env";

export function createWatchtowerClient(account?: `0x${string}`) {
  return createClient({
    chain: studionet,
    account: account,
  });
}

export type WatchtowerClient = ReturnType<typeof createWatchtowerClient>;

export function getContractAddress(): `0x${string}` {
  const addr = env.contractAddress;
  if (!addr) throw new Error("Contract address not configured");
  return addr as `0x${string}`;
}
