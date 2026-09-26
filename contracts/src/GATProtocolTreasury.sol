// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title GAT Protocol Treasury
 * @notice Holds protocol fees and routes to vault buckets (Syariah utility model, no interest)
 */
contract GATProtocolTreasury is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public immutable gatToken;

    /// @dev Distribution bucket indices
    uint8 public constant BUCKET_MAIN = 0;
    uint8 public constant BUCKET_VALIDATOR = 1;
    uint8 public constant BUCKET_REFERRAL = 2;
    uint8 public constant BUCKET_BURN = 3;
    uint8 public constant BUCKET_LIQUIDITY = 4;
    uint8 public constant BUCKET_INSURANCE = 5;
    uint8 public constant BUCKET_AUTO_DIST = 6;
    uint8 public constant BUCKET_COUNT = 7;

    mapping(uint8 => uint256) public bucketBalances;
    mapping(address => bool) public feeCollectors;

    uint256 public totalBurned;
    uint256 public goldReserveGrams; // mirrored off-chain attestation (admin update)

    event FeeDeposited(uint8 indexed bucket, uint256 amount, address indexed from);
    event FeeCollectorUpdated(address indexed account, bool allowed);
    event Withdrawn(uint8 indexed bucket, address indexed to, uint256 amount);
    event BuybackBurn(uint256 amount, address indexed executor);
    event GoldReserveUpdated(uint256 grams, string attestationUri);

    modifier onlyCollector() {
        require(feeCollectors[msg.sender] || msg.sender == owner(), "Treasury: not collector");
        _;
    }

    constructor(address gatTokenAddress) Ownable(msg.sender) {
        require(gatTokenAddress != address(0), "Treasury: zero token");
        gatToken = IERC20(gatTokenAddress);
        feeCollectors[msg.sender] = true;
    }

    function setFeeCollector(address account, bool allowed) external onlyOwner {
        feeCollectors[account] = allowed;
        emit FeeCollectorUpdated(account, allowed);
    }

    function depositToBucket(uint8 bucket, uint256 amount) external nonReentrant whenNotPaused onlyCollector {
        require(bucket < BUCKET_COUNT, "Treasury: invalid bucket");
        require(amount > 0, "Treasury: zero amount");
        gatToken.safeTransferFrom(msg.sender, address(this), amount);
        bucketBalances[bucket] += amount;
        emit FeeDeposited(bucket, amount, msg.sender);
    }

    function withdrawBucket(uint8 bucket, address to, uint256 amount) external nonReentrant onlyOwner {
        require(bucket < BUCKET_COUNT, "Treasury: invalid bucket");
        require(to != address(0), "Treasury: zero recipient");
        require(amount > 0 && bucketBalances[bucket] >= amount, "Treasury: insufficient");
        bucketBalances[bucket] -= amount;
        gatToken.safeTransfer(to, amount);
        emit Withdrawn(bucket, to, amount);
    }

    function buybackAndBurn(uint256 amount) external nonReentrant onlyOwner whenNotPaused {
        require(amount > 0, "Treasury: zero amount");
        require(bucketBalances[BUCKET_BURN] >= amount, "Treasury: insufficient burn bucket");
        bucketBalances[BUCKET_BURN] -= amount;
        gatToken.safeTransfer(address(0xdead), amount);
        totalBurned += amount;
        emit BuybackBurn(amount, msg.sender);
    }

    function updateGoldReserve(uint256 grams, string calldata attestationUri) external onlyOwner {
        goldReserveGrams = grams;
        emit GoldReserveUpdated(grams, attestationUri);
    }

    function totalTreasuryBalance() external view returns (uint256) {
        return gatToken.balanceOf(address(this));
    }

    /// @notice Recover ERC-20 sent to treasury outside bucket accounting.
    function rescueERC20(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Treasury: zero to");
        IERC20(token).safeTransfer(to, amount);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
