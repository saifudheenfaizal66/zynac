/**
 * Vercel Serverless Function for capturing FinFloat early access leads via Formspree.
 * Set LEAD_WEBHOOK_URL in Vercel Project Settings > Environment Variables
 * (e.g. https://formspree.io/f/YOUR_FORM_ID).
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function classifyLeadContact(value) {
  const trimmed = String(value || '').trim();
  if (EMAIL_PATTERN.test(trimmed)) {
    return { valid: true, type: 'email', normalized: trimmed };
  }
  const digitsOnly = trimmed.replace(/[\s\-().+]/g, '');
  if (/^\d{7,15}$/.test(digitsOnly)) {
    return { valid: true, type: 'whatsapp', normalized: trimmed };
  }
  return { valid: false, type: null, normalized: trimmed };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch {
    res.status(400).json({ ok: false, error: 'Invalid JSON request body.' });
    return;
  }

  const rawContact = String(body.contact || '').trim();
  const classification = classifyLeadContact(rawContact);

  if (!classification.valid) {
    res.status(400).json({ ok: false, error: 'Please provide a valid email or WhatsApp number.' });
    return;
  }

  const submittedAt = body.submittedAt || new Date().toISOString();
  const source = String(body.source || 'early-access-hero');

  // Formspree-friendly payload: maps email inputs to `email` and phone inputs to `whatsapp`
  const entry = {
    contact: classification.normalized,
    contactType: classification.type,
    ...(classification.type === 'email'
      ? { email: classification.normalized }
      : { whatsapp: classification.normalized }),
    source,
    submittedAt,
    _subject: `FinFloat Early Access Request (${classification.type})`
  };

  const webhookUrl = (process.env.LEAD_WEBHOOK_URL || '').trim();
  if (!webhookUrl || webhookUrl.includes('YOUR_FORM_ID')) {
    console.warn('[Early Access Lead] LEAD_WEBHOOK_URL is not configured; logging lead only:', JSON.stringify(entry));
    res.status(200).json({ ok: true, forwarded: false, entry });
    return;
  }

  try {
    const upstream = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(entry)
    });

    const upstreamData = await upstream.json().catch(() => ({}));

    if (!upstream.ok || (Array.isArray(upstreamData.errors) && upstreamData.errors.length > 0)) {
      const msg = Array.isArray(upstreamData.errors) && upstreamData.errors[0]?.message
        ? upstreamData.errors[0].message
        : (upstreamData.error || `Formspree returned status ${upstream.status}.`);
      res.status(502).json({ ok: false, error: msg });
      return;
    }

    res.status(200).json({ ok: true, forwarded: true, entry });
  } catch (err) {
    res.status(502).json({ ok: false, error: 'Failed to reach Formspree webhook.' });
  }
};
