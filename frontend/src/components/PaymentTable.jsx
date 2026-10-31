import artifact from "../contracts/RentEase.json";
import { eth, fmtDateTime, paymentsToCSV, downloadCSV, sameAddr, shortAddr } from "../utils/format.js";

export default function PaymentTable({ payments, account, filename = "rentease-transactions.csv" }) {
  const rows = [...payments].sort((a, b) => b.timestamp - a.timestamp);
  const label = (addr) => {
    if (sameAddr(addr, account)) return "You";
    if (sameAddr(addr, artifact.address)) return "Escrow";
    return shortAddr(addr);
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Transactions</h3>
        <button className="btn btn-ghost" disabled={!rows.length} onClick={() => downloadCSV(filename, paymentsToCSV(rows))}>
          Export CSV
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="empty">No transactions yet. Payments appear here as soon as they are confirmed on-chain.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Date</th><th>Lease</th><th>Type</th><th>From</th><th>To</th><th>Amount</th><th>Fees</th></tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>{fmtDateTime(p.timestamp)}</td>
                  <td>#{p.leaseId}</td>
                  <td>{p.kind}</td>
                  <td>{label(p.payer)}</td>
                  <td>{label(p.receiver)}</td>
                  <td><strong>{eth(p.amount)}</strong></td>
                  <td className="muted">
                    {p.platformFee > 0n && <>platform {eth(p.platformFee)}</>}
                    {p.lateFee > 0n && <> late {eth(p.lateFee)}</>}
                    {p.platformFee === 0n && p.lateFee === 0n && "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
