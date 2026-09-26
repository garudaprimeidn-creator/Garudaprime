// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title GarudaPayHubBase
 * @notice Shared relayer-gated GAT movements for Full Pay Hub On-Chain (Sidra).
 */
abstract contract GarudaPayHubBase is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    IERC20 public immutable gat;

    event GarudaRelayTransfer(
        bytes32 indexed refId,
        address indexed from,
        address indexed to,
        uint256 amount,
        string action
    );

    error GarudaZeroAddress();
    error GarudaZeroAmount();
    error GarudaDuplicateRef(bytes32 refId);

    /// @dev idempotency on-chain
    mapping(bytes32 => bool) public processedRef;

    constructor(address gatToken, address relayer, address admin) {
        if (gatToken == address(0) || admin == address(0)) revert GarudaZeroAddress();
        gat = IERC20(gatToken);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        if (relayer != address(0)) {
            _grantRole(RELAYER_ROLE, relayer);
        }
    }

    function _markRef(bytes32 refId) internal {
        if (refId == bytes32(0)) return;
        if (processedRef[refId]) revert GarudaDuplicateRef(refId);
        processedRef[refId] = true;
    }

    function _relayPull(
        address from,
        address to,
        uint256 amount,
        bytes32 refId,
        string memory action
    ) internal {
        if (from == address(0) || to == address(0)) revert GarudaZeroAddress();
        if (amount == 0) revert GarudaZeroAmount();
        _markRef(refId);
        gat.safeTransferFrom(from, to, amount);
        emit GarudaRelayTransfer(refId, from, to, amount, action);
    }
}
