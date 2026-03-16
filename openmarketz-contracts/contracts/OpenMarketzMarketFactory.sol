// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IOpenMarketzVault} from "./IOpenMarketzVault.sol";
import {OpenMarketzBinaryMarket} from "./OpenMarketzBinaryMarket.sol";

contract OpenMarketzMarketFactory is Ownable, EIP712, ReentrancyGuard {
    struct CreateMarketRequest {
        address creator;
        uint256 yesSeed;
        uint256 noSeed;
        string question;
        string oracleDescription;
        bytes32 linksHash;
        uint256 nonce;
        uint256 deadline;
    }

    error ZeroAddress();
    error InvalidSigner(address expected, address actual);
    error InvalidNonce(uint256 expected, uint256 provided);
    error SignatureExpired(uint256 deadline, uint256 currentTime);
    error UnauthorizedRelayer(address caller);
    error InvalidSeedLiquidity(uint256 yesSeed, uint256 noSeed, uint256 totalSeed);
    error InvalidQuestionLength(uint256 providedLength);
    error InvalidOracleTextLength(uint256 providedLength);
    error TooManyOracleLinks(uint256 providedCount);
    error InvalidOracleLink(uint256 index);
    error LinkHashMismatch(bytes32 expected, bytes32 provided);
    error CodeGenerationFailed();

    event RelayerUpdated(address indexed oldRelayer, address indexed newRelayer);
    event MarketCreated(
        address indexed market,
        address indexed creator,
        string code,
        uint256 yesSeed,
        uint256 noSeed,
        bytes32 linksHash
    );

    bytes32 private constant CREATE_MARKET_TYPEHASH = keccak256(
        "CreateMarket(address creator,uint256 yesSeed,uint256 noSeed,bytes32 questionHash,bytes32 oracleDescriptionHash,bytes32 linksHash,uint256 nonce,uint256 deadline)"
    );

    uint256 public constant MIN_YES_SEED = 2 ether;
    uint256 public constant MIN_NO_SEED = 2 ether;
    uint256 public constant MIN_TOTAL_SEED = 4 ether;
    uint256 public constant MAX_QUESTION_LENGTH = 300;
    uint256 public constant MAX_ORACLE_NOTE_LENGTH = 1000;
    uint256 public constant MAX_ORACLE_LINKS = 5;

    IOpenMarketzVault public immutable vault;
    address public relayer;

    mapping(address => uint256) public nonces;
    mapping(bytes32 => address) private codeToMarket;
    mapping(address => string) private marketCode;
    mapping(address => address) private marketCreator;
    mapping(address => string) private marketQuestion;
    mapping(address => string) private marketOracleDescription;
    mapping(address => string[]) private marketOracleLinks;
    mapping(address => address[]) private creatorMarkets;

    uint256 private entropyNonce;

    constructor(address vaultAddress, address relayerAddress) Ownable(msg.sender) EIP712("OpenMarketzMarketFactory", "1") {
        if (vaultAddress == address(0) || relayerAddress == address(0)) {
            revert ZeroAddress();
        }

        vault = IOpenMarketzVault(vaultAddress);
        relayer = relayerAddress;
    }

    modifier onlyRelayer() {
        if (msg.sender != relayer) {
            revert UnauthorizedRelayer(msg.sender);
        }
        _;
    }

    function setRelayer(address newRelayer) external onlyOwner {
        if (newRelayer == address(0)) {
            revert ZeroAddress();
        }

        address oldRelayer = relayer;
        relayer = newRelayer;
        emit RelayerUpdated(oldRelayer, newRelayer);
    }

    function createBinaryMarket(
        CreateMarketRequest calldata req,
        string[] calldata links,
        bytes calldata signature
    ) external onlyRelayer nonReentrant returns (address marketAddress) {
        _validateDeadline(req.deadline);
        _consumeNonce(req.creator, req.nonce);
        _validateCreationRules(req, links);

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    CREATE_MARKET_TYPEHASH,
                    req.creator,
                    req.yesSeed,
                    req.noSeed,
                    keccak256(bytes(req.question)),
                    keccak256(bytes(req.oracleDescription)),
                    req.linksHash,
                    req.nonce,
                    req.deadline
                )
            )
        );

        address signer = ECDSA.recover(digest, signature);
        if (signer != req.creator) {
            revert InvalidSigner(req.creator, signer);
        }

        string memory code = _generateUniqueCode(req.creator, req.nonce);
        OpenMarketzBinaryMarket market =
            new OpenMarketzBinaryMarket(
                address(vault), address(this), req.creator, code, req.question, req.oracleDescription
            );
        marketAddress = address(market);

        bytes32 codeHash = keccak256(bytes(code));
        codeToMarket[codeHash] = marketAddress;
        marketCode[marketAddress] = code;
        marketCreator[marketAddress] = req.creator;
        marketQuestion[marketAddress] = req.question;
        marketOracleDescription[marketAddress] = req.oracleDescription;
        creatorMarkets[req.creator].push(marketAddress);

        for (uint256 i = 0; i < links.length; i++) {
            marketOracleLinks[marketAddress].push(links[i]);
        }

        vault.authorizeMarket(marketAddress);
        market.seedInitialLiquidity(req.creator, req.yesSeed, req.noSeed);

        emit MarketCreated(marketAddress, req.creator, code, req.yesSeed, req.noSeed, req.linksHash);
    }

    function getMarketByCode(string calldata code) external view returns (address) {
        return codeToMarket[keccak256(bytes(code))];
    }

    function getMarketCode(address market) external view returns (string memory) {
        return marketCode[market];
    }

    function getMarketCreator(address market) external view returns (address) {
        return marketCreator[market];
    }

    function getMarketQuestion(address market) external view returns (string memory) {
        return marketQuestion[market];
    }

    function getMarketOracleDescription(address market) external view returns (string memory) {
        return marketOracleDescription[market];
    }

    function getMarketOracleLinks(address market) external view returns (string[] memory) {
        return marketOracleLinks[market];
    }

    function getCreatorMarkets(address creator) external view returns (address[] memory) {
        return creatorMarkets[creator];
    }

    function getCreatorMarketCodes(address creator) external view returns (string[] memory codes) {
        address[] storage markets = creatorMarkets[creator];
        codes = new string[](markets.length);

        for (uint256 i = 0; i < markets.length; i++) {
            codes[i] = marketCode[markets[i]];
        }
    }

    function _validateCreationRules(CreateMarketRequest calldata req, string[] calldata links) internal pure {
        uint256 totalSeed = req.yesSeed + req.noSeed;
        if (req.yesSeed < MIN_YES_SEED || req.noSeed < MIN_NO_SEED || totalSeed < MIN_TOTAL_SEED) {
            revert InvalidSeedLiquidity(req.yesSeed, req.noSeed, totalSeed);
        }

        uint256 questionLength = bytes(req.question).length;
        if (questionLength == 0 || questionLength > MAX_QUESTION_LENGTH) {
            revert InvalidQuestionLength(questionLength);
        }

        uint256 noteLength = bytes(req.oracleDescription).length;
        if (noteLength == 0 || noteLength > MAX_ORACLE_NOTE_LENGTH) {
            revert InvalidOracleTextLength(noteLength);
        }

        if (links.length > MAX_ORACLE_LINKS) {
            revert TooManyOracleLinks(links.length);
        }

        for (uint256 i = 0; i < links.length; i++) {
            if (!_isLikelyHttpUrl(links[i])) {
                revert InvalidOracleLink(i);
            }
        }

        bytes32 calculatedHash = _hashLinks(links);
        if (calculatedHash != req.linksHash) {
            revert LinkHashMismatch(calculatedHash, req.linksHash);
        }
    }

    function _generateUniqueCode(address creator, uint256 nonceSeed) internal returns (string memory) {
        for (uint256 i = 0; i < 20; i++) {
            entropyNonce += 1;
            uint256 digits = uint256(
                keccak256(
                    abi.encodePacked(
                        creator,
                        nonceSeed,
                        entropyNonce,
                        block.timestamp,
                        block.prevrandao,
                        blockhash(block.number - 1)
                    )
                )
            ) % 10_000_000_000;

            string memory candidate = _formatOpenCode(digits);
            if (codeToMarket[keccak256(bytes(candidate))] == address(0)) {
                return candidate;
            }
        }

        revert CodeGenerationFailed();
    }

    function _formatOpenCode(uint256 digits) internal pure returns (string memory) {
        bytes memory out = bytes("OPEN0000000000");

        for (uint256 i = 0; i < 10; i++) {
            out[13 - i] = bytes1(uint8(48 + (digits % 10)));
            digits /= 10;
        }

        return string(out);
    }

    function _hashLinks(string[] calldata links) internal pure returns (bytes32) {
        bytes memory packed;
        for (uint256 i = 0; i < links.length; i++) {
            packed = abi.encodePacked(packed, keccak256(bytes(links[i])));
        }
        return keccak256(packed);
    }

    function _isLikelyHttpUrl(string calldata link) internal pure returns (bool) {
        bytes memory value = bytes(link);
        if (value.length < 10) {
            return false;
        }

        bytes memory httpPrefix = bytes("http://");
        bytes memory httpsPrefix = bytes("https://");

        if (_startsWith(value, httpPrefix) || _startsWith(value, httpsPrefix)) {
            return true;
        }

        return false;
    }

    function _startsWith(bytes memory value, bytes memory prefix) internal pure returns (bool) {
        if (value.length < prefix.length) {
            return false;
        }

        for (uint256 i = 0; i < prefix.length; i++) {
            if (value[i] != prefix[i]) {
                return false;
            }
        }

        return true;
    }

    function _consumeNonce(address creator, uint256 providedNonce) internal {
        uint256 expected = nonces[creator];
        if (providedNonce != expected) {
            revert InvalidNonce(expected, providedNonce);
        }

        nonces[creator] = expected + 1;
    }

    function _validateDeadline(uint256 deadline) internal view {
        if (deadline < block.timestamp) {
            revert SignatureExpired(deadline, block.timestamp);
        }
    }

    function hashLinks(string[] calldata links) external pure returns (bytes32) {
        return _hashLinks(links);
    }
}
