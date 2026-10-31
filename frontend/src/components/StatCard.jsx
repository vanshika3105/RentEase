export default function StatCard({ label, value, hint, color = "navy" }) {
  return (
    <div className={`stat stat-${color}`}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}
