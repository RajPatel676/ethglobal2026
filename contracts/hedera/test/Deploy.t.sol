// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";

contract DeployHelpersTest is Test {
    Deploy d;

    function setUp() public {
        d = new Deploy();
    }

    /// @dev Hedera entity 0.0.N is the EVM address with N in its low bytes. Getting this wrong
    ///      points the market at an address with no token behind it, and transfers vanish.
    ///      429274 == 0x68cda.
    function test_htsEvmAddress_matchesHederaEntityMapping() public view {
        assertEq(d.htsEvmAddress(429274), 0x0000000000000000000000000000000000068cDa, "USDC 0.0.429274");
        assertEq(d.htsEvmAddress(1), address(1));
        assertEq(d.htsEvmAddress(0), address(0));
        // ATS factory 0.0.9213391 == 0x8c95cf
        assertEq(d.htsEvmAddress(9213391), 0x00000000000000000000000000000000008c95cF);
    }

    function testFuzz_htsEvmAddressRoundTrips(uint64 num) public view {
        assertEq(uint160(d.htsEvmAddress(num)), uint256(num));
    }
}
