import { ethers } from "hardhat";

function resolveTreasuryAddress(deployerAddress: string): string {
  const raw = process.env.TREASURY_ADDRESS?.trim();

  if (!raw || raw === "optional_treasury_address") {
    return deployerAddress;
  }

  try {
    return ethers.getAddress(raw);
  } catch {
    throw new Error(
      "Invalid TREASURY_ADDRESS in .env. Use a 0x-prefixed address or remove TREASURY_ADDRESS to default to deployer.",
    );
  }
}

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  const treasury = resolveTreasuryAddress(deployer.address);

  const factory = await ethers.getContractFactory("OpenMarketzAMM");
  const contract = await factory.deploy(treasury);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const deploymentTx = contract.deploymentTransaction();
  const deploymentReceipt = deploymentTx ? await deploymentTx.wait() : null;

  console.log("OpenMarketzAMM deployed");
  console.log("deployer:", deployer.address);
  console.log("treasury:", treasury);
  console.log("contract:", address);
  if (deploymentTx) {
    console.log("txHash:", deploymentTx.hash);
  }
  if (deploymentReceipt) {
    console.log("block:", deploymentReceipt.blockNumber);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
