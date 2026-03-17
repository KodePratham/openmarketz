import { BrowserProvider } from "ethers";

const MONAD_CHAIN_ID_HEX = "0x279f";

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

export async function connectMetaMask(): Promise<ConnectedWallet> {
  const ethereum = getEthereum();
  await ensureMonadNetwork();

  await ethereum.request({ method: "eth_requestAccounts" });

  const provider = new BrowserProvider(ethereum);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();

  return { provider, address };
}
