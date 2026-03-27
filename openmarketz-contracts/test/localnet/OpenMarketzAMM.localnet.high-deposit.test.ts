import { expect } from "chai";
import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import type { MockUSDC, OpenMarketzAMM } from "../../typechain-types";

type Side = "YES" | "NO";

type TxRow = {
  step: number;
  account: string;
  action: string;
  amountUsdc: string;
  txHash: string;
  gasUsed: string;
};

type InvestorDecision = {
  name: string;
  signer: SignerWithAddress;
  side: Side;
  intendedDeposit: bigint;
  shares: bigint;
  grossCost: bigint;
  fee: bigint;
  totalCost: bigint;
  redeemedNet: bigint;
};

const BPS = 10_000n;
const TRADE_FEE_BPS = 50n;
const u = (value: string) => ethers.parseUnits(value, 6);
const formatUsdc = (value: bigint) => Number(ethers.formatUnits(value, 6)).toFixed(6);
const toSharesString = (value: bigint) => Number(ethers.formatUnits(value, 6)).toFixed(4);

function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function quoteFromShares(shares: bigint, priceBps: bigint) {
  const grossCost = (shares * priceBps) / BPS;
  const fee = (grossCost * TRADE_FEE_BPS) / BPS;
  const totalCost = grossCost + fee;
  return { grossCost, fee, totalCost };
}

function sharesFromTargetTotal(targetTotal: bigint, priceBps: bigint) {
  if (targetTotal == 0n || priceBps == 0n) return 0n;
  const grossTarget = (targetTotal * BPS) / (BPS + TRADE_FEE_BPS);
  const shares = (grossTarget * BPS) / priceBps;
  return shares == 0n ? 1n : shares;
}

async function trackTx(
  rows: TxRow[],
  account: string,
  action: string,
  amount: bigint,
  txPromise: Promise<{ hash: string; wait: () => Promise<{ gasUsed: bigint } | null> }>
) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error("Transaction receipt was null");
  }

  rows.push({
    step: rows.length + 1,
    account,
    action,
    amountUsdc: formatUsdc(amount),
    txHash: tx.hash,
    gasUsed: receipt.gasUsed.toString(),
  });
}

describe("OpenMarketzAMM localnet 10-account high-deposit simulation", function () {
  it("runs $10-$100 random deposits and writes treasury/LP earnings report", async function () {
    const signers = await ethers.getSigners();
    expect(signers.length).to.be.greaterThan(10);

    const accounts: SignerWithAddress[] = signers.slice(0, 10);
    const treasury = signers[10];
    const accountNames = accounts.map((_, i) => `account ${i + 1}`);

    const tokenFactory = await ethers.getContractFactory("MockUSDC", treasury);
    const token = (await tokenFactory.deploy()) as unknown as MockUSDC;
    await token.waitForDeployment();

    const ammFactory = await ethers.getContractFactory("OpenMarketzAMM", treasury);
    const amm = (await ammFactory.deploy(treasury.address, await token.getAddress())) as unknown as OpenMarketzAMM;
    await amm.waitForDeployment();

    const ammAddress = await amm.getAddress();
    const txRows: TxRow[] = [];
    const balancesBefore = new Map<string, bigint>();

    const mintPerAccount = u("2000");
    for (let i = 0; i < accounts.length; i++) {
      const signer = accounts[i];
      const name = accountNames[i];

      await trackTx(txRows, "treasury", `mint to ${name}`, mintPerAccount, token.mint(signer.address, mintPerAccount));
      await trackTx(txRows, name, "approve AMM", mintPerAccount, token.connect(signer).approve(ammAddress, mintPerAccount));

      const balance = await token.balanceOf(signer.address);
      balancesBefore.set(name, balance);
    }

    const latestBlock = await ethers.provider.getBlock("latest");
    if (!latestBlock) {
      throw new Error("Latest block not found");
    }

    const closeTime = latestBlock.timestamp + 3600;
    const seedCollateral = u("20");

    await trackTx(
      txRows,
      "account 1",
      "create market",
      seedCollateral,
      amm.connect(accounts[0]).createMarket(
        "Will OPEN token close green today?",
        "10-account high-deposit localnet simulation",
        closeTime,
        seedCollateral
      )
    );

    const rng = makeRng(closeTime + 77);
    const investors: InvestorDecision[] = [];
    const minDeposit = u("10");
    const maxDeposit = u("100");

    for (let i = 1; i < accounts.length; i++) {
      const signer = accounts[i];
      const name = accountNames[i];
      const side: Side = rng() < 0.5 ? "YES" : "NO";

      const targetWholeDollars = 10 + Math.floor(rng() * 91);
      const intendedDeposit = u(String(targetWholeDollars));

      const priceBps = BigInt(await amm.getImpliedPriceBps(1, side === "YES"));
      let shares = sharesFromTargetTotal(intendedDeposit, priceBps);
      let { grossCost, fee, totalCost } = quoteFromShares(shares, priceBps);

      // Keep actual spend in the requested $10-$100 band after rounding.
      if (totalCost < minDeposit) {
        shares = sharesFromTargetTotal(minDeposit, priceBps);
        ({ grossCost, fee, totalCost } = quoteFromShares(shares, priceBps));
      }
      if (totalCost > maxDeposit) {
        shares = sharesFromTargetTotal(maxDeposit, priceBps);
        ({ grossCost, fee, totalCost } = quoteFromShares(shares, priceBps));
      }

      expect(totalCost).to.be.gte(minDeposit);
      expect(totalCost).to.be.lte(maxDeposit);

      if (side === "YES") {
        await trackTx(txRows, name, "buy YES", totalCost, amm.connect(signer).buyYes(1, shares, totalCost));
      } else {
        await trackTx(txRows, name, "buy NO", totalCost, amm.connect(signer).buyNo(1, shares, totalCost));
      }

      investors.push({
        name,
        signer,
        side,
        intendedDeposit,
        shares,
        grossCost,
        fee,
        totalCost,
        redeemedNet: 0n,
      });
    }

    await ethers.provider.send("evm_increaseTime", [3601]);
    await ethers.provider.send("evm_mine", []);

    const outcomeYes = rng() < 0.5;
    await trackTx(
      txRows,
      "account 1",
      `resolve market => ${outcomeYes ? "YES" : "NO"}`,
      0n,
      amm.connect(accounts[0]).resolveMarket(1, outcomeYes)
    );

    for (let i = 0; i < accounts.length; i++) {
      const signer = accounts[i];
      const name = accountNames[i];
      const before = await token.balanceOf(signer.address);

      try {
        await trackTx(txRows, name, "redeem winning shares", 0n, amm.connect(signer).redeemWinningShares(1));
        const after = await token.balanceOf(signer.address);
        const redeemed = after - before;

        const investor = investors.find((item) => item.name === name);
        if (investor) {
          investor.redeemedNet = redeemed;
        }
      } catch {
        const investor = investors.find((item) => item.name === name);
        if (investor) {
          investor.redeemedNet = 0n;
        }
      }
    }

    const treasuryTradeFeesAccrued = await amm.claimableTreasuryTradeFees(1);
    const treasuryWinnerFeesAccrued = await amm.claimableTreasuryWinnerFees(1);
    const lpFeesAccrued = await amm.claimableLpTradeFees(1);

    const treasuryBalanceBeforeClaims = await token.balanceOf(treasury.address);
    const creatorBalanceBeforeLpClaim = await token.balanceOf(accounts[0].address);

    if (treasuryTradeFeesAccrued > 0n) {
      await trackTx(
        txRows,
        "treasury",
        "claim treasury trade fees",
        treasuryTradeFeesAccrued,
        amm.connect(treasury).claimTreasuryTradeFees(1)
      );
    }

    if (treasuryWinnerFeesAccrued > 0n) {
      await trackTx(
        txRows,
        "treasury",
        "claim treasury winner fees",
        treasuryWinnerFeesAccrued,
        amm.connect(treasury).claimTreasuryWinnerFees(1)
      );
    }

    if (lpFeesAccrued > 0n) {
      await trackTx(
        txRows,
        "account 1",
        "claim creator LP fees",
        lpFeesAccrued,
        amm.connect(accounts[0]).claimCreatorLpFees(1)
      );
    }

    const treasuryBalanceAfterClaims = await token.balanceOf(treasury.address);
    const creatorBalanceAfterLpClaim = await token.balanceOf(accounts[0].address);

    const treasuryClaimed = treasuryBalanceAfterClaims - treasuryBalanceBeforeClaims;
    const lpClaimed = creatorBalanceAfterLpClaim - creatorBalanceBeforeLpClaim;

    const balancesAfter = new Map<string, bigint>();
    for (let i = 0; i < accounts.length; i++) {
      const name = accountNames[i];
      const balance = await token.balanceOf(accounts[i].address);
      balancesAfter.set(name, balance);
    }

    const reportLines: string[] = [];
    reportLines.push("# OpenMarketz AMM Localnet High-Deposit Report");
    reportLines.push("");
    reportLines.push(`Generated: ${new Date().toISOString()}`);
    reportLines.push("Network: localhost (Hardhat node)");
    reportLines.push("Market ID: 1");
    reportLines.push("Investor deposit band: 10.000000 to 100.000000 USDC");
    reportLines.push(`Resolved Outcome: ${outcomeYes ? "YES" : "NO"}`);
    reportLines.push("");

    reportLines.push("## Transactions");
    reportLines.push("");
    reportLines.push("| Step | Account | Action | Amount (USDC) | Gas Used | Tx Hash |");
    reportLines.push("| --- | --- | --- | ---: | ---: | --- |");
    for (const row of txRows) {
      reportLines.push(
        `| ${row.step} | ${row.account} | ${row.action} | ${row.amountUsdc} | ${row.gasUsed} | ${row.txHash} |`
      );
    }
    reportLines.push("");

    reportLines.push("## Investor Summary (account 2 to account 10)");
    reportLines.push("");
    reportLines.push("| Account | Invested Side | Intended Deposit (USDC) | Actual Invested (USDC) | Shares | Gross Cost (USDC) | Fee (USDC) | Redeemed (USDC) | Won/Lost | Net PnL (USDC) |");
    reportLines.push("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |");

    for (const investor of investors) {
      const won = investor.side === (outcomeYes ? "YES" : "NO") && investor.redeemedNet > 0n;
      const pnl = investor.redeemedNet - investor.totalCost;

      reportLines.push(
        `| ${investor.name} | ${investor.side} | ${formatUsdc(investor.intendedDeposit)} | ${formatUsdc(investor.totalCost)} | ${toSharesString(investor.shares)} | ${formatUsdc(investor.grossCost)} | ${formatUsdc(investor.fee)} | ${formatUsdc(investor.redeemedNet)} | ${won ? "WON" : "LOST"} | ${formatUsdc(pnl)} |`
      );
    }
    reportLines.push("");

    reportLines.push("## Protocol Earnings Summary");
    reportLines.push("");
    reportLines.push("| Beneficiary | Source | Amount (USDC) |");
    reportLines.push("| --- | --- | ---: |");
    reportLines.push(`| Treasury | Trade fees accrued | ${formatUsdc(treasuryTradeFeesAccrued)} |`);
    reportLines.push(`| Treasury | Winner fees accrued | ${formatUsdc(treasuryWinnerFeesAccrued)} |`);
    reportLines.push(`| Treasury | Total claimed in this run | ${formatUsdc(treasuryClaimed)} |`);
    reportLines.push(`| Liquidity Provider (account 1) | LP trade fees accrued | ${formatUsdc(lpFeesAccrued)} |`);
    reportLines.push(`| Liquidity Provider (account 1) | LP fees claimed in this run | ${formatUsdc(lpClaimed)} |`);
    reportLines.push("");

    reportLines.push("## Account Balances and PnL (account 1 to account 10)");
    reportLines.push("");
    reportLines.push("| Account | Start Balance (USDC) | End Balance (USDC) | Net PnL (USDC) |");
    reportLines.push("| --- | ---: | ---: | ---: |");

    for (const name of accountNames) {
      const start = balancesBefore.get(name) ?? 0n;
      const end = balancesAfter.get(name) ?? 0n;
      const pnl = end - start;
      reportLines.push(`| ${name} | ${formatUsdc(start)} | ${formatUsdc(end)} | ${formatUsdc(pnl)} |`);
    }

    const reportDir = path.resolve(process.cwd(), "test-runs");
    const reportPath = path.join(reportDir, "openmarketz-amm-localnet-high-deposit-report.md");
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(reportPath, reportLines.join("\n"), "utf8");

    expect(fs.existsSync(reportPath)).to.equal(true);
  });
});
