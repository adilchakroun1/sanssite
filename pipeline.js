const { supabaseAdmin, getUserFromRequest } = require('./_auth');

module.exports = async (req, res) => {
  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Non authentifié' });

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('pipeline_leads')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ leads: data });
  }

  if (req.method === 'POST') {
    const { place_id, name, phone, address, niche, ville, website, score, status } = req.body || {};
    if (!place_id) return res.status(400).json({ error: 'place_id requis' });
    const { error } = await supabaseAdmin.from('pipeline_leads').upsert(
      {
        user_id: user.id, place_id, name, phone, address, niche, ville,
        website, score, status: status || 'Nouveau', updated_at: new Date().toISOString()
      },
      { onConflict: 'user_id,place_id' }
    );
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
};
