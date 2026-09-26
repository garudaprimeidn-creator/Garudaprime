// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./GATProtocolTreasury.sol";

/**
 * @title GAT Fee Router
 * @notice Collects protocol fees and auto-distributes to treasury buckets
 */
contract GATFeeRouter is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    enum FeeType {
        Transaction,
        Market,
        Investment,
        Withdraw,
        Deposit,
        Swap,
        Trading,
        Staking,
        Treasury,
        Validator,
        Referral,
        Burn,
        Liquidity,
        AutoDistribution
    }

    IERC20 public immutable gatToken;
    GATProtocolTreasury public immutable treasury;

    uint16 public constant BPS_DENOM = 10000;
    uint16 public constant MAX_FEE_BPS = 1000;
    uint8 public constant BUCKET_COUNT = 7;

    /// @dev Fee rates in basis points (10000 = 100%), max 1000 (10%) per type
    mapping(FeeType => uint16) public feeRatesBps;
    /// @dev Auto-distribution split across buckets (must sum to 10000)
    uint16[7] public distributionBps;

    mapping(address => bool) public operators;

    event FeeCollected(
        FeeType indexed feeType,
        address indexed payer,
        uint256 grossAmount,
        uint256 feeAmount,
        bytes32 refId
    );
    event OperatorUpdated(address indexed account, bool allowed);
    event FeeRateUpdated(FeeType indexed feeType, uint16 bps);
    event DistributionUpdated(uint16[7] bps);

    modifier onlyOperator() {
        require(operators[msg.sender] || msg.sender == owner(), "FeeRouter: not operator");
        _;
    }

    constructor(address gatTokenAddress, address treasuryAddress) Ownable(msg.sender) {
        require(gatTokenAddress != address(0) && treasuryAddress != address(0), "FeeRouter: zero address");
        gatToken = IERC20(gatTokenAddress);
        treasury = GATProtocolTreasury(treasuryAddress);

        // Default fee rates (bps)
        feeRatesBps[FeeType.Transaction] = 10;    // 0.10%
        feeRatesBps[FeeType.Market] = 25;         // 0.25%
        feeRatesBps[FeeType.Investment] = 50;     // 0.50%
        feeRatesBps[FeeType.Withdraw] = 30;       // 0.30%
        feeRatesBps[FeeType.Deposit] = 0;
        feeRatesBps[FeeType.Swap] = 10;           // 0.10%
        feeRatesBps[FeeType.Trading] = 20;        // 0.20%
        feeRatesBps[FeeType.Staking] = 15;        // 0.15%

        // Auto distribution: main 30%, validator 15%, referral 10%, burn 5%,
        // liquidity 15%, insurance 10%, autoDist 15%
        distributionBps = [3000, 1500, 1000, 500, 1500, 1000, 1500];
    }

    function setFeeRate(FeeType feeType, uint16 bps) external onlyOwner {
        require(bps <= MAX_FEE_BPS, "FeeRouter: rate too high");
        feeRatesBps[feeType] = bps;
        emit FeeRateUpdated(feeType, bps);
    }

    function setDistribution(uint16[7] calldata bps) external onlyOwner {
        uint256 sum;
        for (uint256 i = 0; i < BUCKET_COUNT; i++) sum += bps[i];
        require(sum == BPS_DENOM, "FeeRouter: distribution must sum 10000");
        distributionBps = bps;
        emit DistributionUpdated(bps);
    }

    function setOperator(address account, bool allowed) external onlyOwner {
        operators[account] = allowed;
        emit OperatorUpdated(account, allowed);
    }

    function computeFee(FeeType feeType, uint256 amount) public view returns (uint256) {
        uint16 bps = feeRatesBps[feeType];
        if (bps == 0 || amount == 0) return 0;
        return (amount * bps) / BPS_DENOM;
    }

    /**
     * @notice Pull fee from payer and distribute to treasury buckets
     * @param refId Off-chain reference (order id, tx hash hash, etc.)
     */
    function collectFee(
        FeeType feeType,
        address payer,
        uint256 grossAmount,
        bytes32 refId
    ) external nonReentrant whenNotPaused returns (uint256 feeAmount) {
        require(payer != address(0) && grossAmount > 0, "FeeRouter: invalid input");
        feeAmount = computeFee(feeType, grossAmount);
        if (feeAmount == 0) return 0;

        gatToken.safeTransferFrom(payer, address(this), feeAmount);
        _distributeToTreasury(feeAmount);

        emit FeeCollected(feeType, payer, grossAmount, feeAmount, refId);
    }

    function collectFeeHeld(
        FeeType feeType,
        uint256 feeAmount,
        bytes32 refId
    ) external nonReentrant whenNotPaused onlyOperator returns (uint256) {
        require(feeAmount > 0, "FeeRouter: zero fee");
        gatToken.safeTransferFrom(msg.sender, address(this), feeAmount);
        _distributeToTreasury(feeAmount);
        emit FeeCollected(feeType, msg.sender, feeAmount, feeAmount, refId);
        return feeAmount;
    }

    /**
     * @notice Collect fee when GAT already held by router (e.g. from wrapped flow)
     */
    function distributeHeldFee(
        FeeType feeType,
        uint256 feeAmount,
        bytes32 refId
    ) external onlyOwner nonReentrant whenNotPaused {
        require(feeAmount > 0, "FeeRouter: zero fee");
        require(gatToken.balanceOf(address(this)) >= feeAmount, "FeeRouter: insufficient");
        _distributeToTreasury(feeAmount);
        emit FeeCollected(feeType, msg.sender, feeAmount, feeAmount, refId);
    }

    function _distributeToTreasury(uint256 feeAmount) internal {
        uint256 remaining = feeAmount;
        for (uint8 i = 0; i < BUCKET_COUNT - 1; i++) {
            uint256 share = (feeAmount * distributionBps[i]) / BPS_DENOM;
            if (share > 0) {
                gatToken.approve(address(treasury), share);
                treasury.depositToBucket(i, share);
                remaining -= share;
            }
        }
        if (remaining > 0) {
            gatToken.approve(address(treasury), remaining);
            treasury.depositToBucket(BUCKET_COUNT - 1, remaining);
        }
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }
}
