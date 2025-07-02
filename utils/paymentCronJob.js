const cron = require("node-cron");
const axios = require("axios");
const PaymentLog = require("../models/paymentLog");

// Cron job that runs every 5 minutes
cron.schedule("*/5 * * * *", async () => {
  console.log("Checking pending payments...");

  const pendingPayments = await PaymentLog.find({ status: "PENDING" });

  for (const payment of pendingPayments) {
    try {
      // Replace this URL with the actual PhonePe status API endpoint and add checksum if needed.
      const response = await axios.get(`https://api.phonepe.com/apis/hermes/pg/v1/status/${payment.transactionId}`);
      if (response.data.status && response.data.status !== "PENDING") {
        payment.status = response.data.status;
        await payment.save();
      }
    } catch (error) {
      console.error(`Error checking status for ${payment.transactionId}:`, error.message);
    }
  }
});
