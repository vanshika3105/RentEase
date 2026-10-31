import { LEASE_STATUS } from "../utils/format.js";

export default function StatusBadge({ status }) {
  const name = LEASE_STATUS[status] ?? "Unknown";
  return <span className={`badge badge-${name.toLowerCase()}`}>{name}</span>;
}
