require("@nomicfoundation/hardhat-toolbox");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env.local") });
require("dotenv").config({ path: path.join(__dirname, "../admin/.env.local") });

const deployerKey =
  process.env.PROTOCOL_OWNER_PRIVATE_KEY
  || process.env.DEPLOYER_PRIVATE_KEY
  || process.env.VITE_DEPLOYER_PRIVATE_KEY;

/** Hardhat node account #0, pre-funded on local Garuda testnet */
const HARDHAT_ACCOUNT_0 =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const garudaRpc = process.env.GARUDA_TESTNET_RPC_URL || "http://127.0.0.1:9745";
const isLocalGaruda =
  garudaRpc.includes("127.0.0.1") || garudaRpc.includes("localhost");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris",
    },
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    sidra: {
      url: process.env.VITE_SIDRA_RPC_URL || "https://rpc.sidrachain.com",
      chainId: Number(process.env.VITE_SIDRA_CHAIN_ID) || 97453,
      accounts: deployerKey ? [deployerKey] : [],
    },
    garudaTestnet: {
      url: garudaRpc,
      chainId: Number(process.env.VITE_GARUDA_CHAIN_ID) || 974540,
      accounts: isLocalGaruda ? [HARDHAT_ACCOUNT_0] : deployerKey ? [deployerKey] : [],
    },
    hardhat: {
      chainId: Number(process.env.VITE_GARUDA_CHAIN_ID) || 974540,
    },
  },
};
