const https = require('https');
const { SignatureV4 } = require('@smithy/signature-v4');
const { Sha256 } = require('@aws-crypto/sha256-js');
const { HttpRequest } = require('@smithy/protocol-http');
const { defaultProvider } = require('@aws-sdk/credential-provider-node');

const SAAM_REGION = process.env.SAAM_REGION || 'us-east-1';
const SIGV4_HOST = `midway-auth-sigv4.${SAAM_REGION}.amazonaws.com`;
const TESTRAIL_HOST = 'public.testrail.appstore.amazon.dev';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const AUTH_USER = process.env.AUTH_USER || 'admin';
const AUTH_PASS = process.env.AUTH_PASS || 'audit@2024';

let cachedSession = null;
let sessionExpiry = 0;

async function getMidwaySession() {
  if (cachedSession && Date.now() < sessionExpiry) {
    return cachedSession;
  }

  const signer = new SignatureV4({
    service: 'midway-auth',
    region: SAAM_REGION,
    credentials: defaultProvider(),
    sha256: Sha256,
  });

  const request = new HttpRequest({
    method: 'GET',
    protocol: 'https:',
    hostname: SIGV4_HOST,
    path: '/api/sigv4/login',
    headers: { host: SIGV4_HOST },
  });

  const signed = await signer.sign(request);

  const body = await new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: signed.hostname,
        path: signed.path,
        method: 'GET',
        headers: signed.headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve(data));
      }
    );
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('SAAM request timeout')); });
    req.end();
  });

  const json = JSON.parse(body);
  if (!json.session) {
    throw new Error('No session in SAAM response: ' + body);
  }

  cachedSession = json.session;
  sessionExpiry = Date.now() + 5 * 60 * 60 * 1000; // cache for 5 hours (valid 6h)
  return cachedSession;
}

async function fetchWithMidway(url, testrailAuth) {
  const session = await getMidwaySession();

  const cookies = { session };
  let currentUrl = new URL(url);
  let maxRedirects = 10;

  while (maxRedirects-- > 0) {
    const cookieString = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');

    const result = await new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: currentUrl.hostname,
          path: currentUrl.pathname + currentUrl.search,
          method: 'GET',
          headers: {
            'Cookie': cookieString,
            'Authorization': `Basic ${testrailAuth}`,
            'Content-Type': 'application/json',
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => { body += chunk; });
          res.on('end', () => {
            const setCookies = res.headers['set-cookie'] || [];
            for (const sc of setCookies) {
              const match = sc.match(/^([^=]+)=([^;]+)/);
              if (match) cookies[match[1]] = match[2];
            }
            resolve({ statusCode: res.statusCode, headers: res.headers, body });
          });
        }
      );
      req.on('error', reject);
      req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
      req.end();
    });

    if ([301, 302, 303, 307, 308].includes(result.statusCode) && result.headers.location) {
      const location = result.headers.location;
      currentUrl = location.startsWith('http')
        ? new URL(location)
        : new URL(location, `https://${currentUrl.hostname}`);
      continue;
    }

    return result;
  }

  throw new Error('Too many redirects');
}

function checkAuth(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  if (!authHeader.startsWith('Basic ')) return false;
  const credentials = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
  const [user, pass] = credentials.split(':');
  return user === AUTH_USER && pass === AUTH_PASS;
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

async function handleProxy(params) {
  const targetPath = params.path;
  const testrailAuth = params.auth;

  if (!targetPath || !testrailAuth) {
    return respond(400, { error: 'Missing path or auth parameter' });
  }

  const url = `https://${TESTRAIL_HOST}/index.php?${targetPath}`;

  try {
    const result = await fetchWithMidway(url, testrailAuth);
    return respond(result.statusCode, result.body);
  } catch (err) {
    return respond(500, { error: err.message, code: err.code || 'UNKNOWN' });
  }
}

async function handleResultsByTester(params) {
  const { auth, projectId, userId, createdAfter, createdBefore } = params;

  if (!auth || !projectId || !userId) {
    return respond(400, { error: 'Missing required params (auth, projectId, userId)' });
  }

  try {
    let allRuns = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      let apiPath = `/api/v2/get_runs/${projectId}&limit=250&offset=${offset}`;
      if (createdAfter) apiPath += `&created_after=${createdAfter}`;
      if (createdBefore) apiPath += `&created_before=${createdBefore}`;

      const result = await fetchWithMidway(
        `https://${TESTRAIL_HOST}/index.php?${apiPath}`,
        auth
      );

      if (result.statusCode !== 200) { hasMore = false; break; }
      const data = JSON.parse(result.body);
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
          let apiPath = `/api/v2/get_results_for_run/${run.id}&limit=250&offset=${resultsOffset}`;
          if (createdAfter) apiPath += `&created_after=${createdAfter}`;
          if (createdBefore) apiPath += `&created_before=${createdBefore}`;

          const result = await fetchWithMidway(
            `https://${TESTRAIL_HOST}/index.php?${apiPath}`,
            auth
          );

          if (result.statusCode !== 200) break;
          const data = JSON.parse(result.body);
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

    return respond(200, { results: allResults, runs: allRuns.length });
  } catch (err) {
    return respond(500, { error: err.message });
  }
}

exports.handler = async (event) => {
  if (event.requestContext?.http?.method === 'OPTIONS' || event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (!checkAuth(event)) {
    return respond(401, { error: 'Authentication required' });
  }

  const path = event.requestContext?.http?.path || event.path || '';
  const params = event.queryStringParameters || {};

  if (path === '/api/proxy') {
    return handleProxy(params);
  }

  if (path === '/api/results-by-tester') {
    return handleResultsByTester(params);
  }

  return respond(404, { error: 'Not found' });
};
