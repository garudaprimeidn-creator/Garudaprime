// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title GATBridgeVault, TAHAP 2 prep
 * @notice Lock GAT on Sidra for future mint on Garuda Chain (relayer completes on L2)
 */
contract GATBridgeVault is Ownable, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public immutable gat;
    uint256 public totalLocked;
    mapping(bytes32 => bool) public processedDeposits;

    event Locked(
        address indexed user,
        uint256 amount,
        bytes32 indexed depositId,
        uint256 timestamp
    );

    constructor(address gatToken) Ownable(msg.sender) {
        require(gatToken != address(0), "GATBridgeVault: zero token");
        gat = IERC20(gatToken);
    }

    function lock(uint256 amount, bytes32 depositId) external whenNotPaused {
        require(amount > 0, "GATBridgeVault: zero amount");
        require(!processedDeposits[depositId], "GATBridgeVault: duplicate");

        processedDeposits[depositId] = true;
        totalLocked += amount;
        gat.safeTransferFrom(msg.sender, address(this), amount);

        emit Locked(msg.sender, amount, depositId, block.timestamp);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
