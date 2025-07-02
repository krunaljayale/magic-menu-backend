const nodemailer = require("nodemailer");

module.exports.sendEmail = async (name, email, otp) => {
  if (!email) {
    console.error("No email address provided!");
    return { status: 400, message: "No email address provided!" };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST, // e.g., smtp.gmail.com
    port: parseInt(process.env.EMAIL_PORT || "587"),
    secure: process.env.EMAIL_PORT === "465", // true for 465, false for 587
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: `"Magic Menu Support" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `Your Magic Menu OTP`,
    text: `Hello ${name},

Thank you for choosing Magic Menu!

Your one-time password (OTP) is: ${otp}

This OTP is valid for 5 minutes. Please do not share it with anyone.

If you didn’t request this, please ignore this email.

– The Magic Menu Team`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #ddd; border-radius: 8px; background-color: #f9f9f9;">
        <h2 style="color: #333;">👋 Hello ${name},</h2>
        <p style="font-size: 16px; color: #555;">
          Thank you for signing up with <strong>Magic Menu</strong>!
        </p>
        <p style="font-size: 16px; color: #555;">
          Your one-time password (OTP) is:
        </p>
        <div style="font-size: 28px; font-weight: bold; background-color: #fff; padding: 16px; text-align: center; border-radius: 6px; border: 2px dashed #ccc; color: #222;">
          ${otp}
        </div>
        <p style="font-size: 14px; color: #777; margin-top: 16px;">
          This OTP is valid for <strong>5 minutes</strong>. Please do not share it with anyone.
        </p>
        <hr style="margin: 24px 0;" />
        <p style="font-size: 14px; color: #999;">
          If you didn’t request this OTP, you can safely ignore this email.
        </p>
        <p style="font-size: 14px; color: #999;">– The Magic Menu Team</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { status: 200, message: "Email sent successfully" };
  } catch (error) {
    console.error("Error sending email:", error);
    return { status: 500, message: "Error sending email" };
  }
};
