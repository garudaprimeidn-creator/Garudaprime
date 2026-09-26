/**
 * Deploy GarudaUtilityNFT to Sidra Network.
 *
 *   cd contracts && npm run compile
 *   npm run deploy:utility-nft
 *
 * Set VITE_GARUDA_UTILITY_NFT_ADDRESS after deploy.
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [signer] = await hre.ethers.getSigners();
  if (!signer) throw new Error("Set PROTOCOL_OWNER_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY");

  const Factory = await hre.ethers.getContractFactory("GarudaUtilityNFT");
  const nft = await Factory.deploy();
  await nft.waitForDeployment();
  const address = await nft.getAddress();

  console.log("GarudaUtilityNFT deployed:", address);
  console.log("Owner/minter:", signer.address);
  console.log("");
  console.log("Add to Vercel / .env.local:");
  console.log(`VITE_GARUDA_UTILITY_NFT_ADDRESS=${address}`);

  const out = {
    network: "sidra",
    chainId: Number(process.env.VITE_SIDRA_CHAIN_ID) || 97453,
    deployedAt: new Date().toISOString(),
    deployer: signer.address,
    utilityNft: address,
  };
  const outPath = path.join(__dirname, "../deployments/utility-nft-sidra.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("Saved:", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
