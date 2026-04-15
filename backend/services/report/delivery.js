/**
 * Report Delivery Service
 * Handles sending reports via Email (Resend).
 */

const { Resend } = require('resend');
const { buildEmailHtml } = require('./template');

let resendClient = null;

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.REPORT_FROM_EMAIL || 'reports@bessie.farm';

if (RESEND_API_KEY) {
  resendClient = new Resend(RESEND_API_KEY);
  console.log('[Report/Delivery] Resend client initialized.');
} else {
  console.warn('[Report/Delivery] RESEND_API_KEY missing — email delivery disabled.');
}

/**
 * Send a report via email using Resend.
 * @param {string} toEmail - Recipient email address.
 * @param {object} reportData - Structured report data from the LLM.
 * @param {string} userName - Display name or email.
 * @param {string} dateStr - Human-readable date string.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendEmail(toEmail, reportData, userName, dateStr) {
  if (!resendClient) {
    return { success: false, error: 'Email service not configured (missing RESEND_API_KEY).' };
  }

  try {
    const html = buildEmailHtml(reportData, userName, dateStr);

    const { error } = await resendClient.emails.send({
      from: FROM_EMAIL,
      to: [toEmail],
      subject: `🐄 Bessie Daily Report — ${dateStr}`,
      html,
    });

    if (error) {
      console.error('[Report/Delivery] Resend error:', error);
      return { success: false, error: error.message || 'Email send failed.' };
    }

    console.log(`[Report/Delivery] Email sent to ${toEmail}`);
    return { success: true };
  } catch (err) {
    console.error('[Report/Delivery] Email delivery error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Deliver a report using the user's preferred method (Email only).
 * @param {'email'|'none'} method - Delivery method.
 * @param {string} destination - Email address.
 * @param {object} reportData - Structured report data.
 * @param {string} userName - User display name.
 * @param {string} dateStr - Formatted date.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function deliverReport(method, destination, reportData, userName, dateStr) {
  if (method === 'email') {
    return sendEmail(destination, reportData, userName, dateStr);
  }
  return { success: false, error: `Daily reports are currently disabled or method ${method} is invalid.` };
}

module.exports = { sendEmail, deliverReport };
