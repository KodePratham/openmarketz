// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title OpenMarketzVault
 * @author OpenMarketz
 * @notice Isolated vault for native MON custody and accounting for OpenMarketz markets.
 * @dev Holds user funds and moves balances only via authorized instructions. Market logic lives outside this contract.
 */
contract OpenMarketzVault is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error InsufficientBalance(uint256 available, uint256 requested);
    error InsufficientLockedBalance(uint256 available, uint256 requested);
    error UnauthorizedMarket(address caller);
    error BelowMinimumDeposit(uint256 sent, uint256 minimum);
    error ZeroAmount();
    error ZeroAddress();
    error TransferFailed();
    error NoFeesToWithdraw();
    error EmergencyModeActive();
    error DirectTransferNotAllowed();

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event FundsLocked(address indexed user, uint256 amount, address indexed market);
    event FundsReleased(address indexed from, address indexed to, uint256 amount, address indexed market);
    event FeeCollected(uint256 amount, address indexed market);
    event FeesWithdrawn(address indexed to, uint256 amount);
    event MarketAuthorized(address indexed market);
    event MarketRevoked(address indexed market);
    event MinDepositUpdated(uint256 oldAmount, uint256 newAmount);
    event EmergencyWithdraw(uint256 amount);
    event VaultDeployed(address indexed owner, uint256 timestamp);

    mapping(address => uint256) private balances;
    mapping(address => uint256) private lockedBalances;
    mapping(address => bool) private authorizedMarkets;

    uint256 private totalVaultBalance;
    uint256 private protocolFees;
    uint256 private minDepositAmount;
    uint256 private totalFreeBalance;
    uint256 private totalLockedBalance;

    bool private emergencyMode;

    modifier onlyAuthorizedMarket() {
        if (!authorizedMarkets[msg.sender]) {
            revert UnauthorizedMarket(msg.sender);
        }
        _;
    }

    modifier whenVaultOperational() {
        if (emergencyMode) {
            revert EmergencyModeActive();
        }
        _;
    }

    /**
     * @notice Deploys the vault with owner and initial minimum deposit.
     * @dev Initializes Ownable with deployer and emits deployment event for indexing.
     * @param initialMinDeposit Minimum native MON deposit allowed in wei.
     */
    constructor(uint256 initialMinDeposit) Ownable(msg.sender) {
        if (initialMinDeposit == 0) {
            revert ZeroAmount();
        }

        minDepositAmount = initialMinDeposit;
        emit VaultDeployed(msg.sender, block.timestamp);
    }

    /**
     * @notice Rejects direct native transfers that bypass accounting entrypoints.
     * @dev Prevents accidental desync from plain transfers; use deposit() instead.
     */
    receive() external payable {
        revert DirectTransferNotAllowed();
    }

    /**
     * @notice Rejects fallback calls and direct value sends.
     * @dev Keeps all value movement explicit through contract functions.
     */
    fallback() external payable {
        revert DirectTransferNotAllowed();
    }

    /**
     * @notice Deposits native MON into the caller's free vault balance.
     * @dev Non-reentrant and disabled while paused. Updates accounting before emitting event.
     */
    function deposit() external payable nonReentrant whenNotPaused whenVaultOperational {
        uint256 amount = msg.value;
        if (amount == 0) {
            revert ZeroAmount();
        }
        if (amount < minDepositAmount) {
            revert BelowMinimumDeposit(amount, minDepositAmount);
        }

        balances[msg.sender] += amount;
        totalFreeBalance += amount;
        totalVaultBalance += amount;

        _assertAccountingIntegrity();
        emit Deposited(msg.sender, amount);
    }

    /**
     * @notice Withdraws native MON from the caller's free vault balance.
     * @dev Follows strict CEI: validate, mutate storage, then transfer via call.
     * @param amount Amount of native MON to withdraw in wei.
     */
    function withdraw(uint256 amount) external nonReentrant whenNotPaused whenVaultOperational {
        if (amount == 0) {
            revert ZeroAmount();
        }

        uint256 available = balances[msg.sender];
        if (available < amount) {
            revert InsufficientBalance(available, amount);
        }

        balances[msg.sender] = available - amount;
        totalFreeBalance -= amount;
        totalVaultBalance -= amount;

        (bool success,) = payable(msg.sender).call{value: amount}("");
        if (!success) {
            revert TransferFailed();
        }

        _assertAccountingIntegrity();
        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice Marks a market contract as authorized to instruct balance movements.
     * @dev Owner-only admin control.
     * @param market Address of the market contract to authorize.
     */
    function authorizeMarket(address market) external onlyOwner {
        if (market == address(0)) {
            revert ZeroAddress();
        }

        authorizedMarkets[market] = true;
        emit MarketAuthorized(market);
    }

    /**
     * @notice Revokes a market contract's authorization.
     * @dev Owner-only admin control.
     * @param market Address of the market contract to revoke.
     */
    function revokeMarket(address market) external onlyOwner {
        if (market == address(0)) {
            revert ZeroAddress();
        }

        authorizedMarkets[market] = false;
        emit MarketRevoked(market);
    }

    /**
     * @notice Locks funds from a user's free balance for an active market position.
     * @dev Callable only by authorized market contracts.
     * @param user Address whose funds are being locked.
     * @param amount Amount to lock in wei.
     */
    function lockFunds(address user, uint256 amount)
        external
        onlyAuthorizedMarket
        nonReentrant
        whenVaultOperational
    {
        if (user == address(0)) {
            revert ZeroAddress();
        }
        if (amount == 0) {
            revert ZeroAmount();
        }

        uint256 available = balances[user];
        if (available < amount) {
            revert InsufficientBalance(available, amount);
        }

        balances[user] = available - amount;
        lockedBalances[user] += amount;

        totalFreeBalance -= amount;
        totalLockedBalance += amount;

        _assertAccountingIntegrity();
        emit FundsLocked(user, amount, msg.sender);
    }

    /**
     * @notice Releases locked funds from one user to another user's free balance.
     * @dev Callable only by authorized market contracts after market resolution.
     * @param from Address whose locked balance is debited.
     * @param to Address whose free balance is credited.
     * @param amount Amount to release in wei.
     */
    function releaseFunds(address from, address to, uint256 amount)
        external
        onlyAuthorizedMarket
        nonReentrant
        whenVaultOperational
    {
        if (from == address(0) || to == address(0)) {
            revert ZeroAddress();
        }
        if (amount == 0) {
            revert ZeroAmount();
        }

        uint256 locked = lockedBalances[from];
        if (locked < amount) {
            revert InsufficientLockedBalance(locked, amount);
        }

        lockedBalances[from] = locked - amount;
        balances[to] += amount;

        totalLockedBalance -= amount;
        totalFreeBalance += amount;

        _assertAccountingIntegrity();
        emit FundsReleased(from, to, amount, msg.sender);
    }

    /**
     * @notice Reclassifies market-held free balance into protocol fees.
     * @dev Callable only by authorized market contracts; does not move native funds externally.
     * @param amount Fee amount in wei to classify as protocol revenue.
     */
    function collectFee(uint256 amount) external onlyAuthorizedMarket nonReentrant whenVaultOperational {
        if (amount == 0) {
            revert ZeroAmount();
        }

        uint256 marketBalance = balances[msg.sender];
        if (marketBalance < amount) {
            revert InsufficientBalance(marketBalance, amount);
        }

        balances[msg.sender] = marketBalance - amount;
        protocolFees += amount;
        totalFreeBalance -= amount;

        _assertAccountingIntegrity();
        emit FeeCollected(amount, msg.sender);
    }

    /**
     * @notice Withdraws accumulated protocol fees to a target address.
     * @dev Owner-only and non-reentrant. Uses CEI and call-based transfer.
     * @param to Recipient address for protocol fee withdrawal.
     */
    function withdrawFees(address to) external onlyOwner nonReentrant whenVaultOperational {
        if (to == address(0)) {
            revert ZeroAddress();
        }

        uint256 amount = protocolFees;
        if (amount == 0) {
            revert NoFeesToWithdraw();
        }

        protocolFees = 0;
        totalVaultBalance -= amount;

        (bool success,) = payable(to).call{value: amount}("");
        if (!success) {
            revert TransferFailed();
        }

        _assertAccountingIntegrity();
        emit FeesWithdrawn(to, amount);
    }

    /**
     * @notice Updates the minimum allowed deposit amount.
     * @dev Owner-only admin setter.
     * @param newMinDeposit New minimum deposit in wei.
     */
    function setMinDepositAmount(uint256 newMinDeposit) external onlyOwner {
        if (newMinDeposit == 0) {
            revert ZeroAmount();
        }

        uint256 oldMinDeposit = minDepositAmount;
        minDepositAmount = newMinDeposit;

        emit MinDepositUpdated(oldMinDeposit, newMinDeposit);
    }

    /**
     * @notice Pauses deposit and withdraw entrypoints for emergency response.
     * @dev Owner-only circuit breaker.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpauses deposit and withdraw entrypoints.
     * @dev Owner-only and blocked permanently after emergency withdrawal.
     */
    function unpause() external onlyOwner {
        if (emergencyMode) {
            revert EmergencyModeActive();
        }
        _unpause();
    }

    /**
     * @notice Emergency-only full vault drain to owner.
     * @dev Callable only while paused. Activates irreversible emergency mode and resets aggregate accounting.
     */
    function emergencyWithdraw() external onlyOwner whenPaused nonReentrant {
        uint256 amount = address(this).balance;

        emergencyMode = true;
        protocolFees = 0;
        totalVaultBalance = 0;
        totalFreeBalance = 0;
        totalLockedBalance = 0;

        (bool success,) = payable(owner()).call{value: amount}("");
        if (!success) {
            revert TransferFailed();
        }

        emit EmergencyWithdraw(amount);
    }

    /**
     * @notice Returns a user's free balance.
     * @dev Free balance excludes locked funds.
     * @param user Address to query.
     * @return Free balance in wei.
     */
    function getBalance(address user) external view returns (uint256) {
        return balances[user];
    }

    /**
     * @notice Returns a user's locked balance.
     * @dev Locked balance is reserved for market settlement.
     * @param user Address to query.
     * @return Locked balance in wei.
     */
    function getLockedBalance(address user) external view returns (uint256) {
        return lockedBalances[user];
    }

    /**
     * @notice Returns a user's total balance (free + locked).
     * @dev Utility view for frontend and analytics.
     * @param user Address to query.
     * @return Sum of free and locked balances in wei.
     */
    function getTotalBalance(address user) external view returns (uint256) {
        return balances[user] + lockedBalances[user];
    }

    /**
     * @notice Returns total protocol fees collected.
     * @dev Restricted to owner to avoid exposing fee runway publicly if undesired.
     * @return Total protocol fees in wei.
     */
    function getProtocolFees() external view onlyOwner returns (uint256) {
        return protocolFees;
    }

    /**
     * @notice Checks whether a market address is authorized.
     * @dev Public read helper for integrations.
     * @param market Address to query.
     * @return True if market is authorized, otherwise false.
     */
    function isAuthorizedMarket(address market) external view returns (bool) {
        return authorizedMarkets[market];
    }

    /**
     * @notice Returns total accounted vault holdings.
     * @dev This value tracks protocol-accounted funds in wei.
     * @return Total accounted holdings in wei.
     */
    function getVaultTotalHoldings() external view returns (uint256) {
        return totalVaultBalance;
    }

    /**
     * @notice Returns current minimum deposit requirement.
     * @dev Helper for client-side validation before sending transactions.
     * @return Minimum deposit amount in wei.
     */
    function getMinDepositAmount() external view returns (uint256) {
        return minDepositAmount;
    }

    /**
     * @notice Returns whether the vault entered emergency terminal mode.
     * @dev Once true, normal state-mutating operations remain disabled.
     * @return True if emergency mode is active.
     */
    function isEmergencyMode() external view returns (bool) {
        return emergencyMode;
    }

    /**
     * @notice Internal accounting invariant check.
     * @dev Ensures aggregate free/locked/fee balances reconcile with total tracked balance.
     */
    function _assertAccountingIntegrity() internal view {
        assert(totalFreeBalance + totalLockedBalance + protocolFees == totalVaultBalance);
        assert(address(this).balance == totalVaultBalance);
    }
}