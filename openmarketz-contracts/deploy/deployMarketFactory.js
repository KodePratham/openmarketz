const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const vaultAddress = process.env.VAULT_ADDRESS;
  const relayerAddress = process.env.RELAYER_ADDRESS || deployer.address;

  if (!vaultAddress) {
    throw new Error("Missing VAULT_ADDRESS in environment.");
  }

  const chainId = network.config.chainId ?? (await deployer.provider.getNetwork()).chainId;

  console.log("Deploying OpenMarketzMarketFactory...");
  console.log(`Network: ${network.name}`);
  console.log(`Chain ID: ${chainId.toString()}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Vault: ${vaultAddress}`);
  console.log(`Relayer: ${relayerAddress}`);

  const Factory = await ethers.getContractFactory("OpenMarketzMarketFactory");
  const factory = await Factory.deploy(vaultAddress, relayerAddress);
  await factory.waitForDeployment();

  const factoryAddress = await factory.getAddress();
  console.log(`OpenMarketzMarketFactory deployed at: ${factoryAddress}`);
  console.log("IMPORTANT: Call OpenMarketzVault.setMarketAuthorizer(factory, true) from vault owner.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
