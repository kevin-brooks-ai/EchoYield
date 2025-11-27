// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {ERC7984} from "confidential-contracts-v91/contracts/token/ERC7984/ERC7984.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ConfidentialCoin
/// @notice Encrypted reward token minted by the EchoYield vault.
contract ConfidentialCoin is ERC7984, ZamaEthereumConfig, Ownable {
    address public minter;

    error UnauthorizedMinter(address caller);

    constructor() ERC7984("EchoYield COIN", "COIN", "") Ownable(msg.sender) {}

    /// @notice Sets the address allowed to mint confidential COIN rewards.
    function setMinter(address newMinter) external onlyOwner {
        minter = newMinter;
    }

    /// @notice Mints encrypted COIN rewards to the provided address.
    function mintEncrypted(address to, euint64 encryptedAmount) external returns (euint64 mintedAmount) {
        if (msg.sender != minter) {
            revert UnauthorizedMinter(msg.sender);
        }

        mintedAmount = _mint(to, encryptedAmount);
    }
}
