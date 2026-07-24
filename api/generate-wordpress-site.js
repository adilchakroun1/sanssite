const { getUserFromRequest } = require('./_auth');

// Génère le contenu via Claude, puis crée un vrai site WordPress.com avec ce contenu.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Non authentifié' });

  const { name, niche, ville, phone } = req.body || {};
  if (!name || !niche) return res.status(400).json({ error: "Nom de l'entreprise et métier requis" });

  const token = process.env.WPCOM_ACCESS_TOKEN;
  if (!token) return res.status(500).json({ error: "WPCOM_ACCESS_TOKEN manquant côté serveur." });

  try {
    // 1. Génère le contenu avec Claude
    const prompt = `Tu es un rédacteur web. Génère le contenu d'une page d'accueil pour l'entreprise "${name}", métier : ${niche}${ville ? ', située à ' + ville : ''}.
Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, au format exact :
{"tagline":"phrase d'accroche 10-15 mots","intro":"paragraphe de présentation 40-60 mots, ton humain et rassurant","services":["service 1","service 2","service 3"],"cta":"texte d'appel à l'action 3-6 mots"}
Contenu spécifique au métier "${niche}", pas générique.`;

    const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 700,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const aiData = await aiResp.json();
    const textBlock = (aiData.content || []).find(b => b.type === 'text');
    if (!textBlock) return res.status(502).json({ error: "Réponse IA vide — vérifie ANTHROPIC_API_KEY." });
    const content = JSON.parse(textBlock.text.replace(/```json|```/g, '').trim());

    // 2. Crée le site WordPress.com
    const siteResp = await fetch('https://public-api.wordpress.com/rest/v1.1/sites/new', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        blog_name: name.toLowerCase().replace(/[^a-z0-9]+/g, '') + Math.floor(Math.random() * 10000),
        blog_title: name,
        lang_id: '2',
        public: '1',
        validate: '0',
        find_available_url: 'true'
      })
    });
    const siteData = await siteResp.json();
    if (!siteData.blog_details) {
      return res.status(502).json({ error: `Erreur WordPress.com : ${siteData.error || JSON.stringify(siteData).slice(0, 200)}` });
    }
    const siteId = siteData.blog_details.blogid;
    const siteUrl = siteData.blog_details.url;

    // 3. Construit et publie la page d'accueil
    const homepageContent = `
<!-- wp:heading {"level":1} -->
<h1>${name}</h1>
<!-- /wp:heading -->

<!-- wp:paragraph {"fontSize":"large"} -->
<p class="has-large-font-size">${content.tagline}</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>${content.intro}</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2>Nos prestations</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>${(content.services || []).map(s => `<li>${s}</li>`).join('')}</ul>
<!-- /wp:list -->

<!-- wp:paragraph -->
<p><strong>${content.cta}</strong>${phone ? ` — ${phone}` : ''}${ville ? ` (${ville})` : ''}</p>
<!-- /wp:paragraph -->
`.trim();

    const pageResp = await fetch(`https://public-api.wordpress.com/rest/v1.1/sites/${siteId}/posts/new`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        title: name,
        content: homepageContent,
        status: 'publish',
        type: 'page'
      })
    });
    const pageData = await pageResp.json();

    return res.status(200).json({
      siteUrl,
      pageUrl: pageData.URL || siteUrl,
      siteId
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
