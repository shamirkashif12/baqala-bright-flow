export const sar = (n: number) => `ر.س ${n.toFixed(2)}`;
export const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};
export const todayISO = () => new Date().toISOString();