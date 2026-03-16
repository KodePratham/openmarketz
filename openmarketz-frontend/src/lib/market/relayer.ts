import { Contract, JsonRpcProvider, Wallet } from "ethers";

const MONAD_CHAIN_ID = 10143;

export const getRelayerSigner = () => {
  const rpcUrl = process.env.NEXT_PUBLIC_MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz";
  const relayerKey = process.env.RELAYER_PRIVATE_KEY;

  if (!relayerKey) {
    throw new Error("Missing RELAYER_PRIVATE_KEY environment variable.");
  }

  const provider = new JsonRpcProvider(rpcUrl, MONAD_CHAIN_ID);
  return new Wallet(relayerKey, provider);
};

export const getFactoryContract = (abi: readonly string[]) => {
  const factoryAddress = process.env.NEXT_PUBLIC_MARKET_FACTORY_ADDRESS;
  if (!factoryAddress) {
    throw new Error("Missing NEXT_PUBLIC_MARKET_FACTORY_ADDRESS environment variable.");
  }

  const relayer = getRelayerSigner();
  return new Contract(factoryAddress, abi, relayer);
};

export const getMarketContract = (marketAddress: string, abi: readonly string[]) => {
  if (!marketAddress) {
    throw new Error("Missing marketAddress");
  }

  const relayer = getRelayerSigner();
  return new Contract(marketAddress, abi, relayer);
};
