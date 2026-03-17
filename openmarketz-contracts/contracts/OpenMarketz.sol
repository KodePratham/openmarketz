// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract OpenMarketz is ReentrancyGuard {
    uint256 public constant FEE_DENOMINATOR = 10_000;
    uint256 public constant CODE_MIN = 1_000_000_000;
    uint256 public constant CODE_RANGE = 9_000_000_000;

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
        uint256 totalYesPool;
        uint256 totalNoPool;
        bool outcomeYes;
        MarketStatus status;
    }

    struct Stake {
        uint256 yes;
        uint256 no;
        bool claimed;
    }

    uint256 public nextMarketId = 1;
    uint256 public feeBps;
    address public treasury;

    mapping(uint256 => Market) private markets;
    mapping(uint64 => uint256) public codeToMarketId;
    mapping(uint256 => mapping(address => Stake)) public stakes;
    mapping(address => uint256[]) public createdMarketIds;
    mapping(address => uint256[]) public participatedMarketIds;
    mapping(uint256 => mapping(address => bool)) public hasParticipated;

    uint256 private entropyNonce;

    event MarketCreated(uint256 indexed marketId, uint64 indexed code, address indexed creator, string question, uint64 closeTime);
    event BetPlaced(uint256 indexed marketId, address indexed bettor, bool yesSide, uint256 amount);
    event MarketResolved(uint256 indexed marketId, bool outcomeYes, address indexed resolver);
    event PayoutClaimed(uint256 indexed marketId, address indexed claimant, uint256 payoutAmount, uint256 feeAmount);
    event MarketCanceled(uint256 indexed marketId, address indexed creator);

    error InvalidCloseTime();
    error MarketNotFound();
    error MarketNotOpen();
    error MarketNotResolved();
    error MarketAlreadyResolved();
    error MarketAlreadyCanceled();
    error NotCreator();
    error BetWindowClosed();
    error InvalidBetAmount();
    error NoWinningStake();
    error AlreadyClaimed();
    error CannotCancelAfterBet();
    error ResolveTooEarly();
    error InvalidFeeBps();
    error InvalidTreasury();
    error CodeGenerationFailed();

    constructor(address initialTreasury, uint256 initialFeeBps) {
        if (initialTreasury == address(0)) revert InvalidTreasury();
        if (initialFeeBps >= FEE_DENOMINATOR) revert InvalidFeeBps();

        treasury = initialTreasury;
        feeBps = initialFeeBps;
    }

    function createMarket(string calldata question, string calldata description, uint64 closeTime)
        external
        returns (uint256 marketId, uint64 code)
    {
        if (closeTime <= block.timestamp) revert InvalidCloseTime();

        marketId = nextMarketId;
        nextMarketId += 1;

        code = _generateUniqueCode(msg.sender, marketId);
        codeToMarketId[code] = marketId;

        markets[marketId] = Market({
            creator: msg.sender,
            question: question,
            description: description,
            createdAt: uint64(block.timestamp),
            closeTime: closeTime,
            code: code,
            totalYesPool: 0,
            totalNoPool: 0,
            outcomeYes: false,
            status: MarketStatus.OPEN
        });

        createdMarketIds[msg.sender].push(marketId);

        emit MarketCreated(marketId, code, msg.sender, question, closeTime);
    }

    function placeBet(uint256 marketId, bool yesSide) external payable {
        Market storage market = markets[marketId];
        _revertIfMarketMissing(market);
        if (market.status != MarketStatus.OPEN) revert MarketNotOpen();
        if (block.timestamp > market.closeTime) revert BetWindowClosed();
        if (msg.value == 0) revert InvalidBetAmount();

        Stake storage userStake = stakes[marketId][msg.sender];

        if (!hasParticipated[marketId][msg.sender]) {
            hasParticipated[marketId][msg.sender] = true;
            participatedMarketIds[msg.sender].push(marketId);
        }

        if (yesSide) {
            userStake.yes += msg.value;
            market.totalYesPool += msg.value;
        } else {
            userStake.no += msg.value;
            market.totalNoPool += msg.value;
        }

        emit BetPlaced(marketId, msg.sender, yesSide, msg.value);
    }

    function cancelMarket(uint256 marketId) external {
        Market storage market = markets[marketId];
        _revertIfMarketMissing(market);
        if (market.creator != msg.sender) revert NotCreator();
        if (market.status == MarketStatus.CANCELED) revert MarketAlreadyCanceled();
        if (market.status == MarketStatus.RESOLVED) revert MarketAlreadyResolved();
        if (market.totalYesPool > 0 || market.totalNoPool > 0) revert CannotCancelAfterBet();

        market.status = MarketStatus.CANCELED;

        emit MarketCanceled(marketId, msg.sender);
    }

    function resolveMarket(uint256 marketId, bool outcomeYes) external {
        Market storage market = markets[marketId];
        _revertIfMarketMissing(market);
        if (market.creator != msg.sender) revert NotCreator();
        if (market.status == MarketStatus.CANCELED) revert MarketAlreadyCanceled();
        if (market.status == MarketStatus.RESOLVED) revert MarketAlreadyResolved();
        if (block.timestamp <= market.closeTime) revert ResolveTooEarly();

        market.outcomeYes = outcomeYes;
        market.status = MarketStatus.RESOLVED;

        emit MarketResolved(marketId, outcomeYes, msg.sender);
    }

    function claimPayout(uint256 marketId) external nonReentrant returns (uint256 payoutAmount, uint256 feeAmount) {
        Market storage market = markets[marketId];
        _revertIfMarketMissing(market);
        if (market.status != MarketStatus.RESOLVED) revert MarketNotResolved();

        Stake storage userStake = stakes[marketId][msg.sender];
        if (userStake.claimed) revert AlreadyClaimed();

        uint256 winnerStake = market.outcomeYes ? userStake.yes : userStake.no;
        if (winnerStake == 0) revert NoWinningStake();

        userStake.claimed = true;

        uint256 totalPool = market.totalYesPool + market.totalNoPool;
        uint256 winningPool = market.outcomeYes ? market.totalYesPool : market.totalNoPool;

        uint256 grossPayout = (winnerStake * totalPool) / winningPool;
        uint256 winnings = grossPayout > winnerStake ? grossPayout - winnerStake : 0;
        feeAmount = (winnings * feeBps) / FEE_DENOMINATOR;
        payoutAmount = grossPayout - feeAmount;

        (bool payoutOk, ) = payable(msg.sender).call{value: payoutAmount}("");
        require(payoutOk, "PAYOUT_TRANSFER_FAILED");

        if (feeAmount > 0) {
            (bool feeOk, ) = payable(treasury).call{value: feeAmount}("");
            require(feeOk, "FEE_TRANSFER_FAILED");
        }

        emit PayoutClaimed(marketId, msg.sender, payoutAmount, feeAmount);
    }

    function getMarket(uint256 marketId) external view returns (Market memory) {
        Market memory market = markets[marketId];
        _revertIfMarketMissing(market);
        return market;
    }

    function getCreatedMarkets(address user) external view returns (uint256[] memory) {
        return createdMarketIds[user];
    }

    function getParticipatedMarkets(address user) external view returns (uint256[] memory) {
        return participatedMarketIds[user];
    }

    function getMarketIdByOpenCode(string calldata openCode) external view returns (uint256 marketId) {
        uint64 code = _parseOpenCode(openCode);
        marketId = codeToMarketId[code];
    }

    function formatOpenCode(uint64 code) external pure returns (string memory) {
        return string(abi.encodePacked("OPEN", _toFixedTenDigitString(code)));
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

    function _revertIfMarketMissing(Market memory market) private pure {
        if (market.creator == address(0)) revert MarketNotFound();
    }
}
