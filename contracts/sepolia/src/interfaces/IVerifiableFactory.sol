// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice ENSv2 VerifiableFactory — deterministic proxies for UserRegistry / PermissionedResolver impls.
interface IVerifiableFactory {
    function deployProxy(address implementation, uint256 salt, bytes calldata data) external returns (address);
}
