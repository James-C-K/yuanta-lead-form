export const config = { api: { bodyParser: true } };

function mkRow(label, value) {
  return {
    type: 'box',
    layout: 'baseline',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#999999', flex: 2 },
      { type: 'text', text: value || '-', size: 'sm', color: '#333333', flex: 5, wrap: true },
    ],
  };
}

function buildPayloads(body) {
  const name = (body.name || '').trim();
  const broker = (body.broker || '').trim();
  const feeDiscount = (body.feeDiscount || '').trim();
  const preferredContact = (body.preferredContact || '').trim();
  const lineId = (body.lineId || '').trim();
  const phone = (body.phone || '').trim();
  const convenientTime = (body.convenientTime || '').trim();
  const smsConsent = (body.smsConsent || '').trim();
  const notes = (body.notes || '').trim() || '（無）';
  const consent = (body.consent || '').trim();

  const submittedAt = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });

  const issueTitle = `[新名單] ${name || '未填姓名'} - ${broker || '未填券商'}`;
  const issueBody = [
    `**提交時間**：${submittedAt}`,
    `**個資使用同意**：${consent}`,
    '',
    '### 聯絡資訊',
    `- 姓名/稱呼：${name}`,
    `- 偏好聯絡方式：${preferredContact}`,
    `- 聯絡電話：${phone}`,
    `- LINE ID：${lineId}`,
    `- 方便聯繫時段：${convenientTime}`,
    `- 同意簡訊聯繫：${smsConsent}`,
    '',
    '### 券商資訊',
    `- 目前使用券商：${broker}`,
    `- 目前手續費折數：${feeDiscount}`,
    '',
    '### 其他想說的話',
    notes,
  ].join('\n');

  const bodyContents = [
    mkRow('姓名/稱呼', name),
    mkRow('目前券商', broker),
    mkRow('手續費折數', feeDiscount),
    { type: 'separator', margin: 'md' },
    mkRow('偏好聯絡方式', preferredContact),
    mkRow('聯絡電話', phone),
    mkRow('LINE ID', lineId),
    mkRow('方便時段', convenientTime),
    mkRow('簡訊同意', smsConsent),
  ];
  if (notes !== '（無）') {
    bodyContents.push({ type: 'separator', margin: 'md' });
    bodyContents.push({ type: 'text', text: '其他想說的話', size: 'xs', color: '#999999', margin: 'md' });
    bodyContents.push({ type: 'text', text: notes, size: 'sm', wrap: true });
  }

  const flexContents = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#2B5CAD',
      paddingAll: '16px',
      contents: [
        { type: 'text', text: '新客戶名單通知', color: '#FFFFFF', weight: 'bold', size: 'lg' },
        { type: 'text', text: submittedAt, color: '#D6E4FF', size: 'xs', margin: 'sm' },
      ],
    },
    body: { type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '16px', contents: bodyContents },
  };

  return {
    issueTitle,
    issueBody,
    flexMessage: { type: 'flex', altText: `新客戶名單：${name || '未具名'}`, contents: flexContents },
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const { issueTitle, issueBody, flexMessage } = buildPayloads(req.body || {});

  const results = { github: null, line: null };

  try {
    const ghRes = await fetch(
      `https://api.github.com/repos/${process.env.GITHUB_DATA_REPO}/issues`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: issueTitle, body: issueBody }),
      }
    );
    results.github = { ok: ghRes.ok, status: ghRes.status };
    if (!ghRes.ok) results.github.detail = await ghRes.text();
  } catch (err) {
    results.github = { ok: false, error: String(err) };
  }

  try {
    const lineRes = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: process.env.LINE_TARGET_USER_ID,
        messages: [flexMessage],
      }),
    });
    results.line = { ok: lineRes.ok, status: lineRes.status };
    if (!lineRes.ok) results.line.detail = await lineRes.text();
  } catch (err) {
    results.line = { ok: false, error: String(err) };
  }

  console.log('submit result', JSON.stringify(results));

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>已送出</title>
<style>body{font-family:-apple-system,sans-serif;background:#f4f6fb;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#1c1f26}
main{background:#fff;padding:40px 36px;border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.08);max-width:420px;text-align:center}
h1{font-size:20px;margin:0 0 12px}p{font-size:14px;color:#555;line-height:1.7;margin:0}</style></head>
<body><main><h1>✅ 感謝您的填寫</h1><p>我們已經收到您的資料，將盡快與您聯繫。<br>若急需聯絡，也歡迎直接在 LINE 找 shao。</p></main></body></html>`);
}
