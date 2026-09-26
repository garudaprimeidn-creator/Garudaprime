// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title GarudaValidatorRegistry
 * @notice On-chain validator stake (SDA native) + activation registry (ADR-005 Phase 4).
 * @dev Off-chain KYC/admin approval still required; relayer mirrors approved validators on-chain.
 */
contract GarudaValidatorRegistry is AccessControl, ReentrancyGuard {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    uint256 public minStakeSda;

    mapping(bytes32 => bool) public processedRef;
    mapping(address => uint256) public stakeSda;
    mapping(address => bool) public isActive;
    mapping(bytes32 => address) public appValidator;

    event MinStakeUpdated(uint256 minStakeSda);
    event ValidatorStaked(
        bytes32 indexed appId,
        address indexed validator,
        uint256 amountSda,
        bytes32 refId
    );
    event ValidatorActivated(bytes32 indexed appId, address indexed validator);
    event ValidatorDeactivated(bytes32 indexed appId, address indexed validator);
    event ValidatorUnstaked(
        bytes32 indexed appId,
        address indexed validator,
        uint256 amountSda,
        bytes32 refId
    );

    error GarudaZeroAddress();
    error GarudaDuplicateRef(bytes32 refId);
    error GarudaInsufficientStake(address validator, uint256 have, uint256 need);

    constructor(address relayer, address admin, uint256 minStake) {
        if (admin == address(0)) revert GarudaZeroAddress();
        minStakeSda = minStake;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        if (relayer != address(0)) {
            _grantRole(RELAYER_ROLE, relayer);
        }
    }

    function setMinStakeSda(uint256 minStake) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minStakeSda = minStake;
        emit MinStakeUpdated(minStake);
    }

    function _markRef(bytes32 refId) internal {
        if (refId == bytes32(0)) return;
        if (processedRef[refId]) revert GarudaDuplicateRef(refId);
        processedRef[refId] = true;
    }

    /**
     * @notice Record validator SDA stake (relayer may attach `msg.value` when forwarding native SDA).
     */
    function relayStake(
        bytes32 appId,
        address validator,
        uint256 amountSda,
        bytes32 refId
    ) external payable onlyRole(RELAYER_ROLE) nonReentrant {
        if (validator == address(0)) revert GarudaZeroAddress();
        _markRef(refId);
        if (msg.value > 0) {
            require(msg.value >= amountSda, "SDA value mismatch");
        }
        stakeSda[validator] += amountSda;
        appValidator[appId] = validator;
        emit ValidatorStaked(appId, validator, amountSda, refId);
    }

    function relayActivate(bytes32 appId, address validator) external onlyRole(RELAYER_ROLE) {
        if (validator == address(0)) revert GarudaZeroAddress();
        uint256 staked = stakeSda[validator];
        if (minStakeSda > 0 && staked < minStakeSda) {
            revert GarudaInsufficientStake(validator, staked, minStakeSda);
        }
        isActive[validator] = true;
        appValidator[appId] = validator;
        emit ValidatorActivated(appId, validator);
    }

    function relayDeactivate(bytes32 appId, address validator) external onlyRole(RELAYER_ROLE) {
        if (validator == address(0)) revert GarudaZeroAddress();
        isActive[validator] = false;
        emit ValidatorDeactivated(appId, validator);
    }

    function relayUnstake(
        bytes32 appId,
        address validator,
        uint256 amountSda,
        address payable recipient,
        bytes32 refId
    ) external onlyRole(RELAYER_ROLE) nonReentrant {
        if (validator == address(0) || recipient == address(0)) revert GarudaZeroAddress();
        _markRef(refId);
        require(stakeSda[validator] >= amountSda, "insufficient stake");
        stakeSda[validator] -= amountSda;
        if (amountSda > 0) {
            (bool ok, ) = recipient.call{value: amountSda}("");
            require(ok, "SDA transfer failed");
        }
        if (stakeSda[validator] == 0) {
            isActive[validator] = false;
        }
        emit ValidatorUnstaked(appId, validator, amountSda, refId);
    }

    receive() external payable {}
}
