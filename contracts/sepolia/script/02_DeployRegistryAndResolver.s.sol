// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/Script.sol";
import {Base} from "./Base.s.sol";
import {IVerifiableFactory} from "../src/interfaces/IVerifiableFactory.sol";
import {ENSRoles} from "../src/libraries/ENSRoles.sol";

/// @notice Step 3b.2 — deploy the two proxies that hold the receivable.eth tree.
///
///   rootSubregistry : UserRegistry proxy. Holds <biz>.receivable.eth. Deployer is root admin now;
///                     script 04 grants ROLE_REGISTRAR to VerificationConsumer.
///   resolver        : PermissionedResolver proxy for the whole tree. Deployer is root admin now;
///                     script 04 grants the setter + setter-admin roles to VerificationConsumer.
///
///   forge script script/02_DeployRegistryAndResolver.s.sol --rpc-url sepolia --broadcast
///
/// Both are deployed through ENS's VerifiableFactory, whose salt is
/// keccak256(abi.encode(msg.sender, salt)) — so addresses are deterministic per deployer and
/// re-running with the same salt reverts rather than silently producing a second tree.
contract DeployRegistryAndResolver is Base {
    function run() external {
        IVerifiableFactory factory = IVerifiableFactory(_need(".ens.verifiableFactory"));
        address userRegistryImpl = _need(".ens.userRegistryImpl");
        address resolverImpl = _need(".ens.permissionedResolverImpl");
        address deployer = _deployer();
        string memory rootName = _str(".receivable.rootName");

        require(
            _addr(".receivable.rootSubregistry") == ZERO, "rootSubregistry already set - clear it to redeploy"
        );
        require(_addr(".receivable.resolver") == ZERO, "resolver already set - clear it to redeploy");

        uint256 registrySalt = uint256(keccak256(abi.encodePacked("receivable.rootSubregistry.v1", rootName)));
        uint256 resolverSalt = uint256(keccak256(abi.encodePacked("receivable.resolver.v1", rootName)));

        // UserRegistry.initialize(address rootAccount, uint256 roleBitmap)
        bytes memory registryInit =
            abi.encodeWithSignature("initialize(address,uint256)", deployer, ENSRoles.ALL_ROLES);

        // PermissionedResolver.initialize(address admin, uint256 roleBitmap, bytes[] setters)
        bytes[] memory noSetters = new bytes[](0);
        bytes memory resolverInit = abi.encodeWithSignature(
            "initialize(address,uint256,bytes[])", deployer, ENSRoles.ALL_ROLES, noSetters
        );

        _broadcast();
        address rootSubregistry = factory.deployProxy(userRegistryImpl, registrySalt, registryInit);
        address resolver = factory.deployProxy(resolverImpl, resolverSalt, resolverInit);
        vm.stopBroadcast();

        console2.log("rootSubregistry:", rootSubregistry);
        console2.log("resolver:       ", resolver);
        _write(".receivable.rootSubregistry", rootSubregistry);
        _write(".receivable.resolver", resolver);
        console2.log("Next: 03_DeployConsumer.s.sol");
    }
}
