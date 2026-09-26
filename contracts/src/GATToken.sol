// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title GAT, Garuda Asset Token
 * @notice Utility & payment token for Garuda Prime on SDA Sidra Network (TAHAP 1)
 * @dev No interest-bearing logic, aligned with Syariah utility token model
 */
contract GATToken is ERC20, ERC20Burnable, Ownable, Pausable {
    uint256 public immutable maxSupply;

    event TreasuryMint(address indexed to, uint256 amount);

    constructor(
        address treasury,
        uint256 initialSupply,
        uint256 cap
    ) ERC20("Garuda Asset Token", "GAT") Ownable(msg.sender) {
        require(treasury != address(0), "GAT: zero treasury");
        require(initialSupply <= cap, "GAT: initial exceeds cap");
        require(cap > 0, "GAT: zero cap");

        maxSupply = cap;

        if (initialSupply > 0) {
            _mint(treasury, initialSupply);
            emit TreasuryMint(treasury, initialSupply);
        }
    }

    function mint(address to, uint256 amount) external onlyOwner whenNotPaused {
        require(totalSupply() + amount <= maxSupply, "GAT: cap exceeded");
        _mint(to, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _update(address from, address to, uint256 value)
        internal
        override
        whenNotPaused
    {
        super._update(from, to, value);
    }
}
