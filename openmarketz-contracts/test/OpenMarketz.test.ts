import { expect } from "chai";
import { ethers } from "hardhat";

describe("OpenMarketz", function () {
  async function expectRevert(txPromise: Promise<unknown>) {
    let reverted = false;
    try {
      await txPromise;
    } catch {
      reverted = true;
    }
    expect(reverted).to.equal(true);
  }

  async function deployFixture() {
    const [deployer, creator, bettorA, bettorB] = await ethers.getSigners();

    const factory = await ethers.getContractFactory("OpenMarketz", deployer);
    const contract = (await factory.deploy(deployer.address, 200)) as any;
    await contract.waitForDeployment();

    return { contract, deployer, creator, bettorA, bettorB };
  }

  it("creates market and maps OPEN code", async function () {
    const { contract, creator } = await deployFixture();
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;

    const tx = await contract.connect(creator).createMarket("Will it rain?", "City weather", now + 3600);
    const receipt = await tx.wait();

    const event = receipt!.logs
      .map((l: any) => {
        try {
          return contract.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((e: any) => e?.name === "MarketCreated");

    expect(event).to.not.equal(undefined);

    const marketId = event!.args.marketId;
    const code = event!.args.code;

    expect(await contract.codeToMarketId(code)).to.equal(marketId);

    const openCode = await contract.formatOpenCode(code);
    expect(openCode.startsWith("OPEN")).to.equal(true);

    const lookedUp = await contract.getMarketIdByOpenCode(openCode);
    expect(lookedUp).to.equal(marketId);
  });

  it("rejects bets after close time", async function () {
    const { contract, creator, bettorA } = await deployFixture();
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;

    await contract.connect(creator).createMarket("Will ETH go up?", "Daily close", now + 60);
    await ethers.provider.send("evm_increaseTime", [61]);
    await ethers.provider.send("evm_mine", []);

    await expectRevert(contract.connect(bettorA).placeBet(1, true, { value: ethers.parseEther("0.1") }));
  });

  it("creator resolves after close and winner claims payout with fee", async function () {
    const { contract, deployer, creator, bettorA, bettorB } = await deployFixture();
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;

    await contract.connect(creator).createMarket("Will test pass?", "unit test", now + 10);

    await contract.connect(bettorA).placeBet(1, true, { value: ethers.parseEther("1") });
    await contract.connect(bettorB).placeBet(1, false, { value: ethers.parseEther("1") });

    await ethers.provider.send("evm_increaseTime", [11]);
    await ethers.provider.send("evm_mine", []);

    await expectRevert(contract.connect(bettorA).resolveMarket(1, true));
    await contract.connect(creator).resolveMarket(1, true);

    const treasuryBefore = await ethers.provider.getBalance(deployer.address);

    const claimTx = await contract.connect(bettorA).claimPayout(1);
    await claimTx.wait();

    await expectRevert(contract.connect(bettorA).claimPayout(1));

    const treasuryAfter = await ethers.provider.getBalance(deployer.address);
    expect(treasuryAfter > treasuryBefore).to.equal(true);
  });

  it("allows cancel only before first bet", async function () {
    const { contract, creator, bettorA } = await deployFixture();
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;

    await contract.connect(creator).createMarket("Will this cancel?", "cancel test", now + 3600);
    await contract.connect(creator).cancelMarket(1);

    await contract.connect(creator).createMarket("Second", "second", now + 3600);
    await contract.connect(bettorA).placeBet(2, true, { value: ethers.parseEther("0.2") });

    await expectRevert(contract.connect(creator).cancelMarket(2));
  });
});
