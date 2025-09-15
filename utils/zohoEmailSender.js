// // zohoEmailSender.js
// const axios = require("axios");

// const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID;
// const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
// const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN;
// const ZOHO_ACCOUNT_ID = process.env.ZOHO_ACCOUNT_ID;
// const FROM_EMAIL = process.env.EMAIL_USER;

// let accessToken = null;

// // Get Zoho access token using refresh token
// async function getAccessToken() {
//   if (accessToken) return accessToken;

//   try {
//     const response = await axios.post(
//       "https://accounts.zoho.in/oauth/v2/token",
//       null,
//       {
//         params: {
//           refresh_token: ZOHO_REFRESH_TOKEN,
//           client_id: ZOHO_CLIENT_ID,
//           client_secret: ZOHO_CLIENT_SECRET,
//           grant_type: "refresh_token",
//         },
//       }
//     );

//     accessToken = response.data.access_token;

//     // Refresh token 5 minutes before expiry (~55 min)
//     setTimeout(() => (accessToken = null), 55 * 60 * 1000);

//     return accessToken;
//   } catch (err) {
//     console.error(
//       "Error getting Zoho access token:",
//       err.response?.data || err.message
//     );
//     throw new Error("Failed to get Zoho access token");
//   }
// }

// module.exports.sendEmail = async (name, email, otp) => {
//   if (!email) {
//     console.error("No email address provided!");
//     return { status: 400, message: "No email address provided!" };
//   }

//   const token = await getAccessToken();

//   const mailOptions = {
//     fromAddress: FROM_EMAIL,
//     toAddress: [{ email }],
//     subject: `Your Magic Menu OTP`,
//     content: `
// <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #ddd; border-radius: 8px; background-color: #f9f9f9;">
//   <h2 style="color: #333;">👋 Hello ${name},</h2>
//   <p style="font-size: 16px; color: #555;">
//     Thank you for signing up with <strong>Magic Menu</strong>!
//   </p>
//   <p style="font-size: 16px; color: #555;">
//     Your one-time password (OTP) is:
//   </p>
//   <div style="font-size: 28px; font-weight: bold; background-color: #fff; padding: 16px; text-align: center; border-radius: 6px; border: 2px dashed #ccc; color: #222;">
//     ${otp}
//   </div>
//   <p style="font-size: 14px; color: #777; margin-top: 16px;">
//     This OTP is valid for <strong>5 minutes</strong>. Please do not share it with anyone.
//   </p>
//   <hr style="margin: 24px 0;" />
//   <p style="font-size: 14px; color: #999;">
//     If you didn’t request this OTP, you can safely ignore this email.
//   </p>
//   <p style="font-size: 14px; color: #999;">– The Magic Menu Team</p>
// </div>
//   `,
//   };

//   try {
//     await axios.post(
//       `https://mail.zoho.in/api/accounts/${ZOHO_ACCOUNT_ID}/messages`,
//       mailOptions,
//       {
//         headers: {
//           Authorization: `Zoho-oauthtoken ${token}`,
//           "Content-Type": "application/json",
//         },
//       }
//     );

//     return { status: 200, message: "Email sent successfully" };
//   } catch (error) {
//     console.error(
//       "Error sending email:",
//       error.response?.data || error.message
//     );
//     return { status: 500, message: "Error sending email" };
//   }
// };
