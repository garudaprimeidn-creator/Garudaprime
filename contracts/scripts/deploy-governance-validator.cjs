/**
 * Deploy Garuda Validator Registry + Governance Council (Sidra).
 *   cd contracts && npm run deploy:governance-validator
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const relayer =
    process.env.PAY_HUB_RELAYER_ADDRESS?.trim()
    || process.env.PROTOCOL_OWNER_ADDRESS?.trim()
    || deployer.address;

  const minStakeSda = BigInt(
    Math.floor(Number(process.env.VALIDATOR_MIN_STAKE_SDA ?? "1000") * 1e18),
  );

  console.log("Deployer:", deployer.address);
  console.log("Relayer:", relayer);
  console.log("Min stake SDA (wei):", minStakeSda.toString());

  const Validator = await hre.ethers.getContractFactory("GarudaValidatorRegistry");
  const validator = await Validator.deploy(relayer, deployer.address, minStakeSda);
  await validator.waitForDeployment();

  const Governance = await hre.ethers.getContractFactory("GarudaGovernanceCouncil");
  const governance = await Governance.deploy(relayer, deployer.address);
  await governance.waitForDeployment();

  const out = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    relayer,
    admin: deployer.address,
    validator: await validator.getAddress(),
    governance: await governance.getAddress(),
    minStakeSda: minStakeSda.toString(),
    deployedAt: new Date().toISOString(),
  };

  const dir = path.join(__dirname, "../deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `governance-validator-${out.chainId}-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));

  const existingJson = process.env.PAY_HUB_ONCHAIN_CONTRACTS_JSON?.trim();
  let merged = {};
  if (existingJson) {
    try {
      merged = JSON.parse(existingJson);
    } catch {
      merged = {};
    }
  }
  const envContracts = {
    ...merged,
    validator: out.validator,
    governance: out.governance,
  };

  console.log("\nValidator + Governance deployed:");
  console.log(JSON.stringify(out, null, 2));
  console.log("\nMerge into PAY_HUB_ONCHAIN_CONTRACTS_JSON:");
  console.log(JSON.stringify(envContracts, null, 2));
  console.log("\nWritten:", file);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
