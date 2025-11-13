// paymentUtil.js
const axios = require("axios");
const querystring = require("querystring");

let cachedToken = null;
let tokenExpiryAt = 0;
let inflightTokenPromise = null; // to prevent concurrent requests

const DEFAULT_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes fallback
const AXIOS_TIMEOUT_MS = 7000; // 7 seconds

module.exports.generateTransactionID = () => {
  // Get current UTC time
  const now = new Date();

  // Convert UTC to IST (UTC + 5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);

  const day = String(istDate.getDate()).padStart(2, "0");
  const month = String(istDate.getMonth() + 1).padStart(2, "0");
  const year = istDate.getFullYear();

  const random = Math.floor(Math.random() * 1000000); // 6-digit random number

  return `T${day}${month}${year}${random}`;
};

module.exports.generateMerchandUserID = () => {
  // Get current UTC time
  const now = new Date();

  // Convert UTC to IST (UTC + 5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);

  const day = String(istDate.getDate()).padStart(2, "0");
  const month = String(istDate.getMonth() + 1).padStart(2, "0");
  const year = istDate.getFullYear();

  const random = Math.floor(Math.random() * 1000000); // 6-digit random number

  return `MUID_${day}${month}${year}${random}`;
};

module.exports.generateTicket = () => {
  return Math.floor(100000 + Math.random() * 900000);
};

function getTokenUrl() {
  const isProd =
    (process.env.PHONEPE_ENVIRONMENT || "").toUpperCase() === "PRODUCTION";

  return isProd
    ? "https://api.phonepe.com/apis/identity-manager/v1/oauth/token"
    : "https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token";
}

function validateEnv() {
  if (!process.env.PHONEPE_CLIENT_ID || !process.env.PHONEPE_CLIENT_SECRET) {
    throw new Error(
      "Missing PHONEPE_CLIENT_ID or PHONEPE_CLIENT_SECRET in environment"
    );
  }
}

async function requestNewToken() {
  validateEnv();
  const url = getTokenUrl();

  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  const data = querystring.stringify({
    grant_type: "client_credentials",
    client_id: process.env.PHONEPE_CLIENT_ID,
    client_secret: process.env.PHONEPE_CLIENT_SECRET,
    client_version: process.env.PHONEPE_CLIENT_VERSION || 1,
  });

  const axiosOptions = { headers, timeout: AXIOS_TIMEOUT_MS };

  const resp = await axios.post(url, data, axiosOptions);
  const token = resp.data?.access_token;
  const expiresAt = resp.data?.expires_at;

  if (!token) {
    const bodyStr = JSON.stringify(resp.data || {});
    throw new Error(`PhonePe token response missing access_token: ${bodyStr}`);
  }

  const now = Date.now();
  let expiryMs = DEFAULT_TOKEN_TTL_MS;
  if (expiresAt) {
    // expires_at in docs is epoch seconds
    const parsed = parseInt(expiresAt, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      expiryMs = parsed * 1000 - now;
    }
  }

  // apply small safety margin (refresh 30s before actual expiry)
  tokenExpiryAt = now + Math.max(0, expiryMs) - 30_000;
  cachedToken = token;

  return cachedToken;
}

/**
 * getPhonePeToken - main exported function
 * Uses cached token if valid, otherwise uses inflight promise or requests a new token.
 */
module.exports.getPhonePeToken = async () => {
  const now = Date.now();
  if (cachedToken && now < tokenExpiryAt) {
    return cachedToken;
  }

  // If a token request is already in-flight, wait for it
  if (inflightTokenPromise) {
    try {
      return await inflightTokenPromise;
    } catch (e) {
      // If inflight failed, clear and continue to attempt a fresh request below
      inflightTokenPromise = null;
    }
  }

  // create a new inflight promise and store it
  inflightTokenPromise = requestNewToken();

  try {
    const token = await inflightTokenPromise;
    return token;
  } finally {
    inflightTokenPromise = null;
  }
};

/**
 * getTokenInfo - useful for debugging / monitoring
 * returns { cached: boolean, expiresAt: epochMs, msRemaining }
 */
module.exports.getTokenInfo = () => {
  if (!cachedToken) return { cached: false, expiresAt: null, msRemaining: 0 };
  const now = Date.now();
  const msRemaining = Math.max(0, tokenExpiryAt - now);
  return { cached: true, expiresAt: tokenExpiryAt, msRemaining };
};
