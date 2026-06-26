export const env = {
  contractAddress: process.env.NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS || "",
  chainId: Number(process.env.NEXT_PUBLIC_GENLAYER_CHAIN_ID || "61999"),
  rpcUrl: process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || "https://studio.genlayer.com/api",
  explorerBaseUrl:
    process.env.NEXT_PUBLIC_GENLAYER_EXPLORER_BASE_URL ||
    "https://explorer-studio.genlayer.com",
} as const;

export function getExplorerTxUrl(hash: string): string {
  return `${env.explorerBaseUrl}/tx/${hash}`;
}

export function getExplorerAddressUrl(addr: string): string {
  return `${env.explorerBaseUrl}/address/${addr}`;
}
