/**
 * Deploy Garuda Pay Hub on-chain contracts (Sidra).
 *   cd contracts && npm run deploy:payhub-onchain
 *
 * Writes deployments/payhub-onchain-<chainId>-<ts>.json
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const gat =
    process.env.VITE_GAT_TOKEN_ADDRESS?.trim()
    || process.env.GAT_TOKEN_ADDRESS?.trim();
  if (!gat?.startsWith("0x")) {
    throw new Error("Set VITE_GAT_TOKEN_ADDRESS before deploy");
  }

  const [deployer] = await hre.ethers.getSigners();
  const relayer =
    process.env.PAY_HUB_RELAYER_ADDRESS?.trim()
    || process.env.PROTOCOL_OWNER_ADDRESS?.trim()
    || deployer.address;

  console.log("Deployer:", deployer.address);
  console.log("Relayer:", relayer);
  console.log("GAT:", gat);

  const Payment = await hre.ethers.getContractFactory("GarudaPaymentContract");
  const payment = await Payment.deploy(gat, relayer, deployer.address);
  await payment.waitForDeployment();

  const Merchant = await hre.ethers.getContractFactory("GarudaMerchantContract");
  const merchant = await Merchant.deploy(gat, relayer, deployer.address);
  await merchant.waitForDeployment();

  const Marketplace = await hre.ethers.getContractFactory("GarudaMarketplaceContract");
  const marketplace = await Marketplace.deploy(gat, relayer, deployer.address);
  await marketplace.waitForDeployment();

  const Reward = await hre.ethers.getContractFactory("GarudaRewardContract");
  const reward = await Reward.deploy(gat, relayer, deployer.address);
  await reward.waitForDeployment();

  const out = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    gatToken: gat,
    relayer,
    admin: deployer.address,
    payment: await payment.getAddress(),
    merchant: await merchant.getAddress(),
    marketplace: await marketplace.getAddress(),
    reward: await reward.getAddress(),
    deployedAt: new Date().toISOString(),
  };

  const dir = path.join(__dirname, "../deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `payhub-onchain-${out.chainId}-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));

  console.log("\nPay Hub on-chain contracts deployed:");
  console.log(JSON.stringify(out, null, 2));
  console.log("\nSet Vercel env PAY_HUB_ONCHAIN_CONTRACTS_JSON:");
  console.log(JSON.stringify({
    gatToken: out.gatToken,
    payment: out.payment,
    merchant: out.merchant,
    marketplace: out.marketplace,
    reward: out.reward,
  }));
  console.log("\nWritten:", file);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
