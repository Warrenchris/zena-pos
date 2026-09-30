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
    // Force IPv4 — top-level option passed directly to net.connect()
    family: 4
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

function getMailer() {
  if (transporter) return transporter;
  if (isEmailConfigured()) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      family: 4
    });
  }
  return null;
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
    const mailer = transporter || (isEmailConfigured() ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      family: 4
    }) : null);
    if (!mailer) {
      throw new Error('Email is not configured on this server (SMTP_HOST/SMTP_PORT missing).');
    }
    try {
      const info = await mailer.sendMail({
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
  },

  async sendVerificationEmail({ to, verificationUrl }) {
    const mailer = transporter || (isEmailConfigured() ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      family: 4
    }) : null);
    if (!mailer) {
      throw new Error('Email is not configured on this server (SMTP_HOST/SMTP_PORT missing).');
    }
    try {
      const companyName = process.env.COMPANY_NAME || 'Zana POS';
      const fromAddress = process.env.SMTP_FROM || 'noreply@zanapos.com';
      const info = await mailer.sendMail({
        from: '"' + companyName + '" <' + fromAddress + '>',
        to: to,
        subject: 'Verify your ' + companyName + ' email address',
        html:
          '<h2>Verify your email address</h2>' +
          '<p>Welcome to ' + companyName + '! Please verify your email address to keep full access to your account.</p>' +
          '<p><a href="' + verificationUrl + '">Verify email address</a></p>' +
          '<p>This verification link expires in 24 hours.</p>' +
          '<p>If you did not sign up for this account, you can safely ignore this email.</p>' +
          '<br>' +
          '<p>Best regards,</p>' +
          '<p>' + companyName + '</p>'
      });

      logger.info('Verification email sent:', info.messageId);
      return info;
    } catch (error) {
      logger.error('Error sending verification email:', error);
      throw error;
    }
  },

  async sendTrialEndingEmail({ to, name, daysRemaining, trialEndsAt, upgradeUrl }) {
    const mailer = getMailer();
    if (!mailer) {
      throw new Error('Email is not configured on this server (SMTP_HOST/SMTP_PORT missing).');
    }
    const companyName = process.env.COMPANY_NAME || 'Zana POS';
    const fromAddress = process.env.SMTP_FROM || 'noreply@zanapos.com';
    const formattedDate = trialEndsAt ? new Date(trialEndsAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
    const dayText = daysRemaining === 1 ? '1 day' : `${daysRemaining} days`;

    const subject = `Action Required: Your ${companyName} trial ends in ${dayText}`;
    const html = `
      <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a56db;">Your Trial Ends Soon</h2>
        <p>Hello ${name || 'Valued Customer'},</p>
        <p>Your free trial of <strong>${companyName}</strong> will expire in <strong>${dayText}</strong>${formattedDate ? ` on <strong>${formattedDate}</strong>` : ''}.</p>
        <p>To ensure uninterrupted access to your POS system, inventory management, and sales reports, please choose a subscription plan before your trial ends.</p>
        ${upgradeUrl ? `<div style="margin: 24px 0;"><a href="${upgradeUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Choose a Plan</a></div>` : ''}
        <p style="font-size: 13px; color: #666;">If your trial expires, your account will enter a limited grace period before features are suspended.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 13px; color: #666;">Best regards,<br/>The ${companyName} Team</p>
      </div>
    `;

    try {
      const info = await mailer.sendMail({
        from: `"${companyName}" <${fromAddress}>`,
        to,
        subject,
        html
      });
      logger.info('Trial ending email sent:', info.messageId);
      return info;
    } catch (error) {
      logger.error('Error sending trial ending email:', error);
      throw error;
    }
  },

  async sendRenewalDueEmail({ to, name, planName, amount, currency, currentPeriodEnd, renewalUrl }) {
    const mailer = getMailer();
    if (!mailer) {
      throw new Error('Email is not configured on this server (SMTP_HOST/SMTP_PORT missing).');
    }
    const companyName = process.env.COMPANY_NAME || 'Zana POS';
    const fromAddress = process.env.SMTP_FROM || 'noreply@zanapos.com';
    const formattedDate = currentPeriodEnd ? new Date(currentPeriodEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
    const formattedAmount = `${currency || 'KES'} ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    const subject = `Upcoming Renewal: Your ${companyName} subscription renews on ${formattedDate}`;
    const html = `
      <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a56db;">Subscription Renewal Reminder</h2>
        <p>Hello ${name || 'Valued Customer'},</p>
        <p>Your subscription for the <strong>${planName || 'Standard'}</strong> plan is scheduled for renewal on <strong>${formattedDate}</strong>.</p>
        <div style="background-color: #f3f4f6; padding: 16px; border-radius: 6px; margin: 16px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Plan:</strong> ${planName || 'Standard'}</p>
          <p style="margin: 0 0 8px 0;"><strong>Renewal Amount:</strong> ${formattedAmount}</p>
          <p style="margin: 0;"><strong>Renewal Date:</strong> ${formattedDate}</p>
        </div>
        ${renewalUrl ? `<div style="margin: 24px 0;"><a href="${renewalUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Manage Subscription</a></div>` : ''}
        <p style="font-size: 13px; color: #666;">Please ensure your payment details are up to date to prevent any service interruption.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 13px; color: #666;">Best regards,<br/>The ${companyName} Team</p>
      </div>
    `;

    try {
      const info = await mailer.sendMail({
        from: `"${companyName}" <${fromAddress}>`,
        to,
        subject,
        html
      });
      logger.info('Renewal due email sent:', info.messageId);
      return info;
    } catch (error) {
      logger.error('Error sending renewal due email:', error);
      throw error;
    }
  },

  async sendPaymentReceiptEmail({ to, name, invoiceNumber, amount, currency, paymentMethod, newPeriodEnd, receiptUrl }) {
    const mailer = getMailer();
    if (!mailer) {
      throw new Error('Email is not configured on this server (SMTP_HOST/SMTP_PORT missing).');
    }
    const companyName = process.env.COMPANY_NAME || 'Zana POS';
    const fromAddress = process.env.SMTP_FROM || 'noreply@zanapos.com';
    const formattedDate = newPeriodEnd ? new Date(newPeriodEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null;
    const formattedAmount = `${currency || 'KES'} ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    const subject = `Payment Received: Invoice #${invoiceNumber}`;
    const html = `
      <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #059669;">Payment Confirmation</h2>
        <p>Hello ${name || 'Valued Customer'},</p>
        <p>Thank you! We have received your payment for invoice <strong>#${invoiceNumber}</strong>.</p>
        <div style="background-color: #f3f4f6; padding: 16px; border-radius: 6px; margin: 16px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Invoice:</strong> #${invoiceNumber}</p>
          <p style="margin: 0 0 8px 0;"><strong>Amount Paid:</strong> ${formattedAmount}</p>
          <p style="margin: 0 0 8px 0;"><strong>Payment Method:</strong> ${paymentMethod ? paymentMethod.toUpperCase() : 'CARD'}</p>
          ${formattedDate ? `<p style="margin: 0;"><strong>Coverage Valid Through:</strong> ${formattedDate}</p>` : ''}
        </div>
        ${receiptUrl ? `
        <div style="margin: 24px 0;">
          <a href="${receiptUrl}" style="background-color: #059669; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">View Invoice</a>
        </div>` : ''}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 13px; color: #666;">Best regards,<br/>The ${companyName} Team</p>
      </div>
    `;

    try {
      const info = await mailer.sendMail({
        from: `"${companyName}" <${fromAddress}>`,
        to,
        subject,
        html
      });
      logger.info('Payment receipt email sent:', info.messageId);
      return info;
    } catch (error) {
      logger.error('Error sending payment receipt email:', error);
      throw error;
    }
  },

  async sendPaymentFailedEmail({ to, name, invoiceNumber, amount, currency, reason, retryUrl }) {
    const mailer = getMailer();
    if (!mailer) {
      throw new Error('Email is not configured on this server (SMTP_HOST/SMTP_PORT missing).');
    }
    const companyName = process.env.COMPANY_NAME || 'Zana POS';
    const fromAddress = process.env.SMTP_FROM || 'noreply@zanapos.com';
    const formattedAmount = `${currency || 'KES'} ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    const subject = `Payment Failed: Action needed for invoice #${invoiceNumber}`;
    const html = `
      <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #dc2626;">Payment Failed</h2>
        <p>Hello ${name || 'Valued Customer'},</p>
        <p>We were unable to process your payment of <strong>${formattedAmount}</strong> for invoice <strong>#${invoiceNumber}</strong>.</p>
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
        <p>Please update your payment method or retry the transaction to prevent service interruption.</p>
        ${retryUrl ? `
        <div style="margin: 24px 0;">
          <a href="${retryUrl}" style="background-color: #dc2626; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Retry Payment</a>
        </div>` : ''}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 13px; color: #666;">Best regards,<br/>The ${companyName} Team</p>
      </div>
    `;

    try {
      const info = await mailer.sendMail({
        from: `"${companyName}" <${fromAddress}>`,
        to,
        subject,
        html
      });
      logger.info('Payment failed email sent:', info.messageId);
      return info;
    } catch (error) {
      logger.error('Error sending payment failed email:', error);
      throw error;
    }
  },

  async sendAccountSuspendedEmail({ to, name, gracePeriodEnd, reactivateUrl }) {
    const mailer = getMailer();
    if (!mailer) {
      throw new Error('Email is not configured on this server (SMTP_HOST/SMTP_PORT missing).');
    }
    const companyName = process.env.COMPANY_NAME || 'Zana POS';
    const fromAddress = process.env.SMTP_FROM || 'noreply@zanapos.com';
    const formattedDate = gracePeriodEnd ? new Date(gracePeriodEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null;

    const subject = `Account Suspended: ${companyName} subscription past grace period`;
    const html = `
      <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #dc2626;">Your Account Has Been Suspended</h2>
        <p>Hello ${name || 'Valued Customer'},</p>
        <p>Your <strong>${companyName}</strong> subscription grace period ${formattedDate ? `ended on <strong>${formattedDate}</strong>` : 'has ended'}, and your account has been suspended.</p>
        <p>While suspended, store operations, product management, and reporting features are restricted. Your data remains safe and preserved.</p>
        ${reactivateUrl ? `
        <div style="margin: 24px 0;">
          <a href="${reactivateUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reactivate Account</a>
        </div>` : ''}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 13px; color: #666;">Best regards,<br/>The ${companyName} Team</p>
      </div>
    `;

    try {
      const info = await mailer.sendMail({
        from: `"${companyName}" <${fromAddress}>`,
        to,
        subject,
        html
      });
      logger.info('Account suspended email sent:', info.messageId);
      return info;
    } catch (error) {
      logger.error('Error sending account suspended email:', error);
      throw error;
    }
  },

  async sendAccountReactivatedEmail({ to, name, planName, currentPeriodEnd }) {
    const mailer = getMailer();
    if (!mailer) {
      throw new Error('Email is not configured on this server (SMTP_HOST/SMTP_PORT missing).');
    }
    const companyName = process.env.COMPANY_NAME || 'Zana POS';
    const fromAddress = process.env.SMTP_FROM || 'noreply@zanapos.com';
    const formattedDate = currentPeriodEnd ? new Date(currentPeriodEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null;

    const subject = `Account Reactivated: Welcome back to ${companyName}`;
    const html = `
      <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #059669;">Welcome Back! Account Reactivated</h2>
        <p>Hello ${name || 'Valued Customer'},</p>
        <p>Your <strong>${companyName}</strong> account has been successfully reactivated on the <strong>${planName || 'Standard'}</strong> plan.</p>
        ${formattedDate ? `<p>Your current subscription period is active through <strong>${formattedDate}</strong>.</p>` : ''}
        <p>All system features and services are fully restored.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 13px; color: #666;">Best regards,<br/>The ${companyName} Team</p>
      </div>
    `;

    try {
      const info = await mailer.sendMail({
        from: `"${companyName}" <${fromAddress}>`,
        to,
        subject,
        html
      });
      logger.info('Account reactivated email sent:', info.messageId);
      return info;
    } catch (error) {
      logger.error('Error sending account reactivated email:', error);
      throw error;
    }
  }
};

function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT);
}

emailService.isEmailConfigured = isEmailConfigured;

module.exports = emailService;
module.exports.isEmailConfigured = isEmailConfigured;