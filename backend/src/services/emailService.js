const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT);

// Create reusable transporter object using SMTP transport.
// Only attempt this if SMTP is actually configured — passing an undefined
// host/port into nodemailer can throw synchronously during connection setup
// (outside its normal callback-based error handling), which previously
// surfaced as an uncaught exception on every server boot when SMTP env vars
// were unset.
let transporter = null;
if (smtpConfigured) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    // Force IPv4
    connection: {
      family: 4
    }
  });

  // Log email configuration (without sensitive data)
  logger.info('Email Configuration:', {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === 'true',
    from: process.env.SMTP_FROM,
    company: process.env.COMPANY_NAME
  });

  // Verify connection configuration
  transporter.verify(function(error, success) {
    if (error) {
      logger.error('Error verifying email configuration:', error);
    } else {
      logger.info('Email server is ready to send messages');
    }
  });
} else {
  logger.warn('SMTP_HOST/SMTP_PORT not configured — email sending (invoices, password reset) is disabled.');
}

const emailService = {
  async sendInvoice({ to, invoiceNumber, pdf }) {
    if (!transporter) {
      throw new Error('Email is not configured on this server (SMTP_HOST/SMTP_PORT missing).');
    }
    try {
      const info = await transporter.sendMail({
        from: '"' + process.env.COMPANY_NAME + '" <' + process.env.SMTP_FROM + '>',
        to: to,
        subject: 'Invoice #' + invoiceNumber,
        html: 
          '<h2>Invoice #' + invoiceNumber + '</h2>' +
          '<p>Thank you for your business. Please find your invoice attached.</p>' +
          '<p>If you have any questions, please don\'t hesitate to contact us.</p>' +
          '<br>' +
          '<p>Best regards,</p>' +
          '<p>' + process.env.COMPANY_NAME + '</p>',
        attachments: [
          {
            filename: 'invoice-' + invoiceNumber + '.pdf',
            content: pdf,
            contentType: 'application/pdf'
          }
        ]
      });

      logger.info('Email sent:', info.messageId);
      return info;
    } catch (error) {
      logger.error('Error sending email:', error);
      throw error;
    }
  },

  async sendPasswordReset({ to, resetUrl }) {
    if (!transporter) {
      throw new Error('Email is not configured on this server (SMTP_HOST/SMTP_PORT missing).');
    }
    try {
      const info = await transporter.sendMail({
        from: '"' + process.env.COMPANY_NAME + '" <' + process.env.SMTP_FROM + '>',
        to: to,
        subject: 'Reset your ' + process.env.COMPANY_NAME + ' password',
        html:
          '<h2>Password Reset Request</h2>' +
          '<p>We received a request to reset your password. This link expires in 15 minutes.</p>' +
          '<p><a href="' + resetUrl + '">Reset your password</a></p>' +
          '<p>If you did not request this, you can safely ignore this email.</p>' +
          '<br>' +
          '<p>Best regards,</p>' +
          '<p>' + process.env.COMPANY_NAME + '</p>'
      });

      logger.info('Password reset email sent:', info.messageId);
      return info;
    } catch (error) {
      logger.error('Error sending password reset email:', error);
      throw error;
    }
  }
};

module.exports = emailService;