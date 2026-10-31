import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ethNum } from "../utils/format.js";

// Rent volume per day (only "Rent" payments).
export default function PaymentsChart({ payments, color = "#2980b9", title = "Rent payments" }) {
  const byDay = {};
  payments
    .filter((p) => p.kind === "Rent")
    .forEach((p) => {
      const day = new Date(p.timestamp * 1000).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
      byDay[day] = (byDay[day] || 0) + ethNum(p.amount);
    });
  const data = Object.entries(byDay).map(([day, amount]) => ({ day, amount: Number(amount.toFixed(4)) }));

  return (
    <div className="panel">
      <div className="panel-head"><h3>{title}</h3></div>
      {data.length === 0 ? (
        <p className="empty">No rent has been paid yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="day" />
            <YAxis unit=" Ξ" width={56} />
            <Tooltip formatter={(v) => `${v} ETH`} />
            <Bar dataKey="amount" fill={color} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
