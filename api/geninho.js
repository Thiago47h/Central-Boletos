// Geninho — integração segura Gemini + Supabase.
const SUPABASE_URL = 'https://mgwrovpwoqzzgfcwisfu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_HSX0TcfcQJKfZ1eDowcvOw_tf9dRztB';
const GEMINI_MODEL = 'gemini-2.5-flash-lite';

function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Método não permitido.' });
  }

  if (!process.env.GEMINI_API_KEY) {
    return send(res, 503, { error: 'O Geninho ainda não está configurado no servidor.' });
  }

  const authorization = String(req.headers.authorization || '');
  if (!authorization.startsWith('Bearer ')) {
    return send(res, 401, { error: 'Faça login novamente para usar o Geninho.' });
  }

  try {
    const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: authorization,
        apikey: SUPABASE_PUBLISHABLE_KEY
      }
    });

    if (!authResponse.ok) {
      return send(res, 401, { error: 'Sua sessão expirou. Entre novamente.' });
    }

    const user = await authResponse.json();
    if (user?.app_metadata?.central_access !== true) {
      return send(res, 403, { error: 'Este usuário não tem acesso à Central de Boletos.' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const question = String(body.question || '').trim().slice(0, 1500);
    if (!question) return send(res, 400, { error: 'Escreva uma pergunta para o Geninho.' });

    const bills = Array.isArray(body.bills) ? body.bills.slice(0, 100).map((bill) => ({
      fornecedor: String(bill?.supplier || '').slice(0, 120),
      vencimento: String(bill?.due || '').slice(0, 10),
      valor: Number.isFinite(Number(bill?.amount)) ? Number(bill.amount) : null,
      status: bill?.status === 'paid' ? 'pago' : 'em aberto',
      observacao: String(bill?.note || '').slice(0, 160)
    })) : [];

    const prompt = [
      'Você é o Geninho, assistente da Central de Boletos.',
      'Responda em português brasileiro, de forma curta, clara e prática.',
      'Use somente os dados fornecidos. Se faltar informação, diga que não sabe; nunca invente.',
      'Valores podem variar mês a mês e campos nulos significam valor não informado.',
      'Não execute pagamentos nem afirme que alterou registros.',
      '',
      'Pergunta do usuário:',
      question,
      '',
      'Resumo seguro dos boletos:',
      JSON.stringify(bills)
    ].join('\n');

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 700 }
        })
      }
    );

    const gemini = await geminiResponse.json();
    if (!geminiResponse.ok) {
      console.error('Gemini error', geminiResponse.status, gemini?.error?.message || 'unknown');
      if (geminiResponse.status === 429) {
        return send(res, 429, { error: 'O limite gratuito do Gemini foi atingido. Tente novamente mais tarde.' });
      }
      return send(res, 502, { error: 'O Gemini não conseguiu responder agora.' });
    }

    const answer = gemini?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim();

    if (!answer) return send(res, 502, { error: 'O Gemini devolveu uma resposta vazia.' });
    return send(res, 200, { answer });
  } catch (error) {
    console.error('Geninho route error', error?.message || error);
    return send(res, 500, { error: 'Não foi possível falar com o Geninho agora.' });
  }
}
