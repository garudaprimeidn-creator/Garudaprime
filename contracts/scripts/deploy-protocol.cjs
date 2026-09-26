const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error("No deployer, set DEPLOYER_PRIVATE_KEY");

  const gatAddress = process.env.VITE_GAT_TOKEN_ADDRESS || process.env.GAT_TOKEN_ADDRESS;
  if (!gatAddress) throw new Error("Set VITE_GAT_TOKEN_ADDRESS before deploying protocol");

  console.log("Deployer:", deployer.address);
  console.log("GAT Token:", gatAddress);

  const Treasury = await hre.ethers.getContractFactory("GATProtocolTreasury");
  const treasury = await Treasury.deploy(gatAddress);
  await treasury.waitForDeployment();
  const treasuryAddress = await treasury.getAddress();
  console.log("✓ GATProtocolTreasury:", treasuryAddress);

  const FeeRouter = await hre.ethers.getContractFactory("GATFeeRouter");
  const feeRouter = await FeeRouter.deploy(gatAddress, treasuryAddress);
  await feeRouter.waitForDeployment();
  const feeRouterAddress = await feeRouter.getAddress();
  console.log("✓ GATFeeRouter:", feeRouterAddress);

  await (await treasury.setFeeCollector(feeRouterAddress, true)).wait();

  const Staking = await hre.ethers.getContractFactory("GATStakingPool");
  const staking = await Staking.deploy(gatAddress, feeRouterAddress);
  await staking.waitForDeployment();
  const stakingAddress = await staking.getAddress();
  console.log("✓ GATStakingPool:", stakingAddress);

  const Vault = await hre.ethers.getContractFactory("GATInvestmentVault");
  const vault = await Vault.deploy(gatAddress, feeRouterAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("✓ GATInvestmentVault:", vaultAddress);

  await (await feeRouter.setOperator(stakingAddress, true)).wait();
  await (await feeRouter.setOperator(vaultAddress, true)).wait();

  const network = await hre.ethers.provider.getNetwork();
  const deployment = {
    network: network.name,
    chainId: Number(network.chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    gatToken: gatAddress,
    contracts: {
      treasury: treasuryAddress,
      feeRouter: feeRouterAddress,
      stakingPool: stakingAddress,
      investmentVault: vaultAddress,
    },
  };

  const outDir = path.join(__dirname, "../deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `protocol-${Number(network.chainId)}-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));

  console.log("\n✓ Saved:", outFile);
  console.log("\nAdd to .env.local:");
  console.log(`VITE_GAT_TREASURY_ADDRESS=${treasuryAddress}`);
  console.log(`VITE_GAT_FEE_ROUTER_ADDRESS=${feeRouterAddress}`);
  console.log(`VITE_GAT_STAKING_POOL_ADDRESS=${stakingAddress}`);
  console.log(`VITE_GAT_INVESTMENT_VAULT_ADDRESS=${vaultAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
