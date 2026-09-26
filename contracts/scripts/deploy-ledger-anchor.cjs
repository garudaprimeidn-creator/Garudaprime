/**
 * Deploy PayHubLedgerAnchor on Sidra.
 *   cd contracts && npm run deploy:ledger-anchor
 *
 * Set in .env.local:
 *   VITE_PAY_HUB_LEDGER_ANCHOR_ADDRESS=0x...
 */
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const Factory = await hre.ethers.getContractFactory("PayHubLedgerAnchor");
  const anchor = await Factory.deploy();
  await anchor.waitForDeployment();
  const address = await anchor.getAddress();

  console.log("\n✓ PayHubLedgerAnchor:", address);
  console.log("\nAdd to .env.local:");
  console.log(`VITE_PAY_HUB_LEDGER_ANCHOR_ADDRESS=${address}`);
  console.log(`PAY_HUB_LEDGER_ANCHOR_ADDRESS=${address}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
