// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Hedera Token Service system contract at 0x167.
/// @dev Needed because HTS tokens (USDC 0.0.429274) cannot be received by an account or contract
///      that has not ASSOCIATED with them first — an unassociated transfer reverts. Solidity
///      contracts that hold HTS tokens must associate themselves at construction.
///      See HIP-206 / HIP-514, docs.hedera.com/hedera/core-concepts/smart-contracts/system-smart-contracts
interface IHTSToken {
    /// @dev Success code returned by HTS precompile calls. Anything else is a failure.
    ///      HTS returns a response CODE, it does not revert — an unchecked call looks like success.
    function associateToken(address account, address token) external returns (int64 responseCode);
    function dissociateToken(address account, address token) external returns (int64 responseCode);
    function isAssociated(address account, address token) external view returns (bool);
    function transferToken(address token, address sender, address recipient, int64 amount)
        external
        returns (int64 responseCode);
}

library HTS {
    address internal constant PRECOMPILE = address(0x167);
    int64 internal constant SUCCESS = 22; // HederaResponseCodes.SUCCESS

    error HTSCallFailed(int64 responseCode);

    /// @notice Associate `token` with this contract, tolerating "already associated".
    /// @dev HTS signals failure with a response code rather than a revert, so the code MUST be
    ///      checked. TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT (194) is benign and treated as success
    ///      so redeploys and re-runs stay idempotent.
    function associate(address token) internal {
        (bool okCall, bytes memory out) =
            PRECOMPILE.call(abi.encodeWithSelector(IHTSToken.associateToken.selector, address(this), token));
        if (!okCall) revert HTSCallFailed(0);
        int64 code = abi.decode(out, (int64));
        if (code != SUCCESS && code != 194) revert HTSCallFailed(code);
    }
}
