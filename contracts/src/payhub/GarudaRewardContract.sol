// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GarudaPayHubBase.sol";

/**
 * @title GarudaRewardContract
 * @notice Reward vault → user (referral, validator, campaign). Vault must hold GAT + approve.
 */
contract GarudaRewardContract is GarudaPayHubBase {
    address public rewardVault;

    event RewardVaultSet(address vault);

    constructor(address gatToken, address relayer, address admin) GarudaPayHubBase(gatToken, relayer, admin) {}

    function setRewardVault(address vault) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (vault == address(0)) revert GarudaZeroAddress();
        rewardVault = vault;
        emit RewardVaultSet(vault);
    }

    function relayReward(
        address recipient,
        uint256 amount,
        bytes32 refId
    ) external onlyRole(RELAYER_ROLE) nonReentrant {
        if (rewardVault == address(0)) revert GarudaZeroAddress();
        _relayPull(rewardVault, recipient, amount, refId, "reward");
    }
}
