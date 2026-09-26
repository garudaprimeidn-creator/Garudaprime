const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const gatAddress = process.env.VITE_GAT_TOKEN_ADDRESS;
  if (!gatAddress) throw new Error("Set VITE_GAT_TOKEN_ADDRESS in .env.local");

  const Vault = await hre.ethers.getContractFactory("GATBridgeVault");
  const vault = await Vault.deploy(gatAddress);
  await vault.waitForDeployment();

  const address = await vault.getAddress();
  const outDir = path.join(__dirname, "../deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `sidra-bridge-vault-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify({
    network: "sidra",
    contract: "GATBridgeVault",
    address,
    gatToken: gatAddress,
    deployedAt: new Date().toISOString(),
  }, null, 2));

  console.log("\n✓ GATBridgeVault deployed:", address);
  console.log("✓ Saved:", outFile);
  console.log("\nAdd to .env.local:");
  console.log(`VITE_GAT_BRIDGE_VAULT_ADDRESS=${address}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
