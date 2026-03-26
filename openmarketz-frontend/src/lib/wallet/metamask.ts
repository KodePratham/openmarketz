import { BrowserProvider } from "ethers";

const MONAD_CHAIN_ID_HEX = "0x279f";
const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";

const DEFAULT_TARGET_NETWORK = {
  chainIdHex: SEPOLIA_CHAIN_ID_HEX,
  chainName: "Sepolia",
  rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
  blockExplorerUrls: ["https://sepolia.etherscan.io"],
  nativeCurrency: {
    name: "Sepolia Ether",
    symbol: "ETH",
    decimals: 18,
  },
} as const;

function normalizeChainIdHex(chainId: string | undefined): string {
  if (!chainId) return DEFAULT_TARGET_NETWORK.chainIdHex;

  if (chainId.startsWith("0x")) {
    const normalized = chainId.toLowerCase();
    return normalized === "0x0" ? DEFAULT_TARGET_NETWORK.chainIdHex : normalized;
  }

  const asNumber = Number(chainId);
  if (!Number.isFinite(asNumber) || asNumber <= 0) return DEFAULT_TARGET_NETWORK.chainIdHex;
  return `0x${Math.floor(asNumber).toString(16)}`;
}

function getTargetNetworkConfig() {
  return {
    chainIdHex: normalizeChainIdHex(process.env.NEXT_PUBLIC_CHAIN_ID),
    chainName: process.env.NEXT_PUBLIC_CHAIN_NAME || DEFAULT_TARGET_NETWORK.chainName,
    rpcUrls: [process.env.NEXT_PUBLIC_RPC_URL || DEFAULT_TARGET_NETWORK.rpcUrls[0]],
    blockExplorerUrls: [process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL || DEFAULT_TARGET_NETWORK.blockExplorerUrls[0]],
    nativeCurrency: {
      name: process.env.NEXT_PUBLIC_NATIVE_CURRENCY_NAME || DEFAULT_TARGET_NETWORK.nativeCurrency.name,
      symbol: process.env.NEXT_PUBLIC_NATIVE_CURRENCY_SYMBOL || DEFAULT_TARGET_NETWORK.nativeCurrency.symbol,
      decimals: Number(process.env.NEXT_PUBLIC_NATIVE_CURRENCY_DECIMALS || DEFAULT_TARGET_NETWORK.nativeCurrency.decimals),
    },
  };
}

export type ConnectedWallet = {
  provider: BrowserProvider;
  address: string;
};

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

function getEthereum() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask is required");
  }
  return window.ethereum;
}

export async function ensureMonadNetwork(): Promise<void> {
  const ethereum = getEthereum();

  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: MONAD_CHAIN_ID_HEX }],
    });
  } catch {
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: MONAD_CHAIN_ID_HEX,
          chainName: "Monad Testnet",
          nativeCurrency: {
            name: "Monad",
            symbol: "MON",
            decimals: 18,
          },
          rpcUrls: ["https://testnet-rpc.monad.xyz"],
          blockExplorerUrls: ["https://testnet.monadexplorer.com"],
        },
      ],
    });
  }
}

export async function ensureTargetNetwork(): Promise<void> {
  const ethereum = getEthereum();
  const target = getTargetNetworkConfig();

  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: target.chainIdHex }],
    });
  } catch {
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: target.chainIdHex,
          chainName: target.chainName,
          nativeCurrency: target.nativeCurrency,
          rpcUrls: target.rpcUrls,
          blockExplorerUrls: target.blockExplorerUrls,
        },
      ],
    });
  }
}

export async function connectMetaMask(): Promise<ConnectedWallet> {
  const ethereum = getEthereum();
  await ensureTargetNetwork();

  await ethereum.request({ method: "eth_requestAccounts" });

  const provider = new BrowserProvider(ethereum);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();

  return { provider, address };
}
