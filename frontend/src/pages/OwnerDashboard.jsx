import { useCallback, useState } from "react";
import { parseEther } from "ethers";
import { useNavigate } from "react-router-dom";
import { useWeb3 } from "../context/Web3Context.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import usePolling from "../hooks/usePolling.js";
import { eth, parseLease, parseOwner, parsePayment, parseProperty, sameAddr, shortAddr } from "../utils/format.js";
import LeaseCard from "../components/LeaseCard.jsx";
import LeaseActions from "../components/LeaseActions.jsx";
import CreateLeaseForm from "../components/CreateLeaseForm.jsx";
import PaymentTable from "../components/PaymentTable.jsx";
import PaymentsChart from "../components/PaymentsChart.jsx";
import MaintenancePanel from "../components/MaintenancePanel.jsx";

const OWNER_NAV = [
  { group: "Main", items: [{ label: "Dashboard", tab: "Overview", icon: "▦" }] },
  {
    group: "Properties",
    items: [
      { label: "My Properties", tab: "Properties", icon: "▤", count: "properties" },
      { label: "Maintenance Requests", tab: "Maintenance", icon: "⚒" },
    ],
  },
  {
    group: "Management",
    items: [
      { label: "Agreements", tab: "Leases", icon: "▧", count: "leases" },
      { label: "Payments", tab: "Transactions", icon: "↗" },
    ],
  },
];

function OwnerMetric({ label, value, note, icon, tone }) {
  return (
    <article className={`owner-metric owner-metric-${tone}`}>
      <div className="owner-metric-top">
        <span className="owner-metric-icon" aria-hidden="true">{icon}</span>
        <span className="owner-metric-note">{note}</span>
      </div>
      <span className="owner-metric-label">{label}</span>
      <strong className="owner-metric-value">{value}</strong>
    </article>
  );
}

function PropertyForm({ property, setProperty, onSubmit }) {
  return (
    <div className="owner-panel">
      <div className="owner-panel-heading">
        <span className="owner-panel-icon" aria-hidden="true">＋</span>
        <div><h2>Add New Property</h2><p>List your property for rent or lease</p></div>
      </div>
      <form className="form-grid" onSubmit={onSubmit}>
        <label className="field">
          Property title
          <input
            value={property.name}
            onChange={(event) => setProperty((current) => ({ ...current, name: event.target.value }))}
            placeholder="e.g. Sunrise Apartments"
            required
          />
        </label>
        <label className="field">
          Location
          <input
            value={property.location}
            onChange={(event) => setProperty((current) => ({ ...current, location: event.target.value }))}
            placeholder="City, neighborhood"
            required
          />
        </label>
        <div className="span-2">
          <button className="owner-primary-button" type="submit"><span aria-hidden="true">＋</span> Add Property</button>
        </div>
      </form>
    </div>
  );
}

export default function OwnerDashboard() {
  const { contract, account, send, disconnect } = useWeb3();
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("Overview");
  const [navSelection, setNavSelection] = useState("Dashboard");
  const [properties, setProperties] = useState([]);
  const [leases, setLeases] = useState([]);
  const [payments, setPayments] = useState([]);
  const [ownerName, setOwnerName] = useState("");
  const [property, setProperty] = useState({ name: "", location: "" });
  const [search, setSearch] = useState("");
  const [chainId, setChainId] = useState("");

  const load = useCallback(async () => {
    const [propertyResults, leaseResults, paymentResults, ownerResults, network] = await Promise.all([
      contract.getPropertiesByOwner(account),
      contract.getLeasesByOwner(account),
      contract.getPaymentsByUser(account),
      contract.getOwners(),
      contract.runner.provider.getNetwork(),
    ]);
    setProperties(propertyResults.map(parseProperty));
    setLeases(leaseResults.map(parseLease));
    setPayments(paymentResults.map(parsePayment));
    setOwnerName(ownerResults.map(parseOwner).find((owner) => sameAddr(owner.wallet, account))?.name ?? "");
    setChainId(network.chainId.toString());
  }, [contract, account]);
  usePolling(load);

  const act = async (fn, message) => {
    const succeeded = await send(fn, message);
    if (succeeded) await load();
    return succeeded;
  };

  const propertiesById = Object.fromEntries(properties.map((item) => [item.id, item]));
  const activeLeases = leases.filter((lease) => lease.status === 1);
  const pendingLeases = leases.filter((lease) => lease.status === 0);
  const heldDeposits = leases.reduce((sum, lease) => sum + lease.depositHeld, 0n);
  const monthAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
  const recentIncome = payments
    .filter((payment) => payment.kind === "Rent" && sameAddr(payment.receiver, account) && payment.timestamp >= monthAgo)
    .reduce((sum, payment) => sum + payment.amount - payment.platformFee, 0n);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredProperties = properties.filter((item) =>
    `${item.name} ${item.location} ${item.id}`.toLowerCase().includes(normalizedSearch)
  );
  const filteredLeases = [...leases].reverse().filter((lease) =>
    `${lease.id} ${lease.tenant} ${propertiesById[lease.propertyId]?.name ?? ""}`.toLowerCase().includes(normalizedSearch)
  );
  const selectedNavigation = OWNER_NAV.flatMap((group) => group.items).find((item) => item.label === navSelection);
  const displayName = ownerName || user?.displayName || "Property Owner";
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

  const addProperty = async (event) => {
    event.preventDefault();
    const succeeded = await act(
      () => contract.addProperty(property.name.trim(), property.location.trim()),
      "Property added"
    );
    if (succeeded) setProperty({ name: "", location: "" });
  };

  return (
    <div className="owner-shell">
      <aside className="owner-sidebar">
        <div className="owner-brand">
          <span className="owner-brand-icon" aria-hidden="true">⌂</span>
          <span>RentEase</span>
        </div>
        <div className="owner-profile">
          <span className="owner-profile-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
          <span><strong>{displayName}</strong><small>Owner · {shortAddr(account)}</small></span>
        </div>
        <nav className="owner-nav" aria-label="Owner navigation">
          {OWNER_NAV.map((group) => (
            <section className="owner-nav-group" key={group.group}>
              <h2>{group.group}</h2>
              {group.items.map((item) => {
                const count = item.count === "properties"
                  ? properties.length
                  : item.count === "leases" ? activeLeases.length : 0;
                const selected = navSelection === item.label && tab === item.tab;
                return (
                  <button
                    className={`owner-nav-link ${selected ? "selected" : ""}`}
                    key={item.label}
                    onClick={() => goTo(item.label, item.tab)}
                    aria-current={selected ? "page" : undefined}
                  >
                    <span className="owner-nav-icon" aria-hidden="true">{item.icon}</span>
                    <span>{item.label}</span>
                    {count > 0 && <span className="owner-nav-count">{count}</span>}
                  </button>
                );
              })}
            </section>
          ))}
        </nav>
        <button className="owner-logout" onClick={handleLogout}>
          <span aria-hidden="true">↪</span> Log out
        </button>
      </aside>

      <section className="owner-workspace">
        <header className="owner-topbar">
          <div className="owner-heading">
            <span className="owner-eyebrow">{selectedNavigation?.label ?? "Property management"}</span>
            <h1>Welcome back, {displayName}</h1>
            <p>Here&apos;s what&apos;s happening with your properties today <span className="owner-date">{dateLabel}</span></p>
          </div>
          <div className="owner-toolbar">
            <label className="owner-search">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                placeholder="Search properties, tenants..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search properties and tenants"
              />
            </label>
            <button
              className="owner-account-button"
              onClick={() => goTo("Agreements", "Leases")}
              title="Open leases awaiting tenant acceptance"
              aria-label={`${pendingLeases.length} leases awaiting tenant acceptance`}
            >
              ♧{pendingLeases.length > 0 && <span>{pendingLeases.length}</span>}
            </button>
            <button className="owner-logout owner-logout-top" onClick={handleLogout}>
              <span aria-hidden="true">↪</span> Logout
            </button>
          </div>
        </header>

        <main className="owner-content">
          {tab === "Overview" && (
            <div className="owner-overview">
              <section className="owner-metrics" aria-label="Property portfolio overview">
                <OwnerMetric label="Total properties" value={properties.length} note="In your portfolio" icon="▦" tone="blue" />
                <OwnerMetric label="Pending acceptance" value={pendingLeases.length} note="Leases awaiting tenant" icon="◷" tone="amber" />
                <OwnerMetric label="Active agreements" value={activeLeases.length} note={`${leases.length} total agreements`} icon="▤" tone="violet" />
                <OwnerMetric label="Rent income · 30 days" value={eth(recentIncome)} note="After platform fees" icon="↗" tone="green" />
              </section>

              <section className="owner-shortcuts" aria-label="Quick actions">
                <article className="owner-shortcut">
                  <div className="owner-shortcut-heading"><span className="shortcut-icon shortcut-green">＋</span><div><h2>Add New Property</h2><p>List your property for rent or lease</p></div></div>
                  <p className="owner-shortcut-copy">Add a property to your portfolio and make it available for a new agreement.</p>
                  <button className="owner-primary-button" onClick={() => goTo("My Properties", "Properties")}>＋ Add Property</button>
                </article>
                <article className="owner-shortcut">
                  <div className="owner-shortcut-heading"><span className="shortcut-icon shortcut-amber">⚒</span><div><h2>Maintenance Requests</h2><p>Review and update tenant requests</p></div></div>
                  <p className="owner-shortcut-copy">View maintenance issues submitted by your tenants and track their status.</p>
                  <button className="owner-primary-button" onClick={() => goTo("Maintenance Requests", "Maintenance")}>View Requests →</button>
                </article>
                <article className="owner-shortcut">
                  <div className="owner-shortcut-heading"><span className="shortcut-icon shortcut-violet">▤</span><div><h2>Agreements</h2><p>Manage your rental contracts</p></div></div>
                  <p className="owner-shortcut-copy">You have {activeLeases.length} active agreements. Create a lease or review an existing one.</p>
                  <button className="owner-primary-button" onClick={() => goTo("Agreements", "Leases")}>View Agreements →</button>
                </article>
              </section>

              <PropertyForm property={property} setProperty={setProperty} onSubmit={addProperty} />

              <section className="owner-overview-lower">
                <div className="owner-chart-panel">
                  <PaymentsChart
                    payments={payments.filter((payment) => sameAddr(payment.receiver, account))}
                    color="#4162db"
                    title="Your rent income"
                  />
                </div>
                <aside className="owner-status-panel">
                  <div className="owner-status-heading"><span aria-hidden="true">▰</span><h2>Portfolio Summary</h2></div>
                  <div className="owner-status-row"><span><i className="owner-status-dot" /> Properties</span><strong>{properties.length}</strong></div>
                  <div className="owner-status-row"><span><i className="owner-status-dot" /> Active agreements</span><strong>{activeLeases.length}</strong></div>
                  <div className="owner-status-row"><span><i className={`owner-status-dot ${pendingLeases.length ? "owner-status-pending" : ""}`} /> Awaiting acceptance</span><strong>{pendingLeases.length}</strong></div>
                  <div className="owner-status-row"><span><i className="owner-status-dot" /> Network</span><strong>Chain {chainId || "—"}</strong></div>
                  <div className="owner-status-divider" />
                  <div className="owner-deposit-summary"><span>Deposits in escrow</span><strong>{eth(heldDeposits)}</strong></div>
                </aside>
              </section>
            </div>
          )}

          {tab === "Properties" && (
            <div className="owner-page-stack">
              <PropertyForm property={property} setProperty={setProperty} onSubmit={addProperty} />
              <section className="owner-panel">
                <div className="owner-panel-heading"><span className="owner-panel-icon" aria-hidden="true">▦</span><div><h2>Your Properties</h2><p>{filteredProperties.length} properties in your portfolio</p></div></div>
                {filteredProperties.length === 0 ? (
                  <p className="empty">{properties.length ? "No properties match your search." : "You have not added any properties yet."}</p>
                ) : (
                  <ul className="list">
                    {filteredProperties.map((item) => (
                      <li key={item.id}>
                        <div><strong>{item.name}</strong><p className="muted">{item.location}</p></div>
                        <span className="owner-property-id">Property #{item.id}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {tab === "Leases" && (
            <div className="owner-page-stack">
              <section className="owner-panel">
                <div className="owner-panel-heading"><span className="owner-panel-icon" aria-hidden="true">＋</span><div><h2>Create an Agreement</h2><p>Send a rental lease to a tenant wallet</p></div></div>
                <CreateLeaseForm
                  properties={properties}
                  onCreate={(value) =>
                    act(
                      () => contract.createLease(
                        value.propertyId,
                        value.tenant,
                        parseEther(value.rent),
                        parseEther(value.deposit || "0"),
                        value.months,
                        value.docHash
                      ),
                      "Lease created. The tenant can now see it"
                    )
                  }
                />
              </section>
              <section className="owner-panel">
                <div className="owner-panel-heading"><span className="owner-panel-icon" aria-hidden="true">▤</span><div><h2>Your Agreements</h2><p>{filteredLeases.length} agreements</p></div></div>
                {filteredLeases.length === 0 ? (
                  <p className="empty">{leases.length ? "No agreements match your search." : "No agreements yet. Create one above and it will appear on the tenant's dashboard."}</p>
                ) : (
                  <div className="card-grid">
                    {filteredLeases.map((lease) => (
                      <LeaseCard key={lease.id} lease={lease} property={propertiesById[lease.propertyId]} party="tenant">
                        <LeaseActions lease={lease} role="owner" contract={contract} act={act} />
                      </LeaseCard>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {tab === "Transactions" && (
            <section className="owner-panel">
              <div className="owner-panel-heading"><span className="owner-panel-icon" aria-hidden="true">↗</span><div><h2>Payments</h2><p>Incoming rent and transaction history</p></div></div>
              <PaymentTable payments={payments} account={account} filename="owner-transactions.csv" />
            </section>
          )}
          {tab === "Maintenance" && (
            <section className="owner-panel">
              <div className="owner-panel-heading"><span className="owner-panel-icon" aria-hidden="true">⚒</span><div><h2>Maintenance Requests</h2><p>Review issues submitted by your tenants</p></div></div>
              <MaintenancePanel role="owner" account={account} leases={leases} />
            </section>
          )}
        </main>
      </section>
    </div>
  );
}
