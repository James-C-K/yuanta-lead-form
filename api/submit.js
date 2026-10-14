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
  const isPhone = preferredContact === '手機';
  const isLine = preferredContact === 'LINE';

  const contactLines = [];
  if (isPhone) contactLines.push(`- 聯絡電話：${phone}`);
  if (isLine) contactLines.push(`- LINE ID：${lineId}`);
  contactLines.push(`- 方便聯繫時段：${convenientTime}`);
  if (isPhone && smsConsent) contactLines.push(`- 同意簡訊聯繫：${smsConsent}`);

  const issueTitle = `[新名單] ${name || '未填姓名'} - ${broker || '未填券商'}`;
  const issueBody = [
    `**提交時間**：${submittedAt}`,
    `**個資使用同意**：${consent}`,
    '',
    '### 聯絡資訊',
    `- 姓名/稱呼：${name}`,
    `- 偏好聯絡方式：${preferredContact}`,
    ...contactLines,
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
  ];
  if (isPhone) bodyContents.push(mkRow('聯絡電話', phone));
  if (isLine) bodyContents.push(mkRow('LINE ID', lineId));
  bodyContents.push(mkRow('方便時段', convenientTime));
  if (isPhone && smsConsent) bodyContents.push(mkRow('簡訊同意', smsConsent));
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

  const closingNotice = preferredContact === 'LINE'
    ? '請注意是否有阻擋 LINE 的訊息或是加入好友，也請留意是否有看到『Shao😊』加入您好友。或是您也可以 LINE 手機號碼搜尋：0983010246，或是致電給我，敝姓：沈，告訴我您有填表單我就會知道了，感謝您。'
    : '請注意手機號碼：0983010246 的來電或簡訊，或是您也可以致電給我，敝姓：沈，告訴我您有填表單我就會知道了，感謝您。';

  return {
    name,
    issueTitle,
    issueBody,
    flexMessage: { type: 'flex', altText: `新客戶名單：${name || '未具名'}`, contents: flexContents },
    closingNotice,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const { name, issueTitle, issueBody, flexMessage, closingNotice } = buildPayloads(req.body || {});

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

  if (req.query && req.query.debug === '1') {
    res.status(200).json(results);
    return;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>已送出</title>
<style>
  :root{--accent:#0b57a4;--accent-2:#2f8fe0;--n-accent:#6d3df0;--n-accent-2:#9b6bfb;--ink:#161a23;--ink-2:#555d6e;--line:#e4e7ee}
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang TC","Microsoft JhengHei",sans-serif;background:radial-gradient(1200px 500px at 50% -10%, #e7f1fc 0%, #eef1f7 55%);display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;color:var(--ink)}
  main{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(22,26,35,.04),0 8px 24px rgba(22,26,35,.08);max-width:440px;width:100%;text-align:center}
  .cobrand{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px 12px;padding:14px 16px;border-bottom:1px solid var(--line)}
  .cobrand-logo{display:flex;align-items:center;gap:7px}
  .cobrand-logo svg{flex:none}
  .cobrand-logo span{font-size:13.5px;font-weight:800}
  .cobrand-logo.n span{color:#241a4d}
  .cobrand-logo.y span{color:var(--accent)}
  .cobrand-x{font-size:12px;color:#9298a6;font-weight:600}
  .banner{background:linear-gradient(165deg, var(--accent-2), var(--accent));padding:24px 20px 20px;color:#fff}
  .banner svg{width:36px;height:36px;margin-bottom:6px}
  .banner div{font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;opacity:.9}
  .inner{padding:26px 28px 32px}
  .check{width:52px;height:52px;border-radius:50%;background:#e9f6ee;color:#2f9e55;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:26px}
  h1{font-size:19px;margin:0 0 14px}
  p{font-size:14px;color:var(--ink-2);line-height:1.7;margin:0}
  .notice{margin-top:18px;background:#fff6e8;border:1px solid #f0dcb0;border-radius:12px;padding:14px 16px;font-size:13px;color:#6b5323;line-height:1.7;text-align:left}
</style></head>
<body><main>
<div class="cobrand">
  <div class="cobrand-logo n">
    <svg width="18" height="18" viewBox="0 0 40 40" role="img" aria-label="nSchool">
      <polyline points="7,30 18,10 23,22 33,6" fill="none" stroke="#d7d4e8" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" transform="translate(-2,2)"/>
      <polyline points="7,30 18,10 23,22 33,6" fill="none" stroke="var(--n-accent)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span>nSchool</span>
  </div>
  <div class="cobrand-x">×</div>
  <div class="cobrand-logo y">
    <svg width="16" height="16" viewBox="0 0 100 100" role="img" aria-label="元大證券">
      <g fill="var(--accent)">
        <path d="M50,50 L50,6 A44,44 0 0,1 83,25 Z"/>
        <path d="M50,50 L94,50 A44,44 0 0,1 75,83 Z"/>
        <path d="M50,50 L50,94 A44,44 0 0,1 17,75 Z"/>
        <path d="M50,50 L6,50 A44,44 0 0,1 25,17 Z"/>
      </g>
    </svg>
    <span>元大證券</span>
  </div>
</div>
<div class="inner">
  <div class="check">✓</div>
  <h1>感謝您的填寫${name ? '，' + name : ''}</h1>
  <p>我們已經收到您的資料，將盡快與您聯繫。</p>
  <div class="notice">${closingNotice}</div>
</div>
</main></body></html>`);
}
