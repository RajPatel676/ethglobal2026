// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IATSBond} from "../../src/interfaces/IATSBond.sol";

/// @notice Stand-in for HTS USDC's ERC-20 facade. 6 decimals, like the real 0.0.429274.
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice Minimal ATS ERC-1410 partitioned bond. Enough to prove the market moves units through
///         the partition API and not a bare ERC-20 transfer.
contract MockATSBond is IATSBond {
    bytes32 public constant PARTITION = bytes32(uint256(1)); // ATS _DEFAULT_PARTITION

    mapping(bytes32 => mapping(address => uint256)) public balances;
    mapping(bytes32 => uint256) public partitionSupply;
    uint256 public override totalSupply;

    /// @dev Set true to emulate an unassociated recipient — ATS reverts rather than silently
    ///      crediting nobody.
    mapping(address => bool) public blocked;

    error InsufficientPartitionBalance(address from, uint256 have, uint256 want);
    error RecipientNotAssociated(address to);

    function DEFAULT_PARTITION() external pure returns (bytes32) {
        return PARTITION;
    }

    function setBlocked(address who, bool v) external {
        blocked[who] = v;
    }

    function issueByPartition(IssueData calldata d) external {
        balances[d.partition][d.tokenHolder] += d.value;
        partitionSupply[d.partition] += d.value;
        totalSupply += d.value;
    }

    function transferByPartition(bytes32 p, BasicTransferInfo calldata info, bytes calldata)
        external
        returns (bytes32)
    {
        if (blocked[info.to]) revert RecipientNotAssociated(info.to);
        uint256 bal = balances[p][msg.sender];
        if (bal < info.value) revert InsufficientPartitionBalance(msg.sender, bal, info.value);
        balances[p][msg.sender] = bal - info.value;
        balances[p][info.to] += info.value;
        return p;
    }

    function balanceOfByPartition(bytes32 p, address who) external view returns (uint256) {
        return balances[p][who];
    }

    function totalSupplyByPartition(bytes32 p) external view returns (uint256) {
        return partitionSupply[p];
    }

    function balanceOf(address who) external view returns (uint256) {
        return balances[PARTITION][who];
    }
}

/// @notice Stands in for the Hedera Token Service system contract at 0x167.
/// @dev Etched into place by the tests. Returns SUCCESS (22) so `HTS.associate` proceeds; a
///      forge test would otherwise revert in the constructor because address(0x167) has no code.
contract MockHTS {
    int64 public constant SUCCESS = 22;

    mapping(address => mapping(address => bool)) public associated; // slot 0
    /// @dev Slot 1. `vm.etch` copies runtime code but NOT storage, so a freshly etched mock has
    ///      this at 0 — hence 0 means SUCCESS. Tests force a failure with
    ///      `vm.store(HTS.PRECOMPILE, bytes32(uint256(1)), bytes32(uint256(code)))`.
    int64 public overrideResponse; // slot 1

    function response() public view returns (int64) {
        return overrideResponse == 0 ? SUCCESS : overrideResponse;
    }

    function setResponse(int64 code) external {
        overrideResponse = code;
    }

    function associateToken(address account, address token) external returns (int64) {
        int64 code = response();
        if (code == SUCCESS) associated[account][token] = true;
        return code;
    }

    function dissociateToken(address, address) external view returns (int64) {
        return response();
    }

    function isAssociated(address account, address token) external view returns (bool) {
        return associated[account][token];
    }

    function transferToken(address, address, address, int64) external view returns (int64) {
        return response();
    }
}
