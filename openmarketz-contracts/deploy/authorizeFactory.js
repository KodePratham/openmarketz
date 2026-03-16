const { ethers, network } = require("hardhat");

const vaultAbi = [
  "function owner() view returns (address)",
  "function setMarketAuthorizer(address authorizer, bool allowed)",
  "function isMarketAuthorizer(address authorizer) view returns (bool)",
];

async function main() {
  const [caller] = await ethers.getSigners();
  const vaultAddress = process.env.VAULT_ADDRESS;
  const factoryAddress = process.env.FACTORY_ADDRESS || process.env.NEXT_PUBLIC_MARKET_FACTORY_ADDRESS;

  if (!vaultAddress) {
    throw new Error("Missing VAULT_ADDRESS in environment.");
  }

  if (!factoryAddress) {
    throw new Error("Missing FACTORY_ADDRESS (or NEXT_PUBLIC_MARKET_FACTORY_ADDRESS) in environment.");
  }

  const chainId = network.config.chainId ?? (await caller.provider.getNetwork()).chainId;
  const vault = new ethers.Contract(vaultAddress, vaultAbi, caller);

  const owner = await vault.owner();
  const isAlreadyAuthorized = await vault.isMarketAuthorizer(factoryAddress);

  console.log("Authorizing market factory in vault...");
  console.log(`Network: ${network.name}`);
  console.log(`Chain ID: ${chainId.toString()}`);
  console.log(`Caller: ${caller.address}`);
  console.log(`Vault: ${vaultAddress}`);
  console.log(`Factory: ${factoryAddress}`);
  console.log(`Vault owner: ${owner}`);

  if (isAlreadyAuthorized) {
    console.log("Factory is already authorized. No transaction needed.");
    return;
  }

  if (owner.toLowerCase() !== caller.address.toLowerCase()) {
    throw new Error("Connected signer is not vault owner. Switch PRIVATE_KEY to the vault owner key and retry.");
  }

  const tx = await vault.setMarketAuthorizer(factoryAddress, true);
  console.log(`Submitted tx: ${tx.hash}`);
  const receipt = await tx.wait();

  const isAuthorized = await vault.isMarketAuthorizer(factoryAddress);
  console.log(`Confirmed in block ${receipt.blockNumber}.`);
  console.log(`isMarketAuthorizer(factory): ${isAuthorized}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
