// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice The slice of Hedera's Asset Tokenization Studio (ATS) security-token diamond that
///         InvoicePrimaryMarket needs.
/// @dev Verified against hashgraph/asset-tokenization-studio
///      (`facets/transferByPartition/ITransferByPartition.sol`,
///       `facets/mintByPartition/IMintByPartition.sol`,
///       `facets/balanceTrackerByPartition/IBalanceTrackerByPartition.sol`,
///       `facets/layer_1/ERC1400/ERC1410/IERC1410Types.sol`).
///
///      ATS bonds are ERC-1400/1410 partitioned securities behind a diamond proxy, NOT plain
///      ERC-20s. Balances live in a partition; the single-partition tokens we mint use
///      DEFAULT_PARTITION. Anything that reads or moves units must go through the *ByPartition
///      calls — a bare ERC-20 `transfer` reverts in multi-partition mode and silently reads the
///      wrong figure elsewhere.
interface IATSBond {
    /// @dev ATS `_DEFAULT_PARTITION` from contracts/constants/values.sol.
    ///      bytes32(uint256(1)) — not zero, which is a common and expensive mistake.
    function DEFAULT_PARTITION() external pure returns (bytes32);

    struct BasicTransferInfo {
        address to;
        uint256 value;
    }

    struct IssueData {
        bytes32 partition;
        address tokenHolder;
        uint256 value;
        bytes data;
    }

    /// @notice Move `info.value` units of `partition` from the caller to `info.to`.
    /// @return The partition the units landed in for the recipient.
    function transferByPartition(bytes32 partition, BasicTransferInfo calldata info, bytes calldata data)
        external
        returns (bytes32);

    /// @notice Mint units into a partition. Issuer/agent role only.
    function issueByPartition(IssueData calldata issueData) external;

    function balanceOfByPartition(bytes32 partition, address tokenHolder) external view returns (uint256);
    function totalSupplyByPartition(bytes32 partition) external view returns (uint256);
    function balanceOf(address tokenHolder) external view returns (uint256);
    function totalSupply() external view returns (uint256);
}
