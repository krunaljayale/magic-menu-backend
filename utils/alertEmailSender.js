const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: 587,
  secure: false,
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
    console.log(`📧 Alert email sent to admin: ${process.env.ADMIN_EMAIL}` );
  } catch (error) {
    console.error("❌ Failed to send admin alert email:", error.message);
  }
}

module.exports = { sendAdminAlertEmail };
