// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Base} from "./Base.s.sol";
import {IETHRegistrar} from "../src/interfaces/IETHRegistrar.sol";
import {IENSv2Registry} from "../src/interfaces/IENSv2Registry.sol";
import {NameCoder} from "../src/libraries/NameCoder.sol";

/// @notice Step 3b.1 — register `receivable.eth` on the ENSv2 Sepolia beta.
///
/// Commit/reveal, so this is TWO transactions separated by MIN_COMMITMENT_AGE. Foundry scripts
/// cannot sleep, so run them as two invocations:
///
///   forge script script/01_RegisterName.s.sol --sig "commit()"   --rpc-url sepolia --broadcast
///   (wait MIN_COMMITMENT_AGE — the script prints it)
///   forge script script/01_RegisterName.s.sol --sig "register()" --rpc-url sepolia --broadcast
///
/// SECRET must be identical across both calls. Set it in .env; do not reuse it after registration.
/// The name is registered with subregistry=0 and resolver=0 — script 04 points them at the
/// contracts created in 02, once they exist.
contract RegisterName is Base {
    uint64 internal constant DURATION = 365 days;

    function _label() internal view returns (string memory) {
        return NameCoder.firstLabel(_str(".receivable.rootName"));
    }

    function _secret() internal view returns (bytes32) {
        return keccak256(abi.encodePacked(vm.envString("ENS_REGISTRATION_SECRET")));
    }

    function commit() external {
        IETHRegistrar registrar = IETHRegistrar(_need(".ens.ethRegistrar"));
        string memory label = _label();
        address owner = _deployer();

        require(registrar.isAvailable(label), string.concat(label, ".eth is not available"));

        bytes32 commitment = registrar.makeCommitment(
            label, owner, _secret(), IENSv2Registry(ZERO), ZERO, DURATION, bytes32(0)
        );

        _broadcast();
        registrar.commit(commitment);
        vm.stopBroadcast();

        console2.log("committed to label:", label);
        console2.log("owner:            ", owner);
        console2.log("wait (seconds):   ", registrar.MIN_COMMITMENT_AGE());
        console2.log("commitment expires after (seconds):", registrar.MAX_COMMITMENT_AGE());
        console2.log("Now re-run with --sig \"register()\" using the SAME ENS_REGISTRATION_SECRET.");
    }

    function register() external {
        IETHRegistrar registrar = IETHRegistrar(_need(".ens.ethRegistrar"));
        address usdc = _need(".ens.mockUsdc");
        string memory label = _label();
        address owner = _deployer();

        (uint256 base, uint256 premium) = registrar.getRegisterPrice(label, DURATION, usdc);
        uint256 total = base + premium;
        console2.log("price (base + premium):", total);

        uint256 balance = IERC20(usdc).balanceOf(owner);
        require(
            balance >= total,
            "insufficient MockUSDC - mint some first: cast send <mockUsdc> 'mint(address,uint256)' <you> <amount>"
        );

        _broadcast();
        // safeTransferFrom in the registrar pulls the fee, so approve first.
        IERC20(usdc).approve(address(registrar), total);
        uint256 tokenId = registrar.register(
            label, owner, _secret(), IENSv2Registry(ZERO), ZERO, DURATION, usdc, bytes32(0)
        );
        vm.stopBroadcast();

        console2.log("registered:", string.concat(label, ".eth"));
        console2.log("tokenId:   ", tokenId);
        console2.log("Next: 02_DeployRegistryAndResolver.s.sol");
    }
}
