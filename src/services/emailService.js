// backend/src/services/emailService.js
import nodemailer from 'nodemailer';

// Create email transporter using YOUR exact environment variables
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const emailService = {
  
  // Send email
  async sendEmail({ to, subject, html, text }) {
    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || `"Procurement System" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html,
        text: text || this.htmlToText(html),
      };

      const result = await transporter.sendMail(mailOptions);
      console.log(`📧 Email sent to ${to}: ${result.messageId}`);
      return result;
    } catch (error) {
      console.error('❌ Error sending email:', error);
      throw error;
    }
  },

  // Convert HTML to plain text (fallback)
  htmlToText(html) {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  },

  // Test email connection
  async verifyConnection() {
    try {
      await transporter.verify();
      console.log('✅ SMTP connection verified');
      return true;
    } catch (error) {
      console.error('❌ SMTP connection failed:', error);
      return false;
    }
  }
};