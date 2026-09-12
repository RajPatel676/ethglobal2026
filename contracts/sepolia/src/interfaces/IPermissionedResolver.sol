// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Minimal surface of the ENSv2 PermissionedResolver (per-record roles).
interface IPermissionedResolver {
    function setText(bytes32 node, string calldata key, string calldata value) external;
    function setAddr(bytes32 node, uint256 coinType, bytes calldata a) external;
    function text(bytes32 node, string calldata key) external view returns (string memory);
    /// @dev `name` is DNS-encoded (ENSIP-10). Grants/revokes the setter role for one text key.
    function authorizeTextRoles(bytes calldata name, string calldata key, address account, bool authorized)
        external;
    /// @dev Grants/revokes a whole role bitmap on a name's resource. DNS-encoded "" (0x00) == root,
    ///      which is how the deploy scripts give VerificationConsumer tree-wide setter rights.
    function authorizeNameRoles(bytes calldata name, uint256 roleBitmap, address account, bool grant)
        external
        returns (bool);
    function hasRoles(uint256 resource, uint256 roleBitmap, address account) external view returns (bool);
    function authorizeAddrRoles(bytes calldata name, uint256 coinType, address account, bool authorized)
        external;
}
