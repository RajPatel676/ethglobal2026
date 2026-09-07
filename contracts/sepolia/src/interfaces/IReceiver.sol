// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Chainlink CRE consumer interface. The KeystoneForwarder calls this with the DON-signed report.
interface IReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}
