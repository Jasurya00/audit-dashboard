// Cloudflare Worker — API proxy for Audit Dashboard
// Deploy this on Cloudflare Workers (free tier, no card required)

const AUTH_USER = 'admin';
const AUTH_PASS = 'audit@2024';

// CORS headers to allow requests from GitHub Pages
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Handle CORS preflight
function handleOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// Basic auth check
function checkAuth(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Basic ')) return false;
  const credentials = atob(authHeader.split(' ')[1]);
  const [user, pass] = credentials.split(':');
  return user === AUTH_USER && pass === AUTH_PASS;
}

// Proxy endpoint: forwards requests to TestRail API
async function handleProxy(url) {
  const params = new URL(url).searchParams;
  const targetUrl = params.get('url');
  const auth = params.get('auth');

  if (!targetUrl || !auth) {
    return new Response(JSON.stringify({ error: 'Missing url or auth query parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }

  const response = await fetch(targetUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    }
  });

  const contentType = response.headers.get('content-type') || '';
  const body = await response.text();

  return new Response(body, {
    status: response.status,
    headers: {
      'Content-Type': contentType || 'application/json',
      ...CORS_HEADERS
    }
  });
}

// Results by tester endpoint
async function handleResultsByTester(url) {
  const params = new URL(url).searchParams;
  const baseUrl = params.get('baseUrl');
  const auth = params.get('auth');
  const projectId = params.get('projectId');
  const userId = params.get('userId');
  const createdAfter = params.get('createdAfter');
  const createdBefore = params.get('createdBefore');

  if (!baseUrl || !auth || !projectId || !userId) {
    return new Response(JSON.stringify({ error: 'Missing required params' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }

  const headers = {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json'
  };

  try {
    // Fetch all runs for the project
    let allRuns = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      let fetchUrl = `${baseUrl}/index.php?/api/v2/get_runs/${projectId}&limit=250&offset=${offset}`;
      if (createdAfter) fetchUrl += `&created_after=${createdAfter}`;
      if (createdBefore) fetchUrl += `&created_before=${createdBefore}`;

      const resp = await fetch(fetchUrl, { headers });
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

    // Get latest result per test for each run
    const allResults = [];

    for (const run of allRuns) {
      try {
        let resultsOffset = 0;
        let moreResults = true;
        const runResults = [];

        while (moreResults) {
          let fetchUrl = `${baseUrl}/index.php?/api/v2/get_results_for_run/${run.id}&limit=250&offset=${resultsOffset}`;
          if (createdAfter) fetchUrl += `&created_after=${createdAfter}`;
          if (createdBefore) fetchUrl += `&created_before=${createdBefore}`;

          const resp = await fetch(fetchUrl, { headers });
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

        // Group by test_id, keep only latest result
        const latestByTest = {};
        for (const r of runResults) {
          const testId = r.test_id || r.id;
          if (!latestByTest[testId] || (r.created_on > latestByTest[testId].created_on)) {
            latestByTest[testId] = r;
          }
        }

        // Only include where latest result was created by searched user and not untested
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

    return new Response(JSON.stringify({ results: allResults, runs: allRuns.length }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }
}

// Main request handler
export default {
  async fetch(request) {
    const url = request.url;
    const path = new URL(url).pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleOptions();
    }

    // Check basic auth
    if (!checkAuth(request)) {
      return new Response('Authentication required.', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Audit Dashboard API"',
          ...CORS_HEADERS
        }
      });
    }

    // Route requests
    if (path === '/api/proxy') {
      return handleProxy(url);
    }

    if (path === '/api/results-by-tester') {
      return handleResultsByTester(url);
    }

    return new Response('Not found', { status: 404, headers: CORS_HEADERS });
  }
};
