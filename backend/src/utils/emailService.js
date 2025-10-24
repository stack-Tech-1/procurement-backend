// src/utils/emailService.js
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

// Nodemailer setup using environment variables
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT),
    secure: false, // For port 587 (TLS/STARTTLS)
    requireTLS: true, // Enforce TLS security
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    // Allows logging of connection issues
    logger: true, 
});

export async function sendVendorNotification(toEmail, subject, body, html = null) {
    if (!toEmail || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.error("Email service: Configuration missing or recipient email is invalid.");
        return false;
    }

    try {
        const info = await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: toEmail,
            subject: subject,
            text: body,
            // html: html, // Uncomment if you use HTML templates
        });

        console.log(`\n--- VENDOR EMAIL SENT VIA GMAIL ---`);
        console.log(`TO: ${toEmail}`);
        console.log(`SUBJECT: ${subject}`);
        console.log(`Message ID: ${info.messageId}`);
        console.log(`------------------------------------\n`);
        return true;

    } catch (error) {
        console.error('❌ Email Service Failed to Send:', error.message);
        // Specifically check for authentication errors
        if (error.code === 'EAUTH') {
             console.error('     -> AUTH ERROR: Check your Gmail App Password and EMAIL_USER in .env.');
        }
        return false;
    }
}