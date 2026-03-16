const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("OpenMarketzMarketFactory", function () {
  const MIN_DEPOSIT = ethers.parseEther("0.001");

  async function deployFixture() {
    const [owner, relayer, creator, trader] = await ethers.getSigners();

    const Vault = await ethers.getContractFactory("OpenMarketzVault");
    const vault = await Vault.deploy(MIN_DEPOSIT);
    await vault.waitForDeployment();

    const Factory = await ethers.getContractFactory("OpenMarketzMarketFactory");
    const factory = await Factory.deploy(await vault.getAddress(), relayer.address);
    await factory.waitForDeployment();

    await vault.connect(owner).setMarketAuthorizer(await factory.getAddress(), true);

    await vault.connect(creator).deposit({ value: ethers.parseEther("6") });
    await vault.connect(trader).deposit({ value: ethers.parseEther("2") });

    return { vault, factory, owner, relayer, creator, trader };
  }

  async function signCreateRequest(factory, creator, request) {
    const network = await ethers.provider.getNetwork();
    const domain = {
      name: "OpenMarketzMarketFactory",
      version: "1",
      chainId: Number(network.chainId),
      verifyingContract: await factory.getAddress(),
    };

    const types = {
      CreateMarket: [
        { name: "creator", type: "address" },
        { name: "yesSeed", type: "uint256" },
        { name: "noSeed", type: "uint256" },
        { name: "questionHash", type: "bytes32" },
        { name: "oracleDescriptionHash", type: "bytes32" },
        { name: "linksHash", type: "bytes32" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const value = {
      creator: request.creator,
      yesSeed: request.yesSeed,
      noSeed: request.noSeed,
      questionHash: ethers.keccak256(ethers.toUtf8Bytes(request.question)),
      oracleDescriptionHash: ethers.keccak256(ethers.toUtf8Bytes(request.oracleDescription)),
      linksHash: request.linksHash,
      nonce: request.nonce,
      deadline: request.deadline,
    };

    return creator.signTypedData(domain, types, value);
  }

  async function signTradeRequest(market, trader, request) {
    const network = await ethers.provider.getNetwork();
    const domain = {
      name: "OpenMarketzBinaryMarket",
      version: "1",
      chainId: Number(network.chainId),
      verifyingContract: await market.getAddress(),
    };

    const types = {
      Trade: [
        { name: "trader", type: "address" },
        { name: "isYes", type: "bool" },
        { name: "amount", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    return trader.signTypedData(domain, types, request);
  }

  async function signResolveRequest(market, creator, request) {
    const network = await ethers.provider.getNetwork();
    const domain = {
      name: "OpenMarketzBinaryMarket",
      version: "1",
      chainId: Number(network.chainId),
      verifyingContract: await market.getAddress(),
    };

    const types = {
      Resolve: [
        { name: "yesWins", type: "bool" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    return creator.signTypedData(domain, types, request);
  }

  async function signClaimRequest(market, signer, request) {
    const network = await ethers.provider.getNetwork();
    const domain = {
      name: "OpenMarketzBinaryMarket",
      version: "1",
      chainId: Number(network.chainId),
      verifyingContract: await market.getAddress(),
    };

    const types = {
      Claim: [
        { name: "claimant", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    return signer.signTypedData(domain, types, request);
  }

  it("creates a market with OPEN code and stores creator market index", async function () {
    const { factory, relayer, creator } = await deployFixture();
    const links = ["https://example.com/rules", "https://example.com/data"];
    const linksHash = await factory.hashLinks(links);
    const deadline = Math.floor(Date.now() / 1000) + 600;

    const req = {
      creator: creator.address,
      yesSeed: ethers.parseEther("2"),
      noSeed: ethers.parseEther("2"),
      question: "Will OpenMarketz launch before quarter end?",
      oracleDescription: "Resolve YES if official launch announcement is posted before quarter close.",
      linksHash,
      nonce: 0,
      deadline,
    };

    const signature = await signCreateRequest(factory, creator, req);

    const tx = await factory.connect(relayer).createBinaryMarket(req, links, signature);
    const receipt = await tx.wait();

    const event = receipt.logs
      .map((log) => {
        try {
          return factory.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed?.name === "MarketCreated");

    expect(event).to.not.equal(undefined);
    expect(event.args.code.startsWith("OPEN")).to.equal(true);
    expect(event.args.code.length).to.equal(14);

    const byCode = await factory.getMarketByCode(event.args.code);
    expect(byCode).to.equal(event.args.market);

    const creatorMarkets = await factory.getCreatorMarkets(creator.address);
    expect(creatorMarkets).to.have.length(1);
    expect(creatorMarkets[0]).to.equal(event.args.market);
  });

  it("reverts when initial liquidity is less than 2/2 and total 4 MON", async function () {
    const { factory, relayer, creator } = await deployFixture();
    const links = ["https://example.com/rules"];
    const linksHash = await factory.hashLinks(links);

    const req = {
      creator: creator.address,
      yesSeed: ethers.parseEther("1.99"),
      noSeed: ethers.parseEther("2"),
      question: "Will liquidity validation fail?",
      oracleDescription: "This market should fail minimum liquidity checks.",
      linksHash,
      nonce: 0,
      deadline: Math.floor(Date.now() / 1000) + 600,
    };

    const signature = await signCreateRequest(factory, creator, req);

    await expect(factory.connect(relayer).createBinaryMarket(req, links, signature)).to.be.revertedWithCustomError(
      factory,
      "InvalidSeedLiquidity",
    );
  });

  it("supports relayed trade resolve and claim", async function () {
    const { factory, relayer, creator, trader, vault } = await deployFixture();
    const links = ["https://example.com/source"];
    const linksHash = await factory.hashLinks(links);

    const createReq = {
      creator: creator.address,
      yesSeed: ethers.parseEther("2"),
      noSeed: ethers.parseEther("2"),
      question: "Will product launch before target date?",
      oracleDescription: "Resolve YES if launch post appears on official channels by target date.",
      linksHash,
      nonce: 0,
      deadline: Math.floor(Date.now() / 1000) + 600,
    };

    const createSig = await signCreateRequest(factory, creator, createReq);
    const createTx = await factory.connect(relayer).createBinaryMarket(createReq, links, createSig);
    const createReceipt = await createTx.wait();

    const createdEvent = createReceipt.logs
      .map((log) => {
        try {
          return factory.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed?.name === "MarketCreated");

    const marketAddress = createdEvent.args.market;
    const Market = await ethers.getContractFactory("OpenMarketzBinaryMarket");
    const market = Market.attach(marketAddress);

    const tradeReq = {
      trader: trader.address,
      isYes: true,
      amount: ethers.parseEther("1"),
      nonce: 0,
      deadline: Math.floor(Date.now() / 1000) + 600,
    };

    const tradeSig = await signTradeRequest(market, trader, tradeReq);
    await market.connect(relayer).trade(tradeReq, tradeSig);

    const resolveReq = {
      yesWins: true,
      nonce: 0,
      deadline: Math.floor(Date.now() / 1000) + 600,
    };

    const resolveSig = await signResolveRequest(market, creator, resolveReq);
    await market.connect(relayer).resolve(resolveReq, resolveSig);

    const beforeClaim = await vault.getBalance(trader.address);
    const claimReq = {
      claimant: trader.address,
      nonce: 1,
      deadline: Math.floor(Date.now() / 1000) + 600,
    };

    const claimSig = await signClaimRequest(market, trader, claimReq);
    await market.connect(relayer).claim(claimReq, claimSig);

    const afterClaim = await vault.getBalance(trader.address);
    expect(afterClaim).to.be.gt(beforeClaim);
  });
});
