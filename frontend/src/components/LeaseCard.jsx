import { useState } from "react";
import StatusBadge from "./StatusBadge.jsx";
import { eth, fmtDate, shortAddr } from "../utils/format.js";
import { documentUrl, verifyDocument } from "../utils/api.js";
import { useWeb3 } from "../context/Web3Context.jsx";

// party: which counterparty to show ("tenant" for owners, "owner" for tenants, "both" for admin)
export default function LeaseCard({ lease, property, party = "both", due, children }) {
  const { notify } = useWeb3();
  const [checking, setChecking] = useState(false);
  const pct = Math.min(100, Math.round((lease.paidMonths / lease.durationMonths) * 100));

  async function verify() {
    setChecking(true);
    try {
      const ok = await verifyDocument(lease.docHash);
      notify(ok ? "success" : "error", ok ? "Document matches the hash stored on-chain" : "Document does NOT match the on-chain hash");
    } catch (e) {
      notify("error", e.message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <article className="lease-card">
      <header>
        <div>
          <h3>{property?.name ?? `Property #${lease.propertyId}`}</h3>
          <p className="muted">{property?.location} · Lease #{lease.id}</p>
        </div>
        <StatusBadge status={lease.status} />
      </header>

      <dl className="lease-grid">
        <div><dt>Monthly rent</dt><dd>{eth(lease.rent)}</dd></div>
        <div><dt>Deposit</dt><dd>{eth(lease.deposit)}{lease.depositHeld > 0n && <small> (held {eth(lease.depositHeld)})</small>}</dd></div>
        <div><dt>Duration</dt><dd>{lease.durationMonths} months</dd></div>
        <div><dt>Start date</dt><dd>{fmtDate(lease.startDate)}</dd></div>
        {party !== "owner" && <div><dt>Tenant</dt><dd><code title={lease.tenant}>{shortAddr(lease.tenant)}</code></dd></div>}
        {party !== "tenant" && <div><dt>Owner</dt><dd><code title={lease.owner}>{shortAddr(lease.owner)}</code></dd></div>}
      </dl>

      {lease.status !== 0 && lease.status !== 5 && (
        <div className="progress-wrap">
          <div className="progress"><div style={{ width: `${pct}%` }} /></div>
          <small>{lease.paidMonths} of {lease.durationMonths} rent payments made</small>
        </div>
      )}

      {due && due.lateFee > 0n && (
        <p className="banner banner-warn">Rent is overdue. A late fee of {eth(due.lateFee)} applies.</p>
      )}

      {lease.docHash && (
        <p className="doc-row">
          <a href={documentUrl(lease.docHash)} target="_blank" rel="noreferrer">Download agreement (PDF)</a>
          <button className="link-btn" onClick={verify} disabled={checking}>
            {checking ? "Checking…" : "Verify integrity"}
          </button>
        </p>
      )}

      {children}
    </article>
  );
}
