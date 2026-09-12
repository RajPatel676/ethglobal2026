// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IENSv2Registry} from "../../src/interfaces/IENSv2Registry.sol";
import {IPermissionedResolver} from "../../src/interfaces/IPermissionedResolver.sol";
import {IVerifiableFactory} from "../../src/interfaces/IVerifiableFactory.sol";

contract MockRegistry is IENSv2Registry {
    struct Entry {
        address owner;
        address subregistry;
        address resolver;
        uint256 roles;
        uint64 expires;
    }
    mapping(bytes32 => Entry) public entries;
    string[] public labels;

    function register(
        string calldata label,
        address owner,
        IENSv2Registry sub,
        address res,
        uint256 roles,
        uint64 expires
    ) external returns (uint256) {
        bytes32 k = keccak256(bytes(label));
        require(entries[k].owner == address(0), "exists");
        entries[k] = Entry(owner, address(sub), res, roles, expires);
        labels.push(label);
        return uint256(k);
    }
    function setSubregistry(uint256, IENSv2Registry) external {}
    function setResolver(uint256, address) external {}

    function getSubregistry(string calldata label) external view returns (IENSv2Registry) {
        return IENSv2Registry(entries[keccak256(bytes(label))].subregistry);
    }

    function getResolver(string calldata label) external view returns (address) {
        return entries[keccak256(bytes(label))].resolver;
    }

    function grantRoles(uint256, uint256, address) external pure returns (bool) {
        return true;
    }

    function hasRoles(uint256, uint256, address) external pure returns (bool) {
        return true;
    }

    function count() external view returns (uint256) {
        return labels.length;
    }
}

contract MockResolver is IPermissionedResolver {
    mapping(bytes32 => mapping(string => string)) public texts;
    mapping(bytes32 => mapping(uint256 => bytes)) public addrs;
    mapping(bytes32 => mapping(string => mapping(address => bool))) public textAuth; // keccak(name)→key→acct
    address public writer; // who may setText (simulates ROLE_SET_TEXT)

    function setWriter(address w) external {
        writer = w;
    }

    function setText(bytes32 node, string calldata key, string calldata value) external {
        require(writer == address(0) || msg.sender == writer, "EACUnauthorizedAccountRoles");
        texts[node][key] = value;
    }

    function setAddr(bytes32 node, uint256 coinType, bytes calldata a) external {
        addrs[node][coinType] = a;
    }

    function text(bytes32 node, string calldata key) external view returns (string memory) {
        return texts[node][key];
    }

    function authorizeTextRoles(bytes calldata name, string calldata key, address account, bool ok) external {
        textAuth[keccak256(name)][key][account] = ok;
    }
    function authorizeAddrRoles(bytes calldata, uint256, address, bool) external {}

    // EnhancedAccessControl surface used by script/04_GrantRoles.s.sol.
    mapping(uint256 => mapping(address => uint256)) public roles; // resource → account → bitmap
    mapping(bytes32 => mapping(address => uint256)) public nameRoles; // keccak(dnsName) → account → bitmap

    function authorizeNameRoles(bytes calldata name, uint256 roleBitmap, address account, bool grant)
        external
        returns (bool)
    {
        // Mirror EnhancedAccessControl._checkRoleBitmap so an illegal bitmap fails in tests too.
        require((roleBitmap & ~ALL_ROLES_MASK) == 0, "EACInvalidRoleBitmap");
        bytes32 k = keccak256(name);
        if (grant) {
            nameRoles[k][account] |= roleBitmap;
            if (name.length == 1 && name[0] == 0x00) roles[0][account] |= roleBitmap;
        } else {
            nameRoles[k][account] &= ~roleBitmap;
            if (name.length == 1 && name[0] == 0x00) roles[0][account] &= ~roleBitmap;
        }
        return true;
    }

    function hasRoles(uint256 resource, uint256 roleBitmap, address account) external view returns (bool) {
        return roles[resource][account] & roleBitmap == roleBitmap;
    }

    uint256 internal constant ALL_ROLES_MASK =
        0x1111111111111111111111111111111111111111111111111111111111111111;
}

contract MockFactory is IVerifiableFactory {
    function deployProxy(address, uint256 salt, bytes calldata) external returns (address) {
        MockRegistry r = new MockRegistry{salt: bytes32(salt)}();
        return address(r);
    }
}
