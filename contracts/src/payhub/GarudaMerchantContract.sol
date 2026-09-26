// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GarudaPayHubBase.sol";

/**
 * @title GarudaMerchantContract
 * @notice Merchant QR settlement, payer → merchant vault wallet.
 */
contract GarudaMerchantContract is GarudaPayHubBase {
    mapping(bytes32 => address) public merchantVault;

    event MerchantVaultSet(bytes32 indexed merchantId, address vault);

    constructor(address gatToken, address relayer, address admin) GarudaPayHubBase(gatToken, relayer, admin) {}

    function setMerchantVault(bytes32 merchantId, address vault) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (vault == address(0)) revert GarudaZeroAddress();
        merchantVault[merchantId] = vault;
        emit MerchantVaultSet(merchantId, vault);
    }

    function relayMerchantPay(
        address payer,
        bytes32 merchantId,
        uint256 amount,
        bytes32 refId
    ) external onlyRole(RELAYER_ROLE) nonReentrant {
        address vault = merchantVault[merchantId];
        if (vault == address(0)) revert GarudaZeroAddress();
        _relayPull(payer, vault, amount, refId, "merchant_pay");
    }
}
