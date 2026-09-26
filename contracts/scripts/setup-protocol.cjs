/**
 * Setup GAT Protocol, set fund APR + fund ROI & staking reward pools
 *
 * Usage:
 *   cd contracts
 *   npm run setup:protocol
 *
 * Optional env (.env.local):
 *   PROTOCOL_ROI_POOL_GAT=10000     , GAT untuk Investment Vault ROI pool
 *   PROTOCOL_STAKING_REWARDS_GAT=5000, GAT untuk Staking Pool rewards
 *   PROTOCOL_SKIP_APR=true          , lewati setFundApr (jika sudah diset)
 *   PROTOCOL_SKIP_FUND=true         , lewati fundRoiPool & fundRewards
 */
const hre = require("hardhat");

/** fundId → APR bps (10000 = 100%). Sinkron dengan src/app/investData.ts */
const DEFAULT_FUND_APR_BPS = {
  1: 1250, // Mudharabah Fund Alpha 12.5%
  2: 1580, // Green Agriculture Musyarakah 15.8%
  3: 1020, // UMKM Halal Marketplace 10.2%
  4: 850,  // Property Sukuk Fund 8.5%
};

async function main() {
  const [signer] = await hre.ethers.getSigners();
  if (!signer) throw new Error("No signer, set PROTOCOL_OWNER_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY in .env.local");

  const gatAddress = process.env.VITE_GAT_TOKEN_ADDRESS;
  const vaultAddress = process.env.VITE_GAT_INVESTMENT_VAULT_ADDRESS;
  const stakingAddress = process.env.VITE_GAT_STAKING_POOL_ADDRESS;

  if (!gatAddress || !vaultAddress || !stakingAddress) {
    throw new Error("Set VITE_GAT_TOKEN_ADDRESS, VITE_GAT_INVESTMENT_VAULT_ADDRESS, VITE_GAT_STAKING_POOL_ADDRESS in .env.local");
  }

  const roiPoolGat = process.env.PROTOCOL_ROI_POOL_GAT || "10000";
  const stakingRewardsGat = process.env.PROTOCOL_STAKING_REWARDS_GAT || "5000";
  const skipApr = process.env.PROTOCOL_SKIP_APR === "true";
  const skipFund = process.env.PROTOCOL_SKIP_FUND === "true";

  console.log("Owner wallet:", signer.address);
  console.log("GAT Token:   ", gatAddress);
  console.log("Vault:       ", vaultAddress);
  console.log("Staking Pool:", stakingAddress);
  console.log("");

  const gat = await hre.ethers.getContractAt("GATToken", gatAddress);
  const vault = await hre.ethers.getContractAt("GATInvestmentVault", vaultAddress);
  const staking = await hre.ethers.getContractAt("GATStakingPool", stakingAddress);

  const ownerBalance = await gat.balanceOf(signer.address);
  console.log("Owner GAT balance:", hre.ethers.formatUnits(ownerBalance, 18), "GAT");

  if (!skipApr) {
    console.log("\n── Step 1: Set Fund APR ──");
    for (const [fundId, aprBps] of Object.entries(DEFAULT_FUND_APR_BPS)) {
      const current = await vault.fundAprBps(fundId);
      if (current > 0n) {
        console.log(`  Fund ${fundId}: already ${Number(current)} bps, skipping (unset with PROTOCOL_FORCE_APR=true)`);
        if (process.env.PROTOCOL_FORCE_APR !== "true") continue;
      }
      const tx = await vault.setFundApr(fundId, aprBps);
      await tx.wait();
      console.log(`  ✓ Fund ${fundId} → ${aprBps} bps (${(aprBps / 100).toFixed(2)}% APR)`);
    }
  } else {
    console.log("\n── Step 1: Set Fund APR, SKIPPED (PROTOCOL_SKIP_APR=true) ──");
  }

  if (!skipFund) {
    const roiAmount = hre.ethers.parseUnits(roiPoolGat, 18);
    const stakeAmount = hre.ethers.parseUnits(stakingRewardsGat, 18);
    const totalNeeded = roiAmount + stakeAmount;

    if (ownerBalance < totalNeeded) {
      console.error(`\n❌ Saldo owner tidak cukup. Butuh ${roiPoolGat} + ${stakingRewardsGat} = ${Number(roiPoolGat) + Number(stakingRewardsGat)} GAT`);
      console.error("   Transfer GAT ke owner wallet atau mint via: npm run mint:sidra");
      process.exit(1);
    }

    console.log("\n── Step 2: Fund Investment Vault ROI Pool ──");
    let tx = await gat.approve(vaultAddress, roiAmount);
    await tx.wait();
    tx = await vault.fundRoiPool(roiAmount);
    await tx.wait();
    console.log(`  ✓ fundRoiPool(${roiPoolGat} GAT)`);

    console.log("\n── Step 3: Fund Staking Pool Rewards ──");
    tx = await gat.approve(stakingAddress, stakeAmount);
    await tx.wait();
    tx = await staking.fundRewards(stakeAmount);
    await tx.wait();
    console.log(`  ✓ fundRewards(${stakingRewardsGat} GAT)`);
  } else {
    console.log("\n── Step 2 & 3: Fund pools, SKIPPED (PROTOCOL_SKIP_FUND=true) ──");
  }

  console.log("\n── Verification ──");
  for (const fundId of Object.keys(DEFAULT_FUND_APR_BPS)) {
    const apr = await vault.fundAprBps(fundId);
    console.log(`  Fund ${fundId} APR: ${Number(apr)} bps`);
  }
  const vaultBal = await gat.balanceOf(vaultAddress);
  const stakeBal = await gat.balanceOf(stakingAddress);
  console.log(`  Vault GAT balance:  ${hre.ethers.formatUnits(vaultBal, 18)} GAT`);
  console.log(`  Staking GAT balance: ${hre.ethers.formatUnits(stakeBal, 18)} GAT`);
  console.log("\n✓ Protocol setup complete. Users can now invest & stake on-chain.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
