// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PayHubLedgerAnchor
 * @notice On-chain audit anchor for Firestore pay_ledgers snapshot hashes (Fase 3).
 *         Terpisah dari GATProtocolTreasury, tidak mengubah kontrak treasury yang sudah deploy.
 */
contract PayHubLedgerAnchor is Ownable {
    struct AnchorRecord {
        bytes32 snapshotHash;
        uint256 ledgerCount;
        /// @dev total GAT liability × 1e6 (matches off-chain JSON rounding)
        uint256 totalLedgerGatMicro;
        uint40 anchoredAt;
    }

    AnchorRecord public latest;
    uint256 public anchorCount;

    event PayHubAnchored(
        bytes32 indexed snapshotHash,
        uint256 ledgerCount,
        uint256 totalLedgerGatMicro,
        uint256 anchorIndex
    );

    constructor() Ownable(msg.sender) {}

    /**
     * @param snapshotHash keccak256 canonical JSON snapshot (0x-prefixed bytes32)
     * @param ledgerCount number of pay_ledgers accounts
     * @param totalLedgerGatMicro total liability GAT × 1e6
     */
    function anchorPayHubLedger(
        bytes32 snapshotHash,
        uint256 ledgerCount,
        uint256 totalLedgerGatMicro
    ) external onlyOwner {
        require(snapshotHash != bytes32(0), "Anchor: zero hash");

        anchorCount += 1;
        latest = AnchorRecord({
            snapshotHash: snapshotHash,
            ledgerCount: ledgerCount,
            totalLedgerGatMicro: totalLedgerGatMicro,
            anchoredAt: uint40(block.timestamp)
        });

        emit PayHubAnchored(snapshotHash, ledgerCount, totalLedgerGatMicro, anchorCount);
    }
}
