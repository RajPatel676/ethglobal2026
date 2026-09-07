// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Minimal surface of ensdomains/namechain `PermissionedRegistry` / `UserRegistry` that Receivable needs.
/// @dev Keep in sync with the beta contracts on Sepolia; see docs.ens.domains/ensv2.
interface IENSv2Registry {
    function register(
        string calldata label,
        address owner,
        IENSv2Registry subregistry,
        address resolver,
        uint256 roleBitmap,
        uint64 expires
    ) external returns (uint256 tokenId);

    function setSubregistry(uint256 tokenId, IENSv2Registry registry) external;
    function setResolver(uint256 tokenId, address resolver) external;
    function getSubregistry(string calldata label) external view returns (IENSv2Registry);
    function getResolver(string calldata label) external view returns (address);
    function grantRoles(uint256 resource, uint256 roleBitmap, address account) external returns (bool);
    function hasRoles(uint256 resource, uint256 roleBitmap, address account) external view returns (bool);
}
