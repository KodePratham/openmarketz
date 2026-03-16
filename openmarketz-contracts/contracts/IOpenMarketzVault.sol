// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IOpenMarketzVault {
    function authorizeMarket(address market) external;
    function revokeMarket(address market) external;
    function lockFunds(address user, uint256 amount) external;
    function releaseFunds(address from, address to, uint256 amount) external;
}
