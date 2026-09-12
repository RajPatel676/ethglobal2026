// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/Script.sol";
import {Base} from "./Base.s.sol";
import {VerificationConsumer} from "../src/VerificationConsumer.sol";
import {IVerifiableFactory} from "../src/interfaces/IVerifiableFactory.sol";
import {IENSv2Registry} from "../src/interfaces/IENSv2Registry.sol";
import {IPermissionedResolver} from "../src/interfaces/IPermissionedResolver.sol";
import {NameCoder} from "../src/libraries/NameCoder.sol";

/// @notice Step 3b.3 — deploy VerificationConsumer and wire it to the tree from script 02.
///
///   forge script script/03_DeployConsumer.s.sol --rpc-url sepolia --broadcast --verify
///
/// The consumer holds NO roles yet — script 04 does that. Deploying first is deliberate: the
/// grants in 04 need this address.
///
/// `forwarder` comes from sepolia.json and defaults to the MockKeystoneForwarder used by
/// `cre workflow simulate --broadcast`. Swap it for the real KeystoneForwarder
/// (0xF8344CFd5c43616a4366C34E3EEE75af79a74482) via setForwarder() before a live DON run.
contract DeployConsumer is Base {
    function run() external {
        address forwarder = _need(".receivable.forwarder");
        address rootSubregistry = _need(".receivable.rootSubregistry");
        address resolver = _need(".receivable.resolver");
        address factory = _need(".ens.verifiableFactory");
        address userRegistryImpl = _need(".ens.userRegistryImpl");
        string memory rootName = _str(".receivable.rootName");

        address hederaAdapter = vm.envOr("HEDERA_ADAPTER_EVM_ADDRESS", address(0));
        if (hederaAdapter == ZERO) {
            console2.log("WARNING: HEDERA_ADAPTER_EVM_ADDRESS unset - deploying with adapter=0.");
            console2.log("         Call setHederaAdapter() after scripts/setup-hedera.ts (Step 4).");
        }

        // namehash("receivable.eth") — computed here so the constant can never drift from rootName.
        bytes32 rootNode = NameCoder.namehash(rootName);
        console2.log("rootName:", rootName);
        console2.logBytes32(rootNode);

        _broadcast();
        VerificationConsumer consumer = new VerificationConsumer(
            forwarder, hederaAdapter, rootName, rootNode, IVerifiableFactory(factory), userRegistryImpl
        );
        consumer.setEns(IENSv2Registry(rootSubregistry), IPermissionedResolver(resolver));

        // Reject reports from any workflow owner but ours, once we know it.
        address workflowOwner = vm.envOr("CRE_WORKFLOW_OWNER", address(0));
        if (workflowOwner != ZERO) {
            consumer.setExpectedWorkflowOwner(workflowOwner);
            console2.log("expectedWorkflowOwner:", workflowOwner);
        } else {
            console2.log("WARNING: CRE_WORKFLOW_OWNER unset - consumer accepts ANY workflow owner.");
            console2.log("         Set it before the public demo: setExpectedWorkflowOwner().");
        }
        vm.stopBroadcast();

        console2.log("verificationConsumer:", address(consumer));
        _write(".receivable.verificationConsumer", address(consumer));
        console2.log("Next: 04_GrantRoles.s.sol");
        console2.log("Then: put this address in services/cre/verify-invoice/config.staging.json");
    }
}
