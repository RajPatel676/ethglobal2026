// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {InvoicePrimaryMarket} from "../src/InvoicePrimaryMarket.sol";
import {IATSBond} from "../src/interfaces/IATSBond.sol";
import {HTS} from "../src/interfaces/IHTSToken.sol";
import {MockUSDC, MockATSBond, MockHTS} from "./mocks/Mocks.sol";

contract InvoicePrimaryMarketTest is Test {
    MockUSDC usdc;
    MockATSBond bond;
    InvoicePrimaryMarket market;

    address smb = makeAddr("smbPayout");
    address operator = makeAddr("adapter");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address payer = makeAddr("debtorEscrow");

    bytes32 constant PARTITION = bytes32(uint256(1));
    bytes32 constant INVOICE_HASH = keccak256("acme|INV-1042|1250000|1762387200|deb-globex");

    // $12,500 invoice = 12_500 whole-dollar units. riskScore 88 -> discountBps 320 (3.2%).
    uint256 constant TOTAL_UNITS = 12_500;
    uint16 constant DISCOUNT_BPS = 320;
    uint64 dueDate;
    uint64 fundingDeadline;

    function setUp() public {
        vm.warp(1_760_000_000);
        dueDate = uint64(block.timestamp + 60 days);
        fundingDeadline = uint64(block.timestamp + 14 days);

        // The HTS system contract does not exist in a forge EVM — put a mock at 0x167 or the
        // market constructor reverts on HTS.associate.
        vm.etch(HTS.PRECOMPILE, address(new MockHTS()).code);

        usdc = new MockUSDC();
        bond = new MockATSBond();
        market = new InvoicePrimaryMarket(
            IERC20(address(usdc)),
            IATSBond(address(bond)),
            PARTITION,
            smb,
            operator,
            INVOICE_HASH,
            TOTAL_UNITS,
            DISCOUNT_BPS,
            dueDate,
            fundingDeadline
        );

        // The market holds the bond units it sells.
        bond.issueByPartition(
            IATSBond.IssueData({
                partition: PARTITION, tokenHolder: address(market), value: TOTAL_UNITS, data: ""
            })
        );

        usdc.mint(alice, 100_000e6);
        usdc.mint(bob, 100_000e6);
        usdc.mint(payer, 100_000e6);
        usdc.mint(operator, 100_000e6);
    }

    function _buy(address who, uint256 units) internal {
        vm.startPrank(who);
        usdc.approve(address(market), market.quote(units));
        market.buy(units);
        vm.stopPrank();
    }

    // ───────── pricing ─────────

    /// @dev Must match packages/shared/src/utils/pricing.ts unitPriceMicro() exactly, or the web
    ///      app quotes a different number than the chain charges.
    function test_unitPriceMatchesSharedFormula() public view {
        assertEq(market.unitPriceMicro(), (1_000_000 * (10_000 - uint256(DISCOUNT_BPS))) / 10_000);
        assertEq(market.unitPriceMicro(), 968_000); // 3.2% off par
        assertEq(market.quote(100), 96_800_000);
        assertEq(market.parValueMicro(100), 100_000_000);
    }

    function testFuzz_quoteIsLinearAndBelowPar(uint16 bps, uint96 units) public {
        bps = uint16(bound(bps, 0, 9_999));
        units = uint96(bound(units, 1, 1_000_000));
        InvoicePrimaryMarket m = new InvoicePrimaryMarket(
            IERC20(address(usdc)),
            IATSBond(address(bond)),
            PARTITION,
            smb,
            operator,
            INVOICE_HASH,
            units,
            bps,
            dueDate,
            fundingDeadline
        );
        assertEq(m.quote(units), units * m.unitPriceMicro());
        assertLe(m.quote(units), m.parValueMicro(units), "investor must never pay above par");
    }

    // ───────── primary sale ─────────

    function test_buy_paysSmbImmediatelyAndDeliversUnits() public {
        uint256 units = 1_000;
        uint256 cost = market.quote(units);

        vm.startPrank(alice);
        usdc.approve(address(market), cost);
        vm.expectEmit(true, false, false, true);
        emit InvoicePrimaryMarket.Purchased(alice, units, cost);
        market.buy(units);
        vm.stopPrank();

        assertEq(usdc.balanceOf(smb), cost, "SMB paid same-transaction");
        assertEq(usdc.balanceOf(address(market)), 0, "market custodies no primary-sale cash");
        assertEq(bond.balanceOfByPartition(PARTITION, alice), units);
        assertEq(market.unitsOwned(alice), units);
        assertEq(market.unitsSold(), units);
        assertEq(market.unitsRemaining(), TOTAL_UNITS - units);
    }

    function test_buy_multipleInvestorsAccrueSeparately() public {
        _buy(alice, 1_000);
        _buy(bob, 2_500);
        assertEq(market.unitsSold(), 3_500);
        assertEq(usdc.balanceOf(smb), market.quote(3_500));
        assertEq(market.unitsOwned(alice), 1_000);
        assertEq(market.unitsOwned(bob), 2_500);
    }

    function test_buy_cannotOversell() public {
        _buy(alice, TOTAL_UNITS - 10);
        vm.startPrank(bob);
        usdc.approve(address(market), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(InvoicePrimaryMarket.InsufficientUnits.selector, 11, 10));
        market.buy(11);
        vm.stopPrank();
    }

    function test_buy_rejectsZero() public {
        vm.prank(alice);
        vm.expectRevert(InvoicePrimaryMarket.ZeroUnits.selector);
        market.buy(0);
    }

    function test_buy_rejectedAfterFundingDeadline() public {
        vm.warp(fundingDeadline + 1);
        vm.startPrank(alice);
        usdc.approve(address(market), type(uint256).max);
        vm.expectRevert(InvoicePrimaryMarket.FundingClosed.selector);
        market.buy(1);
        vm.stopPrank();
    }

    /// @dev On Hedera a recipient that has not associated the token makes the ATS transfer revert.
    ///      The whole buy must roll back — cash must not reach the SMB without units reaching
    ///      the investor.
    function test_buy_revertsAtomicallyIfInvestorNotAssociated() public {
        bond.setBlocked(alice, true);
        vm.startPrank(alice);
        usdc.approve(address(market), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(MockATSBond.RecipientNotAssociated.selector, alice));
        market.buy(100);
        vm.stopPrank();

        assertEq(usdc.balanceOf(smb), 0, "SMB must not be paid when units cannot be delivered");
        assertEq(market.unitsSold(), 0);
    }

    // ───────── settlement ─────────

    function test_settle_thenRedeemAtPar() public {
        _buy(alice, 1_000);
        _buy(bob, 500);

        uint256 owed = market.outstandingParMicro();
        assertEq(owed, 1_500 * 1_000_000);

        vm.startPrank(payer);
        usdc.approve(address(market), owed);
        market.settle(owed);
        vm.stopPrank();

        assertEq(uint256(market.status()), uint256(InvoicePrimaryMarket.Status.Settled));

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        market.redeem();
        assertEq(usdc.balanceOf(alice) - aliceBefore, 1_000 * 1_000_000, "alice redeems at par");

        vm.prank(bob);
        market.redeem();
        assertEq(usdc.balanceOf(address(market)), 0, "pool fully drained, no dust stranded");
    }

    /// @dev The investor's return is exactly the discount. 3.2% of $1,000 face = $32.
    function test_investorReturnEqualsDiscount() public {
        uint256 units = 1_000;
        uint256 before = usdc.balanceOf(alice);
        _buy(alice, units);

        uint256 owed = market.outstandingParMicro();
        vm.startPrank(payer);
        usdc.approve(address(market), owed);
        market.settle(owed);
        vm.stopPrank();

        vm.prank(alice);
        market.redeem();

        assertEq(usdc.balanceOf(alice) - before, units * uint256(DISCOUNT_BPS) * 100);
        assertEq(usdc.balanceOf(alice) - before, 32_000_000); // $32.00
    }

    function test_settle_rejectsUnderfunded() public {
        _buy(alice, 1_000);
        uint256 owed = market.outstandingParMicro();
        vm.startPrank(payer);
        usdc.approve(address(market), owed);
        vm.expectRevert(
            abi.encodeWithSelector(InvoicePrimaryMarket.UnderfundedSettlement.selector, owed - 1, owed)
        );
        market.settle(owed - 1);
        vm.stopPrank();
    }

    function test_redeem_rejectsDoubleClaim() public {
        _buy(alice, 100);
        uint256 owed = market.outstandingParMicro();
        vm.startPrank(payer);
        usdc.approve(address(market), owed);
        market.settle(owed);
        vm.stopPrank();

        vm.startPrank(alice);
        market.redeem();
        vm.expectRevert(InvoicePrimaryMarket.AlreadyRedeemed.selector);
        market.redeem();
        vm.stopPrank();
    }

    function test_redeem_rejectsNonHolder() public {
        _buy(alice, 100);
        uint256 owed = market.outstandingParMicro();
        vm.startPrank(payer);
        usdc.approve(address(market), owed);
        market.settle(owed);
        vm.stopPrank();

        vm.prank(bob);
        vm.expectRevert(InvoicePrimaryMarket.NothingOwned.selector);
        market.redeem();
    }

    function test_redeem_beforeSettlementReverts() public {
        _buy(alice, 100);
        vm.prank(alice);
        vm.expectRevert(InvoicePrimaryMarket.NotSettled.selector);
        market.redeem();
    }

    // ───────── cancellation ─────────

    function test_cancel_refundsAtCost() public {
        _buy(alice, 1_000);
        uint256 paid = market.paidMicro(alice);

        vm.warp(fundingDeadline + 1);
        vm.startPrank(operator);
        usdc.approve(address(market), paid);
        market.cancel(paid);
        vm.stopPrank();

        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        market.refund();
        assertEq(usdc.balanceOf(alice) - before, paid, "refunded exactly what was paid");
        assertEq(usdc.balanceOf(address(market)), 0);
    }

    function test_cancel_beforeDeadlineReverts() public {
        vm.prank(operator);
        vm.expectRevert(InvoicePrimaryMarket.DeadlineNotReached.selector);
        market.cancel(0);
    }

    function test_cancel_onlyOperator() public {
        vm.warp(fundingDeadline + 1);
        vm.prank(alice);
        vm.expectRevert(InvoicePrimaryMarket.NotOperator.selector);
        market.cancel(0);
    }

    function test_buy_rejectedAfterCancel() public {
        vm.warp(fundingDeadline + 1);
        vm.prank(operator);
        market.cancel(0);
        vm.startPrank(alice);
        usdc.approve(address(market), type(uint256).max);
        // Status is checked before the deadline, so a cancelled market reports NotOpen.
        vm.expectRevert(InvoicePrimaryMarket.NotOpen.selector);
        market.buy(1);
        vm.stopPrank();
    }

    // ───────── construction ─────────

    function test_constructor_rejectsBadTerms() public {
        // discountBps at 100% would make units free
        vm.expectRevert(InvoicePrimaryMarket.InvalidTerms.selector);
        new InvoicePrimaryMarket(
            IERC20(address(usdc)),
            IATSBond(address(bond)),
            PARTITION,
            smb,
            operator,
            INVOICE_HASH,
            TOTAL_UNITS,
            10_000,
            dueDate,
            fundingDeadline
        );
        // zero units
        vm.expectRevert(InvoicePrimaryMarket.InvalidTerms.selector);
        new InvoicePrimaryMarket(
            IERC20(address(usdc)),
            IATSBond(address(bond)),
            PARTITION,
            smb,
            operator,
            INVOICE_HASH,
            0,
            DISCOUNT_BPS,
            dueDate,
            fundingDeadline
        );
        // deadline already passed
        vm.expectRevert(InvoicePrimaryMarket.InvalidTerms.selector);
        new InvoicePrimaryMarket(
            IERC20(address(usdc)),
            IATSBond(address(bond)),
            PARTITION,
            smb,
            operator,
            INVOICE_HASH,
            TOTAL_UNITS,
            DISCOUNT_BPS,
            dueDate,
            uint64(block.timestamp)
        );
    }

    /// @dev HTS signals failure with a response code instead of reverting. If HTS.associate does
    ///      not check it, an unassociated market deploys fine and then cannot receive settlement.
    function test_constructor_revertsWhenHtsAssociationFails() public {
        // slot 1 == MockHTS.overrideResponse; 7 is an arbitrary non-SUCCESS code
        vm.store(HTS.PRECOMPILE, bytes32(uint256(1)), bytes32(uint256(7)));

        vm.expectRevert(abi.encodeWithSelector(HTS.HTSCallFailed.selector, int64(7)));
        new InvoicePrimaryMarket(
            IERC20(address(usdc)),
            IATSBond(address(bond)),
            PARTITION,
            smb,
            operator,
            INVOICE_HASH,
            TOTAL_UNITS,
            DISCOUNT_BPS,
            dueDate,
            fundingDeadline
        );
    }
}
