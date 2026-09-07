// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {VerificationConsumer} from "../src/VerificationConsumer.sol";
import {IENSv2Registry} from "../src/interfaces/IENSv2Registry.sol";
import {IPermissionedResolver} from "../src/interfaces/IPermissionedResolver.sol";
import {IVerifiableFactory} from "../src/interfaces/IVerifiableFactory.sol";
import {NameCoder} from "../src/libraries/NameCoder.sol";
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
        c = new VerificationConsumer(forwarder, adapter, "receivable.eth", ROOT_NODE, factory, address(0xBEEF));
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
        (, , address reg, ) = c.business("acme");
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
        (, , address reg1, ) = c.business("acme");
        c.onReport(_metadata(), _report("acme", "inv-2", bytes32(uint256(2))));
        (, , address reg2, ) = c.business("acme");
        vm.stopPrank();
        assertEq(reg1, reg2);
        assertEq(root.count(), 1);
        assertEq(MockRegistry(reg1).count(), 2);
    }

    function test_dnsEncode() public pure {
        bytes memory d = NameCoder.dnsEncode2("acme", "receivable.eth");
        assertEq(d, hex"04" "acme" hex"0a" "receivable" hex"03" "eth" hex"00");
    }
}
