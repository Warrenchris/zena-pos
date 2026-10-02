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

function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT);
}

// B4: single authoritative mailer factory — all send methods use this.
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

// A1: central company-name resolver.
function getCompanyName() {
  return process.env.COMPANY_NAME || 'Zana POS';
}

// B3: central sender builder with fallbacks — no "undefined" in From header.
function getSender() {
  return '"' + getCompanyName() + '" <' + (process.env.SMTP_FROM || 'noreply@zanapos.com') + '>';
}

// B5: HTML-escape user-supplied / env-sourced values before interpolation.
// null / undefined → empty string.
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getEmailVerificationBanner(isEmailVerified = true) {
  if (isEmailVerified) return '';
  return `
        <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0; border-radius: 4px; color: #92400e; font-size: 13px;">
          <strong>Action Recommended:</strong> Your account email is not yet verified. Please verify your email to ensure uninterrupted access to security and billing settings.
        </div>`;
}

const emailService = {
  // B4: uses getMailer(). B3: from via getSender(). B5: escapeHtml on HTML values. A1: getCompanyName().
  async sendInvoice({ to, invoiceNumber, pdf }) {
    const mailer = getMailer();
    if (!mailer) {
      throw new Error('Email is not configured on this server (SMTP_HOST/SMTP_PORT missing).');
    }
    try {
      const companyName = getCompanyName();
      const info = await mailer.sendMail({
        from: getSender(),
        to: to,
        subject: 'Invoice #' + invoiceNumber,
        html:
          '<h2>Invoice #' + escapeHtml(invoiceNumber) + '</h2>' +
          '<p>Thank you for your business. Please find your invoice attached.</p>' +
          '<p>If you have any questions, please don\'t hesitate to contact us.</p>' +
          '<br>' +
          '<p>Best regards,</p>' +
          '<p>' + escapeHtml(companyName) + '</p>',
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

  // B4: inline createTransport removed. B3: getSender(). A1: getCompanyName(). B5: escapeHtml.
  async sendPasswordReset({ to, resetUrl }) {
    const mailer = getMailer();
    if (!mailer) {
      throw new Error('Email is not configured on this server (SMTP_HOST/SMTP_PORT missing).');
    }
    try {
      const companyName = getCompanyName();
      const info = await mailer.sendMail({
        from: getSender(),
        to: to,
        subject: 'Reset your ' + companyName + ' password',
        html:
          '<h2>Password Reset Request</h2>' +
          '<p>We received a request to reset your password. This link expires in 15 minutes.</p>' +
          '<p><a href="' + escapeHtml(resetUrl) + '">Reset your password</a></p>' +
          '<p>If you did not request this, you can safely ignore this email.</p>' +
          '<br>' +
          '<p>Best regards,</p>' +
          '<p>' + escapeHtml(companyName) + '</p>'
      });

      logger.info('Password reset email sent:', info.messageId);
      return info;
    } catch (error) {
      logger.error('Error sending password reset email:', error);
      throw error;
    }
  },

  // B4: inline createTransport removed. B3: getSender(). A1: getCompanyName(). B5: escapeHtml.
  async sendVerificationEmail({ to, verificationUrl }) {
    const mailer = getMailer();
    if (!mailer) {
      throw new Error('Email is not configured on this server (SMTP_HOST/SMTP_PORT missing).');
    }
    try {
      const companyName = getCompanyName();
      const info = await mailer.sendMail({
        from: getSender(),
        to: to,
        subject: 'Verify your ' + companyName + ' email address',
        html:
          '<h2>Verify your email address</h2>' +
          '<p>Welcome to ' + escapeHtml(companyName) + '! Please verify your email address to keep full access to your account.</p>' +
          '<p><a href="' + escapeHtml(verificationUrl) + '">Verify email address</a></p>' +
          '<p>This verification link expires in 24 hours.</p>' +
          '<p>If you did not sign up for this account, you can safely ignore this email.</p>' +
          '<br>' +
          '<p>Best regards,</p>' +
          '<p>' + escapeHtml(companyName) + '</p>'
      });

      logger.info('Verification email sent:', info.messageId);
      return info;
    } catch (error) {
      logger.error('Error sending verification email:', error);
      throw error;
    }
  },

  async sendTrialEndingEmail({ to, name, daysRemaining, trialEndsAt, upgradeUrl, isEmailVerified = true }) {
    const mailer = getMailer();
    if (!mailer) {
      throw new Error('Email is not configured on this server (SMTP_HOST/SMTP_PORT missing).');
    }
    const companyName = getCompanyName();
    const formattedDate = trialEndsAt ? new Date(trialEndsAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
    const dayText = daysRemaining === 1 ? '1 day' : `${daysRemaining} days`;

    const subject = `Action Required: Your ${companyName} trial ends in ${dayText}`;
    // B5: escape all user/env-sourced values before HTML interpolation.
    const eName       = escapeHtml(name || 'Valued Customer');
    const eCompany    = escapeHtml(companyName);
    const eDayText    = escapeHtml(dayText);
    const eDate       = escapeHtml(formattedDate);
    const eUpgradeUrl = escapeHtml(upgradeUrl);
    const html = `
      <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a56db;">Your Trial Ends Soon</h2>
        <p>Hello ${eName},</p>
        <p>Your free trial of <strong>${eCompany}</strong> will expire in <strong>${eDayText}</strong>${eDate ? ` on <strong>${eDate}</strong>` : ''}.</p>
        <p>To ensure uninterrupted access to your POS system, inventory management, and sales reports, please choose a subscription plan before your trial ends.</p>
        ${upgradeUrl ? `<div style="margin: 24px 0;"><a href="${eUpgradeUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Choose a Plan</a></div>` : ''}
        <p style="font-size: 13px; color: #666;">If your trial expires, your account will enter a limited grace period before features are suspended.</p>
        ${getEmailVerificationBanner(isEmailVerified)}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 13px; color: #666;">Best regards,<br/>The ${eCompany} Team</p>
      </div>
    `;

    try {
      const info = await mailer.sendMail({
        from: getSender(),
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

  async sendRenewalDueEmail({ to, name, planName, amount, currency, currentPeriodEnd, renewalUrl, isEmailVerified = true }) {
    const mailer = getMailer();
    if (!mailer) {
      throw new Error('Email is not configured on this server (SMTP_HOST/SMTP_PORT missing).');
    }
    const companyName = getCompanyName();
    const formattedDate = currentPeriodEnd ? new Date(currentPeriodEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
    const formattedAmount = `${currency || 'KES'} ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    const subject = `Upcoming Renewal: Your ${companyName} subscription renews on ${formattedDate}`;
    // B5: escape all user/env-sourced values before HTML interpolation.
    const eName       = escapeHtml(name || 'Valued Customer');
    const eCompany    = escapeHtml(companyName);
    const ePlanName   = escapeHtml(planName || 'Standard');
    const eDate       = escapeHtml(formattedDate);
    const eAmount     = escapeHtml(formattedAmount);
    const eRenewalUrl = escapeHtml(renewalUrl);
    const html = `
      <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a56db;">Subscription Renewal Reminder</h2>
        <p>Hello ${eName},</p>
        <p>Your subscription for the <strong>${ePlanName}</strong> plan is scheduled for renewal on <strong>${eDate}</strong>.</p>
        <div style="background-color: #f3f4f6; padding: 16px; border-radius: 6px; margin: 16px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Plan:</strong> ${ePlanName}</p>
          <p style="margin: 0 0 8px 0;"><strong>Renewal Amount:</strong> ${eAmount}</p>
          <p style="margin: 0;"><strong>Renewal Date:</strong> ${eDate}</p>
        </div>
        ${renewalUrl ? `<div style="margin: 24px 0;"><a href="${eRenewalUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Manage Subscription</a></div>` : ''}
        <p style="font-size: 13px; color: #666;">Please ensure your payment details are up to date to prevent any service interruption.</p>
        ${getEmailVerificationBanner(isEmailVerified)}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 13px; color: #666;">Best regards,<br/>The ${eCompany} Team</p>
      </div>
    `;

    try {
      const info = await mailer.sendMail({
        from: getSender(),
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

  async sendPaymentReceiptEmail({ to, name, invoiceNumber, amount, currency, paymentMethod, newPeriodEnd, receiptUrl, isEmailVerified = true }) {
    const mailer = getMailer();
    if (!mailer) {
      throw new Error('Email is not configured on this server (SMTP_HOST/SMTP_PORT missing).');
    }
    const companyName = getCompanyName();
    const formattedDate = newPeriodEnd ? new Date(newPeriodEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null;
    const formattedAmount = `${currency || 'KES'} ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    const subject = `Payment Received: Invoice #${invoiceNumber}`;
    // B5: escape all user/env-sourced values before HTML interpolation.
    const eName       = escapeHtml(name || 'Valued Customer');
    const eCompany    = escapeHtml(companyName);
    const eInvoice    = escapeHtml(invoiceNumber);
    const eAmount     = escapeHtml(formattedAmount);
    const eMethod     = escapeHtml(paymentMethod ? paymentMethod.toUpperCase() : 'CARD');
    const eDate       = escapeHtml(formattedDate);
    const eReceiptUrl = escapeHtml(receiptUrl);
    const html = `
      <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #059669;">Payment Confirmation</h2>
        <p>Hello ${eName},</p>
        <p>Thank you! We have received your payment for invoice <strong>#${eInvoice}</strong>.</p>
        <div style="background-color: #f3f4f6; padding: 16px; border-radius: 6px; margin: 16px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Invoice:</strong> #${eInvoice}</p>
          <p style="margin: 0 0 8px 0;"><strong>Amount Paid:</strong> ${eAmount}</p>
          <p style="margin: 0 0 8px 0;"><strong>Payment Method:</strong> ${eMethod}</p>
          ${formattedDate ? `<p style="margin: 0;"><strong>Coverage Valid Through:</strong> ${eDate}</p>` : ''}
        </div>
        ${receiptUrl ? `
        <div style="margin: 24px 0;">
          <a href="${eReceiptUrl}" style="background-color: #059669; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">View Invoice</a>
        </div>` : ''}
        ${getEmailVerificationBanner(isEmailVerified)}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 13px; color: #666;">Best regards,<br/>The ${eCompany} Team</p>
      </div>
    `;

    try {
      const info = await mailer.sendMail({
        from: getSender(),
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

  async sendPaymentFailedEmail({ to, name, invoiceNumber, amount, currency, reason, retryUrl, isEmailVerified = true }) {
    const mailer = getMailer();
    if (!mailer) {
      throw new Error('Email is not configured on this server (SMTP_HOST/SMTP_PORT missing).');
    }
    const companyName = getCompanyName();
    const formattedAmount = `${currency || 'KES'} ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    const subject = `Payment Failed: Action needed for invoice #${invoiceNumber}`;
    // B5: escape all user/env-sourced values before HTML interpolation.
    const eName      = escapeHtml(name || 'Valued Customer');
    const eCompany   = escapeHtml(companyName);
    const eInvoice   = escapeHtml(invoiceNumber);
    const eAmount    = escapeHtml(formattedAmount);
    const eReason    = escapeHtml(reason);
    const eRetryUrl  = escapeHtml(retryUrl);
    const html = `
      <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #dc2626;">Payment Failed</h2>
        <p>Hello ${eName},</p>
        <p>We were unable to process your payment of <strong>${eAmount}</strong> for invoice <strong>#${eInvoice}</strong>.</p>
        ${reason ? `<p><strong>Reason:</strong> ${eReason}</p>` : ''}
        <p>Please update your payment method or retry the transaction to prevent service interruption.</p>
        ${retryUrl ? `
        <div style="margin: 24px 0;">
          <a href="${eRetryUrl}" style="background-color: #dc2626; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Retry Payment</a>
        </div>` : ''}
        ${getEmailVerificationBanner(isEmailVerified)}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 13px; color: #666;">Best regards,<br/>The ${eCompany} Team</p>
      </div>
    `;

    try {
      const info = await mailer.sendMail({
        from: getSender(),
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

  async sendAccountSuspendedEmail({ to, name, gracePeriodEnd, reactivateUrl, isEmailVerified = true }) {
    const mailer = getMailer();
    if (!mailer) {
      throw new Error('Email is not configured on this server (SMTP_HOST/SMTP_PORT missing).');
    }
    const companyName = getCompanyName();
    const formattedDate = gracePeriodEnd ? new Date(gracePeriodEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null;

    const subject = `Account Suspended: ${companyName} subscription past grace period`;
    // B5: escape all user/env-sourced values before HTML interpolation.
    const eName         = escapeHtml(name || 'Valued Customer');
    const eCompany      = escapeHtml(companyName);
    const eDate         = escapeHtml(formattedDate);
    const eReactivateUrl = escapeHtml(reactivateUrl);
    const html = `
      <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #dc2626;">Your Account Has Been Suspended</h2>
        <p>Hello ${eName},</p>
        <p>Your <strong>${eCompany}</strong> subscription grace period ${formattedDate ? `ended on <strong>${eDate}</strong>` : 'has ended'}, and your account has been suspended.</p>
        <p>While suspended, store operations, product management, and reporting features are restricted. Your data remains safe and preserved.</p>
        ${reactivateUrl ? `
        <div style="margin: 24px 0;">
          <a href="${eReactivateUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reactivate Account</a>
        </div>` : ''}
        ${getEmailVerificationBanner(isEmailVerified)}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 13px; color: #666;">Best regards,<br/>The ${eCompany} Team</p>
      </div>
    `;

    try {
      const info = await mailer.sendMail({
        from: getSender(),
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

  async sendAccountReactivatedEmail({ to, name, planName, currentPeriodEnd, isEmailVerified = true }) {
    const mailer = getMailer();
    if (!mailer) {
      throw new Error('Email is not configured on this server (SMTP_HOST/SMTP_PORT missing).');
    }
    const companyName = getCompanyName();
    const formattedDate = currentPeriodEnd ? new Date(currentPeriodEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null;

    const subject = `Account Reactivated: Welcome back to ${companyName}`;
    // B5: escape all user/env-sourced values before HTML interpolation.
    const eName    = escapeHtml(name || 'Valued Customer');
    const eCompany = escapeHtml(companyName);
    const ePlan    = escapeHtml(planName || 'Standard');
    const eDate    = escapeHtml(formattedDate);
    const html = `
      <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #059669;">Welcome Back! Account Reactivated</h2>
        <p>Hello ${eName},</p>
        <p>Your <strong>${eCompany}</strong> account has been successfully reactivated on the <strong>${ePlan}</strong> plan.</p>
        ${formattedDate ? `<p>Your current subscription period is active through <strong>${eDate}</strong>.</p>` : ''}
        <p>All system features and services are fully restored.</p>
        ${getEmailVerificationBanner(isEmailVerified)}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 13px; color: #666;">Best regards,<br/>The ${eCompany} Team</p>
      </div>
    `;

    try {
      const info = await mailer.sendMail({
        from: getSender(),
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
  },

  setTransporter(t) {
    transporter = t;
  }
};

emailService.isEmailConfigured = isEmailConfigured;
emailService.getEmailVerificationBanner = getEmailVerificationBanner;
emailService.escapeHtml = escapeHtml;
emailService.getSender = getSender;
emailService.getCompanyName = getCompanyName;

module.exports = emailService;
module.exports.isEmailConfigured = isEmailConfigured;
module.exports.getEmailVerificationBanner = getEmailVerificationBanner;
module.exports.escapeHtml = escapeHtml;
module.exports.getSender = getSender;
module.exports.getCompanyName = getCompanyName;