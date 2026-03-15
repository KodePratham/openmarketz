const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const minDepositArg = process.env.MIN_DEPOSIT_WEI;
  const minDeposit = minDepositArg ? BigInt(minDepositArg) : ethers.parseEther("0.001");

  const chainId = network.config.chainId ?? (await deployer.provider.getNetwork()).chainId;

  console.log("Deploying OpenMarketzVault...");
  console.log(`Network: ${network.name}`);
  console.log(`Chain ID: ${chainId.toString()}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Min deposit (wei): ${minDeposit.toString()}`);

  const Vault = await ethers.getContractFactory("OpenMarketzVault");
  const vault = await Vault.deploy(minDeposit);
  await vault.waitForDeployment();

  console.log(`OpenMarketzVault deployed at: ${await vault.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
