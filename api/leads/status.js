export const config = { api: { bodyParser: true } };

const STATUSES = ['待處理', '聯絡中', '完成'];
const DATA_RE = /<!-- LEAD_DATA (.*?) -->/s;

export default async function handler(req, res) {
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${process.env.ADMIN_TOKEN}`) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const { number, status } = req.body || {};
  if (!number || !STATUSES.includes(status)) {
    res.status(400).json({ error: 'invalid number or status' });
    return;
  }

  const repo = process.env.GITHUB_DATA_REPO;
  const headers = {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };

  try {
    const getRes = await fetch(`https://api.github.com/repos/${repo}/issues/${number}`, { headers });
    if (!getRes.ok) {
      res.status(502).json({ error: 'github get failed', detail: await getRes.text() });
      return;
    }
    const issue = await getRes.json();

    const currentLabels = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
    const keptLabels = currentLabels.filter((l) => !STATUSES.includes(l));
    const newLabels = [...keptLabels, status];

    const match = DATA_RE.exec(issue.body || '');
    let data = {};
    if (match) {
      try { data = JSON.parse(match[1]); } catch (e) { data = {}; }
    }
    // completedAt is fully automatic: set on entering 完成, cleared on leaving it.
    data.completedAt = status === '完成' ? new Date().toISOString() : null;

    const newBlock = `<!-- LEAD_DATA ${JSON.stringify(data)} -->`;
    const newBody = match
      ? issue.body.replace(DATA_RE, newBlock)
      : `${issue.body || ''}\n\n${newBlock}`;

    const patchRes = await fetch(`https://api.github.com/repos/${repo}/issues/${number}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ labels: newLabels, body: newBody }),
    });
    if (!patchRes.ok) {
      res.status(502).json({ error: 'github patch failed', detail: await patchRes.text() });
      return;
    }

    res.status(200).json({ ok: true, status, completedAt: data.completedAt });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
