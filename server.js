const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Proxy endpoint to forward requests to TestRail API
app.all('/api/proxy', async (req, res) => {
  const { url, auth } = req.query;

  if (!url || !auth) {
    return res.status(400).json({ error: 'Missing url or auth query parameter' });
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      res.status(response.status).json(data);
    } else {
      const text = await response.text();
      res.status(response.status).send(text);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to fetch results by tester within a timeframe across all runs in a project
app.get('/api/results-by-tester', async (req, res) => {
  const { baseUrl, auth, projectId, userId, createdAfter, createdBefore } = req.query;

  if (!baseUrl || !auth || !projectId || !userId) {
    return res.status(400).json({ error: 'Missing required params (baseUrl, auth, projectId, userId)' });
  }

  const headers = {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json'
  };

  try {
    // Fetch all active and completed runs for the project
    let allRuns = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      let url = `${baseUrl}/index.php?/api/v2/get_runs/${projectId}&limit=250&offset=${offset}`;
      if (createdAfter) url += `&created_after=${createdAfter}`;
      if (createdBefore) url += `&created_before=${createdBefore}`;

      const resp = await fetch(url, { headers });
      if (!resp.ok) {
        // Don't throw — just stop fetching runs
        hasMore = false;
        break;
      }
      const data = await resp.json();
      const runs = data.runs || data || [];
      if (Array.isArray(runs)) {
        allRuns = allRuns.concat(runs);
        hasMore = runs.length === 250;
        offset += 250;
      } else {
        hasMore = false;
      }
    }

    // Now get results for each run — we want the LATEST result per test
    // and only include tests where the latest status was set by the target user
    const allResults = [];

    for (const run of allRuns) {
      try {
        let resultsOffset = 0;
        let moreResults = true;
        const runResults = [];

        while (moreResults) {
          let url = `${baseUrl}/index.php?/api/v2/get_results_for_run/${run.id}&limit=250&offset=${resultsOffset}`;
          if (createdAfter) url += `&created_after=${createdAfter}`;
          if (createdBefore) url += `&created_before=${createdBefore}`;

          const resp = await fetch(url, { headers });
          if (!resp.ok) break;
          const data = await resp.json();
          const results = data.results || data || [];

          if (Array.isArray(results)) {
            runResults.push(...results);
            moreResults = results.length === 250;
            resultsOffset += 250;
          } else {
            moreResults = false;
          }
        }

        // Group by test_id and keep only the latest result (highest created_on) per test
        const latestByTest = {};
        for (const r of runResults) {
          const testId = r.test_id || r.id;
          if (!latestByTest[testId] || (r.created_on > latestByTest[testId].created_on)) {
            latestByTest[testId] = r;
          }
        }

        // Only include tests where the LATEST result was created by the searched user
        // and the status is not "Untested" (status_id 3)
        const latestResults = Object.values(latestByTest).filter(r => 
          String(r.created_by) === String(userId) && r.status_id !== 3
        );
        latestResults.forEach(r => {
          r._run_id = run.id;
          r._run_name = run.name;
        });
        allResults.push(...latestResults);

      } catch {
        continue;
      }
    }

    res.json({ results: allResults, runs: allRuns.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Audit Dashboard running at http://localhost:${PORT}`);
});
