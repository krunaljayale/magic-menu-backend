import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

export const sendEmail = async (name, email, otp) => {
  if (!email) {
    return { status: 400, message: "No email address provided!" };
  }

  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const SENDER_EMAIL = process.env.EMAIL_USER || "noreply@magicmenu.in";

  const mailPayload = {
    sender: { name: "Magic Menu Support", email: SENDER_EMAIL },
    to: [{ email }],
    subject: "Your Magic Menu OTP",
    htmlContent: `
      <div style="font-family: Arial, sans-serif; background:#f9f9f9; padding:20px; line-height:1.5; color:#333;">
        <div style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <div style="background:#2b2d42; padding:15px; text-align:center;">
            <h1 style="color:#ffffff; margin:0; font-size:20px;">Magic Menu</h1>
          </div>
          
          <!-- Body -->
          <div style="padding:25px;">
            <p style="font-size:16px;">👋 Hello <strong>${name}</strong>,</p>
            <p style="font-size:15px; margin-top:10px;">
              Thank you for signing up with <strong>Magic Menu</strong>!<br>
              Here is your one-time password (OTP):
            </p>
            
            <div style="margin:20px auto; text-align:center;">
              <div style="display:inline-block; background:#edf2f7; border:1px dashed #2b2d42; padding:15px 25px; border-radius:8px; font-size:24px; font-weight:bold; letter-spacing:3px; color:#2b2d42;">
                ${otp}
              </div>
            </div>
            
            <p style="font-size:14px; color:#555;">
              This OTP is valid for <strong>5 minutes</strong>. Please do not share it with anyone.
            </p>
          </div>
          
          <!-- Footer -->
          <div style="background:#f1f1f1; padding:15px; text-align:center; font-size:12px; color:#777;">
            <p style="margin:0;">© ${new Date().getFullYear()} Magic Menu. All rights reserved.</p>
            <p style="margin:5px 0 0;">If you didn’t request this OTP, you can safely ignore this email.</p>
          </div>
        </div>
      </div>
    `,
    textContent: `Hello ${name}, your Magic Menu OTP is ${otp}. It is valid for 5 minutes. Please do not share it with anyone.`,
  };

  try {
    const response = await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      mailPayload,
      {
        headers: {
          "Content-Type": "application/json",
          "api-key": BREVO_API_KEY,
        },
        timeout: 8000, // allow a bit more for network
      }
    );

    if (response.status >= 200 && response.status < 300) {
      return { status: 200, message: "Email sent successfully" };
    } else {
      console.error("Brevo API Error:", response.data);
      return { status: 500, message: "Error sending email" };
    }
  } catch (error) {
    console.error(
      "Error sending email:",
      error.response?.data || error.message
    );
    return { status: 500, message: "Error sending email" };
  }
};
