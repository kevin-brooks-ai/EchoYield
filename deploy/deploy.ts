import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const coinDeployment = await deploy("ConfidentialCoin", {
    from: deployer,
    log: true,
  });

  const vaultDeployment = await deploy("EchoYieldVault", {
    from: deployer,
    log: true,
    args: [coinDeployment.address],
  });

  const coin = await hre.ethers.getContractAt("ConfidentialCoin", coinDeployment.address);
  const currentMinter = await coin.minter();

  if (currentMinter !== vaultDeployment.address) {
    const tx = await coin.setMinter(vaultDeployment.address);
    await tx.wait();
    console.log(`Updated ConfidentialCoin minter to EchoYieldVault`);
  }

  console.log(`ConfidentialCoin: ${coinDeployment.address}`);
  console.log(`EchoYieldVault: ${vaultDeployment.address}`);
};
export default func;
func.id = "deploy_echo_yield";
func.tags = ["EchoYield"];
