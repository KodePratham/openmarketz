const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("OpenMarketzVault", function () {
  const MIN_DEPOSIT = ethers.parseEther("0.001");

  async function deployFixture() {
    const [owner, userA, userB, market, feeRecipient] = await ethers.getSigners();
    const Vault = await ethers.getContractFactory("OpenMarketzVault");
    const vault = await Vault.deploy(MIN_DEPOSIT);
    await vault.waitForDeployment();

    return { vault, owner, userA, userB, market, feeRecipient };
  }

  it("Deposit happy path", async function () {
    const { vault, userA } = await deployFixture();
    const amount = ethers.parseEther("1");

    await expect(vault.connect(userA).deposit({ value: amount }))
      .to.emit(vault, "Deposited")
      .withArgs(userA.address, amount);

    expect(await vault.getBalance(userA.address)).to.equal(amount);
    expect(await vault.getVaultTotalHoldings()).to.equal(amount);
  });

  it("Deposit below minimum reverts", async function () {
    const { vault, userA } = await deployFixture();
    const tooSmall = ethers.parseEther("0.0005");

    await expect(vault.connect(userA).deposit({ value: tooSmall }))
      .to.be.revertedWithCustomError(vault, "BelowMinimumDeposit")
      .withArgs(tooSmall, MIN_DEPOSIT);
  });

  it("Withdraw happy path", async function () {
    const { vault, userA } = await deployFixture();
    const depositAmount = ethers.parseEther("1");
    const withdrawAmount = ethers.parseEther("0.4");

    await vault.connect(userA).deposit({ value: depositAmount });

    await expect(vault.connect(userA).withdraw(withdrawAmount))
      .to.emit(vault, "Withdrawn")
      .withArgs(userA.address, withdrawAmount);

    expect(await vault.getBalance(userA.address)).to.equal(depositAmount - withdrawAmount);
    expect(await vault.getVaultTotalHoldings()).to.equal(depositAmount - withdrawAmount);
  });

  it("Withdraw more than balance reverts", async function () {
    const { vault, userA } = await deployFixture();
    const depositAmount = ethers.parseEther("0.1");
    const requested = ethers.parseEther("1");

    await vault.connect(userA).deposit({ value: depositAmount });

    await expect(vault.connect(userA).withdraw(requested))
      .to.be.revertedWithCustomError(vault, "InsufficientBalance")
      .withArgs(depositAmount, requested);
  });

  it("Lock funds from authorized market", async function () {
    const { vault, owner, userA, market } = await deployFixture();
    const amount = ethers.parseEther("1");
    const lockAmount = ethers.parseEther("0.6");

    await vault.connect(userA).deposit({ value: amount });
    await vault.connect(owner).authorizeMarket(market.address);

    await expect(vault.connect(market).lockFunds(userA.address, lockAmount))
      .to.emit(vault, "FundsLocked")
      .withArgs(userA.address, lockAmount, market.address);

    expect(await vault.getBalance(userA.address)).to.equal(amount - lockAmount);
    expect(await vault.getLockedBalance(userA.address)).to.equal(lockAmount);
  });

  it("Lock funds from unauthorized address reverts", async function () {
    const { vault, userA, userB } = await deployFixture();
    const amount = ethers.parseEther("1");

    await vault.connect(userA).deposit({ value: amount });

    await expect(vault.connect(userB).lockFunds(userA.address, amount))
      .to.be.revertedWithCustomError(vault, "UnauthorizedMarket")
      .withArgs(userB.address);
  });

  it("Release funds between users", async function () {
    const { vault, owner, userA, userB, market } = await deployFixture();
    const depositAmount = ethers.parseEther("2");
    const lockAmount = ethers.parseEther("1");
    const releaseAmount = ethers.parseEther("0.8");

    await vault.connect(userA).deposit({ value: depositAmount });
    await vault.connect(owner).authorizeMarket(market.address);
    await vault.connect(market).lockFunds(userA.address, lockAmount);

    await expect(vault.connect(market).releaseFunds(userA.address, userB.address, releaseAmount))
      .to.emit(vault, "FundsReleased")
      .withArgs(userA.address, userB.address, releaseAmount, market.address);

    expect(await vault.getLockedBalance(userA.address)).to.equal(lockAmount - releaseAmount);
    expect(await vault.getBalance(userB.address)).to.equal(releaseAmount);
  });

  it("Fee collection and withdrawal", async function () {
    const { vault, owner, market, feeRecipient } = await deployFixture();
    const marketDeposit = ethers.parseEther("1");
    const feeAmount = ethers.parseEther("0.2");

    await vault.connect(owner).authorizeMarket(market.address);
    await vault.connect(market).deposit({ value: marketDeposit });

    await expect(vault.connect(market).collectFee(feeAmount))
      .to.emit(vault, "FeeCollected")
      .withArgs(feeAmount, market.address);

    expect(await vault.connect(owner).getProtocolFees()).to.equal(feeAmount);

    await expect(vault.connect(owner).withdrawFees(feeRecipient.address))
      .to.emit(vault, "FeesWithdrawn")
      .withArgs(feeRecipient.address, feeAmount);

    expect(await vault.connect(owner).getProtocolFees()).to.equal(0n);
  });

  it("Pause and unpause", async function () {
    const { vault, owner, userA } = await deployFixture();
    const amount = ethers.parseEther("1");

    await vault.connect(owner).pause();

    await expect(vault.connect(userA).deposit({ value: amount }))
      .to.be.revertedWithCustomError(vault, "EnforcedPause");

    await vault.connect(owner).unpause();

    await expect(vault.connect(userA).deposit({ value: amount }))
      .to.emit(vault, "Deposited")
      .withArgs(userA.address, amount);
  });

  it("Emergency withdraw only when paused", async function () {
    const { vault, owner, userA } = await deployFixture();
    const amount = ethers.parseEther("1");

    await vault.connect(userA).deposit({ value: amount });

    await expect(vault.connect(owner).emergencyWithdraw())
      .to.be.revertedWithCustomError(vault, "ExpectedPause");

    await vault.connect(owner).pause();

    await expect(vault.connect(owner).emergencyWithdraw())
      .to.emit(vault, "EmergencyWithdraw")
      .withArgs(amount);

    expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(0n);
    expect(await vault.getVaultTotalHoldings()).to.equal(0n);
    expect(await vault.isEmergencyMode()).to.equal(true);
  });
});
