// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";

/// @notice Shared JSON plumbing + preflight guards for the Sepolia deploy scripts.
/// @dev deployments/sepolia.json is the single source of truth. Every script reads what it needs,
///      refuses to run against an unset (zero / empty) address, and writes back what it created.
abstract contract Base is Script {
    using stdJson for string;

    string internal constant PATH = "deployments/sepolia.json";
    address internal constant ZERO = address(0);

    function _json() internal view returns (string memory) {
        return vm.readFile(PATH);
    }

    /// @dev Reads `key` (e.g. ".ens.ethRegistrar"). Empty string → address(0).
    function _addr(string memory key) internal view returns (address a) {
        string memory j = _json();
        if (!vm.keyExistsJson(j, key)) return ZERO;
        string memory raw = j.readString(key);
        if (bytes(raw).length == 0) return ZERO;
        a = vm.parseAddress(raw);
    }

    /// @dev Same, but aborts with a pointed message when the slot is still blank.
    function _need(string memory key) internal view returns (address a) {
        a = _addr(key);
        require(
            a != ZERO,
            string.concat(
                "sepolia.json ",
                key,
                " is unset. Fill it from ",
                "https://docs.ens.domains/learn/deployments (Sepolia ENSv2 beta) before running this script."
            )
        );
    }

    function _str(string memory key) internal view returns (string memory) {
        return _json().readString(key);
    }

    /// @dev Persist one address back into deployments/sepolia.json, preserving everything else.
    function _write(string memory key, address value) internal {
        vm.writeJson(vm.toString(value), PATH, key);
        console2.log(string.concat("  wrote ", key), value);
    }

    function _deployer() internal view returns (address) {
        return vm.addr(vm.envUint("DEPLOYER_PRIVATE_KEY"));
    }

    function _broadcast() internal {
        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
    }
}
