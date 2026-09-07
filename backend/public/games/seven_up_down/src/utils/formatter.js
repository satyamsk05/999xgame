export function formatCurrency(amount) {
  return `₹${Number(amount || 0).toFixed(2)}`;
}

export function formatShortCurrency(amount) {
  const num = Number(amount || 0);
  if (num >= 1000) {
    return `${num / 1000}K`;
  }
  return `₹${num}`;
}
