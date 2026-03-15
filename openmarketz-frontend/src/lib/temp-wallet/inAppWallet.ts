import { JsonRpcProvider, Wallet, isAddress } from "ethers";

const STORAGE_PREFIX = "openmarketz.inAppWallet.v1";

type InAppWalletRecord = {
  primaryAddress: string;
  privateKey: string;
  createdAt: number;
};

const ensureBrowser = () => {
  if (typeof window === "undefined") {
    throw new Error("In-app wallet is only available in the browser.");
  }
};

const normalizeAddress = (address: string) => {
  if (!isAddress(address)) {
    throw new Error("Invalid wallet address.");
  }
  return address.toLowerCase();
};

const storageKeyFor = (primaryAddress: string) => {
  return `${STORAGE_PREFIX}.${normalizeAddress(primaryAddress)}`;
};

const readRecord = (primaryAddress: string): InAppWalletRecord | null => {
  ensureBrowser();
  const raw = window.localStorage.getItem(storageKeyFor(primaryAddress));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as InAppWalletRecord;
    if (!parsed?.privateKey || !isAddress(parsed.primaryAddress)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const saveRecord = (record: InAppWalletRecord) => {
  ensureBrowser();
  window.localStorage.setItem(storageKeyFor(record.primaryAddress), JSON.stringify(record));
};

export const getOrCreateInAppWallet = (primaryAddress: string) => {
  const existing = readRecord(primaryAddress);
  if (existing) {
    return { address: new Wallet(existing.privateKey).address, created: false };
  }

  const generated = Wallet.createRandom();
  const record: InAppWalletRecord = {
    primaryAddress: normalizeAddress(primaryAddress),
    privateKey: generated.privateKey,
    createdAt: Date.now(),
  };

  saveRecord(record);
  return { address: generated.address, created: true };
};

export const getInAppWalletAddress = (primaryAddress: string) => {
  const record = readRecord(primaryAddress);
  if (!record) {
    return null;
  }

  return new Wallet(record.privateKey).address;
};

export const sendInAppTransfer = async ({
  primaryAddress,
  to,
  valueWei,
  chainId,
  rpcUrl,
}: {
  primaryAddress: string;
  to: string;
  valueWei: bigint;
  chainId: number;
  rpcUrl: string;
}) => {
  if (!isAddress(to)) {
    throw new Error("Invalid recipient address.");
  }
  if (valueWei <= BigInt(0)) {
    throw new Error("Amount must be greater than zero.");
  }

  const record = readRecord(primaryAddress);
  if (!record) {
    throw new Error("In-app wallet not initialized for this wallet.");
  }

  const provider = new JsonRpcProvider(rpcUrl, chainId);
  const wallet = new Wallet(record.privateKey);
  const from = wallet.address;

  const [nonce, feeData, gasLimit] = await Promise.all([
    provider.getTransactionCount(from, "pending"),
    provider.getFeeData(),
    provider.estimateGas({ from, to, value: valueWei }),
  ]);

  const gasPrice = feeData.gasPrice;
  if (!gasPrice) {
    throw new Error("Could not fetch gas price.");
  }

  const signedTx = await wallet.signTransaction({
    chainId,
    nonce,
    to,
    value: valueWei,
    gasLimit,
    gasPrice,
    type: 0,
  });

  const response = await provider.broadcastTransaction(signedTx);
  await response.wait();
  return response.hash;
};

export const getInAppNativeBalance = async ({
  inAppAddress,
  chainId,
  rpcUrl,
}: {
  inAppAddress: string;
  chainId: number;
  rpcUrl: string;
}) => {
  if (!isAddress(inAppAddress)) {
    throw new Error("Invalid in-app wallet address.");
  }

  const provider = new JsonRpcProvider(rpcUrl, chainId);
  return provider.getBalance(inAppAddress);
};
