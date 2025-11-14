// timeUtil.js

// Converts any UTC Date → IST Date
module.exports.convertToIST = (utcDate) => {
  return new Date(utcDate.getTime() + 5.5 * 60 * 60 * 1000);
};

// ─────────────────────────────────────
// CONFIG — change ONLY this value
const COD_CUTOFF_IST = process.env.COD_CUTOFF_IST || "20:30";
// ─────────────────────────────────────

// Internal helper to get IST time
function getISTDate() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );
}

// Check cutoff
module.exports.isAfterCutoffIST = () => {
  const [cutHour, cutMinute] = COD_CUTOFF_IST.split(":").map(Number);

  const ist = getISTDate();
  const hour = ist.getHours();
  const minute = ist.getMinutes();

  return hour > cutHour || (hour === cutHour && minute >= cutMinute);
};
