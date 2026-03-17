// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract OpenMarketzAMM is ReentrancyGuard {
    uint256 public constant FEE_DENOMINATOR = 10_000;
    uint256 public constant CODE_MIN = 1_000_000_000;
    uint256 public constant CODE_RANGE = 9_000_000_000;
    uint256 public constant MIN_CREATION_SEED = 2 ether;
    uint256 public constant TRADE_FEE_BPS = 50;
    uint256 public constant TREASURY_TRADE_FEE_BPS = 3_000;
    uint256 public constant LP_TRADE_FEE_BPS = 7_000;
    uint256 public constant WINNER_FEE_BPS = 200;
    uint256 public constant SHARE_SCALE = 1e18;
    uint256 public constant RESOLUTION_GRACE_PERIOD = 24 hours;

    enum MarketStatus {
        OPEN,
        RESOLVED,
        CANCELED
    }

    struct Market {
        address creator;
        string question;
        string description;
        uint64 createdAt;
        uint64 closeTime;
        uint64 code;
        uint64 resolveDeadline;
        bool outcomeYes;
        MarketStatus status;
        uint256 yesSharesSupply;
        uint256 noSharesSupply;
        uint256 collateralPool;
        uint256 totalLpShares;
        uint256 lmsrB;
        uint256 treasuryTradeFeesAccrued;
        uint256 lpTradeFeesAccrued;
        uint256 treasuryWinnerFeesAccrued;
        uint256 winnerPayoutPerShare;
        uint256 winningSharesSupplySnapshot;
    }

    struct TraderPosition {
        uint256 yesShares;
        uint256 noShares;
        uint256 yesCostBasis;
        uint256 noCostBasis;
        uint256 netCashDeposited;
        bool refundClaimed;
    }

    uint256 public nextMarketId = 1;
    address public treasury;
    uint256 private entropyNonce;

    mapping(uint256 => Market) private markets;
    mapping(uint64 => uint256) public codeToMarketId;
    mapping(address => uint256[]) private createdMarketIds;
    mapping(address => uint256[]) private participatedMarketIds;
    mapping(address => mapping(uint256 => bool)) private hasParticipatedMarket;
    mapping(uint256 => mapping(address => TraderPosition)) public traderPositions;
    mapping(uint256 => mapping(address => uint256)) public lpShares;
    mapping(uint256 => uint256) public claimableTreasuryTradeFees;
    mapping(uint256 => uint256) public claimableTreasuryWinnerFees;
    mapping(uint256 => uint256) public claimableLpTradeFees;

    event MarketCreated(
        uint256 indexed marketId,
        uint64 indexed code,
        address indexed creator,
        string question,
        uint64 closeTime,
        uint256 seedCollateral
    );
    event LiquidityAdded(uint256 indexed marketId, address indexed provider, uint256 amount, uint256 mintedLpShares);
    event SharesBought(
        uint256 indexed marketId,
        address indexed trader,
        bool yesSide,
        uint256 shares,
        uint256 grossCost,
        uint256 fee
    );
    event SharesSold(
        uint256 indexed marketId,
        address indexed trader,
        bool yesSide,
        uint256 shares,
        uint256 grossProceeds,
        uint256 fee
    );
    event MarketResolved(uint256 indexed marketId, bool outcomeYes, address indexed resolver, uint256 payoutPerWinningShare);
    event WinnerRedeemed(uint256 indexed marketId, address indexed trader, uint256 grossPayout, uint256 winnerFee, uint256 netPayout);
    event MarketAutoCanceled(uint256 indexed marketId, address indexed caller);
    event RefundClaimed(uint256 indexed marketId, address indexed trader, uint256 amount);
    event TreasuryTradeFeesClaimed(uint256 indexed marketId, uint256 amount, address indexed treasury);
    event TreasuryWinnerFeesClaimed(uint256 indexed marketId, uint256 amount, address indexed treasury);
    event CreatorLpFeesClaimed(uint256 indexed marketId, uint256 amount, address indexed creator);

    error InvalidTreasury();
    error MarketNotFound();
    error CodeGenerationFailed();
    error InvalidCloseTime();
    error InvalidSeedAmount();
    error MarketNotOpen();
    error BetWindowClosed();
    error InvalidShareAmount();
    error IncorrectPayment();
    error InsufficientShares();
    error InsufficientPoolLiquidity();
    error NotCreator();
    error ResolveTooEarly();
    error MarketNotResolved();
    error AlreadyResolvedOrCanceled();
    error NotReadyForAutoCancel();
    error NotCanceled();
    error RefundAlreadyClaimed();
    error NothingToClaim();

    constructor(address initialTreasury) {
        if (initialTreasury == address(0)) revert InvalidTreasury();
        treasury = initialTreasury;
    }

    function createMarket(string calldata question, string calldata description, uint64 closeTime)
        external
        payable
        returns (uint256 marketId)
    {
        if (closeTime <= block.timestamp) revert InvalidCloseTime();
        if (msg.value < MIN_CREATION_SEED) revert InvalidSeedAmount();

        marketId = nextMarketId;
        nextMarketId += 1;

        uint64 code = _generateUniqueCode(msg.sender, marketId);
        codeToMarketId[code] = marketId;

        uint256 bootstrapShares = 2 * SHARE_SCALE;

        markets[marketId] = Market({
            creator: msg.sender,
            question: question,
            description: description,
            createdAt: uint64(block.timestamp),
            closeTime: closeTime,
            code: code,
            resolveDeadline: closeTime + uint64(RESOLUTION_GRACE_PERIOD),
            outcomeYes: false,
            status: MarketStatus.OPEN,
            yesSharesSupply: bootstrapShares,
            noSharesSupply: bootstrapShares,
            collateralPool: msg.value,
            totalLpShares: msg.value,
            lmsrB: msg.value,
            treasuryTradeFeesAccrued: 0,
            lpTradeFeesAccrued: 0,
            treasuryWinnerFeesAccrued: 0,
            winnerPayoutPerShare: 0,
            winningSharesSupplySnapshot: 0
        });

        TraderPosition storage creatorPosition = traderPositions[marketId][msg.sender];
        creatorPosition.yesShares = bootstrapShares;
        creatorPosition.noShares = bootstrapShares;
        creatorPosition.yesCostBasis = msg.value / 2;
        creatorPosition.noCostBasis = msg.value - creatorPosition.yesCostBasis;
        creatorPosition.netCashDeposited = msg.value;

        lpShares[marketId][msg.sender] = msg.value;
        _trackCreatedMarket(msg.sender, marketId);
        _trackParticipation(msg.sender, marketId);

        emit MarketCreated(marketId, code, msg.sender, question, closeTime, msg.value);
    }

    function addLiquidity(uint256 marketId) external payable returns (uint256 mintedShares) {
        Market storage market = _openMarket(marketId);
        if (msg.sender != market.creator) revert NotCreator();
        if (msg.value == 0) revert InvalidSeedAmount();

        uint256 poolBefore = market.collateralPool;
        if (poolBefore == 0) revert InsufficientPoolLiquidity();

        mintedShares = (msg.value * market.totalLpShares) / poolBefore;
        if (mintedShares == 0) mintedShares = msg.value;

        market.collateralPool += msg.value;
        market.totalLpShares += mintedShares;
        lpShares[marketId][msg.sender] += mintedShares;

        emit LiquidityAdded(marketId, msg.sender, msg.value, mintedShares);
    }

    function buyYes(uint256 marketId, uint256 shares) external payable returns (uint256 grossCost, uint256 fee) {
        return _buy(marketId, true, shares);
    }

    function buyNo(uint256 marketId, uint256 shares) external payable returns (uint256 grossCost, uint256 fee) {
        return _buy(marketId, false, shares);
    }

    function sellYes(uint256 marketId, uint256 shares) external nonReentrant returns (uint256 grossProceeds, uint256 fee) {
        return _sell(marketId, true, shares);
    }

    function sellNo(uint256 marketId, uint256 shares) external nonReentrant returns (uint256 grossProceeds, uint256 fee) {
        return _sell(marketId, false, shares);
    }

    function resolveMarket(uint256 marketId, bool outcomeYes) external {
        Market storage market = markets[marketId];
        _revertIfMarketMissing(market);

        if (msg.sender != market.creator) revert NotCreator();
        if (market.status != MarketStatus.OPEN) revert AlreadyResolvedOrCanceled();
        if (block.timestamp <= market.closeTime) revert ResolveTooEarly();

        market.status = MarketStatus.RESOLVED;
        market.outcomeYes = outcomeYes;

        uint256 winningSupply = outcomeYes ? market.yesSharesSupply : market.noSharesSupply;
        market.winningSharesSupplySnapshot = winningSupply;
        if (winningSupply > 0) {
            market.winnerPayoutPerShare = (market.collateralPool * SHARE_SCALE) / winningSupply;
        }

        emit MarketResolved(marketId, outcomeYes, msg.sender, market.winnerPayoutPerShare);
    }

    function redeemWinningShares(uint256 marketId) external nonReentrant returns (uint256 netPayout, uint256 winnerFee) {
        Market storage market = markets[marketId];
        _revertIfMarketMissing(market);
        if (market.status != MarketStatus.RESOLVED) revert MarketNotResolved();

        TraderPosition storage position = traderPositions[marketId][msg.sender];

        uint256 winningShares;
        uint256 costBasis;
        if (market.outcomeYes) {
            winningShares = position.yesShares;
            costBasis = position.yesCostBasis;
            position.yesShares = 0;
            position.yesCostBasis = 0;
        } else {
            winningShares = position.noShares;
            costBasis = position.noCostBasis;
            position.noShares = 0;
            position.noCostBasis = 0;
        }

        if (winningShares == 0) revert NothingToClaim();

        uint256 grossPayout = (winningShares * market.winnerPayoutPerShare) / SHARE_SCALE;

        uint256 profit = grossPayout > costBasis ? grossPayout - costBasis : 0;
        winnerFee = (profit * WINNER_FEE_BPS) / FEE_DENOMINATOR;
        netPayout = grossPayout - winnerFee;

        market.collateralPool -= grossPayout;

        if (winnerFee > 0) {
            market.treasuryWinnerFeesAccrued += winnerFee;
            claimableTreasuryWinnerFees[marketId] += winnerFee;
        }

        (bool ok, ) = payable(msg.sender).call{value: netPayout}("");
        require(ok, "PAYOUT_TRANSFER_FAILED");

        emit WinnerRedeemed(marketId, msg.sender, grossPayout, winnerFee, netPayout);
    }

    function triggerAutoCancel(uint256 marketId) external {
        Market storage market = markets[marketId];
        _revertIfMarketMissing(market);

        if (market.status != MarketStatus.OPEN) revert AlreadyResolvedOrCanceled();
        if (block.timestamp <= market.resolveDeadline) revert NotReadyForAutoCancel();

        market.status = MarketStatus.CANCELED;

        emit MarketAutoCanceled(marketId, msg.sender);
    }

    function claimCancelRefund(uint256 marketId) external nonReentrant returns (uint256 amount) {
        Market storage market = markets[marketId];
        _revertIfMarketMissing(market);
        if (market.status != MarketStatus.CANCELED) revert NotCanceled();

        TraderPosition storage position = traderPositions[marketId][msg.sender];
        if (position.refundClaimed) revert RefundAlreadyClaimed();

        amount = position.netCashDeposited;
        if (amount == 0) revert NothingToClaim();

        position.refundClaimed = true;
        position.netCashDeposited = 0;
        position.yesShares = 0;
        position.noShares = 0;
        position.yesCostBasis = 0;
        position.noCostBasis = 0;

        if (market.collateralPool >= amount) {
            market.collateralPool -= amount;
        } else {
            market.collateralPool = 0;
        }

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "REFUND_TRANSFER_FAILED");

        emit RefundClaimed(marketId, msg.sender, amount);
    }

    function claimTreasuryTradeFees(uint256 marketId) external nonReentrant returns (uint256 amount) {
        if (msg.sender != treasury) revert InvalidTreasury();

        amount = claimableTreasuryTradeFees[marketId];
        if (amount == 0) revert NothingToClaim();

        claimableTreasuryTradeFees[marketId] = 0;

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "TREASURY_TRADE_FEE_TRANSFER_FAILED");

        emit TreasuryTradeFeesClaimed(marketId, amount, msg.sender);
    }

    function claimTreasuryWinnerFees(uint256 marketId) external nonReentrant returns (uint256 amount) {
        if (msg.sender != treasury) revert InvalidTreasury();

        amount = claimableTreasuryWinnerFees[marketId];
        if (amount == 0) revert NothingToClaim();

        claimableTreasuryWinnerFees[marketId] = 0;

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "TREASURY_WINNER_FEE_TRANSFER_FAILED");

        emit TreasuryWinnerFeesClaimed(marketId, amount, msg.sender);
    }

    function claimCreatorLpFees(uint256 marketId) external nonReentrant returns (uint256 amount) {
        Market storage market = markets[marketId];
        _revertIfMarketMissing(market);
        if (msg.sender != market.creator) revert NotCreator();

        amount = claimableLpTradeFees[marketId];
        if (amount == 0) revert NothingToClaim();

        claimableLpTradeFees[marketId] = 0;

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "LP_FEE_TRANSFER_FAILED");

        emit CreatorLpFeesClaimed(marketId, amount, msg.sender);
    }

    function getMarket(uint256 marketId) external view returns (Market memory) {
        Market memory market = markets[marketId];
        _revertIfMarketMissing(market);
        return market;
    }

    function getMarketIdByOpenCode(string calldata openCode) external view returns (uint256 marketId) {
        uint64 code = _parseOpenCode(openCode);
        marketId = codeToMarketId[code];
    }

    function getCreatedMarkets(address user) external view returns (uint256[] memory) {
        return createdMarketIds[user];
    }

    function getParticipatedMarkets(address user) external view returns (uint256[] memory) {
        return participatedMarketIds[user];
    }

    function formatOpenCode(uint64 code) external pure returns (string memory) {
        return string(abi.encodePacked("OPEN", _toFixedTenDigitString(code)));
    }

    function getImpliedPriceBps(uint256 marketId, bool yesSide) external view returns (uint256 priceBps) {
        Market memory market = markets[marketId];
        _revertIfMarketMissing(market);

        uint256 total = market.yesSharesSupply + market.noSharesSupply;
        if (total == 0) return 5_000;

        if (yesSide) {
            priceBps = (market.yesSharesSupply * FEE_DENOMINATOR) / total;
        } else {
            priceBps = (market.noSharesSupply * FEE_DENOMINATOR) / total;
        }

        if (priceBps < 100) priceBps = 100;
        if (priceBps > 9_900) priceBps = 9_900;
    }

    function _buy(uint256 marketId, bool yesSide, uint256 shares) private returns (uint256 grossCost, uint256 fee) {
        if (shares == 0) revert InvalidShareAmount();

        Market storage market = _openMarket(marketId);
        if (block.timestamp > market.closeTime) revert BetWindowClosed();

        uint256 priceBps = _priceBps(market, yesSide);
        grossCost = (shares * priceBps) / FEE_DENOMINATOR;
        fee = (grossCost * TRADE_FEE_BPS) / FEE_DENOMINATOR;
        uint256 totalCost = grossCost + fee;

        if (msg.value != totalCost) revert IncorrectPayment();

        TraderPosition storage position = traderPositions[marketId][msg.sender];
        _trackParticipation(msg.sender, marketId);

        if (yesSide) {
            position.yesShares += shares;
            position.yesCostBasis += totalCost;
            market.yesSharesSupply += shares;
        } else {
            position.noShares += shares;
            position.noCostBasis += totalCost;
            market.noSharesSupply += shares;
        }

        position.netCashDeposited += totalCost;

        market.collateralPool += grossCost;
        _accrueTradeFees(marketId, market, fee);

        emit SharesBought(marketId, msg.sender, yesSide, shares, grossCost, fee);
    }

    function _sell(uint256 marketId, bool yesSide, uint256 shares) private returns (uint256 grossProceeds, uint256 fee) {
        if (shares == 0) revert InvalidShareAmount();

        Market storage market = _openMarket(marketId);
        if (block.timestamp > market.closeTime) revert BetWindowClosed();

        TraderPosition storage position = traderPositions[marketId][msg.sender];

        uint256 holderSharesBefore = yesSide ? position.yesShares : position.noShares;
        if (holderSharesBefore < shares) revert InsufficientShares();

        uint256 priceBps = _priceBps(market, yesSide);
        grossProceeds = (shares * priceBps) / FEE_DENOMINATOR;
        fee = (grossProceeds * TRADE_FEE_BPS) / FEE_DENOMINATOR;
        uint256 netProceeds = grossProceeds - fee;

        if (market.collateralPool < grossProceeds) revert InsufficientPoolLiquidity();

        if (yesSide) {
            position.yesShares = holderSharesBefore - shares;
            uint256 reducedCost = _proportionalCostReduction(position.yesCostBasis, shares, holderSharesBefore);
            position.yesCostBasis -= reducedCost;
            market.yesSharesSupply -= shares;
        } else {
            position.noShares = holderSharesBefore - shares;
            uint256 reducedCost = _proportionalCostReduction(position.noCostBasis, shares, holderSharesBefore);
            position.noCostBasis -= reducedCost;
            market.noSharesSupply -= shares;
        }

        if (position.netCashDeposited > netProceeds) {
            position.netCashDeposited -= netProceeds;
        } else {
            position.netCashDeposited = 0;
        }

        market.collateralPool -= grossProceeds;
        _accrueTradeFees(marketId, market, fee);

        (bool ok, ) = payable(msg.sender).call{value: netProceeds}("");
        require(ok, "SELL_TRANSFER_FAILED");

        emit SharesSold(marketId, msg.sender, yesSide, shares, grossProceeds, fee);
    }

    function _accrueTradeFees(uint256 marketId, Market storage market, uint256 fee) private {
        if (fee == 0) return;

        uint256 treasuryFee = (fee * TREASURY_TRADE_FEE_BPS) / FEE_DENOMINATOR;
        uint256 lpFee = fee - treasuryFee;

        market.treasuryTradeFeesAccrued += treasuryFee;
        market.lpTradeFeesAccrued += lpFee;
        claimableTreasuryTradeFees[marketId] += treasuryFee;
        claimableLpTradeFees[marketId] += lpFee;
    }

    function _trackCreatedMarket(address user, uint256 marketId) private {
        createdMarketIds[user].push(marketId);
    }

    function _trackParticipation(address user, uint256 marketId) private {
        if (hasParticipatedMarket[user][marketId]) return;
        hasParticipatedMarket[user][marketId] = true;
        participatedMarketIds[user].push(marketId);
    }

    function _proportionalCostReduction(uint256 costBasis, uint256 sharesSold, uint256 sharesBefore)
        private
        pure
        returns (uint256)
    {
        if (costBasis == 0) return 0;
        if (sharesSold == sharesBefore) return costBasis;

        return (costBasis * sharesSold) / sharesBefore;
    }

    function _priceBps(Market storage market, bool yesSide) private view returns (uint256) {
        uint256 total = market.yesSharesSupply + market.noSharesSupply;
        if (total == 0) return 5_000;

        uint256 raw;
        if (yesSide) {
            raw = (market.yesSharesSupply * FEE_DENOMINATOR) / total;
        } else {
            raw = (market.noSharesSupply * FEE_DENOMINATOR) / total;
        }

        if (raw < 100) return 100;
        if (raw > 9_900) return 9_900;
        return raw;
    }

    function _generateUniqueCode(address creator, uint256 marketId) private returns (uint64) {
        for (uint256 i = 0; i < 32; i++) {
            entropyNonce += 1;
            uint256 entropy = uint256(
                keccak256(
                    abi.encodePacked(block.timestamp, block.prevrandao, creator, marketId, entropyNonce, block.number)
                )
            );

            uint64 code = uint64((entropy % CODE_RANGE) + CODE_MIN);
            if (codeToMarketId[code] == 0) {
                return code;
            }
        }

        revert CodeGenerationFailed();
    }

    function _parseOpenCode(string calldata openCode) private pure returns (uint64) {
        bytes memory input = bytes(openCode);
        require(input.length == 14, "INVALID_OPEN_CODE_LENGTH");
        require(input[0] == "O" && input[1] == "P" && input[2] == "E" && input[3] == "N", "INVALID_OPEN_CODE_PREFIX");

        uint64 code;
        for (uint256 i = 4; i < 14; i++) {
            uint8 digit = uint8(input[i]);
            require(digit >= 48 && digit <= 57, "INVALID_OPEN_CODE_DIGIT");
            code = (code * 10) + (digit - 48);
        }

        return code;
    }

    function _toFixedTenDigitString(uint64 value) private pure returns (string memory) {
        bytes memory buffer = new bytes(10);
        for (uint256 i = 10; i > 0; i--) {
            buffer[i - 1] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    function _openMarket(uint256 marketId) private view returns (Market storage market) {
        market = markets[marketId];
        _revertIfMarketMissing(market);
        if (market.status != MarketStatus.OPEN) revert MarketNotOpen();
    }

    function _revertIfMarketMissing(Market memory market) private pure {
        if (market.creator == address(0)) revert MarketNotFound();
    }
}