// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Garuda Utility NFT
 * @notice Soulbound utility credentials on Sidra, membership, KYC, invest, stake, achievement, validator.
 */
contract GarudaUtilityNFT is ERC721, ERC721URIStorage, Ownable, ReentrancyGuard {
    uint256 private _nextTokenId;

    mapping(address => bool) public minters;
    mapping(uint256 => uint8) public tokenCategory;
    mapping(uint256 => uint256) public tokenIssuedAt;
    mapping(uint256 => bool) public tokenSoulbound;

    event UtilityMinted(
        address indexed to,
        uint256 indexed tokenId,
        uint8 category,
        string tokenURI,
        bool soulbound
    );
    event MinterUpdated(address indexed account, bool allowed);

    modifier onlyMinter() {
        require(minters[msg.sender] || msg.sender == owner(), "UtilityNFT: not minter");
        _;
    }

    constructor() ERC721("Garuda Prime Utility NFT", "GPUNFT") Ownable(msg.sender) {
        minters[msg.sender] = true;
    }

    function setMinter(address account, bool allowed) external onlyOwner {
        minters[account] = allowed;
        emit MinterUpdated(account, allowed);
    }

    function mintUtility(
        address to,
        uint8 category,
        string calldata uri,
        bool soulbound
    ) external nonReentrant onlyMinter returns (uint256 tokenId) {
        require(to != address(0), "UtilityNFT: zero to");
        require(category > 0, "UtilityNFT: invalid category");
        tokenId = ++_nextTokenId;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        tokenCategory[tokenId] = category;
        tokenIssuedAt[tokenId] = block.timestamp;
        tokenSoulbound[tokenId] = soulbound;
        emit UtilityMinted(to, tokenId, category, uri, soulbound);
    }

    function tokensOfOwner(address owner) external view returns (uint256[] memory ids) {
        uint256 balance = balanceOf(owner);
        ids = new uint256[](balance);
        uint256 index;
        for (uint256 i = 1; i <= _nextTokenId; i++) {
            if (_ownerOf(i) == owner) {
                ids[index++] = i;
            }
        }
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0) && tokenSoulbound[tokenId]) {
            revert("UtilityNFT: soulbound");
        }
        return super._update(to, tokenId, auth);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
