// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./GATFeeRouter.sol";

/**
 * @title GAT Staking Pool
 * @notice Lock GAT for fixed periods; rewards funded from treasury validator/auto-dist buckets
 */
contract GATStakingPool is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    struct Stake {
        address owner;
        uint256 amount;
        uint256 lockUntil;
        bool active;
    }

    IERC20 public immutable gatToken;
    GATFeeRouter public immutable feeRouter;

    mapping(uint256 => Stake) public stakes;
    uint256 public nextStakeId = 1;
    uint256 public totalStaked;
    uint256 public rewardRateBps;

    event Staked(uint256 indexed stakeId, address indexed user, uint256 amount, uint256 lockUntil, uint256 fee);
    event Unstaked(uint256 indexed stakeId, address indexed user, uint256 amount, uint256 reward, uint256 fee);
    event RewardFunded(uint256 amount);

    constructor(address gatTokenAddress, address feeRouterAddress) Ownable(msg.sender) {
        gatToken = IERC20(gatTokenAddress);
        feeRouter = GATFeeRouter(feeRouterAddress);
        rewardRateBps = 600;
    }

    function fundRewards(uint256 amount) external onlyOwner {
        gatToken.safeTransferFrom(msg.sender, address(this), amount);
        emit RewardFunded(amount);
    }

    function stake(uint256 amount, uint256 lockDays) external nonReentrant whenNotPaused returns (uint256 stakeId) {
        require(amount > 0, "Staking: zero amount");
        uint256 fee = feeRouter.computeFee(GATFeeRouter.FeeType.Staking, amount);
        uint256 net = amount - fee;
        require(net > 0, "Staking: amount too small");

        gatToken.safeTransferFrom(msg.sender, address(this), amount);
        stakeId = nextStakeId++;

        if (fee > 0) {
            gatToken.approve(address(feeRouter), fee);
            feeRouter.collectFeeHeld(GATFeeRouter.FeeType.Staking, fee, bytes32(stakeId));
        }

        uint256 lockUntil = lockDays == 0 ? block.timestamp : block.timestamp + lockDays * 1 days;
        stakes[stakeId] = Stake({
            owner: msg.sender,
            amount: net,
            lockUntil: lockUntil,
            active: true
        });
        totalStaked += net;
        emit Staked(stakeId, msg.sender, net, lockUntil, fee);
    }

    function unstake(uint256 stakeId) external nonReentrant whenNotPaused {
        Stake storage s = stakes[stakeId];
        require(s.active && s.owner == msg.sender, "Staking: invalid stake");
        require(block.timestamp >= s.lockUntil, "Staking: locked");

        uint256 reward = _calcReward(s.amount, s.lockUntil);
        uint256 gross = s.amount + reward;
        uint256 fee = feeRouter.computeFee(GATFeeRouter.FeeType.Withdraw, gross);
        uint256 payout = gross - fee;

        s.active = false;
        totalStaked -= s.amount;

        if (fee > 0) {
            gatToken.approve(address(feeRouter), fee);
            feeRouter.collectFeeHeld(GATFeeRouter.FeeType.Withdraw, fee, bytes32(stakeId));
        }
        gatToken.safeTransfer(msg.sender, payout);
        emit Unstaked(stakeId, msg.sender, s.amount, reward, fee);
    }

    function _calcReward(uint256 amount, uint256 lockUntil) internal view returns (uint256) {
        if (rewardRateBps == 0) return 0;
        uint256 duration = block.timestamp > lockUntil ? block.timestamp - lockUntil : 30 days;
        return (amount * rewardRateBps * duration) / (365 days * 10000);
    }

    function setRewardRateBps(uint256 bps) external onlyOwner {
        require(bps <= 5000, "Staking: rate too high");
        rewardRateBps = bps;
    }

    /// @notice When no active stakes, return all GAT held by the pool (e.g. unused reward pool).
    function recoverAllGatWhenIdle(address to) external onlyOwner {
        require(to != address(0), "Staking: zero to");
        require(totalStaked == 0, "Staking: active stakes");
        uint256 bal = gatToken.balanceOf(address(this));
        if (bal == 0) return;
        gatToken.safeTransfer(to, bal);
    }

    /// @notice Return GAT above reserved stake principal (pause first; keeps active stakes funded).
    function sweepExcessGat(address to) external onlyOwner whenPaused {
        require(to != address(0), "Staking: zero to");
        uint256 bal = gatToken.balanceOf(address(this));
        uint256 reserved = totalStaked;
        require(bal > reserved, "Staking: no excess");
        gatToken.safeTransfer(to, bal - reserved);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
