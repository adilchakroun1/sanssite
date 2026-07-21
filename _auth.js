const { createClient } = require('@supabase/supabase-js');

// Client "service role" — clé secrète, ne doit exister que côté serveur.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Vérifie le token envoyé par le front (Authorization: Bearer <token>)
// et retourne l'utilisateur Supabase correspondant, ou null.
async function getUserFromRequest(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

module.exports = { supabaseAdmin, getUserFromRequest };
