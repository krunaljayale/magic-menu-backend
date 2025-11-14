// utils/phonepeAuth.js
const crypto = require("crypto");

/**
 * Constant-time safe string compare
 */
const safeCompare = (a, b) => {
  try {
    const bufA = Buffer.from(String(a), "utf8");
    const bufB = Buffer.from(String(b), "utf8");
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
};

/**
 * Extract SHA256 token from Authorization header.
 * Accepts formats:
 *  - SHA256 <hex>
 *  - SHA256(<hex>)
 *  - <hex>
 */
const extractToken = (headerRaw) => {
  if (!headerRaw) return null;
  let header = String(headerRaw).trim();

  // Case 1: SHA256(<hex>)
  if (/^SHA256\(/i.test(header)) {
    const m = header.match(/^SHA256\((.+)\)$/i);
    if (m) return m[1].trim();
  }

  // Case 2: SHA256 <hex>
  if (/^SHA256\s+/i.test(header)) {
    return header.split(/\s+/)[1]?.trim() || null;
  }

  // Case 3: raw hex token
  return header.trim();
};

/**
 * Verify PhonePe webhook using SHA256(username:password)
 */
const verifyPhonePeWebhookAuth = (req) => {
  const headerRaw =
    req.headers["authorization"] ||
    req.headers["Authorization"] ||
    null;

  const incomingToken = extractToken(headerRaw);
  if (!incomingToken) return false;

  const USER = (process.env.PHONEPE_CB_USER || "").trim();
  const PASS = (process.env.PHONEPE_CB_PASS || "").trim();
  if (!USER || !PASS) {
    console.error("PhonePe webhook env missing: PHONEPE_CB_USER/PASS");
    return false;
  }

  // Compute expected SHA256(username:password)
  const expected = crypto
    .createHash("sha256")
    .update(`${USER}:${PASS}`)
    .digest("hex")
    .trim();

  return safeCompare(incomingToken, expected);
};

module.exports = { verifyPhonePeWebhookAuth };
