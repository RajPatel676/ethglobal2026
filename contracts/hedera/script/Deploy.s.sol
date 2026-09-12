// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {InvoicePrimaryMarket} from "../src/InvoicePrimaryMarket.sol";
import {IATSBond} from "../src/interfaces/IATSBond.sol";

/**
 * @notice Deploy one InvoicePrimaryMarket for one verified invoice on Hedera testnet (chain 296).
 *
 * Normally the adapter does this in `pipeline/05-*`, once the ATS bond exists. This script is the
 * manual path — for the demo, and for redeploying a single market without replaying the pipeline.
 *
 *   forge script script/Deploy.s.sol \
 *     --rpc-url hedera_testnet --broadcast --legacy \
 *     --private-key $HEDERA_ADAPTER_PRIVATE_KEY
 *
 * `--legacy` matters: Hedera's JSON-RPC relay wants type-0 transactions.
 *
 * Required env (all from the CRE report / ENS records for the invoice):
 *   ATS_BOND_ADDRESS   EVM address of the invoice's ATS bond diamond
 *   SMB_PAYOUT_ADDRESS where investor cash lands, immediately
 *   INVOICE_HASH       bytes32 from the DON-signed report
 *   TOTAL_UNITS        whole dollars of face value (faceValueCents / 100)
 *   DISCOUNT_BPS       from the report — never chosen here
 *   DUE_DATE           unix seconds
 *   FUNDING_DAYS       optional, default 14
 */
contract Deploy is Script {
    using stdJson for string;

    string internal constant PATH = "deployments/hedera-testnet.json";

    /// @dev Hedera maps entity 0.0.N to the EVM address whose low bytes are N.
    ///      USDC 0.0.429274 -> 0x...68cda. Derived, not pasted, so it cannot be mistyped.
    function htsEvmAddress(uint64 tokenNum) public pure returns (address) {
        return address(uint160(tokenNum));
    }

    function run() external {
        string memory j = vm.readFile(PATH);

        uint64 usdcNum = uint64(vm.parseUint(_stripPrefix(j.readString(".usdcTokenId"))));
        address usdc = htsEvmAddress(usdcNum);

        address bond = vm.envAddress("ATS_BOND_ADDRESS");
        address smbPayout = vm.envAddress("SMB_PAYOUT_ADDRESS");
        bytes32 invoiceHash = vm.envBytes32("INVOICE_HASH");
        uint256 totalUnits = vm.envUint("TOTAL_UNITS");
        uint16 discountBps = uint16(vm.envUint("DISCOUNT_BPS"));
        uint64 dueDate = uint64(vm.envUint("DUE_DATE"));
        uint64 fundingDays = uint64(vm.envOr("FUNDING_DAYS", uint256(14)));
        uint64 fundingDeadline = uint64(block.timestamp) + fundingDays * 1 days;

        require(discountBps > 0 && discountBps < 10_000, "DISCOUNT_BPS out of range");
        require(totalUnits > 0, "TOTAL_UNITS is zero");
        require(dueDate > block.timestamp, "invoice already due");
        // Financing an invoice you cannot fund before it matures is pointless.
        require(fundingDeadline < dueDate, "funding window ends after due date");

        console2.log("usdc (HTS EVM):", usdc);
        console2.log("bond:          ", bond);
        console2.log("smbPayout:     ", smbPayout);
        console2.log("totalUnits:    ", totalUnits);
        console2.log("discountBps:   ", discountBps);

        vm.startBroadcast();
        InvoicePrimaryMarket market = new InvoicePrimaryMarket(
            IERC20(usdc),
            IATSBond(bond),
            bytes32(uint256(1)), // ATS _DEFAULT_PARTITION
            smbPayout,
            msg.sender, // adapter is the operator
            invoiceHash,
            totalUnits,
            discountBps,
            dueDate,
            fundingDeadline
        );
        vm.stopBroadcast();

        console2.log("InvoicePrimaryMarket:", address(market));
        console2.log("unitPriceMicro:      ", market.unitPriceMicro());
        console2.log("raise at par (micro):", market.parValueMicro(totalUnits));
        console2.log("");
        console2.log("Next:");
        console2.log("  1. issue %s bond units to the market via ATS issueByPartition", totalUnits);
        console2.log("  2. bash verify.sh %s", vm.toString(address(market)));
        console2.log("  3. adapter writes ats-token to ENS");
    }

    /// @dev "0.0.429274" -> "429274"
    function _stripPrefix(string memory id) internal pure returns (string memory) {
        bytes memory b = bytes(id);
        uint256 last;
        for (uint256 i; i < b.length; i++) {
            if (b[i] == ".") last = i + 1;
        }
        bytes memory out = new bytes(b.length - last);
        for (uint256 i; i < out.length; i++) {
            out[i] = b[last + i];
        }
        return string(out);
    }
}
