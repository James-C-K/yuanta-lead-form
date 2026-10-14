const STATUSES = ['待處理', '聯絡中', '完成'];

function parseIssue(issue) {
  const match = /<!-- LEAD_DATA (.*?) -->/s.exec(issue.body || '');
  let data = null;
  if (match) {
    try { data = JSON.parse(match[1]); } catch (e) { data = null; }
  }

  const labelNames = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
  const status = STATUSES.find((s) => labelNames.includes(s)) || '待處理';

  return {
    number: issue.number,
    htmlUrl: issue.html_url,
    createdAt: issue.created_at,
    status,
    name: data?.name || issue.title,
    broker: data?.broker || '',
    feeDiscount: data?.feeDiscount || '',
    preferredContact: data?.preferredContact || '',
    phone: data?.phone || '',
    lineId: data?.lineId || '',
    convenientTime: data?.convenientTime || '',
    smsConsent: data?.smsConsent || '',
    consent: data?.consent || '',
    notes: data?.notes || '',
    submittedAt: data?.submittedAt || issue.created_at,
    completedAt: data?.completedAt || '',
    raw: !data,
  };
}

export default async function handler(req, res) {
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${process.env.ADMIN_TOKEN}`) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  try {
    const ghRes = await fetch(
      `https://api.github.com/repos/${process.env.GITHUB_DATA_REPO}/issues?state=all&per_page=100&sort=created&direction=desc`,
      {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );
    if (!ghRes.ok) {
      res.status(502).json({ error: 'github fetch failed', detail: await ghRes.text() });
      return;
    }
    const issues = await ghRes.json();
    const leads = issues.filter((i) => !i.pull_request).map(parseIssue);
    res.status(200).json({ leads });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
