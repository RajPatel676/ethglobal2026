// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Decodes the CRE report. MUST match services/cre/verify-invoice/lib/encode.ts and
///         packages/shared/src/schemas/report.ts byte-for-byte.
library ReportCodec {
    struct Verification {
        string businessLabel;
        string invoiceLabel;
        bytes32 invoiceHash;
        uint256 faceValueCents;
        uint64 dueDate;
        uint16 riskScore;
        uint16 discountBps;
    }

    function decode(bytes calldata report) internal pure returns (Verification memory v) {
        (v.businessLabel, v.invoiceLabel, v.invoiceHash, v.faceValueCents, v.dueDate, v.riskScore, v.discountBps) =
            abi.decode(report, (string, string, bytes32, uint256, uint64, uint16, uint16));
    }

    /// @dev CRE metadata layout: [0..32) workflowId, [32..42) workflowName, [42..62) workflowOwner
    function workflowOwner(bytes calldata metadata) internal pure returns (address owner) {
        require(metadata.length >= 62, "metadata too short");
        owner = address(bytes20(metadata[42:62]));
    }

    function workflowName(bytes calldata metadata) internal pure returns (bytes10 name) {
        require(metadata.length >= 42, "metadata too short");
        name = bytes10(metadata[32:42]);
    }
}
