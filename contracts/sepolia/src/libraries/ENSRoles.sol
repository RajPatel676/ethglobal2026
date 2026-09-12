// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Role bitmaps from ensdomains/namechain EnhancedAccessControl. Admin variant = role << 128.
/// @dev Verified against namechain `RegistryRolesLib` / `PermissionedResolverLib` / `EACBaseRolesLib`.
///      EAC packs one role per NYBBLE (4 bits), not one per bit: role N lives at bit 4*N.
library ENSRoles {
    // registry — RegistryRolesLib
    uint256 internal constant ROLE_REGISTRAR = 1 << 0; // nybble 0
    uint256 internal constant ROLE_REGISTER_RESERVED = 1 << 4; // nybble 1
    uint256 internal constant ROLE_SET_PARENT = 1 << 8; // nybble 2
    uint256 internal constant ROLE_UNREGISTER = 1 << 12; // nybble 3
    uint256 internal constant ROLE_RENEW = 1 << 16; // nybble 4
    uint256 internal constant ROLE_SET_SUBREGISTRY = 1 << 20; // nybble 5
    uint256 internal constant ROLE_SET_RESOLVER = 1 << 24; // nybble 6
    uint256 internal constant ROLE_CAN_TRANSFER_ADMIN = (1 << 28) << 128;
    uint256 internal constant ADMIN_SHIFT = 128;

    // resolver — PermissionedResolverLib
    uint256 internal constant ROLE_SET_ADDR = 1 << 0;
    uint256 internal constant ROLE_SET_TEXT = 1 << 4;
    uint256 internal constant ROLE_SET_CONTENTHASH = 1 << 8;
    uint256 internal constant ROLE_SET_ALIAS = 1 << 28;

    /// @dev EACBaseRolesLib.ALL_ROLES — bit 0 of every nybble. NOT type(uint256).max:
    ///      EnhancedAccessControl._checkRoleBitmap reverts EACInvalidRoleBitmap on any bit
    ///      outside this mask, so type(uint256).max would revert every grant.
    uint256 internal constant ALL_ROLES = 0x1111111111111111111111111111111111111111111111111111111111111111;

    function admin(uint256 role) internal pure returns (uint256) {
        return role << ADMIN_SHIFT;
    }

    /// @notice What a verified business gets on its own name: may point resolver/subregistry, may NOT register
    /// invoice names itself and may NOT transfer the name (invoice/business names are non-transferable).
    function businessOwnerRoles() internal pure returns (uint256) {
        return ROLE_SET_RESOLVER | admin(ROLE_SET_RESOLVER);
    }
}
