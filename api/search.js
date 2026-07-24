const { supabaseAdmin, getUserFromRequest } = require('./_auth');

function computeScore(lead) {
  let score = 0;
  score += lead.website ? 5 : 0;
  score += lead.phone ? 2 : 0;
  score += lead.openingHours ? 1.5 : 0;
  score += lead.hasFullAddress ? 1.5 : 0;
  return Math.min(10, Math.round(score * 10) / 10);
}

const TIER_LIMITS = {
  reperage: { searchesPerMonth: 2, resultsPerSearch: 3 },
  cible: { searchesPerMonth: 8, resultsPerSearch: 6 },
  sniper: { searchesPerMonth: null, resultsPerSearch: 15 },
  escouade: { searchesPerMonth: null, resultsPerSearch: null }
};

// Correspondance métier (français, sans accent) → tags OpenStreetMap réels.
// Chaque entrée est une liste de [clé, valeur] ; le premier trouvé qui matche est utilisé.
const TRADE_TAGS = {
  plombier: [['craft', 'plumber']],
  electricien: [['craft', 'electrician']],
  jardinier: [['craft', 'gardener'], ['shop', 'garden_centre']],
  paysagiste: [['craft', 'gardener']],
  menuisier: [['craft', 'carpenter']],
  peintre: [['craft', 'painter']],
  coiffeur: [['shop', 'hairdresser']],
  coiffeuse: [['shop', 'hairdresser']],
  bijoutier: [['shop', 'jewelry']],
  boulanger: [['shop', 'bakery']],
  boulangerie: [['shop', 'bakery']],
  boucher: [['shop', 'butcher']],
  fleuriste: [['shop', 'florist']],
  garagiste: [['shop', 'car_repair']],
  mecanicien: [['shop', 'car_repair']],
  photographe: [['craft', 'photographer'], ['shop', 'photo']],
  architecte: [['office', 'architect']],
  avocat: [['office', 'lawyer']],
  dentiste: [['amenity', 'dentist']],
  medecin: [['amenity', 'doctors']],
  restaurant: [['amenity', 'restaurant']],
  patissier: [['shop', 'pastry']],
  serrurier: [['craft', 'locksmith']],
  vitrier: [['craft', 'glaziery']],
  couvreur: [['craft', 'roofer']],
  macon: [['craft', 'builder']],
  chauffagiste: [['craft', 'hvac']],
  tapissier: [['craft', 'upholsterer']],
  esotheticienne: [['shop', 'beauty']],
  esteticienne: [['shop', 'beauty']],
  tatoueur: [['shop', 'tattoo']],
  traiteur: [['shop', 'catering'], ['craft', 'caterer']],
  horloger: [['craft', 'clockmaker'], ['shop', 'watches']],
  opticien: [['shop', 'optician']],
  pharmacien: [['amenity', 'pharmacy']],
  veterinaire: [['amenity', 'veterinary']],
  notaire: [['office', 'notary']],
  comptable: [['office', 'accountant']],
  agentimmobilier: [['office', 'estate_agent']],
  immobilier: [['office', 'estate_agent']],
  boucherie: [['shop', 'butcher']],
  cordonnier: [['craft', 'shoemaker']],
  tailleur: [['craft', 'tailor']],
  demenageur: [['shop', 'storage_rental']],
  carreleur: [['craft', 'tiler']]
};

function normalize(str) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

async function geocodeCity(ville) {
  const resp = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(ville)}&format=jsonv2&limit=1`,
    { headers: { 'User-Agent': 'SansSite/1.0 (outil de prospection - contact via app)' } }
  );
  if (!resp.ok) return null;
  const results = await resp.json();
  if (!results.length) return null;
  const bbox = results[0].boundingbox; // [south, north, west, east] as strings
  return { south: bbox[0], north: bbox[1], west: bbox[2], east: bbox[3] };
}

function buildOverpassQuery(niche, bbox) {
  const key = normalize(niche).replace(/[^a-z]/g, '');
  const tagPairs = TRADE_TAGS[key];
  const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;

  let filters;
  if (tagPairs) {
    filters = tagPairs.map(([k, v]) => `["${k}"="${v}"]`);
  } else {
    // Pas de correspondance connue : recherche large par nom, dans les catégories commerciales courantes.
    const escaped = niche.replace(/["\\]/g, '');
    filters = [`["name"~"${escaped}",i]`];
  }

  const statements = filters.map(f =>
    `  node${f}(${bboxStr});\n  way${f}(${bboxStr});\n`
  ).join('');

  return `[out:json][timeout:25];\n(\n${statements});\nout center 40;`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Non authentifié' });

  const { niche, ville } = req.body || {};
  if (!niche || !ville) return res.status(400).json({ error: 'Métier et ville requis' });

  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('plan')
    .eq('user_id', user.id)
    .maybeSingle();
  const plan = (sub && TIER_LIMITS[sub.plan]) ? sub.plan : 'reperage';
  const limits = TIER_LIMITS[plan];

  if (limits.searchesPerMonth !== null) {
    const monthKey = new Date().toISOString().slice(0, 7);
    const { data: usageRow } = await supabaseAdmin
      .from('usage_daily')
      .select('search_count')
      .eq('user_id', user.id)
      .eq('day', `${monthKey}-01`)
      .maybeSingle();
    const count = usageRow ? usageRow.search_count : 0;
    if (count >= limits.searchesPerMonth) {
      return res.status(403).json({ error: `Limite mensuelle atteinte pour l'offre "${plan}". Passe à l'offre supérieure pour continuer.` });
    }
    await supabaseAdmin.from('usage_daily').upsert(
      { user_id: user.id, day: `${monthKey}-01`, search_count: count + 1 },
      { onConflict: 'user_id,day' }
    );
  }

  try {
    const bbox = await geocodeCity(ville);
    if (!bbox) return res.status(404).json({ error: `Ville "${ville}" introuvable. Vérifie l'orthographe.` });

    const query = buildOverpassQuery(niche, bbox);
    const resp = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'User-Agent': 'SansSite/1.0' },
      body: query
    });
    if (!resp.ok) {
      const t = await resp.text();
      return res.status(502).json({ error: `Erreur OpenStreetMap : ${resp.status} — ${t.slice(0, 200)}` });
    }
    const data = await resp.json();
    const elements = data.elements || [];

    let leads = elements
      .filter(el => el.tags && el.tags.name)
      .map(el => {
        const tags = el.tags;
        const website = tags.website || tags['contact:website'] || null;
        const phone = tags.phone || tags['contact:phone'] || null;
        const openingHours = tags.opening_hours || null;
        const addrParts = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
        const addrCity = tags['addr:city'] || ville;
        const address = addrParts ? `${addrParts}, ${addrCity}` : `${addrCity} (adresse précise non renseignée)`;
        const hasFullAddress = !!(tags['addr:housenumber'] && tags['addr:street']);

        const lead = {
          id: String(el.id),
          name: tags.name,
          address,
          phone,
          website,
          rating: null,
          ratingCount: null,
          openingHours,
          hasFullAddress,
          niche, ville
        };
        lead.score = computeScore(lead);
        return lead;
      });

    const seen = new Set();
    leads = leads.filter(l => {
      const key = l.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    leads.sort((a, b) => a.score - b.score);
    if (limits.resultsPerSearch !== null) leads = leads.slice(0, limits.resultsPerSearch);

    return res.status(200).json({ leads, plan });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
