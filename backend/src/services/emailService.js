const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// Create reusable transporter object using SMTP transport
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Verify connection configuration
transporter.verify(function(error, success) {
  if (error) {
    logger.error('Error verifying email configuration:', error);
  } else {
    logger.info('Email server is ready to send messages');
  }
});

const emailService = {
  async sendInvoice({ to, invoiceNumber, pdf }) {
    try {
      const info = await transporter.sendMail({
        from: \`"\${process.env.COMPANY_NAME}" <\${process.env.SMTP_FROM}>\`,
        to: to,
        subject: \`Invoice #\${invoiceNumber}\`,
        html: \`
          <h2>Invoice #\${invoiceNumber}</h2>
          <p>Thank you for your business. Please find your invoice attached.</p>
          <p>If you have any questions, please don't hesitate to contact us.</p>
          <br>
          <p>Best regards,</p>
          <p>\${process.env.COMPANY_NAME}</p>
        \`,
        attachments: [
          {
            filename: \`invoice-\${invoiceNumber}.pdf\`,
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
  }
};

module.exports = emailService;