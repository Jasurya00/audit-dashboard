const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export async function handler(event) {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  const path = event.rawPath || event.requestContext?.http?.path || '';
  const params = event.queryStringParameters || {};

  if (path === '/api/proxy') {
    return handleProxy(params);
  } else if (path === '/api/results-by-tester') {
    return handleResultsByTester(params);
  }

  return response(404, { error: 'Not found' });
}

async function handleProxy(params) {
  const { url, auth } = params;
  if (!url || !auth) {
    return response(400, { error: 'Missing url or auth query parameter' });
  }

  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });

    const contentType = resp.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await resp.json();
      return response(resp.status, data);
    } else {
      const text = await resp.text();
      return { statusCode: resp.status, headers: CORS_HEADERS, body: text };
    }
  } catch (err) {
    return response(500, { error: err.message });
  }
}

async function handleResultsByTester(params) {
  const { baseUrl, auth, projectId, userId, createdAfter, createdBefore } = params;

  if (!baseUrl || !auth || !projectId || !userId) {
    return response(400, { error: 'Missing required params (baseUrl, auth, projectId, userId)' });
  }

  const headers = {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json',
  };

  try {
    let allRuns = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      let url = `${baseUrl}/index.php?/api/v2/get_runs/${projectId}&limit=250&offset=${offset}`;
      if (createdAfter) url += `&created_after=${createdAfter}`;
      if (createdBefore) url += `&created_before=${createdBefore}`;

      const resp = await fetch(url, { headers });
      if (!resp.ok) { hasMore = false; break; }
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

        const latestByTest = {};
        for (const r of runResults) {
          const testId = r.test_id || r.id;
          if (!latestByTest[testId] || (r.created_on > latestByTest[testId].created_on)) {
            latestByTest[testId] = r;
          }
        }

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

    return response(200, { results: allResults, runs: allRuns.length });
  } catch (err) {
    return response(500, { error: err.message });
  }
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
