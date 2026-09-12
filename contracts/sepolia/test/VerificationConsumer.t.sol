// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {VerificationConsumer} from "../src/VerificationConsumer.sol";
import {IENSv2Registry} from "../src/interfaces/IENSv2Registry.sol";
import {IPermissionedResolver} from "../src/interfaces/IPermissionedResolver.sol";
import {IVerifiableFactory} from "../src/interfaces/IVerifiableFactory.sol";
import {NameCoder} from "../src/libraries/NameCoder.sol";
import {ENSRoles} from "../src/libraries/ENSRoles.sol";
import {MockRegistry, MockResolver, MockFactory} from "./mocks/MockENS.sol";

contract VerificationConsumerTest is Test {
    VerificationConsumer c;
    MockRegistry root;
    MockResolver resolver;
    MockFactory factory;

    address forwarder = makeAddr("forwarder");
    address adapter = makeAddr("hederaAdapter");
    address bizOwner = makeAddr("acmeOwner");
    bytes32 constant ROOT_NODE = 0x0; // value irrelevant for mocks
    bytes hederaAlias = hex"1111111111111111111111111111111111111111";

    function setUp() public {
        root = new MockRegistry();
        resolver = new MockResolver();
        factory = new MockFactory();
        c = new VerificationConsumer(
            forwarder, adapter, "receivable.eth", ROOT_NODE, factory, address(0xBEEF)
        );
        c.setEns(IENSv2Registry(address(root)), IPermissionedResolver(address(resolver)));
        c.onboardBusiness("acme", bizOwner, hederaAlias);
    }

    function _report(string memory biz, string memory inv, bytes32 h) internal pure returns (bytes memory) {
        return abi.encode(biz, inv, h, uint256(1_250_000), uint64(1_762_387_200), uint16(88), uint16(320));
    }

    function _metadata() internal pure returns (bytes memory) {
        return abi.encodePacked(bytes32(0), bytes10(0), bytes20(0));
    }

    function test_onReport_mintsBusinessAndInvoice() public {
        bytes32 h = keccak256("acme|INV-1042|1250000|1762387200|deb-globex");
        vm.prank(forwarder);
        c.onReport(_metadata(), _report("acme", "inv-1042", h));

        // business registered under root subregistry
        assertEq(root.count(), 1);
        (,, address reg,) = c.business("acme");
        assertTrue(reg != address(0));
        assertEq(MockRegistry(reg).count(), 1); // invoice minted in the business registry

        // records written
        bytes32 bizNode = NameCoder.child(ROOT_NODE, "acme");
        bytes32 invNode = NameCoder.child(bizNode, "inv-1042");
        assertEq(resolver.text(bizNode, "kyc-status"), "verified");
        assertEq(resolver.text(invNode, "status"), "verified");
        assertEq(resolver.text(invNode, "face-value-cents"), "1250000");
        assertEq(resolver.text(invNode, "discount-bps"), "320");

        // adapter delegated exactly the three keys
        bytes32 invDns = keccak256(NameCoder.dnsEncode3("inv-1042", "acme", "receivable.eth"));
        assertTrue(resolver.textAuth(invDns, "ats-token", adapter));
        assertTrue(resolver.textAuth(invDns, "status", adapter));
        assertFalse(resolver.textAuth(invDns, "invoice-hash", adapter));

        assertEq(c.invoiceNameOf(h), "inv-1042.acme.receivable.eth");
    }

    function test_rejectsNonForwarder() public {
        vm.expectRevert(abi.encodeWithSelector(VerificationConsumer.NotForwarder.selector, address(this)));
        c.onReport(_metadata(), _report("acme", "inv-1042", bytes32(uint256(1))));
    }

    function test_rejectsDuplicateInvoice() public {
        bytes32 h = bytes32(uint256(42));
        vm.startPrank(forwarder);
        c.onReport(_metadata(), _report("acme", "inv-1", h));
        vm.expectRevert(abi.encodeWithSelector(VerificationConsumer.DuplicateInvoice.selector, h));
        c.onReport(_metadata(), _report("acme", "inv-1-again", h));
        vm.stopPrank();
    }

    function test_rejectsUnknownBusiness() public {
        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(VerificationConsumer.UnknownBusiness.selector, "ghost"));
        c.onReport(_metadata(), _report("ghost", "inv-1", bytes32(uint256(7))));
    }

    function test_secondInvoiceReusesBusinessRegistry() public {
        vm.startPrank(forwarder);
        c.onReport(_metadata(), _report("acme", "inv-1", bytes32(uint256(1))));
        (,, address reg1,) = c.business("acme");
        c.onReport(_metadata(), _report("acme", "inv-2", bytes32(uint256(2))));
        (,, address reg2,) = c.business("acme");
        vm.stopPrank();
        assertEq(reg1, reg2);
        assertEq(root.count(), 1);
        assertEq(MockRegistry(reg1).count(), 2);
    }

    /// @dev EnhancedAccessControl._checkRoleBitmap reverts EACInvalidRoleBitmap for any bit set
    ///      outside EACBaseRolesLib.ALL_ROLES (bit 0 of each nybble). Every bitmap this repo hands
    ///      to a real ENSv2 registry/resolver must satisfy that, or the call reverts on-chain.
    ///      Regression guard: ALL_ROLES was once type(uint256).max, which fails this on every grant.
    function test_roleBitmapsAreEACLegal() public pure {
        uint256 mask = ENSRoles.ALL_ROLES;
        assertEq(mask & ~mask, 0);
        assertEq(ENSRoles.ALL_ROLES & ~mask, 0, "ALL_ROLES");
        assertEq(ENSRoles.businessOwnerRoles() & ~mask, 0, "businessOwnerRoles");
        assertEq(ENSRoles.ROLE_REGISTRAR & ~mask, 0, "ROLE_REGISTRAR");
        assertEq(ENSRoles.ROLE_RENEW & ~mask, 0, "ROLE_RENEW");
        assertEq(ENSRoles.ROLE_SET_SUBREGISTRY & ~mask, 0, "ROLE_SET_SUBREGISTRY");
        assertEq(ENSRoles.ROLE_SET_RESOLVER & ~mask, 0, "ROLE_SET_RESOLVER");
        assertEq(ENSRoles.ROLE_CAN_TRANSFER_ADMIN & ~mask, 0, "ROLE_CAN_TRANSFER_ADMIN");
        assertEq(ENSRoles.admin(ENSRoles.ROLE_SET_RESOLVER) & ~mask, 0, "admin(SET_RESOLVER)");
    }

    /// @dev Nybble indices must match namechain RegistryRolesLib exactly — a role at the wrong
    ///      nybble silently grants a DIFFERENT permission.
    function test_roleConstantsMatchNamechain() public pure {
        assertEq(ENSRoles.ROLE_REGISTRAR, 1 << 0);
        assertEq(ENSRoles.ROLE_REGISTER_RESERVED, 1 << 4);
        assertEq(ENSRoles.ROLE_SET_PARENT, 1 << 8);
        assertEq(ENSRoles.ROLE_UNREGISTER, 1 << 12);
        assertEq(ENSRoles.ROLE_RENEW, 1 << 16); // NOT 1 << 4 — that is ROLE_REGISTER_RESERVED
        assertEq(ENSRoles.ROLE_SET_SUBREGISTRY, 1 << 20);
        assertEq(ENSRoles.ROLE_SET_RESOLVER, 1 << 24);
    }

    /// @dev rootNode is derived from rootName by 03_DeployConsumer. If namehash is wrong, every
    ///      child node in the tree is wrong and nothing resolves. Values computed independently
    ///      with `cast keccak`, not with this library.
    function test_namehash() public pure {
        assertEq(
            NameCoder.namehash("eth"),
            0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae,
            "eth"
        );
        assertEq(
            NameCoder.namehash("receivable.eth"),
            0x936bc3e93d2f10ac24ce2b71f3bc37a94783ddbd953ca8ad5dc5a6ad7bf90e48,
            "receivable.eth"
        );
        // namehash must compose with child() the way VerificationConsumer assumes
        assertEq(
            NameCoder.namehash("acme.receivable.eth"),
            NameCoder.child(NameCoder.namehash("receivable.eth"), "acme"),
            "child composition"
        );
        assertEq(NameCoder.namehash(""), bytes32(0), "root");
    }

    function test_firstLabel() public pure {
        assertEq(NameCoder.firstLabel("receivable.eth"), "receivable");
        assertEq(NameCoder.firstLabel("inv-1042.acme.receivable.eth"), "inv-1042");
        assertEq(NameCoder.firstLabel("eth"), "eth");
    }

    function test_dnsEncode() public pure {
        bytes memory d = NameCoder.dnsEncode2("acme", "receivable.eth");
        assertEq(d, bytes.concat(hex"04", "acme", hex"0a", "receivable", hex"03", "eth", hex"00"));
    }
}
