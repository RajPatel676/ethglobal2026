// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Role bitmaps from ensdomains/namechain EnhancedAccessControl. Admin variant = role << 128.
library ENSRoles {
    // registry
    uint256 internal constant ROLE_REGISTRAR = 1 << 0;
    uint256 internal constant ROLE_RENEW = 1 << 4;
    uint256 internal constant ROLE_SET_SUBREGISTRY = 1 << 20;
    uint256 internal constant ROLE_SET_RESOLVER = 1 << 24;
    uint256 internal constant ROLE_CAN_TRANSFER_ADMIN = (1 << 28) << 128;
    uint256 internal constant ADMIN_SHIFT = 128;

    // resolver
    uint256 internal constant ROLE_SET_ADDR = 1 << 0;
    uint256 internal constant ROLE_SET_TEXT = 1 << 4;
    uint256 internal constant ROLE_SET_CONTENTHASH = 1 << 8;
    uint256 internal constant ROLE_SET_ALIAS = 1 << 28;

    uint256 internal constant ALL_ROLES = type(uint256).max;

    function admin(uint256 role) internal pure returns (uint256) {
        return role << ADMIN_SHIFT;
    }

    /// @notice What a verified business gets on its own name: may point resolver/subregistry, may NOT register
    /// invoice names itself and may NOT transfer the name (invoice/business names are non-transferable).
    function businessOwnerRoles() internal pure returns (uint256) {
        return ROLE_SET_RESOLVER | admin(ROLE_SET_RESOLVER);
    }
}
