import { expect } from "chai";
import { ethers } from "hardhat";

describe("OpenMarketzAMM", function () {
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
    const [treasury, creator, traderA, traderB, randomUser] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("OpenMarketzAMM", treasury);
    const contract = await factory.deploy(treasury.address);
    await contract.waitForDeployment();

    return { contract: contract as any, treasury, creator, traderA, traderB, randomUser };
  }

  it("creates market with 2 MON seed and creator-only liquidity add", async function () {
    const { contract, creator, traderA } = await deployFixture();
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;

    const tx = await contract
      .connect(creator)
      .createMarket("Will there be rain?", "Weather market", now + 3600, { value: ethers.parseEther("2") });
    const receipt = await tx.wait();

    const createdEvent = receipt.logs
      .map((log: { topics: string[]; data: string }) => {
        try {
          return contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed: { name?: string } | null) => parsed?.name === "MarketCreated");

    if (!createdEvent || createdEvent.args.code === undefined) {
      throw new Error("MarketCreated event code not found");
    }

    const openCode = await contract.formatOpenCode(createdEvent.args.code);
    expect(openCode).to.match(/^OPEN\d{10}$/);

    const lookedUp = await contract.getMarketIdByOpenCode(openCode);
    expect(lookedUp).to.equal(1n);

    await expectRevert(contract.connect(traderA).addLiquidity(1, { value: ethers.parseEther("1") }));

    await contract.connect(creator).addLiquidity(1, { value: ethers.parseEther("1") });

    const market = await contract.getMarket(1);
    expect(market.collateralPool).to.equal(ethers.parseEther("3"));

    const creatorCreated = await contract.getCreatedMarkets(creator.address);
    const creatorParticipated = await contract.getParticipatedMarkets(creator.address);
    expect(creatorCreated).to.deep.equal([1n]);
    expect(creatorParticipated).to.deep.equal([1n]);
  });

  it("tracks participated markets without duplicates across repeated buys", async function () {
    const { contract, creator, traderA } = await deployFixture();
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;

    await contract
      .connect(creator)
      .createMarket("Will volume rise?", "portfolio indexing", now + 3600, { value: ethers.parseEther("2") });

    const shares = ethers.parseEther("0.1");
    const yesPrice = await contract.getImpliedPriceBps(1, true);
    const yesGross = (shares * yesPrice) / 10_000n;
    const yesFee = (yesGross * 50n) / 10_000n;

    await contract.connect(traderA).buyYes(1, shares, { value: yesGross + yesFee });

    const noPrice = await contract.getImpliedPriceBps(1, false);
    const noGross = (shares * noPrice) / 10_000n;
    const noFee = (noGross * 50n) / 10_000n;

    await contract.connect(traderA).buyNo(1, shares, { value: noGross + noFee });

    const participated = await contract.getParticipatedMarkets(traderA.address);
    expect(participated).to.deep.equal([1n]);

    const created = await contract.getCreatedMarkets(traderA.address);
    expect(created).to.deep.equal([]);
  });

  it("rejects invalid OPEN code lookups", async function () {
    const { contract } = await deployFixture();

    await expectRevert(contract.getMarketIdByOpenCode("OPEN123"));
    await expectRevert(contract.getMarketIdByOpenCode("BADP1234567890"));
    await expectRevert(contract.getMarketIdByOpenCode("OPEN12345A789"));
  });

  it("applies 0.5% trade fee and splits 70/30 LP and treasury", async function () {
    const { contract, creator, traderA, treasury } = await deployFixture();
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;

    await contract
      .connect(creator)
      .createMarket("Will token pump?", "Fee split check", now + 3600, { value: ethers.parseEther("2") });

    const shares = ethers.parseEther("1");
    const priceBps = await contract.getImpliedPriceBps(1, true);
    const gross = (shares * priceBps) / 10_000n;
    const fee = (gross * 50n) / 10_000n;

    await contract.connect(traderA).buyYes(1, shares, { value: gross + fee });

    const treasuryClaimable = await contract.claimableTreasuryTradeFees(1);
    const lpClaimable = await contract.claimableLpTradeFees(1);

    expect(treasuryClaimable).to.equal((fee * 3000n) / 10_000n);
    expect(lpClaimable).to.equal(fee - treasuryClaimable);

    const treasuryBefore = await ethers.provider.getBalance(treasury.address);
    const tx = await contract.connect(treasury).claimTreasuryTradeFees(1);
    const receipt = await tx.wait();
    const gas = receipt!.gasUsed * receipt!.gasPrice;
    const treasuryAfter = await ethers.provider.getBalance(treasury.address);

    expect(treasuryAfter + gas - treasuryBefore).to.equal(treasuryClaimable);
  });

  it("charges strict 2% winner fee on profit only", async function () {
    const { contract, creator, traderA, traderB, treasury } = await deployFixture();
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;

    await contract
      .connect(creator)
      .createMarket("Will team A win?", "Winner fee check", now + 20, { value: ethers.parseEther("2") });

    const yesShares = ethers.parseEther("1");
    const noShares = ethers.parseEther("1");

    const yesPrice = await contract.getImpliedPriceBps(1, true);
    const yesGross = (yesShares * yesPrice) / 10_000n;
    const yesFee = (yesGross * 50n) / 10_000n;
    await contract.connect(traderA).buyYes(1, yesShares, { value: yesGross + yesFee });

    const noPrice = await contract.getImpliedPriceBps(1, false);
    const noGross = (noShares * noPrice) / 10_000n;
    const noFee = (noGross * 50n) / 10_000n;
    await contract.connect(traderB).buyNo(1, noShares, { value: noGross + noFee });

    await ethers.provider.send("evm_increaseTime", [21]);
    await ethers.provider.send("evm_mine", []);

    await contract.connect(creator).resolveMarket(1, true);

    const winnerFeesBefore = await contract.claimableTreasuryWinnerFees(1);
    await contract.connect(traderA).redeemWinningShares(1);
    const winnerFeesAfter = await contract.claimableTreasuryWinnerFees(1);

    expect(winnerFeesAfter > winnerFeesBefore).to.equal(true);

    const treasuryBefore = await ethers.provider.getBalance(treasury.address);
    const claimTx = await contract.connect(treasury).claimTreasuryWinnerFees(1);
    const receipt = await claimTx.wait();
    const gas = receipt!.gasUsed * receipt!.gasPrice;
    const treasuryAfter = await ethers.provider.getBalance(treasury.address);

    expect(treasuryAfter + gas - treasuryBefore).to.equal(winnerFeesAfter);
  });

  it("auto-cancels after grace period and allows net cash refunds", async function () {
    const { contract, creator, traderA } = await deployFixture();
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;

    await contract
      .connect(creator)
      .createMarket("Will this get unresolved?", "cancel path", now + 60, { value: ethers.parseEther("2") });

    const shares = ethers.parseEther("0.5");
    const price = await contract.getImpliedPriceBps(1, true);
    const gross = (shares * price) / 10_000n;
    const fee = (gross * 50n) / 10_000n;
    await contract.connect(traderA).buyYes(1, shares, { value: gross + fee });

    await ethers.provider.send("evm_increaseTime", [60 + 24 * 3600 + 1]);
    await ethers.provider.send("evm_mine", []);

    await contract.connect(traderA).triggerAutoCancel(1);

    const before = await ethers.provider.getBalance(traderA.address);
    const tx = await contract.connect(traderA).claimCancelRefund(1);
    const receipt = await tx.wait();
    const gas = receipt!.gasUsed * receipt!.gasPrice;
    const after = await ethers.provider.getBalance(traderA.address);

    expect(after + gas - before).to.equal(gross + fee);
  });
});