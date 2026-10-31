// Buttons shown on a lease depending on who is looking at it and the lease status.
// role: "owner" | "tenant". act(fn, successMessage) sends the tx and refreshes data.
export default function LeaseActions({ lease, role, due, contract, act }) {
  const s = lease.status; // 0 Created 1 Active 2 Completed 3 Terminated 4 Disputed 5 Cancelled
  const buttons = [];
  const add = (label, fn, msg, cls = "btn-primary", confirmText) =>
    buttons.push(
      <button
        key={label}
        className={`btn ${cls}`}
        onClick={() => (!confirmText || window.confirm(confirmText)) && act(fn, msg)}
      >
        {label}
      </button>
    );
  const dispute = () => {
    const reason = window.prompt("Describe the dispute (the admin will review it):");
    if (reason && reason.trim()) act(() => contract.raiseDispute(lease.id, reason.trim()), "Dispute raised");
  };
  const canDispute = lease.depositHeld > 0n && (s === 1 || s === 2 || s === 3);

  if (role === "owner") {
    if (s === 0) add("Cancel lease", () => contract.cancelLease(lease.id), "Lease cancelled", "btn-ghost", "Cancel this lease?");
    if (s === 1) {
      if (lease.paidMonths >= lease.durationMonths) add("Complete lease", () => contract.completeLease(lease.id), "Lease completed", "btn-green");
      add("Terminate", () => contract.terminateLease(lease.id), "Lease terminated", "btn-ghost", "Terminate this lease early?");
    }
    if ((s === 2 || s === 3) && lease.depositHeld > 0n)
      add("Return deposit", () => contract.returnDeposit(lease.id), "Deposit returned to tenant", "btn-green");
  }

  if (role === "tenant") {
    if (s === 0)
      add(`Accept and pay deposit`, () => contract.acceptLease(lease.id, { value: lease.deposit }), "Lease accepted. Deposit is held in escrow", "btn-green");
    if (s === 1 && due && lease.paidMonths < lease.durationMonths)
      add("Pay rent", () => contract.payRent(lease.id, { value: due.total }), "Rent paid", "btn-green");
    if (s === 1) add("Terminate", () => contract.terminateLease(lease.id), "Lease terminated", "btn-ghost", "Terminate this lease early?");
  }

  if (canDispute) buttons.push(<button key="dispute" className="btn btn-danger" onClick={dispute}>Raise dispute</button>);

  if (s === 4) return <p className="banner banner-warn">Dispute open. Waiting for the admin to resolve it.</p>;
  if (!buttons.length) return null;
  return <div className="actions">{buttons}</div>;
}
