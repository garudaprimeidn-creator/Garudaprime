// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title GarudaGovernanceCouncil
 * @notice On-chain proposal tally for Garuda Prime Governance DAO (ADR-005 Phase 4).
 * @dev Vote weight computed off-chain from GAT balance; relayer records immutable tally.
 */
contract GarudaGovernanceCouncil is AccessControl, ReentrancyGuard {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    struct Proposal {
        uint256 yesWeight;
        uint256 noWeight;
        uint64 endTime;
        bool closed;
        string metadataRef;
    }

    mapping(bytes32 => Proposal) public proposals;
    mapping(bytes32 => mapping(address => bool)) public hasVoted;
    mapping(bytes32 => bool) public processedVoteRef;

    uint16 public quorumBps = 500;

    event QuorumUpdated(uint16 quorumBps);
    event ProposalCreated(bytes32 indexed proposalId, uint64 endTime, string metadataRef);
    event VoteRelayed(
        bytes32 indexed proposalId,
        address indexed voter,
        bool support,
        uint256 weight,
        bytes32 refId
    );
    event ProposalClosed(bytes32 indexed proposalId, bool passed, uint256 yesWeight, uint256 noWeight);

    error GarudaZeroAddress();
    error GarudaDuplicateRef(bytes32 refId);
    error GarudaProposalExists(bytes32 proposalId);
    error GarudaProposalMissing(bytes32 proposalId);
    error GarudaProposalClosed(bytes32 proposalId);
    error GarudaAlreadyVoted(bytes32 proposalId, address voter);

    constructor(address relayer, address admin) {
        if (admin == address(0)) revert GarudaZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        if (relayer != address(0)) {
            _grantRole(RELAYER_ROLE, relayer);
        }
    }

    function setQuorumBps(uint16 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(bps <= 10_000, "invalid bps");
        quorumBps = bps;
        emit QuorumUpdated(bps);
    }

    function relayCreateProposal(
        bytes32 proposalId,
        uint64 durationSec,
        string calldata metadataRef
    ) external onlyRole(RELAYER_ROLE) {
        if (proposals[proposalId].endTime != 0) revert GarudaProposalExists(proposalId);
        uint64 endTime = uint64(block.timestamp) + durationSec;
        proposals[proposalId] = Proposal({
            yesWeight: 0,
            noWeight: 0,
            endTime: endTime,
            closed: false,
            metadataRef: metadataRef
        });
        emit ProposalCreated(proposalId, endTime, metadataRef);
    }

    function relayVote(
        bytes32 proposalId,
        address voter,
        bool support,
        uint256 weight,
        bytes32 refId
    ) external onlyRole(RELAYER_ROLE) nonReentrant {
        if (voter == address(0)) revert GarudaZeroAddress();
        Proposal storage p = proposals[proposalId];
        if (p.endTime == 0) revert GarudaProposalMissing(proposalId);
        if (p.closed || block.timestamp > p.endTime) revert GarudaProposalClosed(proposalId);
        if (hasVoted[proposalId][voter]) revert GarudaAlreadyVoted(proposalId, voter);
        if (refId != bytes32(0)) {
            if (processedVoteRef[refId]) revert GarudaDuplicateRef(refId);
            processedVoteRef[refId] = true;
        }
        hasVoted[proposalId][voter] = true;
        if (support) {
            p.yesWeight += weight;
        } else {
            p.noWeight += weight;
        }
        emit VoteRelayed(proposalId, voter, support, weight, refId);
    }

    function relayCloseProposal(
        bytes32 proposalId,
        uint256 totalEligibleWeight
    ) external onlyRole(RELAYER_ROLE) {
        Proposal storage p = proposals[proposalId];
        if (p.endTime == 0) revert GarudaProposalMissing(proposalId);
        if (p.closed) revert GarudaProposalClosed(proposalId);
        p.closed = true;
        uint256 turnout = p.yesWeight + p.noWeight;
        uint256 quorumWeight = (totalEligibleWeight * quorumBps) / 10_000;
        bool quorumMet = turnout >= quorumWeight;
        bool passed = quorumMet && p.yesWeight > p.noWeight;
        emit ProposalClosed(proposalId, passed, p.yesWeight, p.noWeight);
    }
}
