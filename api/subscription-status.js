const { supabaseAdmin, getUserFromRequest } = require('./_auth');

module.exports = async (req, res) => {
  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Non authentifié' });

  const { data } = await supabaseAdmin
    .from('subscriptions')
    .select('plan, status')
    .eq('user_id', user.id)
    .maybeSingle();

  return res.status(200).json({ plan: data ? data.plan : 'free', status: data ? data.status : 'active' });
};
