// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./GATFeeRouter.sol";

/**
 * @title GAT Investment Vault
 * @notice Syariah-aligned profit-sharing vault, admin-funded ROI pool
 */
contract GATInvestmentVault is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    struct Position {
        address owner;
        uint256 principal;
        uint256 startedAt;
        uint256 fundId;
        bool active;
    }

    IERC20 public immutable gatToken;
    GATFeeRouter public immutable feeRouter;

    mapping(uint256 => Position) public positions;
    mapping(uint256 => uint256) public fundAprBps; // per fund id
    uint256 public nextPositionId = 1;
    uint256 public totalPrincipal;

    event Invested(uint256 indexed positionId, address indexed user, uint256 fundId, uint256 amount, uint256 fee);
    event Redeemed(uint256 indexed positionId, address indexed user, uint256 principal, uint256 profit, uint256 fee);
    event FundAprUpdated(uint256 fundId, uint256 aprBps);
    event RoiPoolFunded(uint256 amount);

    constructor(address gatTokenAddress, address feeRouterAddress) Ownable(msg.sender) {
        gatToken = IERC20(gatTokenAddress);
        feeRouter = GATFeeRouter(feeRouterAddress);
    }

    function setFundApr(uint256 fundId, uint256 aprBps) external onlyOwner {
        require(aprBps <= 5000, "Vault: APR too high");
        fundAprBps[fundId] = aprBps;
        emit FundAprUpdated(fundId, aprBps);
    }

    function fundRoiPool(uint256 amount) external onlyOwner {
        gatToken.safeTransferFrom(msg.sender, address(this), amount);
        emit RoiPoolFunded(amount);
    }

    function invest(uint256 fundId, uint256 amount) external nonReentrant whenNotPaused returns (uint256 positionId) {
        require(amount > 0, "Vault: zero amount");
        require(fundAprBps[fundId] > 0, "Vault: fund not configured");

        uint256 fee = feeRouter.computeFee(GATFeeRouter.FeeType.Investment, amount);
        uint256 net = amount - fee;
        require(net > 0, "Vault: amount too small");

        gatToken.safeTransferFrom(msg.sender, address(this), amount);
        positionId = nextPositionId++;

        if (fee > 0) {
            gatToken.approve(address(feeRouter), fee);
            feeRouter.collectFeeHeld(GATFeeRouter.FeeType.Investment, fee, bytes32(positionId));
        }

        positions[positionId] = Position({
            owner: msg.sender,
            principal: net,
            startedAt: block.timestamp,
            fundId: fundId,
            active: true
        });
        totalPrincipal += net;
        emit Invested(positionId, msg.sender, fundId, net, fee);
    }

    function redeem(uint256 positionId) external nonReentrant whenNotPaused {
        Position storage p = positions[positionId];
        require(p.active && p.owner == msg.sender, "Vault: invalid position");

        uint256 profit = _calcProfit(p.principal, p.startedAt, fundAprBps[p.fundId]);
        uint256 gross = p.principal + profit;
        uint256 fee = feeRouter.computeFee(GATFeeRouter.FeeType.Withdraw, gross);
        uint256 payout = gross - fee;

        p.active = false;
        totalPrincipal -= p.principal;

        if (fee > 0) {
            gatToken.approve(address(feeRouter), fee);
            feeRouter.collectFeeHeld(GATFeeRouter.FeeType.Withdraw, fee, bytes32(positionId));
        }
        gatToken.safeTransfer(msg.sender, payout);
        emit Redeemed(positionId, msg.sender, p.principal, profit, fee);
    }

    function _calcProfit(uint256 principal, uint256 startedAt, uint256 aprBps) internal view returns (uint256) {
        if (aprBps == 0) return 0;
        uint256 elapsed = block.timestamp - startedAt;
        return (principal * aprBps * elapsed) / (365 days * 10000);
    }

    /// @notice When no active positions, return all GAT in the vault (e.g. unused ROI pool).
    function recoverAllGatWhenIdle(address to) external onlyOwner {
        require(to != address(0), "Vault: zero to");
        require(totalPrincipal == 0, "Vault: active positions");
        uint256 bal = gatToken.balanceOf(address(this));
        if (bal == 0) return;
        gatToken.safeTransfer(to, bal);
    }

    /// @notice Return GAT above reserved principal (pause first).
    function sweepExcessGat(address to) external onlyOwner whenPaused {
        require(to != address(0), "Vault: zero to");
        uint256 bal = gatToken.balanceOf(address(this));
        uint256 reserved = totalPrincipal;
        require(bal > reserved, "Vault: no excess");
        gatToken.safeTransfer(to, bal - reserved);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
