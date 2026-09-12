// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IENSv2Registry} from "./IENSv2Registry.sol";

/// @notice Minimal surface of namechain `ETHRegistrar` — commit/reveal registration of a .eth name.
/// @dev Verified against ensdomains/namechain `registrar/interfaces/IETHRegistrar.sol` and
///      `registrar/ETHRegistrar.sol`. Payment is pulled with safeTransferFrom, so the caller must
///      approve `base + premium` of `paymentToken` to the registrar before calling `register`.
interface IETHRegistrar {
    function commit(bytes32 commitment) external;

    function commitmentAt(bytes32 commitment) external view returns (uint64);

    function makeCommitment(
        string calldata label,
        address owner,
        bytes32 secret,
        IENSv2Registry subregistry,
        address resolver,
        uint64 duration,
        bytes32 referrer
    ) external pure returns (bytes32);

    function register(
        string memory label,
        address owner,
        bytes32 secret,
        IENSv2Registry subregistry,
        address resolver,
        uint64 duration,
        address paymentToken,
        bytes32 referrer
    ) external returns (uint256);

    function getRegisterPrice(string calldata label, uint64 duration, address paymentToken)
        external
        view
        returns (uint256 base, uint256 premium);

    function isAvailable(string memory label) external view returns (bool);

    function MIN_COMMITMENT_AGE() external view returns (uint64);
    function MAX_COMMITMENT_AGE() external view returns (uint64);
}
