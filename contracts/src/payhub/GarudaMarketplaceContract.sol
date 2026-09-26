// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GarudaPayHubBase.sol";

/**
 * @title GarudaMarketplaceContract
 * @notice Marketplace checkout, buyer debited, merchant vault credited (single leg per split).
 */
contract GarudaMarketplaceContract is GarudaPayHubBase {
    mapping(bytes32 => address) public merchantVault;

    event MarketVaultSet(bytes32 indexed merchantId, address vault);

    constructor(address gatToken, address relayer, address admin) GarudaPayHubBase(gatToken, relayer, admin) {}

    function setMerchantVault(bytes32 merchantId, address vault) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (vault == address(0)) revert GarudaZeroAddress();
        merchantVault[merchantId] = vault;
        emit MarketVaultSet(merchantId, vault);
    }

    function relayCheckout(
        address buyer,
        bytes32 merchantId,
        uint256 amount,
        bytes32 checkoutRef
    ) external onlyRole(RELAYER_ROLE) nonReentrant {
        address vault = merchantVault[merchantId];
        if (vault == address(0)) revert GarudaZeroAddress();
        _relayPull(buyer, vault, amount, checkoutRef, "market_checkout");
    }
}
