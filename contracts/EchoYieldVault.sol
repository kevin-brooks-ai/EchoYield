// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ConfidentialCoin} from "./ConfidentialCoin.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {FHE, euint128, euint64} from "@fhevm/solidity/lib/FHE.sol";

/// @title EchoYieldVault
/// @notice Accepts ETH deposits, tracks encrypted stake balances, and mints COIN rewards.
contract EchoYieldVault is ZamaEthereumConfig, Ownable, ReentrancyGuard {
    struct StakePosition {
        uint256 amount;
        uint256 pendingRewards;
        uint64 lastUpdate;
    }

    uint256 public constant REWARD_PER_ETH_PER_DAY = 10_000 * 1e6;
    uint256 private constant SECONDS_PER_DAY = 1 days;

    ConfidentialCoin public immutable rewardToken;
    uint256 public totalStaked;

    mapping(address => StakePosition) private _stakes;
    mapping(address => euint128) private _encryptedStake;

    event Staked(address indexed account, uint256 amount, euint128 encryptedBalance);
    event Withdrawn(address indexed account, uint256 amount, euint128 encryptedBalance);
    event RewardsClaimed(address indexed account, uint256 rewardAmount);

    error InvalidAmount();
    error InsufficientStake();
    error NothingToClaim();

    constructor(ConfidentialCoin coin) Ownable(msg.sender) {
        rewardToken = coin;
    }

    /// @notice Stakes ETH into the vault and updates the encrypted stake balance.
    function stake() external payable nonReentrant {
        if (msg.value == 0 || msg.value > type(uint128).max) {
            revert InvalidAmount();
        }

        _updateRewards(msg.sender);

        StakePosition storage position = _stakes[msg.sender];
        position.amount += msg.value;
        totalStaked += msg.value;

        euint128 updatedBalance = FHE.add(_encryptedStake[msg.sender], FHE.asEuint128(uint128(msg.value)));
        FHE.allowThis(updatedBalance);
        FHE.allow(updatedBalance, msg.sender);
        _encryptedStake[msg.sender] = updatedBalance;

        emit Staked(msg.sender, msg.value, updatedBalance);
    }

    /// @notice Withdraws previously staked ETH.
    function withdraw(uint256 amount) external nonReentrant {
        StakePosition storage position = _stakes[msg.sender];

        if (amount == 0 || amount > position.amount) {
            revert InsufficientStake();
        }

        _updateRewards(msg.sender);
        position.amount -= amount;
        totalStaked -= amount;

        euint128 updatedBalance = FHE.sub(_encryptedStake[msg.sender], FHE.asEuint128(uint128(amount)));
        FHE.allowThis(updatedBalance);
        FHE.allow(updatedBalance, msg.sender);
        _encryptedStake[msg.sender] = updatedBalance;

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "ETH transfer failed");

        emit Withdrawn(msg.sender, amount, updatedBalance);
    }

    /// @notice Claims accumulated COIN rewards for the caller.
    function claimRewards() external nonReentrant {
        _updateRewards(msg.sender);

        StakePosition storage position = _stakes[msg.sender];
        uint256 rewards = position.pendingRewards;

        if (rewards == 0) {
            revert NothingToClaim();
        }

        position.pendingRewards = 0;

        if (rewards > type(uint64).max) {
            revert InvalidAmount();
        }

        euint64 encryptedReward = FHE.asEuint64(uint64(rewards));
        FHE.allow(encryptedReward, address(rewardToken));
        FHE.allowThis(encryptedReward);

        rewardToken.mintEncrypted(msg.sender, encryptedReward);

        emit RewardsClaimed(msg.sender, rewards);
    }

    /// @notice Returns the encrypted stake handle for the requested account.
    function getEncryptedStake(address account) external view returns (euint128) {
        return _encryptedStake[account];
    }

    /// @notice Returns the clear staked amount in wei.
    function stakedBalance(address account) external view returns (uint256) {
        return _stakes[account].amount;
    }

    /// @notice Returns the pending COIN rewards for the provided account.
    function pendingRewards(address account) external view returns (uint256) {
        return _previewRewards(account);
    }

    /// @notice Internal reward calculator that includes up-to-date accruals.
    function _previewRewards(address account) internal view returns (uint256) {
        StakePosition storage position = _stakes[account];
        uint256 pending = position.pendingRewards;

        if (position.amount == 0 || position.lastUpdate == 0) {
            return pending;
        }

        uint256 elapsed = block.timestamp - position.lastUpdate;
        if (elapsed == 0) {
            return pending;
        }

        return pending + ((position.amount * REWARD_PER_ETH_PER_DAY * elapsed) / (1 ether * SECONDS_PER_DAY));
    }

    function _updateRewards(address account) private {
        StakePosition storage position = _stakes[account];

        if (position.lastUpdate == 0) {
            position.lastUpdate = uint64(block.timestamp);
            return;
        }

        if (position.amount > 0) {
            uint256 elapsed = block.timestamp - position.lastUpdate;
            if (elapsed > 0) {
                position.pendingRewards +=
                    (position.amount * REWARD_PER_ETH_PER_DAY * elapsed) /
                    (1 ether * SECONDS_PER_DAY);
            }
        }

        position.lastUpdate = uint64(block.timestamp);
    }
}
