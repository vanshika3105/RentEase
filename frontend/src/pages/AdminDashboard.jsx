import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWeb3 } from "../context/Web3Context.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import usePolling from "../hooks/usePolling.js";
import { eth, parseLease, parseOwner, parsePayment, parseProperty, shortAddr, fmtDate } from "../utils/format.js";
import LeaseCard from "../components/LeaseCard.jsx";
import PaymentTable from "../components/PaymentTable.jsx";
import PaymentsChart from "../components/PaymentsChart.jsx";
import MaintenancePanel from "../components/MaintenancePanel.jsx";

const OWNER_STATUS = ["", "Pending", "Approved", "Rejected"];
const NAV_ITEMS = [
  { group: "Main", items: [{ label: "Dashboard", tab: "Overview", icon: "▦" }] },
  {
    group: "Management",
    items: [
      { label: "Owner Approvals", tab: "Owners", icon: "♙", count: "pending" },
      { label: "User Management", tab: "Owners", icon: "♧" },
      { label: "Agreements", tab: "Leases", icon: "▤", count: "leases" },
      { label: "Transactions", tab: "Transactions", icon: "↗" },
      { label: "Maintenance", tab: "Maintenance", icon: "⌂" },
      { label: "Platform Settings", tab: "Settings", icon: "⚙" },
    ],
  },
];

function AdminMetric({ label, value, hint, icon, tone }) {
  return (
    <article className={`admin-metric metric-${tone}`}>
      <div className="admin-metric-top">
        <span className="admin-metric-icon" aria-hidden="true">{icon}</span>
        {hint && <span className="admin-metric-hint">{hint}</span>}
      </div>
      <span className="admin-metric-label">{label}</span>
      <strong className="admin-metric-value">{value}</strong>
    </article>
  );
}

function DisputeCard({ lease, property, contract, act }) {
  const [reason, setReason] = useState("");
  const [pct, setPct] = useState(50);
  usePolling(useCallback(async () => setReason(await contract.disputeReason(lease.id)), [contract, lease.id]), 30000);
  const tenantShare = (lease.depositHeld * BigInt(pct)) / 100n;

  return (
    <LeaseCard lease={lease} property={property}>
      <p className="banner banner-warn"><strong>Dispute:</strong> {reason || "…"}</p>
      <label className="field">
        Refund to tenant: <strong>{pct}%</strong> ({eth(tenantShare)}). Owner receives {eth(lease.depositHeld - tenantShare)}.
        <input type="range" min="0" max="100" step="5" value={pct} onChange={(e) => setPct(Number(e.target.value))} />
      </label>
      <div className="actions">
        <button className="btn btn-purple" onClick={() => act(() => contract.resolveDispute(lease.id, tenantShare), "Dispute resolved")}>
          Resolve dispute
        </button>
      </div>
    </LeaseCard>
  );
}

export default function AdminDashboard() {
  const { contract, account, send, disconnect } = useWeb3();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("Overview");
  const [navSelection, setNavSelection] = useState("Dashboard");
  const [owners, setOwners] = useState([]);
  const [properties, setProperties] = useState([]);
  const [leases, setLeases] = useState([]);
  const [payments, setPayments] = useState([]);
  const [settings, setSettings] = useState({ feeBps: 0, balance: 0n, paused: false });
  const [feeInput, setFeeInput] = useState("");
  const [chainId, setChainId] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const [o, p, l, pay, bps, bal, paused, network] = await Promise.all([
      contract.getOwners(), contract.getProperties(), contract.getAllLeases(), contract.getAllPayments(),
      contract.platformFeeBps(), contract.platformBalance(), contract.paused(),
      contract.runner.provider.getNetwork(),
    ]);
    setOwners(o.map(parseOwner));
    setProperties(p.map(parseProperty));
    setLeases(l.map(parseLease));
    setPayments(pay.map(parsePayment));
    setSettings({ feeBps: Number(bps), balance: bal, paused });
    setChainId(network.chainId.toString());
  }, [contract]);
  usePolling(load);

  const act = async (fn, msg) => {
    const ok = await send(fn, msg);
    if (ok) await load();
    return ok;
  };

  const propById = Object.fromEntries(properties.map((p) => [p.id, p]));
  const disputes = leases.filter((l) => l.status === 4);
  const pendingOwners = owners.filter((o) => o.status === 1);
  const volume = payments.filter((p) => p.kind === "Rent").reduce((s, p) => s + p.amount, 0n);
  const activeLeases = leases.filter((l) => l.status === 1);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredOwners = owners.filter((owner) =>
    `${owner.name} ${owner.wallet} ${OWNER_STATUS[owner.status]}`.toLowerCase().includes(normalizedSearch)
  );
  const filteredLeases = [...leases].reverse().filter((lease) =>
    `${lease.id} ${lease.owner} ${lease.tenant} ${propById[lease.propertyId]?.name ?? ""}`.toLowerCase().includes(normalizedSearch)
  );
  const activeNav = NAV_ITEMS.flatMap((group) => group.items).find((item) => item.label === navSelection);
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  const alertCount = pendingOwners.length + disputes.length;

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-identity">
          <span className="admin-avatar" aria-hidden="true">♙</span>
          <span><strong>Administrator</strong><small>Super Admin</small></span>
        </div>
        <nav className="admin-nav" aria-label="Administrator navigation">
          {NAV_ITEMS.map((group) => (
            <section className="admin-nav-group" key={group.group}>
              <h2>{group.group}</h2>
              {group.items.map((item) => {
                const count = item.count === "pending"
                  ? pendingOwners.length
                  : item.count === "leases" ? leases.length : 0;
                const selected = navSelection === item.label && tab === item.tab;
                return (
                  <button
                    className={`admin-nav-link ${selected ? "selected" : ""}`}
                    key={item.label}
                    onClick={() => { setTab(item.tab); setNavSelection(item.label); }}
                    aria-current={selected ? "page" : undefined}
                  >
                    <span className="admin-nav-icon" aria-hidden="true">{item.icon}</span>
                    <span>{item.label}</span>
                    {count > 0 && <span className="admin-nav-count">{count}</span>}
                  </button>
                );
              })}
            </section>
          ))}
          {filteredOwners.length === 0 && <tr><td colSpan="5" className="empty">No owners match your search.</td></tr>}
        </nav>
        <div className="admin-sidebar-footer">
          <span className={`system-indicator ${settings.paused ? "offline" : ""}`} />
          <span>{settings.paused ? "Platform paused" : "System online"}</span>
          <span className="admin-version">Local</span>
        </div>
      </aside>

      <section className="admin-workspace">
        <header className="admin-topbar">
          <div className="admin-heading">
            <span className="admin-eyebrow">{activeNav?.label ?? "Administration"}</span>
            <h1>{tab === "Overview" ? "Dashboard Overview" : activeNav?.label ?? tab}</h1>
            <p>Welcome back, Administrator <span className="admin-date">{dateLabel}</span></p>
          </div>
          <div className="admin-toolbar">
            <label className="admin-search">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                placeholder="Search owners, agreements..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search owners and agreements"
              />
            </label>
            <button
              className="admin-alert-button"
              onClick={() => {
                if (pendingOwners.length) { setTab("Owners"); setNavSelection("Owner Approvals"); }
                else if (disputes.length) { setTab("Leases"); setNavSelection("Agreements"); }
                else { setTab("Overview"); setNavSelection("Dashboard"); }
              }}
              aria-label={`${alertCount} pending admin items`}
              title={alertCount ? `${alertCount} items need review` : "No pending items"}
            >
              <span aria-hidden="true">♧</span>
              {alertCount > 0 && <span className="admin-alert-count">{alertCount}</span>}
            </button>
            <button className="admin-logout" onClick={async () => {
              if (await logout()) { disconnect(); navigate("/"); }
            }}>
              <span aria-hidden="true">↪</span> Logout
            </button>
          </div>
        </header>

        <div className="admin-content">
          {tab === "Overview" && (
            <div className="admin-overview">
              <section className="admin-metrics" aria-label="Platform overview">
                <AdminMetric label="Total owners" value={owners.filter((owner) => owner.status === 2).length} hint={`${pendingOwners.length} awaiting approval`} icon="♧" tone="violet" />
                <AdminMetric label="Pending approvals" value={pendingOwners.length} hint="Owner applications" icon="◷" tone="pink" />
                <AdminMetric label="Active agreements" value={activeLeases.length} hint={`${leases.length} total agreements`} icon="▤" tone="cyan" />
                <AdminMetric label="Rent volume" value={eth(volume)} hint="On-chain rent payments" icon="↗" tone="green" />
              </section>
              <section className="admin-overview-lower">
                <div className="admin-chart-panel">
                  <PaymentsChart payments={payments} color="#2e43a4" title="Performance Metrics · Rent volume" />
                </div>
                <aside className="admin-status-panel">
                  <div className="admin-status-heading"><span aria-hidden="true">▰</span><h2>System Status</h2></div>
                  <div className="admin-status-row"><span><i className="status-dot" /> Smart contract</span><strong>Connected</strong></div>
                  <div className="admin-status-row"><span><i className={`status-dot ${settings.paused ? "status-warning" : ""}`} /> Platform</span><strong>{settings.paused ? "Paused" : "Operational"}</strong></div>
                  <div className="admin-status-row"><span><i className="status-dot" /> Network</span><strong>Chain {chainId || "—"}</strong></div>
                  <div className="admin-status-row"><span><i className="status-dot" /> Properties</span><strong>{properties.length}</strong></div>
                  <div className="admin-status-divider" />
                  <div className="admin-fee-summary">
                    <span>Fees collected</span><strong>{eth(settings.balance)}</strong><small>{settings.feeBps / 100}% platform fee</small>
                  </div>
                </aside>
              </section>
              {disputes.length > 0 && (
                <button className="admin-review-notice" onClick={() => { setTab("Leases"); setNavSelection("Agreements"); }}>
                  {disputes.length} dispute{disputes.length === 1 ? "" : "s"} need review <span>Review agreements →</span>
                </button>
              )}
            </div>
          )}

      {tab === "Owners" && (
        <div className="panel">
          <div className="panel-head"><h3>Property owners</h3></div>
          {owners.length === 0 ? <p className="empty">No owner has registered yet. Owners can request access from the landing page.</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Name</th><th>Wallet</th><th>Registered</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {filteredOwners.map((o) => (
                    <tr key={o.wallet}>
                      <td><strong>{o.name}</strong></td>
                      <td><code title={o.wallet}>{shortAddr(o.wallet)}</code></td>
                      <td>{fmtDate(o.registeredAt)}</td>
                      <td><span className={`badge badge-own-${OWNER_STATUS[o.status].toLowerCase()}`}>{OWNER_STATUS[o.status]}</span></td>
                      <td className="row-actions">
                        {o.status !== 2 && <button className="btn btn-green" onClick={() => act(() => contract.setOwnerStatus(o.wallet, true), "Owner approved")}>Approve</button>}
                        {o.status !== 3 && <button className="btn btn-ghost" onClick={() => act(() => contract.setOwnerStatus(o.wallet, false), "Owner rejected")}>Reject</button>}
                      </td>
                    </tr>
                  ))}
                  {filteredOwners.length === 0 && <tr><td colSpan="5" className="empty">No owners match your search.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "Leases" && (
        <div className="stack">
          {disputes.length > 0 && (
            <>
              <h3>Open disputes</h3>
              <div className="card-grid">
                {disputes.map((l) => <DisputeCard key={l.id} lease={l} property={propById[l.propertyId]} contract={contract} act={act} />)}
              </div>
            </>
          )}
          <h3>All leases</h3>
          {leases.length === 0 ? <p className="empty">No leases have been created yet.</p> : (
            <div className="card-grid">
              {filteredLeases.filter((l) => l.status !== 4).map((l) => (
                <LeaseCard key={l.id} lease={l} property={propById[l.propertyId]} />
              ))}
              {filteredLeases.filter((l) => l.status !== 4).length === 0 && <p className="empty">No agreements match your search.</p>}
            </div>
          )}
        </div>
      )}

      {tab === "Transactions" && <PaymentTable payments={payments} account={account} filename="platform-transactions.csv" />}
      {tab === "Maintenance" && <MaintenancePanel role="admin" account={account} />}

      {tab === "Settings" && (
        <div className="stack">
          <div className="panel">
            <div className="panel-head"><h3>Platform fee</h3></div>
            <p className="muted">Currently {settings.feeBps / 100}% of every rent payment (maximum 10%).</p>
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                act(() => contract.setPlatformFee(Math.round(Number(feeInput) * 100)), "Platform fee updated");
                setFeeInput("");
              }}
            >
              <input type="number" min="0" max="10" step="0.1" placeholder="New fee in %" value={feeInput} onChange={(e) => setFeeInput(e.target.value)} required />
              <button className="btn btn-purple">Update fee</button>
            </form>
          </div>
          <div className="panel">
            <div className="panel-head"><h3>Collected fees</h3></div>
            <p><strong>{eth(settings.balance)}</strong> available to withdraw.</p>
            <button className="btn btn-purple" disabled={settings.balance === 0n} onClick={() => act(() => contract.withdrawFees(), "Fees withdrawn to your wallet")}>Withdraw fees</button>
          </div>
          <div className="panel">
            <div className="panel-head"><h3>Emergency pause</h3></div>
            <p className="muted">
              {settings.paused ? "The platform is paused. Owners cannot add properties or create leases, and tenants cannot accept leases or pay rent." : "Pausing stops new properties, leases and payments. Deposit returns and dispute resolution keep working."}
            </p>
            <button className={`btn ${settings.paused ? "btn-green" : "btn-danger"}`} onClick={() => act(() => contract.setPaused(!settings.paused), settings.paused ? "Platform resumed" : "Platform paused")}>
              {settings.paused ? "Resume platform" : "Pause platform"}
            </button>
          </div>
        </div>
      )}
        </div>
      </section>
    </div>
  );
}
