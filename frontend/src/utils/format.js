import { formatEther } from "ethers";

export const LEASE_STATUS = ["Created", "Active", "Completed", "Terminated", "Disputed", "Cancelled"];
export const ROLE_LABEL = { 0: "Tenant", 1: "Admin", 2: "Owner", 3: "Owner (pending)", 4: "Owner (rejected)" };

export const sameAddr = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
export const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "-");
export const eth = (v) =>
  `${Number(formatEther(v ?? 0n)).toLocaleString(undefined, { maximumFractionDigits: 4 })} ETH`;
export const ethNum = (v) => Number(formatEther(v ?? 0n));
export const fmtDate = (ts) =>
  ts && Number(ts) > 0
    ? new Date(Number(ts) * 1000).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
    : "-";
export const fmtDateTime = (ts) =>
  ts && Number(ts) > 0 ? new Date(Number(ts) * 1000).toLocaleString() : "-";

// ethers v6 returns read-only Result objects. Convert them to plain objects.
export const parseLease = (l) => ({
  id: Number(l.id),
  propertyId: Number(l.propertyId),
  owner: l.owner,
  tenant: l.tenant,
  rent: l.rent,
  deposit: l.deposit,
  depositHeld: l.depositHeld,
  startDate: Number(l.startDate),
  durationMonths: Number(l.durationMonths),
  paidMonths: Number(l.paidMonths),
  docHash: l.docHash,
  status: Number(l.status),
  createdAt: Number(l.createdAt),
});
export const parseProperty = (p) => ({
  id: Number(p.id), owner: p.owner, name: p.name, location: p.location, createdAt: Number(p.createdAt),
});
export const parsePayment = (p) => ({
  id: Number(p.id), leaseId: Number(p.leaseId), payer: p.payer, receiver: p.receiver,
  amount: p.amount, platformFee: p.platformFee, lateFee: p.lateFee,
  timestamp: Number(p.timestamp), kind: p.kind,
});
export const parseOwner = (o) => ({
  wallet: o.wallet, name: o.name, status: Number(o.status), registeredAt: Number(o.registeredAt),
});

export function downloadCSV(filename, rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function paymentsToCSV(payments) {
  return [
    ["ID", "Lease", "Type", "From", "To", "Amount (ETH)", "Platform fee (ETH)", "Late fee (ETH)", "Date"],
    ...payments.map((p) => [
      p.id, p.leaseId, p.kind, p.payer, p.receiver,
      formatEther(p.amount), formatEther(p.platformFee), formatEther(p.lateFee), fmtDateTime(p.timestamp),
    ]),
  ];
}
