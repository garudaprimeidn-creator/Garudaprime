const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer account, set DEPLOYER_PRIVATE_KEY in .env.local");
  }

  const treasury = process.env.GAT_TREASURY_ADDRESS || deployer.address;
  const initialSupply = hre.ethers.parseUnits(
    process.env.GAT_INITIAL_SUPPLY || "100000000",
    18,
  );
  const maxSupply = hre.ethers.parseUnits(
    process.env.GAT_MAX_SUPPLY || "100000000",
    18,
  );

  console.log("Deployer:", deployer.address);
  console.log("Treasury:", treasury);
  console.log("Initial supply:", hre.ethers.formatUnits(initialSupply, 18), "GAT");
  console.log("Max supply:", hre.ethers.formatUnits(maxSupply, 18), "GAT");

  const GATToken = await hre.ethers.getContractFactory("GATToken");
  const gat = await GATToken.deploy(treasury, initialSupply, maxSupply);
  await gat.waitForDeployment();

  const address = await gat.getAddress();
  const network = await hre.ethers.provider.getNetwork();

  const deployment = {
    network: "sidra",
    chainId: Number(network.chainId),
    contract: "GATToken",
    address,
    deployer: deployer.address,
    treasury,
    initialSupply: initialSupply.toString(),
    maxSupply: maxSupply.toString(),
    deployedAt: new Date().toISOString(),
  };

  const outDir = path.join(__dirname, "../deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `sidra-gat-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));

  console.log("\n✓ GATToken deployed:", address);
  console.log("✓ Saved:", outFile);
  console.log("\nAdd to .env.local:");
  console.log(`VITE_GAT_TOKEN_ADDRESS=${address}`);
  console.log("VITE_GAT_TOKEN_DECIMALS=18");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
