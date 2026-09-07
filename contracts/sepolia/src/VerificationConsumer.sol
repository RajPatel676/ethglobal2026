// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IReceiver} from "./interfaces/IReceiver.sol";
import {IENSv2Registry} from "./interfaces/IENSv2Registry.sol";
import {IPermissionedResolver} from "./interfaces/IPermissionedResolver.sol";
import {IVerifiableFactory} from "./interfaces/IVerifiableFactory.sol";
import {ENSRoles} from "./libraries/ENSRoles.sol";
import {ReportCodec} from "./libraries/ReportCodec.sol";
import {NameCoder} from "./libraries/NameCoder.sol";

/**
 * @title VerificationConsumer
 * @notice Receives DON-signed invoice verifications from the Chainlink CRE Confidential Workflow and turns
 *         each one into an ENSv2 name with permissioned records:
 *
 *         receivable.eth                     (ETHRegistry; owned by deployer)
 *         └─ <biz>.receivable.eth            registered in `rootSubregistry` on first verification;
 *            │                               owner = business wallet, roles = SET_RESOLVER only
 *            └─ inv-<id>.<biz>.receivable.eth  registered in the business's own UserRegistry proxy;
 *                                            owner = business wallet, NO transfer / registrar roles
 *
 *         Who may write which record (Enhanced Access Control + Permissioned Resolver):
 *           • this contract  → invoice-hash, face-value-cents, due-date, risk-score, discount-bps, status=verified
 *           • hederaAdapter  → ats-token, hcs-seq, status (financed / settled)
 *           • business       → description, url on its own name
 *         Nobody — not even the business — can mint an invoice name without a TEE-verified report.
 */
contract VerificationConsumer is IReceiver, Ownable {
    using Strings for uint256;
    using ReportCodec for bytes;

    // ───────── config ─────────
    address public forwarder; // KeystoneForwarder (mock for simulation, real for deployment)
    address public expectedWorkflowOwner; // CRE workflow owner (0 = don't check, simulation)
    address public hederaAdapter; // may write ats-token / hcs-seq / status
    uint32 public constant HEDERA_COIN_TYPE = 0x80000000 | 296; // ENSIP-11, chain id 296

    string public rootName; // "receivable.eth"
    bytes32 public immutable rootNode; // namehash(rootName)
    IENSv2Registry public rootSubregistry; // our PermissionedRegistry under receivable.eth
    IPermissionedResolver public resolver; // one PermissionedResolver proxy for the whole tree
    IVerifiableFactory public immutable factory;
    address public immutable userRegistryImpl;

    // ───────── state ─────────
    struct Business {
        address owner; // wallet that owns <biz>.receivable.eth
        bytes hederaAddr; // 20-byte EVM alias on Hedera
        IENSv2Registry registry; // UserRegistry proxy holding the invoice names
        bool exists;
    }

    mapping(string => Business) private _businesses; // label → business
    mapping(bytes32 => bool) public invoiceSeen; // invoiceHash → already named
    mapping(bytes32 => string) public invoiceNameOf; // invoiceHash → "inv-1042.acme.receivable.eth"

    // ───────── events ─────────
    event BusinessRegistered(string businessLabel, address owner, address registry);
    event InvoiceVerified(
        string businessLabel,
        string invoiceLabel,
        bytes32 indexed invoiceHash,
        uint256 faceValueCents,
        uint64 dueDate,
        uint16 riskScore,
        uint16 discountBps
    );

    error NotForwarder(address caller);
    error UnexpectedWorkflowOwner(address owner);
    error UnknownBusiness(string label);
    error DuplicateInvoice(bytes32 invoiceHash);

    constructor(
        address _forwarder,
        address _hederaAdapter,
        string memory _rootName,
        bytes32 _rootNode,
        IVerifiableFactory _factory,
        address _userRegistryImpl
    ) Ownable(msg.sender) {
        forwarder = _forwarder;
        hederaAdapter = _hederaAdapter;
        rootName = _rootName;
        rootNode = _rootNode;
        factory = _factory;
        userRegistryImpl = _userRegistryImpl;
    }

    // ───────── admin ─────────
    function setForwarder(address f) external onlyOwner {
        forwarder = f;
    }

    function setExpectedWorkflowOwner(address o) external onlyOwner {
        expectedWorkflowOwner = o;
    }

    function setHederaAdapter(address a) external onlyOwner {
        hederaAdapter = a;
    }

    /// @notice Wire up after the registry + resolver proxies are deployed (script 02).
    function setEns(IENSv2Registry _rootSubregistry, IPermissionedResolver _resolver) external onlyOwner {
        rootSubregistry = _rootSubregistry;
        resolver = _resolver;
    }

    /// @notice Businesses are onboarded off-chain (KYC) and announced here before their first invoice.
    function onboardBusiness(string calldata label, address bizOwner, bytes calldata hederaEvmAlias)
        external
        onlyOwner
    {
        Business storage b = _businesses[label];
        b.owner = bizOwner;
        b.hederaAddr = hederaEvmAlias;
        b.exists = true;
    }

    function business(string calldata label)
        external
        view
        returns (address bizOwner, bytes memory hederaAddr, address registry, bool exists)
    {
        Business storage b = _businesses[label];
        return (b.owner, b.hederaAddr, address(b.registry), b.exists);
    }

    // ───────── CRE entrypoint ─────────
    function onReport(bytes calldata metadata, bytes calldata report) external override {
        if (msg.sender != forwarder) revert NotForwarder(msg.sender);
        if (expectedWorkflowOwner != address(0)) {
            address wo = ReportCodec.workflowOwner(metadata);
            if (wo != expectedWorkflowOwner) revert UnexpectedWorkflowOwner(wo);
        }
        _processReport(report);
    }

    function _processReport(bytes calldata report) internal {
        ReportCodec.Verification memory v = report.decode();
        Business storage b = _businesses[v.businessLabel];
        if (!b.exists) revert UnknownBusiness(v.businessLabel);
        if (invoiceSeen[v.invoiceHash]) revert DuplicateInvoice(v.invoiceHash);
        invoiceSeen[v.invoiceHash] = true;

        bytes32 bizNode = NameCoder.child(rootNode, v.businessLabel);

        // 1. first invoice for this business → create its namespace
        if (address(b.registry) == address(0)) {
            b.registry = _deployBusinessRegistry(v.businessLabel);
            rootSubregistry.register(
                v.businessLabel,
                b.owner,
                b.registry,
                address(resolver),
                ENSRoles.businessOwnerRoles(),
                type(uint64).max
            );
            resolver.setText(bizNode, "kyc-status", "verified");
            resolver.setAddr(bizNode, HEDERA_COIN_TYPE, b.hederaAddr);
            // business may edit its own description/url — nothing else
            bytes memory bizDns = NameCoder.dnsEncode2(v.businessLabel, rootName);
            resolver.authorizeTextRoles(bizDns, "description", b.owner, true);
            resolver.authorizeTextRoles(bizDns, "url", b.owner, true);
            emit BusinessRegistered(v.businessLabel, b.owner, address(b.registry));
        }

        // 2. mint the invoice name — non-transferable, no registrar rights for the owner
        b.registry.register(
            v.invoiceLabel,
            b.owner,
            IENSv2Registry(address(0)),
            address(resolver),
            0,
            v.dueDate + 365 days
        );

        // 3. verification records (this contract holds ROLE_SET_TEXT on the resolver)
        bytes32 node = NameCoder.child(bizNode, v.invoiceLabel);
        resolver.setText(node, "invoice-hash", _hex(v.invoiceHash));
        resolver.setText(node, "face-value-cents", v.faceValueCents.toString());
        resolver.setText(node, "due-date", uint256(v.dueDate).toString());
        resolver.setText(node, "risk-score", uint256(v.riskScore).toString());
        resolver.setText(node, "discount-bps", uint256(v.discountBps).toString());
        resolver.setText(node, "status", "verified");

        // 4. delegate exactly three keys to the Hedera adapter
        bytes memory invDns = NameCoder.dnsEncode3(v.invoiceLabel, v.businessLabel, rootName);
        resolver.authorizeTextRoles(invDns, "ats-token", hederaAdapter, true);
        resolver.authorizeTextRoles(invDns, "hcs-seq", hederaAdapter, true);
        resolver.authorizeTextRoles(invDns, "status", hederaAdapter, true);

        invoiceNameOf[v.invoiceHash] =
            string.concat(v.invoiceLabel, ".", v.businessLabel, ".", rootName);

        emit InvoiceVerified(
            v.businessLabel, v.invoiceLabel, v.invoiceHash, v.faceValueCents, v.dueDate, v.riskScore, v.discountBps
        );
    }

    /// @dev Deterministic UserRegistry proxy per business; this contract is its admin/registrar.
    function _deployBusinessRegistry(string memory label) internal returns (IENSv2Registry) {
        uint256 salt = uint256(keccak256(abi.encode(keccak256("UserRegistry"), rootNode, label)));
        bytes memory init = abi.encodeWithSignature("initialize(address,uint256)", address(this), ENSRoles.ALL_ROLES);
        return IENSv2Registry(factory.deployProxy(userRegistryImpl, salt, init));
    }

    function _hex(bytes32 h) private pure returns (string memory) {
        return Strings.toHexString(uint256(h), 32);
    }
}
