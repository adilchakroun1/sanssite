const { supabaseAdmin } = require('./_auth');

// Associe chaque plan_id PayPal (créé dans ton dashboard) au nom d'offre interne.
// Renseigne ces 4 valeurs dans les variables d'environnement Vercel.
const PLAN_ID_TO_TIER = {
  [process.env.PAYPAL_PLAN_ID_REPERAGE]: 'reperage',
  [process.env.PAYPAL_PLAN_ID_CIBLE]: 'cible',
  [process.env.PAYPAL_PLAN_ID_SNIPER]: 'sniper',
  [process.env.PAYPAL_PLAN_ID_ESCOUADE]: 'escouade'
};

async function getPaypalAccessToken() {
  const base = process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  const creds = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const resp = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  const data = await resp.json();
  return { token: data.access_token, base };
}

async function verifyWebhookSignature(req, rawBody, token, base) {
  const verifyResp = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transmission_id: req.headers['paypal-transmission-id'],
      transmission_time: req.headers['paypal-transmission-time'],
      cert_url: req.headers['paypal-cert-url'],
      auth_algo: req.headers['paypal-auth-algo'],
      transmission_sig: req.headers['paypal-transmission-sig'],
      webhook_id: process.env.PAYPAL_WEBHOOK_ID,
      webhook_event: JSON.parse(rawBody)
    })
  });
  const result = await verifyResp.json();
  return result.verification_status === 'SUCCESS';
}

function buffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports.config = { api: { bodyParser: false } };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await buffer(req);
  const { token, base } = await getPaypalAccessToken();

  let verified;
  try {
    verified = await verifyWebhookSignature(req, rawBody, token, base);
  } catch (err) {
    return res.status(400).json({ error: `Vérification impossible : ${err.message}` });
  }
  if (!verified) return res.status(400).json({ error: 'Signature webhook invalide' });

  const event = JSON.parse(rawBody);

  try {
    if (event.event_type === 'BILLING.SUBSCRIPTION.ACTIVATED') {
      const sub = event.resource;
      const userId = sub.custom_id;
      const tier = PLAN_ID_TO_TIER[sub.plan_id] || 'reperage';
      if (userId) {
        await supabaseAdmin.from('subscriptions').upsert({
          user_id: userId,
          plan: tier,
          stripe_subscription_id: sub.id, // champ réutilisé pour stocker l'ID d'abonnement PayPal
          status: 'active',
          updated_at: new Date().toISOString()
        });
      }
    }

    if (['BILLING.SUBSCRIPTION.CANCELLED', 'BILLING.SUBSCRIPTION.EXPIRED', 'BILLING.SUBSCRIPTION.SUSPENDED'].includes(event.event_type)) {
      const sub = event.resource;
      await supabaseAdmin
        .from('subscriptions')
        .update({ plan: 'reperage', status: 'inactive', updated_at: new Date().toISOString() })
        .eq('stripe_subscription_id', sub.id);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
