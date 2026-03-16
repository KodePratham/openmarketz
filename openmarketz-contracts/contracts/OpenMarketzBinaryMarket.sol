// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IOpenMarketzVault} from "./IOpenMarketzVault.sol";

interface IOpenMarketzMarketFactoryRelay {
    function relayer() external view returns (address);
}

contract OpenMarketzBinaryMarket is EIP712, ReentrancyGuard {
    enum MarketState {
        Open,
        Resolved
    }

    struct TradeRequest {
        address trader;
        bool isYes;
        uint256 amount;
        uint256 nonce;
        uint256 deadline;
    }

    struct ResolveRequest {
        bool yesWins;
        uint256 nonce;
        uint256 deadline;
    }

    struct ClaimRequest {
        address claimant;
        uint256 nonce;
        uint256 deadline;
    }

    error ZeroAddress();
    error InvalidAmount();
    error InvalidSigner(address expected, address actual);
    error InvalidNonce(uint256 expected, uint256 provided);
    error SignatureExpired(uint256 deadline, uint256 currentTime);
    error UnauthorizedCaller(address caller);
    error AlreadySeeded();
    error NotFactory(address caller);
    error MarketAlreadyResolved();
    error MarketNotResolved();
    error NoClaimablePosition(address claimant);

    event InitialLiquiditySeeded(address indexed creator, uint256 yesSeed, uint256 noSeed);
    event PositionTraded(address indexed trader, bool indexed isYes, uint256 amount, uint256 totalYes, uint256 totalNo);
    event MarketResolved(address indexed resolver, bool indexed yesWins, uint256 totalPool);
    event Claimed(address indexed claimant, uint256 payout);

    bytes32 private constant TRADE_TYPEHASH =
        keccak256("Trade(address trader,bool isYes,uint256 amount,uint256 nonce,uint256 deadline)");
    bytes32 private constant RESOLVE_TYPEHASH =
        keccak256("Resolve(bool yesWins,uint256 nonce,uint256 deadline)");
    bytes32 private constant CLAIM_TYPEHASH =
        keccak256("Claim(address claimant,uint256 nonce,uint256 deadline)");

    IOpenMarketzVault public immutable vault;
    address public immutable factory;
    address public immutable creator;
    string public marketCode;
    string public marketQuestion;
    string public oracleDescription;

    MarketState public marketState;
    bool public winningYes;

    uint256 public totalYesStake;
    uint256 public totalNoStake;
    uint256 public totalPool;
    uint256 public totalWinningStake;
    uint256 public claimedWinningStake;
    uint256 public totalPaidOut;

    mapping(address => uint256) public yesStakeOf;
    mapping(address => uint256) public noStakeOf;
    mapping(address => uint256) public nonces;

    constructor(
        address vaultAddress,
        address factoryAddress,
        address creatorAddress,
        string memory code,
        string memory question,
        string memory oracleText
    ) EIP712("OpenMarketzBinaryMarket", "1") {
        if (vaultAddress == address(0) || factoryAddress == address(0) || creatorAddress == address(0)) {
            revert ZeroAddress();
        }

        vault = IOpenMarketzVault(vaultAddress);
        factory = factoryAddress;
        creator = creatorAddress;
        marketCode = code;
        marketQuestion = question;
        oracleDescription = oracleText;
        marketState = MarketState.Open;
    }

    modifier onlyFactory() {
        if (msg.sender != factory) {
            revert NotFactory(msg.sender);
        }
        _;
    }

    modifier onlyRelayer() {
        address relay = IOpenMarketzMarketFactoryRelay(factory).relayer();
        if (msg.sender != relay) {
            revert UnauthorizedCaller(msg.sender);
        }
        _;
    }

    function seedInitialLiquidity(address owner, uint256 yesSeed, uint256 noSeed) external onlyFactory nonReentrant {
        if (owner != creator) {
            revert InvalidSigner(creator, owner);
        }
        if (marketState != MarketState.Open) {
            revert MarketAlreadyResolved();
        }
        if (totalPool != 0) {
            revert AlreadySeeded();
        }
        if (yesSeed == 0 || noSeed == 0) {
            revert InvalidAmount();
        }

        uint256 seeded = yesSeed + noSeed;
        vault.lockFunds(owner, seeded);
        vault.releaseFunds(owner, address(this), seeded);

        yesStakeOf[owner] = yesSeed;
        noStakeOf[owner] = noSeed;
        totalYesStake = yesSeed;
        totalNoStake = noSeed;
        totalPool = seeded;

        emit InitialLiquiditySeeded(owner, yesSeed, noSeed);
    }

    function trade(TradeRequest calldata req, bytes calldata signature) external onlyRelayer nonReentrant {
        if (marketState != MarketState.Open) {
            revert MarketAlreadyResolved();
        }
        if (req.amount == 0) {
            revert InvalidAmount();
        }

        _validateDeadline(req.deadline);
        _consumeNonce(req.trader, req.nonce);

        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(TRADE_TYPEHASH, req.trader, req.isYes, req.amount, req.nonce, req.deadline))
        );
        address signer = ECDSA.recover(digest, signature);
        if (signer != req.trader) {
            revert InvalidSigner(req.trader, signer);
        }

        vault.lockFunds(req.trader, req.amount);
        vault.releaseFunds(req.trader, address(this), req.amount);

        if (req.isYes) {
            yesStakeOf[req.trader] += req.amount;
            totalYesStake += req.amount;
        } else {
            noStakeOf[req.trader] += req.amount;
            totalNoStake += req.amount;
        }
        totalPool += req.amount;

        emit PositionTraded(req.trader, req.isYes, req.amount, totalYesStake, totalNoStake);
    }

    function resolve(ResolveRequest calldata req, bytes calldata signature) external onlyRelayer nonReentrant {
        if (marketState != MarketState.Open) {
            revert MarketAlreadyResolved();
        }

        _validateDeadline(req.deadline);
        _consumeNonce(creator, req.nonce);

        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(RESOLVE_TYPEHASH, req.yesWins, req.nonce, req.deadline))
        );
        address signer = ECDSA.recover(digest, signature);
        if (signer != creator) {
            revert InvalidSigner(creator, signer);
        }

        marketState = MarketState.Resolved;
        winningYes = req.yesWins;
        totalWinningStake = req.yesWins ? totalYesStake : totalNoStake;

        vault.lockFunds(address(this), totalPool);

        emit MarketResolved(signer, req.yesWins, totalPool);
    }

    function claim(ClaimRequest calldata req, bytes calldata signature) external onlyRelayer nonReentrant {
        if (marketState != MarketState.Resolved) {
            revert MarketNotResolved();
        }

        _validateDeadline(req.deadline);
        _consumeNonce(req.claimant, req.nonce);

        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(CLAIM_TYPEHASH, req.claimant, req.nonce, req.deadline))
        );
        address signer = ECDSA.recover(digest, signature);
        if (signer != req.claimant) {
            revert InvalidSigner(req.claimant, signer);
        }

        uint256 winningStake;
        if (winningYes) {
            winningStake = yesStakeOf[req.claimant];
            yesStakeOf[req.claimant] = 0;
        } else {
            winningStake = noStakeOf[req.claimant];
            noStakeOf[req.claimant] = 0;
        }

        if (winningStake == 0) {
            revert NoClaimablePosition(req.claimant);
        }

        claimedWinningStake += winningStake;

        uint256 payout;
        if (claimedWinningStake >= totalWinningStake) {
            payout = totalPool - totalPaidOut;
        } else {
            uint256 losingPool = winningYes ? totalNoStake : totalYesStake;
            payout = winningStake + ((winningStake * losingPool) / totalWinningStake);
        }

        totalPaidOut += payout;

        vault.releaseFunds(address(this), req.claimant, payout);
        emit Claimed(req.claimant, payout);
    }

    function getStake(address user) external view returns (uint256 yesStake, uint256 noStake) {
        return (yesStakeOf[user], noStakeOf[user]);
    }

    function _consumeNonce(address actor, uint256 providedNonce) internal {
        uint256 expected = nonces[actor];
        if (providedNonce != expected) {
            revert InvalidNonce(expected, providedNonce);
        }
        nonces[actor] = expected + 1;
    }

    function _validateDeadline(uint256 deadline) internal view {
        if (deadline < block.timestamp) {
            revert SignatureExpired(deadline, block.timestamp);
        }
    }
}
