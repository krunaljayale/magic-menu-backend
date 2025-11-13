// utils/logger.js (simple helper)
const logError = (title, err) => {
  console.error(`[${new Date().toISOString()}] ${title}`);
  if (err && err.response && err.response.data) {
    console.error("Response data:", JSON.stringify(err.response.data));
  } else if (err && err.message) {
    console.error("Error message:", err.message);
  } else {
    console.error(err);
  }
};

module.exports = { logError };
