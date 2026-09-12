// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice namehash / labelhash / DNS-wire helpers for names under receivable.eth.
library NameCoder {
    function labelhash(string memory label) internal pure returns (bytes32) {
        return keccak256(bytes(label));
    }

    /// @notice namehash("<label>.<parent>") given the parent node.
    function child(bytes32 parentNode, string memory label) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(parentNode, labelhash(label)));
    }

    /// @notice ENSIP-1 namehash of a dot-separated name, e.g. "receivable.eth".
    /// @dev Used by the deploy scripts so `rootNode` is derived from `rootName` and the two can
    ///      never drift apart. Labels are hashed as-is: normalise before calling.
    function namehash(string memory name) internal pure returns (bytes32 node) {
        bytes memory b = bytes(name);
        if (b.length == 0) return bytes32(0);
        uint256 end = b.length;
        for (uint256 i = b.length; i > 0; i--) {
            if (b[i - 1] == ".") {
                node = child(node, _substr(b, i, end));
                end = i - 1;
            }
        }
        node = child(node, _substr(b, 0, end));
    }

    /// @notice The first label of a dot-separated name: "receivable.eth" -> "receivable".
    function firstLabel(string memory name) internal pure returns (string memory) {
        bytes memory b = bytes(name);
        for (uint256 i; i < b.length; i++) {
            if (b[i] == ".") return _substr(b, 0, i);
        }
        return name;
    }

    function _substr(bytes memory b, uint256 start, uint256 end) private pure returns (string memory) {
        bytes memory out = new bytes(end - start);
        for (uint256 i; i < out.length; i++) {
            out[i] = b[start + i];
        }
        return string(out);
    }

    /// @notice DNS-encode "<a>.<b>.<rootName>" — ENSIP-10 format used by PermissionedResolver.authorize*Roles.
    function dnsEncode3(string memory a, string memory b, string memory root)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodePacked(_seg(a), _seg(b), _dnsRoot(root));
    }

    function dnsEncode2(string memory a, string memory root) internal pure returns (bytes memory) {
        return abi.encodePacked(_seg(a), _dnsRoot(root));
    }

    /// @dev root like "receivable.eth" → 0x0a 'receivable' 0x03 'eth' 0x00
    function _dnsRoot(string memory root) private pure returns (bytes memory out) {
        bytes memory r = bytes(root);
        uint256 start;
        for (uint256 i = 0; i <= r.length; i++) {
            if (i == r.length || r[i] == ".") {
                uint256 len = i - start;
                require(len > 0 && len < 256, "bad label");
                bytes memory seg = new bytes(len);
                for (uint256 j; j < len; j++) {
                    seg[j] = r[start + j];
                }
                out = abi.encodePacked(out, bytes1(uint8(len)), seg);
                start = i + 1;
            }
        }
        out = abi.encodePacked(out, bytes1(0));
    }

    function _seg(string memory s) private pure returns (bytes memory) {
        bytes memory b = bytes(s);
        require(b.length > 0 && b.length < 256, "bad label");
        return abi.encodePacked(bytes1(uint8(b.length)), b);
    }
}
