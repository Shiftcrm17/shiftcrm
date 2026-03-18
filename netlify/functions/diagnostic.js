// netlify/functions/diagnostic.js
// Proxifie l'appel Claude API et envoie l'email via Resend
// Les clés API sont dans les variables d'environnement Netlify (jamais dans le HTML)

exports.handler = async function(event) {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': 'https://shiftcrm.fr',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { contact, answers, qLabels } = JSON.parse(event.body);

    // 1. Valider les données
    if (!contact || !contact.email || !contact.prenom) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Données manquantes' }) };
    }

    // 2. Construire le prompt
    const answersText = Object.entries(answers)
      .map(([k, v]) => `- ${qLabels[k]} : ${v}`)
      .join('\n');

    const prompt = `Tu es Mathieu Turaud, fondateur de SHIFT CRM, expert CRM & email marketing pour les e-coms Shopify.

Un prospect vient de remplir un diagnostic CRM rapide. Voici ses reponses :

${answersText}

Son prenom : ${contact.prenom}
Sa marque / site : ${contact.marque}

Genere une synthese personnalisee en JSON avec exactement cette structure :
{"score":"faible|moyen|fort","titre":"Une phrase titre percutante max 12 mots","resume":"2-3 phrases situationnelles avec le prenom ${contact.prenom} et la marque ${contact.marque}","tips":[{"titre":"Titre tip 1 max 8 mots","description":"Explication concrete 2-3 phrases"},{"titre":"Titre tip 2 max 8 mots","description":"Explication concrete 2-3 phrases"},{"titre":"Titre tip 3 max 8 mots","description":"Explication concrete 2-3 phrases"}]}

Regles: tips vraiment personnalises, ton expert accessible, score faible si CRM<10%, moyen si 10-25%, fort si >25%. Reponds UNIQUEMENT avec le JSON.`;

    // 3. Appel API Claude
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const claudeData = await claudeRes.json();
    const raw = claudeData.content[0].text;
    const clean = raw.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);

    // 4. Envoyer email au PROSPECT via Resend
    const scoreLabels = {
      faible: 'CRM a fort potentiel inexploite',
      moyen: 'CRM en developpement',
      fort: 'CRM bien structure'
    };

    const prospectEmailHtml = `
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Votre diagnostic CRM SHIFT</title>
</head>
<body style="margin:0;padding:0;background:#F4F4F6;font-family:'DM Sans',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F6;padding:40px 20px">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

      <!-- Header -->
      <tr><td style="background:#0A0A0B;border-radius:16px 16px 0 0;padding:32px 40px;text-align:center">
        <div style="font-size:22px;font-weight:700;color:#FFFFFF;letter-spacing:-0.02em">SHIFT <span style="color:#A78BFA">CRM</span></div>
        <div style="font-size:13px;color:#6B6B74;margin-top:6px">On transforme votre CRM en actif previsible</div>
      </td></tr>

      <!-- Score badge -->
      <tr><td style="background:#111113;padding:24px 40px 0;text-align:center">
        <div style="display:inline-block;padding:6px 18px;border-radius:20px;background:rgba(124,58,237,0.15);border:1px solid rgba(124,58,237,0.3);font-size:12px;font-weight:600;color:#A78BFA;letter-spacing:0.04em">
          ${scoreLabels[result.score] || 'Diagnostic CRM'}
        </div>
      </td></tr>

      <!-- Title -->
      <tr><td style="background:#111113;padding:16px 40px 24px;text-align:center">
        <div style="font-size:22px;font-weight:600;color:#FFFFFF;letter-spacing:-0.02em;line-height:1.3">${result.titre}</div>
      </td></tr>

      <!-- Summary -->
      <tr><td style="background:#1C1C1F;padding:24px 40px">
        <div style="font-size:14px;color:#C4C4CC;line-height:1.75;border-left:3px solid #7C3AED;padding-left:16px">${result.resume}</div>
      </td></tr>

      <!-- Tips label -->
      <tr><td style="background:#111113;padding:24px 40px 8px">
        <div style="font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#A78BFA">3 actions prioritaires pour votre CRM</div>
      </td></tr>

      <!-- Tips -->
      ${result.tips.map((tip, i) => `
      <tr><td style="background:#111113;padding:0 40px 12px">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#1C1C1F;border:1px solid rgba(255,255,255,0.07);border-radius:12px;overflow:hidden">
          <tr>
            <td width="40" style="padding:16px 0 16px 16px;vertical-align:top">
              <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#7C3AED,#A855F7);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#FFFFFF;text-align:center;line-height:28px">${i + 1}</div>
            </td>
            <td style="padding:16px">
              <div style="font-size:13px;font-weight:600;color:#FFFFFF;margin-bottom:4px">${tip.titre}</div>
              <div style="font-size:13px;color:#9898A3;line-height:1.6">${tip.description}</div>
            </td>
          </tr>
        </table>
      </td></tr>`).join('')}

      <!-- CTA -->
      <tr><td style="background:#111113;padding:24px 40px 32px">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.2);border-radius:16px">
          <tr><td style="padding:24px;text-align:center">
            <div style="font-size:14px;color:#9898A3;margin-bottom:16px;line-height:1.6">
              Envie d'aller plus loin ? Un Audit CRM complet vous donnera une roadmap precise sur 90 jours avec le potentiel de CA recuperable chiffre.
            </div>
            <a href="https://calendly.com/mtrd-emailsms/30min" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#7C3AED,#A855F7,#6366F1);border-radius:10px;font-size:14px;font-weight:500;color:#FFFFFF;text-decoration:none">
              Booker une Session Diagnostic CRM - 45 min →
            </a>
          </td></tr>
        </table>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#0A0A0B;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center">
        <div style="font-size:12px;color:#6B6B74">SHIFT CRM · <a href="https://shiftcrm.fr" style="color:#A78BFA;text-decoration:none">shiftcrm.fr</a> · hello@shiftcrm.fr</div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

    // Email prospect
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'SHIFT CRM <diagnostic@shiftcrm.fr>',
        to: contact.email,
        subject: `${contact.prenom}, votre diagnostic CRM SHIFT`,
        html: prospectEmailHtml
      })
    });

    // 5. Envoyer notification a Mathieu
    const reponsesList = Object.entries(answers)
      .map(([k, v]) => `<li><strong>${qLabels[k]}</strong> : ${v}</li>`)
      .join('');

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'SHIFT CRM <diagnostic@shiftcrm.fr>',
        to: 'mtrd.emailsms@gmail.com',
        subject: `Nouveau diagnostic CRM — ${contact.prenom} ${contact.nom} (${contact.marque})`,
        html: `
<h2>Nouveau prospect qualifie</h2>
<p><strong>Prenom :</strong> ${contact.prenom}</p>
<p><strong>Nom :</strong> ${contact.nom}</p>
<p><strong>Marque :</strong> ${contact.marque}</p>
<p><strong>Email :</strong> <a href="mailto:${contact.email}">${contact.email}</a></p>
<p><strong>Tel :</strong> ${contact.tel || 'Non renseigne'}</p>
<hr>
<h3>Reponses au quiz</h3>
<ul>${reponsesList}</ul>
<hr>
<h3>Score : ${result.score.toUpperCase()}</h3>
<p><strong>${result.titre}</strong></p>
<p>${result.resume}</p>
<hr>
<p><a href="https://calendly.com/mtrd-emailsms/30min">Proposer une session diagnostic</a></p>`
      })
    });

    // 6. Retourner le resultat au navigateur
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, result })
    };

  } catch (err) {
    console.error('Error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Erreur serveur', details: err.message })
    };
  }
};
