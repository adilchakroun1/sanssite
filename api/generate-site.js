const { getUserFromRequest } = require('./_auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Non authentifié' });

  const { name, niche, ville } = req.body || {};
  if (!name || !niche) return res.status(400).json({ error: "Nom de l'entreprise et métier requis" });

  const prompt = `Tu es un rédacteur web. Génère le contenu de site vitrine pour l'entreprise "${name}", métier : ${niche}${ville ? ', située à ' + ville : ''}.
Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans texte autour, au format exact suivant :
{"concepts":[
  {"style":"epure","eyebrow":"court label 2-3 mots","headline":"titre percutant 6-10 mots","sub":"une phrase d'accroche 15-20 mots","services":["service 1","service 2","service 3"],"cta":"texte du bouton 2-4 mots"},
  {"style":"chaleureux","eyebrow":"...","headline":"...","sub":"...","services":["...","...","..."],"cta":"..."},
  {"style":"premium","eyebrow":"...","headline":"...","sub":"...","services":["...","...","..."],"cta":"..."}
]}
Adapte le ton à chaque style : epure = direct et efficace, chaleureux = humain et rassurant, premium = haut de gamme et confiant. Le contenu doit être spécifique au métier "${niche}", pas générique.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await response.json();
    const textBlock = (data.content || []).find(b => b.type === 'text');
    if (!textBlock) return res.status(502).json({ error: 'Réponse IA vide' });
    const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
