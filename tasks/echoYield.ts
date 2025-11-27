import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:vault-address", "Prints deployed EchoYieldVault address").setAction(async (_args: TaskArguments, hre) => {
  const vault = await hre.deployments.get("EchoYieldVault");
  console.log(`EchoYieldVault: ${vault.address}`);
});

task("task:coin-address", "Prints ConfidentialCoin address").setAction(async (_args: TaskArguments, hre) => {
  const coin = await hre.deployments.get("ConfidentialCoin");
  console.log(`ConfidentialCoin: ${coin.address}`);
});

task("task:pending-rewards", "Reads pending COIN rewards for an account")
  .addParam("user", "Account to inspect")
  .setAction(async ({ user }: TaskArguments, hre) => {
    const vault = await hre.deployments.get("EchoYieldVault");
    const contract = await hre.ethers.getContractAt("EchoYieldVault", vault.address);
    const rewards = await contract.pendingRewards(user);
    console.log(`Pending rewards for ${user}: ${rewards.toString()} microCOIN`);
  });

task("task:stake", "Stakes ETH into the EchoYieldVault")
  .addParam("amount", "Amount in ETH")
  .setAction(async ({ amount }: TaskArguments, hre) => {
    const vault = await hre.deployments.get("EchoYieldVault");
    const [signer] = await hre.ethers.getSigners();
    const parsed = hre.ethers.parseEther(amount);
    const contract = await hre.ethers.getContractAt("EchoYieldVault", vault.address);
    const tx = await contract.connect(signer).stake({ value: parsed });
    console.log(`Staking tx: ${tx.hash}`);
    await tx.wait();
  });

task("task:claim", "Claims rewards from the EchoYieldVault").setAction(async (_args: TaskArguments, hre) => {
  const vault = await hre.deployments.get("EchoYieldVault");
  const [signer] = await hre.ethers.getSigners();
  const contract = await hre.ethers.getContractAt("EchoYieldVault", vault.address);
  const tx = await contract.connect(signer).claimRewards();
  console.log(`Claim tx: ${tx.hash}`);
  await tx.wait();
});
