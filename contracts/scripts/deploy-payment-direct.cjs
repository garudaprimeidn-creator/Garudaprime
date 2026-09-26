/**
 * Redeploy GarudaPaymentContract v2 (directTransfer) on Sidra.
 * Keeps merchant/marketplace/reward/validator/governance addresses unchanged.
 *
 *   cd contracts && npm run deploy:payment-direct
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

function loadContractsJson() {
  const raw = process.env.PAY_HUB_ONCHAIN_CONTRACTS_JSON?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function main() {
  const existing = loadContractsJson();
  const gat =
    existing?.gatToken
    || process.env.VITE_GAT_TOKEN_ADDRESS?.trim()
    || process.env.GAT_TOKEN_ADDRESS?.trim();
  if (!gat?.startsWith("0x")) {
    throw new Error("Set gatToken in PAY_HUB_ONCHAIN_CONTRACTS_JSON or VITE_GAT_TOKEN_ADDRESS");
  }

  const [deployer] = await hre.ethers.getSigners();
  const relayer =
    process.env.PAY_HUB_RELAYER_ADDRESS?.trim()
    || process.env.PROTOCOL_OWNER_ADDRESS?.trim()
    || deployer.address;

  console.log("Deployer:", deployer.address);
  console.log("Relayer:", relayer);
  console.log("GAT:", gat);
  if (existing?.payment) {
    console.log("Previous payment:", existing.payment);
  }

  const Payment = await hre.ethers.getContractFactory("GarudaPaymentContract");
  const payment = await Payment.deploy(gat, relayer, deployer.address);
  await payment.waitForDeployment();
  const paymentAddr = await payment.getAddress();

  const merged = {
    gatToken: gat,
    payment: paymentAddr,
    merchant: existing?.merchant,
    marketplace: existing?.marketplace,
    reward: existing?.reward,
    validator: existing?.validator,
    governance: existing?.governance,
  };

  const out = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    ...merged,
    relayer,
    admin: deployer.address,
    previousPayment: existing?.payment ?? null,
    deployedAt: new Date().toISOString(),
  };

  const dir = path.join(__dirname, "../deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `payment-direct-${out.chainId}-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));

  console.log("\nGarudaPaymentContract (directTransfer) deployed:");
  console.log("  payment:", paymentAddr);
  console.log("\nUpdate PAY_HUB_ONCHAIN_CONTRACTS_JSON:");
  console.log(JSON.stringify(merged));
  console.log("\nWritten:", file);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
