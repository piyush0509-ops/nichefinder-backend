import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import cors from 'cors';

const app = express();
app.use(bodyParser.json());
app.use(cors({ origin: ['https://your-frontend-domain.vercel.app','http://localhost:3000'] }));

const OPENAI_KEY = process.env.OPENAI_API_KEY; // set this on Render/local env

function computeScores(answers) {
  const strength = Math.min(100, (answers.step1?.evidence_level || 0) * 25 + (answers.step1?.monetized ? 25 : 0));
  const pain = Math.min(100, (answers.step2?.pain_score || 5) * 10);
  const transform = (answers.step3?.before && answers.step3?.after) ? 80 : 30;
  const fit = (answers.step4?.budget_range ? 60 : 30) + (answers.step4?.reach_channel === 'referral' ? 10 : 0);
  const profit = Math.min(100, ((answers.step5?.price || 0) * (answers.step5?.conv_rate_pct || 0) * (answers.step5?.monthly_leads || 0) / 1000));
  const overall = Math.round((strength*0.25 + pain*0.25 + transform*0.20 + fit*0.15 + profit*0.15));
  return { strength, pain, transform, fit, profit, overall };
}

app.post('/api/evaluate', async (req, res) => {
  try {
    const answers = req.body;
    const scores = computeScores(answers);

    if (scores.overall < 30) {
      return res.json({
        final_niche: null,
        message: "Low fit score — validate idea or refine transformation",
        scores
      });
    }

    const system = `You are a concise product strategist. Given user answers and deterministic scores return a JSON object: { final_niche, niche_summary, rationale[], variants[], lead_magnet, content_hooks[], profit_estimate:{monthly_revenue,confidence}, next_steps[] } ONLY JSON.`;
    const userPrompt = `Answers: ${JSON.stringify(answers)}\nScores: ${JSON.stringify(scores)}`;

    const openaiResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role:'system', content: system }, { role:'user', content: userPrompt }],
        temperature: 0.25,
        max_tokens: 600
      })
    });

    const data = await openaiResp.json();
    const text = data?.choices?.[0]?.message?.content || '{}';
    let parsed;
    try { parsed = JSON.parse(text); } catch(e) { parsed = { errorRaw: text }; }

    return res.json({ scores, ai: parsed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error', details: err.message });
  }
});

const PORT = process.env.PORT || 7001;
app.listen(PORT, ()=> console.log('API listening on', PORT));
