// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/Script.sol";
import {Base} from "./Base.s.sol";
import {IENSv2Registry} from "../src/interfaces/IENSv2Registry.sol";
import {IPermissionedResolver} from "../src/interfaces/IPermissionedResolver.sol";
import {ENSRoles} from "../src/libraries/ENSRoles.sol";
import {NameCoder} from "../src/libraries/NameCoder.sol";

/// @notice Step 3b.4 — hand VerificationConsumer exactly the rights it needs, and hang the
///         rootSubregistry off receivable.eth.
///
///   forge script script/04_GrantRoles.s.sol --rpc-url sepolia --broadcast
///
/// What the consumer gets and why:
///   rootSubregistry  ROLE_REGISTRAR      — mint <biz>.receivable.eth on first verification
///   resolver         ROLE_SET_TEXT       — write invoice-hash / face-value-cents / status / ...
///                    ROLE_SET_TEXT_ADMIN — required to call authorizeTextRoles() and delegate
///                                          ats-token / hcs-seq / status to the Hedera adapter
///                    ROLE_SET_ADDR       — write the business's Hedera EVM alias (ENSIP-11)
///                    ROLE_SET_ADDR_ADMIN — required to call authorizeAddrRoles()
///
/// Granted on the resolver ROOT resource (DNS-encoded "" == 0x00) so it covers every node in the
/// tree, including business names that do not exist yet.
///
/// Deliberately NOT granted: ROLE_UNREGISTER, ROLE_RENEW, ROLE_SET_SUBREGISTRY, ROLE_SET_ALIAS,
/// ROLE_UPGRADE. The consumer can create and annotate names; it cannot delete, re-point or
/// upgrade them.
contract GrantRoles is Base {
    bytes internal constant ROOT_NAME_DNS = hex"00"; // NameCoder.encode("")

    function run() external {
        IENSv2Registry ethRegistry = IENSv2Registry(_need(".ens.ethRegistry"));
        IENSv2Registry rootSubregistry = IENSv2Registry(_need(".receivable.rootSubregistry"));
        IPermissionedResolver resolver = IPermissionedResolver(_need(".receivable.resolver"));
        address consumer = _need(".receivable.verificationConsumer");
        string memory rootName = _str(".receivable.rootName");
        string memory label = NameCoder.firstLabel(rootName);

        uint256 resolverRoles = ENSRoles.ROLE_SET_TEXT | ENSRoles.admin(ENSRoles.ROLE_SET_TEXT)
            | ENSRoles.ROLE_SET_ADDR | ENSRoles.admin(ENSRoles.ROLE_SET_ADDR);

        // Guard: an illegal bitmap reverts deep inside EnhancedAccessControl with a bare
        // EACInvalidRoleBitmap. Catch it here where the message is actionable.
        require((resolverRoles & ~ENSRoles.ALL_ROLES) == 0, "resolverRoles not EAC-legal");
        require((ENSRoles.ROLE_REGISTRAR & ~ENSRoles.ALL_ROLES) == 0, "ROLE_REGISTRAR not EAC-legal");

        uint256 labelId = uint256(keccak256(bytes(label)));

        _broadcast();
        // 1. receivable.eth -> our registry + our resolver (deployer owns the name from script 01)
        ethRegistry.setSubregistry(labelId, rootSubregistry);
        ethRegistry.setResolver(labelId, address(resolver));

        // 2. consumer may mint business names
        rootSubregistry.grantRoles(
            0,
            /* ROOT_RESOURCE */
            ENSRoles.ROLE_REGISTRAR,
            consumer
        );

        // 3. consumer may write records and delegate individual keys
        resolver.authorizeNameRoles(ROOT_NAME_DNS, resolverRoles, consumer, true);
        vm.stopBroadcast();

        console2.log("granted ROLE_REGISTRAR on rootSubregistry to", consumer);
        console2.log("granted resolver setter+admin roles to      ", consumer);
        console2.log("bitmap:", resolverRoles);
        console2.log("");
        console2.log("Verify:");
        console2.log("  cast call <rootSubregistry> 'hasRoles(uint256,uint256,address)(bool)' 0 1 <consumer>");
        console2.log("Remaining manual steps:");
        console2.log("  - onboardBusiness(label, wallet, hederaEvmAlias) for each demo SMB");
        console2.log("  - setHederaAdapter() once Step 4 has an adapter address");
        console2.log("  - consumerAddress in services/cre/verify-invoice/config.staging.json");
    }
}
