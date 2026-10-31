// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title RentEase
 * @notice Role based rental agreement platform.
 *  - Admin  : deployer. Approves owners, resolves disputes, sets platform fee.
 *  - Owner  : approved wallet. Adds properties and creates leases for tenants.
 *  - Tenant : any wallet named in a lease. Accepts lease, pays deposit and rent.
 * Deposits are held in escrow by this contract. Rent is forwarded to the owner
 * minus a small platform fee. Late payments incur a late fee.
 */
contract RentEase {
    // ───────────────────────────── Types ─────────────────────────────
    enum OwnerStatus { None, Pending, Approved, Rejected }
    enum LeaseStatus { Created, Active, Completed, Terminated, Disputed, Cancelled }

    struct OwnerInfo {
        address wallet;
        string name;
        OwnerStatus status;
        uint256 registeredAt;
    }

    struct Property {
        uint256 id;
        address owner;
        string name;
        string location;
        uint256 createdAt;
    }

    struct Lease {
        uint256 id;
        uint256 propertyId;
        address owner;
        address tenant;
        uint256 rent;
        uint256 deposit;
        uint256 depositHeld;
        uint256 startDate;
        uint256 durationMonths;
        uint256 paidMonths;
        string docHash; // SHA-256 of the off-chain PDF agreement
        LeaseStatus status;
        uint256 createdAt;
    }

    struct Payment {
        uint256 id;
        uint256 leaseId;
        address payer;
        address receiver;
        uint256 amount;
        uint256 platformFee;
        uint256 lateFee;
        uint256 timestamp;
        string kind; // Deposit, Rent, DepositReturn, DisputeRefund, DisputePayout
    }

    // ───────────────────────────── State ─────────────────────────────
    address public admin;
    uint256 public platformFeeBps = 100; // 1%
    uint256 public platformBalance;
    bool public paused;

    uint256 public constant PERIOD = 30 days;
    uint256 public constant GRACE_PERIOD = 5 days;
    uint256 public constant LATE_FEE_PERCENT = 5;
    uint256 public constant MAX_FEE_BPS = 1000; // 10%

    mapping(address => OwnerInfo) private ownerInfo;
    address[] private ownerList;
    Property[] private properties;
    Lease[] private leases;
    Payment[] private payments;

    mapping(uint256 => string) public disputeReason;
    mapping(uint256 => address) public disputeRaisedBy;

    bool private _locked;

    // ───────────────────────────── Events ────────────────────────────
    event OwnerRequested(address indexed wallet, string name);
    event OwnerStatusChanged(address indexed wallet, OwnerStatus status);
    event PropertyAdded(uint256 indexed id, address indexed owner, string name);
    event LeaseCreated(uint256 indexed id, uint256 indexed propertyId, address indexed owner, address tenant);
    event LeaseCancelled(uint256 indexed id);
    event LeaseActivated(uint256 indexed id, address indexed tenant, uint256 deposit);
    event RentPaid(uint256 indexed id, address indexed tenant, uint256 amount, uint256 lateFee, uint256 paidMonths);
    event LeaseTerminated(uint256 indexed id, address indexed by);
    event LeaseCompleted(uint256 indexed id);
    event DepositReturned(uint256 indexed id, address indexed tenant, uint256 amount);
    event DisputeRaised(uint256 indexed id, address indexed by, string reason);
    event DisputeResolved(uint256 indexed id, uint256 tenantShare, uint256 ownerShare);
    event FeeUpdated(uint256 bps);
    event FeesWithdrawn(address indexed to, uint256 amount);
    event PausedChanged(bool isPaused);

    // ──────────────────────────── Modifiers ──────────────────────────
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    modifier onlyApprovedOwner() {
        require(ownerInfo[msg.sender].status == OwnerStatus.Approved, "Owner not approved");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Platform paused");
        _;
    }

    modifier nonReentrant() {
        require(!_locked, "Reentrant call");
        _locked = true;
        _;
        _locked = false;
    }

    modifier leaseExists(uint256 id) {
        require(id > 0 && id <= leases.length, "Lease not found");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    // ─────────────────────────── Admin actions ───────────────────────
    /// @notice Admin directly registers an approved owner (used for onboarding/seeding).
    function addOwner(address wallet, string calldata name) external onlyAdmin {
        require(wallet != address(0) && wallet != admin, "Invalid owner");
        if (ownerInfo[wallet].status == OwnerStatus.None) {
            ownerList.push(wallet);
        }
        ownerInfo[wallet] = OwnerInfo(wallet, name, OwnerStatus.Approved, block.timestamp);
        emit OwnerStatusChanged(wallet, OwnerStatus.Approved);
    }

    function setOwnerStatus(address wallet, bool approve) external onlyAdmin {
        require(ownerInfo[wallet].status != OwnerStatus.None, "Unknown owner");
        OwnerStatus s = approve ? OwnerStatus.Approved : OwnerStatus.Rejected;
        ownerInfo[wallet].status = s;
        emit OwnerStatusChanged(wallet, s);
    }

    function setPlatformFee(uint256 bps) external onlyAdmin {
        require(bps <= MAX_FEE_BPS, "Fee too high");
        platformFeeBps = bps;
        emit FeeUpdated(bps);
    }

    function setPaused(bool value) external onlyAdmin {
        paused = value;
        emit PausedChanged(value);
    }

    function withdrawFees() external onlyAdmin nonReentrant {
        uint256 amount = platformBalance;
        require(amount > 0, "No fees");
        platformBalance = 0;
        _send(admin, amount);
        emit FeesWithdrawn(admin, amount);
    }

    function resolveDispute(uint256 id, uint256 tenantShare) external onlyAdmin nonReentrant leaseExists(id) {
        Lease storage l = leases[id - 1];
        require(l.status == LeaseStatus.Disputed, "Not disputed");
        uint256 held = l.depositHeld;
        require(tenantShare <= held, "Share exceeds deposit");
        uint256 ownerShare = held - tenantShare;

        l.depositHeld = 0;
        l.status = LeaseStatus.Completed;

        if (tenantShare > 0) {
            _record(id, address(this), l.tenant, tenantShare, 0, 0, "DisputeRefund");
            _send(l.tenant, tenantShare);
        }
        if (ownerShare > 0) {
            _record(id, address(this), l.owner, ownerShare, 0, 0, "DisputePayout");
            _send(l.owner, ownerShare);
        }
        emit DisputeResolved(id, tenantShare, ownerShare);
    }

    // ─────────────────────────── Owner actions ───────────────────────
    /// @notice Anyone can ask to become an owner. Admin must approve.
    function requestOwnerAccess(string calldata name) external whenNotPaused {
        require(msg.sender != admin, "Admin cannot be owner");
        require(bytes(name).length > 0, "Name required");
        OwnerStatus s = ownerInfo[msg.sender].status;
        require(s == OwnerStatus.None || s == OwnerStatus.Rejected, "Already requested");
        if (s == OwnerStatus.None) {
            ownerList.push(msg.sender);
        }
        ownerInfo[msg.sender] = OwnerInfo(msg.sender, name, OwnerStatus.Pending, block.timestamp);
        emit OwnerRequested(msg.sender, name);
    }

    function addProperty(string calldata name, string calldata location)
        external
        onlyApprovedOwner
        whenNotPaused
        returns (uint256)
    {
        require(bytes(name).length > 0, "Name required");
        Property storage p = properties.push();
        p.id = properties.length;
        p.owner = msg.sender;
        p.name = name;
        p.location = location;
        p.createdAt = block.timestamp;
        emit PropertyAdded(p.id, msg.sender, name);
        return p.id;
    }

    function createLease(
        uint256 propertyId,
        address tenant,
        uint256 rent,
        uint256 deposit,
        uint256 durationMonths,
        string memory docHash
    ) external onlyApprovedOwner whenNotPaused returns (uint256) {
        require(propertyId > 0 && propertyId <= properties.length, "Property not found");
        require(properties[propertyId - 1].owner == msg.sender, "Not your property");
        require(tenant != address(0) && tenant != msg.sender && tenant != admin, "Invalid tenant");
        require(rent > 0, "Rent required");
        require(durationMonths > 0 && durationMonths <= 60, "Invalid duration");
        require(!_propertyBusy(propertyId), "Property already leased");

        Lease storage l = leases.push();
        l.id = leases.length;
        l.propertyId = propertyId;
        l.owner = msg.sender;
        l.tenant = tenant;
        l.rent = rent;
        l.deposit = deposit;
        l.durationMonths = durationMonths;
        l.docHash = docHash;
        l.status = LeaseStatus.Created;
        l.createdAt = block.timestamp;
        emit LeaseCreated(l.id, propertyId, msg.sender, tenant);
        return l.id;
    }

    function cancelLease(uint256 id) external leaseExists(id) {
        Lease storage l = leases[id - 1];
        require(msg.sender == l.owner, "Only lease owner");
        require(l.status == LeaseStatus.Created, "Lease already accepted");
        l.status = LeaseStatus.Cancelled;
        emit LeaseCancelled(id);
    }

    function completeLease(uint256 id) external leaseExists(id) {
        Lease storage l = leases[id - 1];
        require(msg.sender == l.owner, "Only lease owner");
        require(l.status == LeaseStatus.Active, "Lease not active");
        require(l.paidMonths >= l.durationMonths, "Rent not fully paid");
        l.status = LeaseStatus.Completed;
        emit LeaseCompleted(id);
    }

    function returnDeposit(uint256 id) external nonReentrant leaseExists(id) {
        Lease storage l = leases[id - 1];
        require(msg.sender == l.owner, "Only lease owner");
        require(
            l.status == LeaseStatus.Completed || l.status == LeaseStatus.Terminated,
            "Lease not ended"
        );
        uint256 amount = l.depositHeld;
        require(amount > 0, "No deposit held");
        l.depositHeld = 0;
        _record(id, address(this), l.tenant, amount, 0, 0, "DepositReturn");
        _send(l.tenant, amount);
        emit DepositReturned(id, l.tenant, amount);
    }

    // ─────────────────────────── Tenant actions ──────────────────────
    function acceptLease(uint256 id) external payable whenNotPaused leaseExists(id) {
        Lease storage l = leases[id - 1];
        require(msg.sender == l.tenant, "Only tenant");
        require(l.status == LeaseStatus.Created, "Lease not open");
        require(msg.value == l.deposit, "Incorrect deposit");
        l.status = LeaseStatus.Active;
        l.startDate = block.timestamp;
        l.depositHeld = msg.value;
        _record(id, msg.sender, address(this), msg.value, 0, 0, "Deposit");
        emit LeaseActivated(id, msg.sender, msg.value);
    }

    function payRent(uint256 id) external payable whenNotPaused nonReentrant leaseExists(id) {
        Lease storage l = leases[id - 1];
        require(msg.sender == l.tenant, "Only tenant");
        require(l.status == LeaseStatus.Active, "Lease not active");
        require(l.paidMonths < l.durationMonths, "All rent paid");

        (, uint256 lateFee, uint256 total) = getAmountDue(id);
        require(msg.value == total, "Incorrect amount");

        l.paidMonths += 1;
        uint256 fee = (total * platformFeeBps) / 10000;
        platformBalance += fee;

        _record(id, msg.sender, l.owner, total, fee, lateFee, "Rent");
        _send(l.owner, total - fee);
        emit RentPaid(id, msg.sender, total, lateFee, l.paidMonths);
    }

    // ─────────────────────── Owner or tenant actions ─────────────────
    function terminateLease(uint256 id) external leaseExists(id) {
        Lease storage l = leases[id - 1];
        require(msg.sender == l.owner || msg.sender == l.tenant, "Not a participant");
        require(l.status == LeaseStatus.Active, "Lease not active");
        l.status = LeaseStatus.Terminated;
        emit LeaseTerminated(id, msg.sender);
    }

    function raiseDispute(uint256 id, string calldata reason) external leaseExists(id) {
        Lease storage l = leases[id - 1];
        require(msg.sender == l.owner || msg.sender == l.tenant, "Not a participant");
        require(
            l.status == LeaseStatus.Active ||
                l.status == LeaseStatus.Completed ||
                l.status == LeaseStatus.Terminated,
            "Cannot dispute"
        );
        require(l.depositHeld > 0, "No deposit held");
        require(bytes(reason).length > 0, "Reason required");
        l.status = LeaseStatus.Disputed;
        disputeReason[id] = reason;
        disputeRaisedBy[id] = msg.sender;
        emit DisputeRaised(id, msg.sender, reason);
    }

    // ───────────────────────────── Views ─────────────────────────────
    /// @return 0 none/tenant, 1 admin, 2 approved owner, 3 pending owner, 4 rejected owner
    function getRole(address who) external view returns (uint8) {
        if (who == admin) return 1;
        OwnerStatus s = ownerInfo[who].status;
        if (s == OwnerStatus.Approved) return 2;
        if (s == OwnerStatus.Pending) return 3;
        if (s == OwnerStatus.Rejected) return 4;
        return 0;
    }

    function getOwner(address who) external view returns (OwnerInfo memory) {
        return ownerInfo[who];
    }

    function getOwners() external view returns (OwnerInfo[] memory list) {
        list = new OwnerInfo[](ownerList.length);
        for (uint256 i = 0; i < ownerList.length; i++) {
            list[i] = ownerInfo[ownerList[i]];
        }
    }

    function getProperties() external view returns (Property[] memory) {
        return properties;
    }

    function getPropertiesByOwner(address who) external view returns (Property[] memory list) {
        uint256 n;
        for (uint256 i = 0; i < properties.length; i++) {
            if (properties[i].owner == who) n++;
        }
        list = new Property[](n);
        uint256 k;
        for (uint256 i = 0; i < properties.length; i++) {
            if (properties[i].owner == who) list[k++] = properties[i];
        }
    }

    function getLease(uint256 id) external view leaseExists(id) returns (Lease memory) {
        return leases[id - 1];
    }

    function getAllLeases() external view returns (Lease[] memory) {
        return leases;
    }

    function getLeasesByOwner(address who) external view returns (Lease[] memory list) {
        uint256 n;
        for (uint256 i = 0; i < leases.length; i++) {
            if (leases[i].owner == who) n++;
        }
        list = new Lease[](n);
        uint256 k;
        for (uint256 i = 0; i < leases.length; i++) {
            if (leases[i].owner == who) list[k++] = leases[i];
        }
    }

    function getLeasesByTenant(address who) external view returns (Lease[] memory list) {
        uint256 n;
        for (uint256 i = 0; i < leases.length; i++) {
            if (leases[i].tenant == who) n++;
        }
        list = new Lease[](n);
        uint256 k;
        for (uint256 i = 0; i < leases.length; i++) {
            if (leases[i].tenant == who) list[k++] = leases[i];
        }
    }

    function getAllPayments() external view returns (Payment[] memory) {
        return payments;
    }

    function getPaymentsByLease(uint256 id) external view returns (Payment[] memory list) {
        uint256 n;
        for (uint256 i = 0; i < payments.length; i++) {
            if (payments[i].leaseId == id) n++;
        }
        list = new Payment[](n);
        uint256 k;
        for (uint256 i = 0; i < payments.length; i++) {
            if (payments[i].leaseId == id) list[k++] = payments[i];
        }
    }

    function getPaymentsByUser(address who) external view returns (Payment[] memory list) {
        uint256 n;
        for (uint256 i = 0; i < payments.length; i++) {
            if (payments[i].payer == who || payments[i].receiver == who) n++;
        }
        list = new Payment[](n);
        uint256 k;
        for (uint256 i = 0; i < payments.length; i++) {
            if (payments[i].payer == who || payments[i].receiver == who) list[k++] = payments[i];
        }
    }

    /// @notice Amount the tenant must send for the next rent installment.
    /// The n-th installment (0-based) is due at startDate + n * 30 days, with a 5 day grace period.
    function getAmountDue(uint256 id)
        public
        view
        leaseExists(id)
        returns (uint256 rent, uint256 lateFee, uint256 total)
    {
        Lease storage l = leases[id - 1];
        rent = l.rent;
        if (l.status == LeaseStatus.Active) {
            uint256 dueDate = l.startDate + l.paidMonths * PERIOD;
            if (block.timestamp > dueDate + GRACE_PERIOD) {
                lateFee = (rent * LATE_FEE_PERCENT) / 100;
            }
        }
        total = rent + lateFee;
    }

    function getStats()
        external
        view
        returns (uint256 ownerCount, uint256 propertyCount, uint256 leaseCount, uint256 paymentCount)
    {
        return (ownerList.length, properties.length, leases.length, payments.length);
    }

    // ─────────────────────────── Internals ───────────────────────────
    function _propertyBusy(uint256 propertyId) internal view returns (bool) {
        for (uint256 i = 0; i < leases.length; i++) {
            Lease storage l = leases[i];
            if (
                l.propertyId == propertyId &&
                (l.status == LeaseStatus.Created ||
                    l.status == LeaseStatus.Active ||
                    l.status == LeaseStatus.Disputed)
            ) {
                return true;
            }
        }
        return false;
    }

    function _record(
        uint256 leaseId,
        address payer,
        address receiver,
        uint256 amount,
        uint256 fee,
        uint256 lateFee,
        string memory kind
    ) internal {
        Payment storage p = payments.push();
        p.id = payments.length;
        p.leaseId = leaseId;
        p.payer = payer;
        p.receiver = receiver;
        p.amount = amount;
        p.platformFee = fee;
        p.lateFee = lateFee;
        p.timestamp = block.timestamp;
        p.kind = kind;
    }

    function _send(address to, uint256 amount) internal {
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "Transfer failed");
    }
}
