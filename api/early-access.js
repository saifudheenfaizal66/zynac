/**
 * Vercel Serverless Function for capturing FinFloat early access leads.
 * Set LEAD_WEBHOOK_URL in Vercel environment variables to forward leads
 * to a webhook (Formspree, Make, Zapier, Google Apps Script, Slack, etc.).
 */
function isValidLeadContact(value) {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const digitsOnly = String(value || '').replace(/[\s\-().+]/g, '');
  const phonePattern = /^\d{7,15}$/;
  return emailPattern.test(value) || phonePattern.test(digitsOnly);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const contact = String(body.contact || '').trim();

  if (!isValidLeadContact(contact)) {
    res.status(400).json({ ok: false, error: 'Please provide a valid email or WhatsApp number.' });
    return;
  }

  const entry = {
    contact,
    source: String(body.source || 'early-access-hero'),
    submittedAt: body.submittedAt || new Date().toISOString()
  };

  const webhookUrl = process.env.LEAD_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const upstream = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(entry)
      });
      if (!upstream.ok) {
        res.status(502).json({ ok: false, error: 'Upstream lead webhook returned an error.' });
        return;
      }
    } catch (err) {
      res.status(502).json({ ok: false, error: 'Failed to forward lead to webhook.' });
      return;
    }
  } else {
    console.log('[Early Access Lead]', JSON.stringify(entry));
  }

  res.status(200).json({ ok: true, entry });
};
