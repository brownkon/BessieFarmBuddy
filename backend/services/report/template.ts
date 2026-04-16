/**
 * Report Email Template
 * Generates a clean, farmer-friendly report layout.
 */

/**
 * Builds an HTML email body for the daily report.
 * @param {object} reportData - The structured report data from the LLM.
 * @param {string} reportData.summary - Overall day summary.
 * @param {string[]} reportData.keyTopics - Key discussion topics.
 * @param {string[]} reportData.notes - Notes recorded.
 * @param {string[]} reportData.actionItems - Extracted action items.
 * @param {string} userName - Display name or email of the user.
 * @param {string} dateStr - Formatted date string (e.g., "April 14, 2026").
 * @returns {string} HTML string.
 */
function buildEmailHtml({ summary, keyTopics, notes, actionItems }, userName, dateStr) {
  const topicsList = (keyTopics || [])
    .map(t => `<li style="margin-bottom:6px;color:#e5e7eb;">${escapeHtml(t)}</li>`)
    .join('');

  const notesList = (notes || [])
    .map(n => `<li style="margin-bottom:6px;color:#e5e7eb;">${escapeHtml(n)}</li>`)
    .join('');

  const actionsList = (actionItems || [])
    .map(a => `<li style="margin-bottom:6px;color:#fbbf24;font-weight:600;">${escapeHtml(a)}</li>`)
    .join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background-color:#0f1117;margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:30px 20px;">
    
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1f2937,#111827);border:1px solid #374151;border-radius:16px;padding:28px;margin-bottom:20px;">
      <h1 style="color:#34d399;margin:0 0 4px 0;font-size:24px;">🐄 Bessie Daily Report</h1>
      <p style="color:#9ca3af;margin:0;font-size:14px;">${escapeHtml(dateStr)} — ${escapeHtml(userName)}</p>
    </div>

    <!-- Summary -->
    ${summary ? `
    <div style="background-color:#1f2937;border:1px solid #374151;border-radius:12px;padding:20px;margin-bottom:16px;">
      <h2 style="color:#60a5fa;margin:0 0 10px 0;font-size:16px;">📋 Summary</h2>
      <p style="color:#d1d5db;margin:0;line-height:1.6;font-size:14px;">${escapeHtml(summary)}</p>
    </div>` : ''}

    <!-- Key Topics -->
    ${topicsList ? `
    <div style="background-color:#1f2937;border:1px solid #374151;border-radius:12px;padding:20px;margin-bottom:16px;">
      <h2 style="color:#60a5fa;margin:0 0 10px 0;font-size:16px;">💬 Key Topics</h2>
      <ul style="margin:0;padding-left:20px;">${topicsList}</ul>
    </div>` : ''}

    <!-- Notes -->
    ${notesList ? `
    <div style="background-color:#1f2937;border:1px solid #374151;border-radius:12px;padding:20px;margin-bottom:16px;">
      <h2 style="color:#60a5fa;margin:0 0 10px 0;font-size:16px;">📝 Notes</h2>
      <ul style="margin:0;padding-left:20px;">${notesList}</ul>
    </div>` : ''}

    <!-- Action Items -->
    ${actionsList ? `
    <div style="background-color:#1f2937;border:1px solid #374151;border-radius:12px;padding:20px;margin-bottom:16px;">
      <h2 style="color:#fbbf24;margin:0 0 10px 0;font-size:16px;">⚡ Action Items</h2>
      <ul style="margin:0;padding-left:20px;">${actionsList}</ul>
    </div>` : ''}

    <!-- Footer -->
    <div style="text-align:center;padding:20px 0;">
      <p style="color:#6b7280;font-size:12px;margin:0;">Sent by Bessie Farm Buddy</p>
    </div>
  </div>
</body>
</html>`;
}

/** Simple HTML escape to prevent injection in email templates. */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { buildEmailHtml };
