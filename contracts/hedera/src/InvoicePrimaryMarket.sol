// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IATSBond} from "./interfaces/IATSBond.sol";
import {HTS} from "./interfaces/IHTSToken.sol";

/**
 * @title InvoicePrimaryMarket
 * @notice One market per verified invoice. Investors buy discounted units of the invoice's ATS
 *         bond with HTS USDC; the SMB is paid immediately, in full, per purchase.
 *
 *         units are whole dollars of FACE value. An investor pays `unitPriceMicro` per unit —
 *         below par — and redeems at par after the debtor settles. The discount is the return.
 *
 *           unitPriceMicro = 1e6 * (10_000 - discountBps) / 10_000
 *
 *         Mirrors packages/shared/src/utils/pricing.ts exactly. `discountBps` is not chosen here:
 *         it is fixed by the DON-signed CRE report that created the invoice's ENS name, and the
 *         adapter passes it through. This contract cannot reprice itself.
 *
 * Lifecycle
 *   Open      — investors buy until sold out or `fundingDeadline` passes
 *   Settled   — payer deposits face value; investors redeem pro rata at par
 *   Cancelled — funding deadline passed unsold; investors refund at cost
 *
 * Hedera notes
 *   - USDC is an HTS token reached through its ERC-20 facade. This contract associates itself in
 *     the constructor; without that, every incoming transfer reverts.
 *   - The bond is an ATS ERC-1410 diamond, so units move with transferByPartition, never
 *     ERC-20 transfer.
 */
contract InvoicePrimaryMarket is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        Open,
        Settled,
        Cancelled
    }

    // ───────── immutable terms ─────────
    IERC20 public immutable usdc;
    IATSBond public immutable bond;
    bytes32 public immutable partition;
    /// @notice Wallet that receives investor cash immediately on each purchase.
    address public immutable smbPayout;
    /// @notice May settle/cancel. The Hedera adapter, whose Sepolia twin writes ENS `status`.
    address public immutable operator;

    /// @notice keccak fingerprint from the CRE report — ties this market to one invoice.
    bytes32 public immutable invoiceHash;
    /// @notice Whole dollars of face value on offer.
    uint256 public immutable totalUnits;
    /// @notice Discount in basis points, from the DON-signed report. 200 = 2%.
    uint16 public immutable discountBps;
    /// @notice Invoice due date (unix seconds), for reference and redemption gating.
    uint64 public immutable dueDate;
    /// @notice After this, unsold units can no longer be bought and the market can be cancelled.
    uint64 public immutable fundingDeadline;

    // ───────── state ─────────
    Status public status;
    uint256 public unitsSold;
    /// @notice USDC deposited by the payer at settlement, in micro-units.
    uint256 public settlementPoolMicro;
    mapping(address => uint256) public unitsOwned;
    mapping(address => uint256) public paidMicro;
    mapping(address => bool) public redeemed;

    // ───────── events ─────────
    event Purchased(address indexed investor, uint256 units, uint256 costMicro);
    event Settled(uint256 amountMicro, uint256 unitsOutstanding);
    event Redeemed(address indexed investor, uint256 units, uint256 payoutMicro);
    event Cancelled(uint256 unitsUnsold);
    event Refunded(address indexed investor, uint256 units, uint256 refundMicro);

    // ───────── errors ─────────
    error NotOperator();
    error NotOpen();
    error FundingClosed();
    error ZeroUnits();
    error InsufficientUnits(uint256 requested, uint256 remaining);
    error NotSettled();
    error NotCancelled();
    error NothingOwned();
    error AlreadyRedeemed();
    error DeadlineNotReached();
    error UnderfundedSettlement(uint256 providedMicro, uint256 owedMicro);
    error InvalidTerms();

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    constructor(
        IERC20 _usdc,
        IATSBond _bond,
        bytes32 _partition,
        address _smbPayout,
        address _operator,
        bytes32 _invoiceHash,
        uint256 _totalUnits,
        uint16 _discountBps,
        uint64 _dueDate,
        uint64 _fundingDeadline
    ) {
        // discountBps == 10_000 would price units at zero; >= that is nonsense.
        if (
            address(_usdc) == address(0) || address(_bond) == address(0) || _smbPayout == address(0)
                || _operator == address(0) || _totalUnits == 0 || _discountBps >= 10_000
                || _fundingDeadline <= block.timestamp
        ) revert InvalidTerms();

        usdc = _usdc;
        bond = _bond;
        partition = _partition;
        smbPayout = _smbPayout;
        operator = _operator;
        invoiceHash = _invoiceHash;
        totalUnits = _totalUnits;
        discountBps = _discountBps;
        dueDate = _dueDate;
        fundingDeadline = _fundingDeadline;

        // Required before this contract can receive HTS USDC at settlement.
        HTS.associate(address(_usdc));
    }

    // ───────── pricing ─────────

    /// @notice USDC micro-units per whole-dollar unit. Mirrors shared/utils/pricing.ts.
    function unitPriceMicro() public view returns (uint256) {
        return (1_000_000 * (10_000 - uint256(discountBps))) / 10_000;
    }

    /// @notice What `units` costs an investor right now, in USDC micro-units.
    function quote(uint256 units) public view returns (uint256 costMicro) {
        return units * unitPriceMicro();
    }

    /// @notice Face value of `units` at par — what they redeem for after settlement.
    function parValueMicro(uint256 units) public pure returns (uint256) {
        return units * 1_000_000;
    }

    function unitsRemaining() external view returns (uint256) {
        return totalUnits - unitsSold;
    }

    /// @notice Total par owed to everyone who has bought so far.
    function outstandingParMicro() public view returns (uint256) {
        return parValueMicro(unitsSold);
    }

    // ───────── primary sale ─────────

    /**
     * @notice Buy `units` of the invoice. Investor pays now, SMB is paid now.
     * @dev The investor must `approve` this contract for `quote(units)` first, and must be
     *      associated with the bond token on Hedera or the ATS transfer reverts.
     *
     *      Cash goes straight to the SMB rather than pooling here — the entire point of invoice
     *      financing is same-day liquidity. The consequence is that a cancelled market cannot
     *      refund from its own balance; see `cancel`.
     */
    function buy(uint256 units) external nonReentrant {
        if (status != Status.Open) revert NotOpen();
        if (block.timestamp > fundingDeadline) revert FundingClosed();
        if (units == 0) revert ZeroUnits();

        uint256 remaining = totalUnits - unitsSold;
        if (units > remaining) revert InsufficientUnits(units, remaining);

        uint256 costMicro = quote(units);

        // Effects before interactions.
        unitsSold += units;
        unitsOwned[msg.sender] += units;
        paidMicro[msg.sender] += costMicro;

        // Investor -> SMB, in one hop. This contract never custodies primary-sale cash.
        usdc.safeTransferFrom(msg.sender, smbPayout, costMicro);

        // Bond units -> investor, through the ATS partition API.
        bond.transferByPartition(partition, IATSBond.BasicTransferInfo({to: msg.sender, value: units}), "");

        emit Purchased(msg.sender, units, costMicro);
    }

    // ───────── settlement ─────────

    /**
     * @notice Deposit the debtor's payment so investors can redeem at par.
     * @dev Anyone may fund it — in the demo the escrow account does — but it must cover the par
     *      value of every unit sold, or partial redemption would race and the last investors out
     *      would get nothing.
     */
    function settle(uint256 amountMicro) external nonReentrant {
        if (status != Status.Open) revert NotOpen();

        uint256 owed = outstandingParMicro();
        if (amountMicro < owed) revert UnderfundedSettlement(amountMicro, owed);

        status = Status.Settled;
        settlementPoolMicro = amountMicro;

        usdc.safeTransferFrom(msg.sender, address(this), amountMicro);

        emit Settled(amountMicro, unitsSold);
    }

    /// @notice Claim par value for your units after settlement.
    function redeem() external nonReentrant {
        if (status != Status.Settled) revert NotSettled();

        uint256 units = unitsOwned[msg.sender];
        if (units == 0) revert NothingOwned();
        if (redeemed[msg.sender]) revert AlreadyRedeemed();

        redeemed[msg.sender] = true;
        uint256 payout = parValueMicro(units);

        usdc.safeTransfer(msg.sender, payout);

        emit Redeemed(msg.sender, units, payout);
    }

    // ───────── failure path ─────────

    /**
     * @notice Close a market that never sold out, letting buyers reclaim what they paid.
     * @dev Only after the funding deadline. Because purchase cash went straight to the SMB, the
     *      operator must fund the refund pool with the cost of all units sold — `refund` pays out
     *      of this contract's balance, so cancelling without funding leaves investors unable to
     *      claim. Kept explicit rather than silently pulling from the SMB.
     */
    function cancel(uint256 refundPoolMicro) external onlyOperator nonReentrant {
        if (status != Status.Open) revert NotOpen();
        if (block.timestamp <= fundingDeadline) revert DeadlineNotReached();

        status = Status.Cancelled;
        if (refundPoolMicro > 0) {
            usdc.safeTransferFrom(msg.sender, address(this), refundPoolMicro);
        }

        emit Cancelled(totalUnits - unitsSold);
    }

    /// @notice Reclaim what you paid, after a cancellation.
    function refund() external nonReentrant {
        if (status != Status.Cancelled) revert NotCancelled();

        uint256 paid = paidMicro[msg.sender];
        if (paid == 0) revert NothingOwned();
        if (redeemed[msg.sender]) revert AlreadyRedeemed();

        redeemed[msg.sender] = true;
        uint256 units = unitsOwned[msg.sender];

        usdc.safeTransfer(msg.sender, paid);

        emit Refunded(msg.sender, units, paid);
    }
}
