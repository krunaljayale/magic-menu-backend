if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const http = require("http"); // ✅ Add this
const connectDB = require("./config/connect");
const socketManager = require("./socket"); // ✅ Add this

const hotelRouter = require("./routes/hotel");
const customerRouter = require("./routes/customer");
const commonRouter = require("./routes/common");
const riderRouter = require("./routes/rider");
const adminRouter = require("./routes/admin");

const app = express();
app.use(express.json());

const { startWeeklySettlementCron } = require("./cron/weeklySettlement");
require("./cron/autoStopServing");

// Routers
app.use("/hotel", hotelRouter);
app.use("/customer", customerRouter);
app.use("/common", commonRouter);
app.use("/rider", riderRouter);
app.use("/admin", adminRouter);

// Default route
app.get("/", (req, res) => {
  res.status(200).send(`
    <html>
      <head>
        <title>MagicMenu - Coming Soon</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            text-align: center;
            margin-top: 20%;
            background-color: #f4f4f4;
            color: #333;
          }
          h1 {
            font-size: 3em;
          }
          p {
            font-size: 1.5em;
          }
        </style>
      </head>
      <body>
        <h1>🚧 Coming Soon!</h1>
        <p>We're working hard to launch <strong>www.magicmenu.in</strong></p>
      </body>
    </html>
  `);
});

app.get("/install", (req, res) => {
  // res.redirect(process.env.REDIRECT_URL);
  res.status(200).send(`
  <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Get Early Access – MagicMenu</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: sans-serif;
      background: #fafafa;
      padding: 2rem;
      max-width: 600px;
      margin: auto;
    }
    h1 {
      color: #333;
    }
    .step {
      margin: 1.5rem 0;
      padding: 1rem;
      background: white;
      border-left: 5px solid #6200ee;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    a.button {
      display: inline-block;
      background: #6200ee;
      color: white;
      padding: 0.7rem 1.2rem;
      border-radius: 5px;
      text-decoration: none;
      margin-top: 0.5rem;
    }
    small {
      color: #777;
    }
  </style>
</head>
<body>
  <h1>✨ Get Early Access to MagicMenu</h1>

  <div class="step">
    <h3>Step 1 — Unlock Access</h3>
    <p>To experience MagicMenu early, join our access group:</p>
    <a class="button" href="https://groups.google.com/g/magicmenu/" target="_blank">Join Group</a>
    <small>Use the same Google account as your Play Store login.</small>
  </div>

  <div class="step">
    <h3>Step 2 — Install the App</h3>
    <p>After joining, click below to download from Google Play:</p>
    <a class="button" href="https://play.google.com/store/apps/details?id=in.krunaljayale.MagicMenuCustomerApp" target="_blank">Install Now</a>
  </div>

  <div class="step">
    <h3>Need Help?</h3>
    <ul>
      <li>Use the same Gmail across group + Play Store</li>
      <li>Wait 5–10 minutes after joining (Google delay)</li>
      <li>Install on Android only</li>
    </ul>
  </div>
</body>
</html>`);
});

const start = async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    startWeeklySettlementCron();

    // ✅ Create HTTP server and pass to socket
    const server = http.createServer(app);
    socketManager.init(server); // 👈 Attach WebSocket

    // ✅ Listen with HTTP server (not app.listen)
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on PORT ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Server Startup Error:", error);
  }
};

start();
