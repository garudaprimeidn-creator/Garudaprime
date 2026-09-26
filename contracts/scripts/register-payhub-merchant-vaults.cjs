/**
 * Register merchant vault addresses on GarudaMerchantContract + GarudaMarketplaceContract.
 *   PAYHUB_DEPLOYMENT=contracts/deployments/payhub-onchain-97453-*.json \
 *   npm run register:payhub-vaults --network sidra
 *
 * Env:
 *   PAY_HUB_DEFAULT_MERCHANT_ID=GP-MRT-2847
 *   PAY_HUB_DEFAULT_MERCHANT_VAULT=0x... (embedded owner or backing EOA)
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const deploymentGlob = process.env.PAYHUB_DEPLOYMENT?.trim();
  const deploymentsDir = path.join(__dirname, "../deployments");
  let deploymentPath = deploymentGlob;
  if (!deploymentPath) {
    const files = fs.readdirSync(deploymentsDir)
      .filter((f) => f.startsWith("payhub-onchain-97453"))
      .sort();
    deploymentPath = path.join(deploymentsDir, files[files.length - 1]);
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  const merchantIdStr =
    process.env.PAY_HUB_DEFAULT_MERCHANT_ID?.trim()
    || process.env.VITE_PAY_HUB_MERCHANT_ID?.trim()
    || "GP-MRT-2847";
  const vault =
    process.env.PAY_HUB_DEFAULT_MERCHANT_VAULT?.trim()
    || process.env.VITE_PAY_HUB_BACKING_ADDRESS?.trim()
    || process.env.PROTOCOL_OWNER_ADDRESS?.trim();
  if (!vault?.startsWith("0x")) throw new Error("Set PAY_HUB_DEFAULT_MERCHANT_VAULT or VITE_PAY_HUB_BACKING_ADDRESS");

  const merchantId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(merchantIdStr));
  const [signer] = await hre.ethers.getSigners();

  const merchant = await hre.ethers.getContractAt(
    "GarudaMerchantContract",
    deployment.merchant,
    signer,
  );
  const marketplace = await hre.ethers.getContractAt(
    "GarudaMarketplaceContract",
    deployment.marketplace,
    signer,
  );

  console.log("Deployment:", deploymentPath);
  console.log("Merchant ID:", merchantIdStr, "→", merchantId);
  console.log("Vault:", vault);

  const tx1 = await merchant.setMerchantVault(merchantId, vault);
  await tx1.wait();
  const tx2 = await marketplace.setMerchantVault(merchantId, vault);
  await tx2.wait();

  console.log("✓ Merchant + marketplace vault registered");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
