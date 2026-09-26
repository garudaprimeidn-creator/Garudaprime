// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GarudaPayHubBase.sol";

/**
 * @title GarudaPaymentContract
 * @notice P2P & internal GAT transfers via relayer (PaymentContract in migration spec).
 * @dev Payer must approve this contract (or infinite approval to router) once.
 */
contract GarudaPaymentContract is GarudaPayHubBase {
    constructor(address gatToken, address relayer, address admin) GarudaPayHubBase(gatToken, relayer, admin) {}

    function relayTransfer(
        address from,
        address to,
        uint256 amount,
        bytes32 refId
    ) external onlyRole(RELAYER_ROLE) nonReentrant {
        _relayPull(from, to, amount, refId, "transfer");
    }

    /**
     * @notice Payer-initiated GAT transfer (Garuda Native Wallet direct debit).
     * @dev Caller must have approved this contract; no relayer gas for pull leg.
     */
    function directTransfer(
        address to,
        uint256 amount,
        bytes32 refId
    ) external nonReentrant {
        _relayPull(msg.sender, to, amount, refId, "direct");
    }
}
