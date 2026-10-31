import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWeb3 } from "../context/Web3Context.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import usePolling from "../hooks/usePolling.js";
import { eth, parseLease, parseOwner, parsePayment, parseProperty, sameAddr, shortAddr } from "../utils/format.js";
import LeaseCard from "../components/LeaseCard.jsx";
import LeaseActions from "../components/LeaseActions.jsx";
import PaymentTable from "../components/PaymentTable.jsx";
import PaymentsChart from "../components/PaymentsChart.jsx";
import MaintenancePanel from "../components/MaintenancePanel.jsx";

const TENANT_NAV = [
  { group: "Main", items: [{ label: "Dashboard", tab: "Overview", icon: "▦" }] },
  {
    group: "Explore",
    items: [
      { label: "Browse Properties", tab: "Browse", icon: "⌕", count: "available" },
      { label: "My Leases", tab: "Leases", icon: "▤", count: "pending" },
      { label: "Maintenance", tab: "Maintenance", icon: "⚒" },
    ],
  },
  { group: "Account", items: [{ label: "Payments", tab: "Payments", icon: "↗" }] },
];

function TenantMetric({ label, value, note, icon, tone }) {
  return (
    <article className={`tenant-metric tenant-metric-${tone}`}>
      <div className="tenant-metric-top">
        <span className="tenant-metric-icon" aria-hidden="true">{icon}</span>
        <span className="tenant-metric-note">{note}</span>
      </div>
      <span className="tenant-metric-label">{label}</span>
      <strong className="tenant-metric-value">{value}</strong>
    </article>
  );
}

function PropertyCard({ property, ownerName, busy, onShareWallet }) {
  return (
    <article className="tenant-property-card">
      <div className={`tenant-property-art ${busy ? "property-busy" : ""}`} aria-hidden="true">
        <span>⌂</span>
        <small>{busy ? "Currently leased" : "Property listing"}</small>
      </div>
      <div className="tenant-property-content">
        <div className="tenant-property-title">
          <div><h3>{property.name}</h3><p>{property.location || "Location not provided"}</p></div>
          <span className={`tenant-availability ${busy ? "unavailable" : ""}`}>{busy ? "Leased" : "Available"}</span>
        </div>
        <div className="tenant-property-meta">
          <span><i aria-hidden="true">⌂</i> Rental property</span>
          <span><i aria-hidden="true">♙</i> {ownerName || shortAddr(property.owner)}</span>
        </div>
        <div className="tenant-property-owner">
          <span className="tenant-owner-avatar">{(ownerName || "O").slice(0, 1).toUpperCase()}</span>
          <span><strong>{ownerName || "Property owner"}</strong><small>{shortAddr(property.owner)}</small></span>
        </div>
        <button className="tenant-primary-button" onClick={onShareWallet} disabled={busy}>
          <span aria-hidden="true">↗</span> Share my wallet with owner
        </button>
        <p className="tenant-property-help">Owners create lease offers for your wallet from the owner portal.</p>
      </div>
    </article>
  );
}

export default function TenantDashboard() {
  const { contract, account, send, disconnect, notify } = useWeb3();
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("Overview");
  const [navSelection, setNavSelection] = useState("Dashboard");
  const [leases, setLeases] = useState([]);
  const [properties, setProperties] = useState([]);
  const [owners, setOwners] = useState([]);
  const [payments, setPayments] = useState([]);
  const [dues, setDues] = useState({});
  const [search, setSearch] = useState("");
  const [busyPropertyIds, setBusyPropertyIds] = useState(() => new Set());

  const load = useCallback(async () => {
    const [leaseResults, propertyResults, paymentResults, ownerResults, allLeases] = await Promise.all([
      contract.getLeasesByTenant(account),
      contract.getProperties(),
      contract.getPaymentsByUser(account),
      contract.getOwners(),
      contract.getAllLeases(),
    ]);
    const parsedLeases = leaseResults.map(parseLease);
    const parsedProperties = propertyResults.map(parseProperty);
    const parsedPayments = paymentResults.map(parsePayment);
    const parsedOwners = ownerResults.map(parseOwner);
    const parsedAllLeases = allLeases.map(parseLease);
    const dueEntries = await Promise.all(
      parsedLeases
        .filter((lease) => lease.status === 1 && lease.paidMonths < lease.durationMonths)
        .map(async (lease) => {
          const result = await contract.getAmountDue(lease.id);
          return [lease.id, { rent: result[0], lateFee: result[1], total: result[2] }];
        })
    );
    setLeases(parsedLeases);
    setProperties(parsedProperties);
    setPayments(parsedPayments);
    setOwners(parsedOwners);
    setDues(Object.fromEntries(dueEntries));
    setBusyPropertyIds(new Set(
      parsedAllLeases
        .filter((lease) => lease.status === 0 || lease.status === 1 || lease.status === 4)
        .map((lease) => lease.propertyId)
    ));
  }, [contract, account]);
  usePolling(load);

  const act = async (fn, message) => {
    const succeeded = await send(fn, message);
    if (succeeded) await load();
    return succeeded;
  };

  const propertiesById = Object.fromEntries(properties.map((property) => [property.id, property]));
  const ownersByAddress = Object.fromEntries(owners.map((owner) => [owner.wallet.toLowerCase(), owner]));
  const pendingLeases = leases.filter((lease) => lease.status === 0);
  const activeLeases = leases.filter((lease) => lease.status === 1);
  const availableProperties = properties.filter((property) => !busyPropertyIds.has(property.id));
  const totalRentPaid = payments
    .filter((payment) => sameAddr(payment.payer, account) && payment.kind === "Rent")
    .reduce((sum, payment) => sum + payment.amount, 0n);
  const totalDepositsPaid = payments
    .filter((payment) => sameAddr(payment.payer, account) && payment.kind === "Deposit")
    .reduce((sum, payment) => sum + payment.amount, 0n);
  const nextDueLease = activeLeases.find((lease) => dues[lease.id]);
  const nextDue = nextDueLease ? dues[nextDueLease.id] : null;
  const normalizedSearch = search.trim().toLowerCase();
  const filteredProperties = availableProperties.filter((property) => {
    const ownerName = ownersByAddress[property.owner.toLowerCase()]?.name ?? "";
    return `${property.name} ${property.location} ${ownerName} ${property.owner}`.toLowerCase().includes(normalizedSearch);
  });
  const filteredLeases = [...leases].reverse().filter((lease) => {
    const propertyName = propertiesById[lease.propertyId]?.name ?? "";
    const ownerName = ownersByAddress[lease.owner.toLowerCase()]?.name ?? "";
    return `${propertyName} ${lease.id} ${lease.owner} ${ownerName} ${lease.status}`.toLowerCase().includes(normalizedSearch);
  });
  const selectedNavigation = TENANT_NAV.flatMap((group) => group.items).find((item) => item.label === navSelection);
  const tenantName = user?.displayName || "Tenant";
  const handleLogout = async () => {
    if (await logout()) { disconnect(); navigate("/"); }
  };
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  const goTo = (label, destination) => {
    setNavSelection(label);
    setTab(destination);
  };

  const shareWallet = async () => {
    try {
      await navigator.clipboard.writeText(account);
      notify("success", "Wallet address copied. Share it with the property owner to receive a lease offer.");
    } catch (error) {
      notify("error", `Could not copy wallet address: ${error.message}`);
    }
  };

  return (
    <div className="tenant-shell">
      <aside className="tenant-sidebar">
        <div className="tenant-brand"><span className="tenant-brand-icon" aria-hidden="true">⌂</span><span>RentEase</span></div>
        <div className="tenant-profile">
          <span className="tenant-profile-avatar">T</span>
          <span><strong>{tenantName}</strong><small>Tenant · {shortAddr(account)}</small></span>
        </div>
        <nav className="tenant-nav" aria-label="Tenant navigation">
          {TENANT_NAV.map((group) => (
            <section className="tenant-nav-group" key={group.group}>
              <h2>{group.group}</h2>
              {group.items.map((item) => {
                const count = item.count === "available"
                  ? availableProperties.length
                  : item.count === "pending" ? pendingLeases.length : 0;
                const selected = navSelection === item.label && tab === item.tab;
                return (
                  <button
                    className={`tenant-nav-link ${selected ? "selected" : ""}`}
                    key={item.label}
                    onClick={() => goTo(item.label, item.tab)}
                    aria-current={selected ? "page" : undefined}
                  >
                    <span className="tenant-nav-icon" aria-hidden="true">{item.icon}</span>
                    <span>{item.label}</span>
                    {count > 0 && <span className="tenant-nav-count">{count}</span>}
                  </button>
                );
              })}
            </section>
          ))}
        </nav>
        <button className="tenant-logout" onClick={handleLogout}>
          <span aria-hidden="true">↪</span> Log out
        </button>
      </aside>

      <section className="tenant-workspace">
        <header className="tenant-topbar">
          <div className="tenant-heading">
            <span className="tenant-eyebrow">{selectedNavigation?.label ?? "Tenant portal"}</span>
            <h1>Welcome back, {tenantName}</h1>
            <p>Review your lease offers, agreements, and property options <span className="tenant-date">{dateLabel}</span></p>
          </div>
          <div className="tenant-toolbar">
            {(tab === "Browse" || tab === "Leases") && (
              <label className="tenant-search">
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  placeholder="Search properties, agreements..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Search properties and agreements"
                />
              </label>
            )}
            <button
              className="tenant-account-button"
              onClick={() => goTo("My Leases", "Leases")}
              title="View pending lease offers"
              aria-label={`${pendingLeases.length} pending lease offers`}
            >
              ♧{pendingLeases.length > 0 && <span>{pendingLeases.length}</span>}
            </button>
            <button className="tenant-logout tenant-logout-top" onClick={handleLogout}>
              <span aria-hidden="true">↪</span> Logout
            </button>
          </div>
        </header>

        <main className="tenant-content">
          {tab === "Overview" && (
            <div className="tenant-overview">
              <section className="tenant-metrics" aria-label="Tenant overview">
                <TenantMetric label="Available properties" value={availableProperties.length} note="Browse the listings" icon="⌂" tone="blue" />
                <TenantMetric label="Pending lease offers" value={pendingLeases.length} note="Review and respond" icon="◷" tone="amber" />
                <TenantMetric label="Active agreements" value={activeLeases.length} note={`${leases.length} total agreements`} icon="▤" tone="violet" />
                <TenantMetric label="Rent paid" value={eth(totalRentPaid)} note="Confirmed on-chain" icon="↗" tone="green" />
              </section>

              {pendingLeases.length > 0 && (
                <button className="tenant-pending-notice" onClick={() => goTo("My Leases", "Leases")}>
                  <span><strong>{pendingLeases.length} lease offer{pendingLeases.length === 1 ? "" : "s"} awaiting your review</strong><small>Review the terms and accept an offer to pay its deposit.</small></span>
                  <span>View offers →</span>
                </button>
              )}

              <section className="tenant-section">
                <div className="tenant-section-heading">
                  <div><h2>Available Properties</h2><p>Properties not currently tied to an active or pending lease</p></div>
                  <button className="tenant-secondary-button" onClick={() => goTo("Browse Properties", "Browse")}>Browse all →</button>
                </div>
                {availableProperties.length === 0 ? (
                  <div className="tenant-empty-state"><span aria-hidden="true">⌂</span><strong>No properties available right now</strong><p>New listings will appear here. You can also share your wallet address with an owner to receive a lease offer.</p><button className="tenant-secondary-button" onClick={shareWallet}>Copy my wallet address</button></div>
                ) : (
                  <div className="tenant-property-grid">
                    {availableProperties.slice(0, 3).map((property) => (
                      <PropertyCard
                        key={property.id}
                        property={property}
                        ownerName={ownersByAddress[property.owner.toLowerCase()]?.name}
                        busy={false}
                        onShareWallet={shareWallet}
                      />
                    ))}
                  </div>
                )}
              </section>

              <section className="tenant-overview-lower">
                <div className="tenant-chart-panel">
                  <PaymentsChart
                    payments={payments.filter((payment) => sameAddr(payment.payer, account))}
                    color="#3478d4"
                    title="Your rent payments"
                  />
                </div>
                <aside className="tenant-summary-panel">
                  <div className="tenant-summary-heading"><span aria-hidden="true">▰</span><h2>Rental Summary</h2></div>
                  <div className="tenant-summary-row"><span><i className="tenant-summary-dot" /> Active agreements</span><strong>{activeLeases.length}</strong></div>
                  <div className="tenant-summary-row"><span><i className={`tenant-summary-dot ${pendingLeases.length ? "summary-pending" : ""}`} /> Pending offers</span><strong>{pendingLeases.length}</strong></div>
                  <div className="tenant-summary-row"><span><i className="tenant-summary-dot" /> Total rent paid</span><strong>{eth(totalRentPaid)}</strong></div>
                  <div className="tenant-summary-row"><span><i className="tenant-summary-dot" /> Deposits paid</span><strong>{eth(totalDepositsPaid)}</strong></div>
                  <div className="tenant-summary-divider" />
                  <div className="tenant-next-due"><span>Next rent due</span><strong>{nextDue ? eth(nextDue.total) : "No payment due"}</strong>{nextDue?.lateFee > 0n && <small>Includes {eth(nextDue.lateFee)} late fee</small>}</div>
                </aside>
              </section>
            </div>
          )}

          {tab === "Browse" && (
            <section className="tenant-section">
              <div className="tenant-section-heading">
                <div><h2>Browse Properties</h2><p>Browse on-chain property listings and contact their owners</p></div>
                <button className="tenant-secondary-button" onClick={shareWallet}>Copy my wallet</button>
              </div>
              {filteredProperties.length === 0 ? (
                <div className="tenant-empty-state"><span aria-hidden="true">⌕</span><strong>{availableProperties.length ? "No properties match your search" : "No available properties right now"}</strong><p>Share your wallet address with a property owner to receive a lease offer.</p><button className="tenant-secondary-button" onClick={shareWallet}>Copy my wallet address</button></div>
              ) : (
                <div className="tenant-property-grid">
                  {filteredProperties.map((property) => (
                    <PropertyCard
                      key={property.id}
                      property={property}
                      ownerName={ownersByAddress[property.owner.toLowerCase()]?.name}
                      busy={false}
                      onShareWallet={shareWallet}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === "Leases" && (
            <div className="tenant-page-stack">
              {pendingLeases.length > 0 && (
                <section className="tenant-section">
                  <div className="tenant-section-heading"><div><h2>Pending Lease Offers</h2><p>Review each offer before accepting and paying its deposit</p></div></div>
                  <div className="tenant-lease-grid">
                    {[...pendingLeases].reverse().map((lease) => (
                      <LeaseCard key={lease.id} lease={lease} property={propertiesById[lease.propertyId]} party="owner">
                        <LeaseActions lease={lease} role="tenant" contract={contract} act={act} />
                      </LeaseCard>
                    ))}
                  </div>
                </section>
              )}
              <section className="tenant-section">
                <div className="tenant-section-heading"><div><h2>My Agreements</h2><p>{filteredLeases.length} lease{filteredLeases.length === 1 ? "" : "s"} connected to your wallet</p></div></div>
                {filteredLeases.length === 0 ? (
                  <div className="tenant-empty-state"><span aria-hidden="true">▤</span><strong>No lease agreements yet</strong><p>Share your wallet address with an owner so they can create an agreement for you.</p><button className="tenant-secondary-button" onClick={shareWallet}>Copy my wallet address</button></div>
                ) : (
                  <div className="tenant-lease-grid">
                    {filteredLeases.map((lease) => (
                      <LeaseCard key={lease.id} lease={lease} property={propertiesById[lease.propertyId]} party="owner" due={dues[lease.id]}>
                        {dues[lease.id] && lease.status === 1 && <p className="muted">Next payment: <strong>{eth(dues[lease.id].total)}</strong></p>}
                        <LeaseActions lease={lease} role="tenant" due={dues[lease.id]} contract={contract} act={act} />
                      </LeaseCard>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {tab === "Payments" && (
            <section className="tenant-section">
              <div className="tenant-section-heading"><div><h2>Payments</h2><p>Rent, deposits, and other confirmed on-chain transactions</p></div></div>
              <PaymentTable payments={payments} account={account} filename="tenant-transactions.csv" />
            </section>
          )}

          {tab === "Maintenance" && (
            <section className="tenant-section">
              <div className="tenant-section-heading"><div><h2>Maintenance Requests</h2><p>Submit a request for a property covered by an active lease</p></div></div>
              <MaintenancePanel role="tenant" account={account} leases={leases} />
            </section>
          )}
        </main>
      </section>
    </div>
  );
}
