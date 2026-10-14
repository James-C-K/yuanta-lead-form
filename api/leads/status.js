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

  const { number, status, plannedAt, completedAt } = req.body || {};
  if (!number) {
    res.status(400).json({ error: 'missing number' });
    return;
  }
  if (status !== undefined && !STATUSES.includes(status)) {
    res.status(400).json({ error: 'invalid status' });
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
    const patch = {};

    if (status !== undefined) {
      const currentLabels = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
      const keptLabels = currentLabels.filter((l) => !STATUSES.includes(l));
      patch.labels = [...keptLabels, status];
    }

    if (plannedAt !== undefined || completedAt !== undefined || status !== undefined) {
      const match = DATA_RE.exec(issue.body || '');
      let data = {};
      if (match) {
        try { data = JSON.parse(match[1]); } catch (e) { data = {}; }
      }
      if (plannedAt !== undefined) data.plannedAt = plannedAt || null;
      if (completedAt !== undefined) {
        data.completedAt = completedAt || null;
      } else if (status === '完成' && !data.completedAt) {
        data.completedAt = new Date().toISOString();
      } else if (status !== undefined && status !== '完成') {
        data.completedAt = null;
      }

      const newBlock = `<!-- LEAD_DATA ${JSON.stringify(data)} -->`;
      const newBody = match
        ? issue.body.replace(DATA_RE, newBlock)
        : `${issue.body || ''}\n\n${newBlock}`;
      patch.body = newBody;
    }

    const patchRes = await fetch(`https://api.github.com/repos/${repo}/issues/${number}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(patch),
    });
    if (!patchRes.ok) {
      res.status(502).json({ error: 'github patch failed', detail: await patchRes.text() });
      return;
    }
    const updated = await patchRes.json();
    const m2 = DATA_RE.exec(updated.body || '');
    let newData = {};
    if (m2) { try { newData = JSON.parse(m2[1]); } catch (e) {} }

    res.status(200).json({ ok: true, status, plannedAt: newData.plannedAt, completedAt: newData.completedAt });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
