const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/** Hardhat account #0, used when bootstrapping local Garuda testnet node */
const HARDHAT_ACCOUNT_0 =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function main() {
  const network = await hre.ethers.provider.getNetwork();
  if (Number(network.chainId) !== 974540) {
    throw new Error(`Expected chainId 974540, got ${network.chainId}`);
  }

  const [signer] = await hre.ethers.getSigners();
  const deployer = signer ?? new hre.ethers.Wallet(HARDHAT_ACCOUNT_0, hre.ethers.provider);
  console.log("Bootstrap deployer:", deployer.address);

  const treasury = process.env.GAT_TREASURY_ADDRESS || deployer.address;
  const initialSupply = hre.ethers.parseUnits(process.env.GAT_INITIAL_SUPPLY || "100000000", 18);
  const maxSupply = hre.ethers.parseUnits(process.env.GAT_MAX_SUPPLY || "100000000", 18);

  const GATToken = await hre.ethers.getContractFactory("GATToken", deployer);
  const gat = await GATToken.deploy(treasury, initialSupply, maxSupply);
  await gat.waitForDeployment();
  const gatAddress = await gat.getAddress();
  console.log("✓ GATToken:", gatAddress);

  const Vault = await hre.ethers.getContractFactory("GATBridgeVault", deployer);
  const vault = await Vault.deploy(gatAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("✓ GATBridgeVault:", vaultAddress);

  const deployment = {
    network: "garudaTestnet",
    chainId: 974540,
    rpcUrl: process.env.GARUDA_TESTNET_RPC_URL || "http://127.0.0.1:9745",
    contracts: {
      GATToken: gatAddress,
      GATBridgeVault: vaultAddress,
    },
    deployer: deployer.address,
    treasury,
    deployedAt: new Date().toISOString(),
  };

  const outDir = path.join(__dirname, "../deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "garuda-testnet-latest.json");
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));
  console.log("✓ Saved:", outFile);

  console.log("\nAdd to .env.local:");
  console.log("VITE_GARUDA_CHAIN_ID=974540");
  console.log("VITE_GARUDA_CHAIN_STATUS=testnet");
  console.log(`VITE_GARUDA_CHAIN_RPC_URL=${deployment.rpcUrl}`);
  console.log(`VITE_GARUDA_TESTNET_GAT_ADDRESS=${gatAddress}`);
  console.log(`VITE_GARUDA_TESTNET_BRIDGE_VAULT=${vaultAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
