const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST, // e.g., smtp.gmail.com
  port: parseInt(process.env.EMAIL_PORT || "587"),
  secure: process.env.EMAIL_PORT === "465", // true for 465, false for 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendAdminAlertEmail(subject, body) {
  try {
    await transporter.sendMail({
      from: `"Magic Menu System" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL, // Set this in your .env
      subject,
      text: body,
    });
    console.log(`📧 Alert email sent to admin: ${process.env.ADMIN_EMAIL}`);
  } catch (error) {
    console.error("❌ Failed to send admin alert email:", error.message);
  }
}

module.exports = { sendAdminAlertEmail };
