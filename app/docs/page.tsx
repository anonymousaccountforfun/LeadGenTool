'use client';

import { useState } from 'react';

export default function ApiDocsPage() {
  const [activeSection, setActiveSection] = useState('overview');

  const sections = [
    { id: 'overview', label: 'Overview' },
    { id: 'authentication', label: 'Authentication' },
    { id: 'rate-limiting', label: 'Rate Limiting' },
    { id: 'search', label: 'Search Endpoints' },
    { id: 'results', label: 'Results Endpoints' },
    { id: 'export', label: 'Export Endpoints' },
    { id: 'webhooks', label: 'Webhooks' },
    { id: 'usage', label: 'Usage & Stats' },
    { id: 'errors', label: 'Error Handling' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">LeadGenTool API Documentation</h1>
        <p className="text-gray-600 mb-8">Version 1.0.0</p>

        <div className="flex gap-8">
          {/* Sidebar */}
          <nav className="w-64 shrink-0">
            <div className="sticky top-8 bg-white rounded-lg shadow p-4">
              <ul className="space-y-2">
                {sections.map((section) => (
                  <li key={section.id}>
                    <button
                      onClick={() => setActiveSection(section.id)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm ${
                        activeSection === section.id
                          ? 'bg-blue-100 text-blue-700 font-medium'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {section.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          {/* Content */}
          <main className="flex-1 min-w-0">
            <div className="bg-white rounded-lg shadow p-8">
              {activeSection === 'overview' && <OverviewSection />}
              {activeSection === 'authentication' && <AuthenticationSection />}
              {activeSection === 'rate-limiting' && <RateLimitingSection />}
              {activeSection === 'search' && <SearchSection />}
              {activeSection === 'results' && <ResultsSection />}
              {activeSection === 'export' && <ExportSection />}
              {activeSection === 'webhooks' && <WebhooksSection />}
              {activeSection === 'usage' && <UsageSection />}
              {activeSection === 'errors' && <ErrorsSection />}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function CodeBlock({ children, language = 'bash' }: { children: string; language?: string }) {
  return (
    <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm">
      <code>{children}</code>
    </pre>
  );
}

function Endpoint({ method, path, description }: { method: string; path: string; description: string }) {
  const methodColors: Record<string, string> = {
    GET: 'bg-green-100 text-green-700',
    POST: 'bg-blue-100 text-blue-700',
    DELETE: 'bg-red-100 text-red-700',
  };

  return (
    <div className="border rounded-lg p-4 mb-4">
      <div className="flex items-center gap-3 mb-2">
        <span className={`px-2 py-1 rounded text-xs font-mono font-bold ${methodColors[method]}`}>
          {method}
        </span>
        <code className="text-sm font-mono text-gray-700">{path}</code>
      </div>
      <p className="text-gray-600 text-sm">{description}</p>
    </div>
  );
}

function OverviewSection() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Overview</h2>
      <p className="text-gray-600 mb-4">
        The LeadGenTool API provides programmatic access to lead generation features.
        Use it to automate searches, retrieve results, and export data.
      </p>

      <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-3">Base URL</h3>
      <CodeBlock>{`https://your-domain.com/api/v1`}</CodeBlock>

      <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-3">Available Endpoints</h3>
      <Endpoint method="POST" path="/search" description="Start a new lead search" />
      <Endpoint method="GET" path="/search" description="List all searches" />
      <Endpoint method="GET" path="/search/{id}" description="Get search status" />
      <Endpoint method="GET" path="/results/{id}" description="Get search results" />
      <Endpoint method="GET" path="/export/{id}" description="Export results" />
      <Endpoint method="POST" path="/webhooks" description="Create webhook" />
      <Endpoint method="GET" path="/webhooks" description="List webhooks" />
      <Endpoint method="DELETE" path="/webhooks/{id}" description="Delete webhook" />
      <Endpoint method="GET" path="/usage" description="Get usage statistics" />
    </div>
  );
}

function AuthenticationSection() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Authentication</h2>
      <p className="text-gray-600 mb-4">
        All API requests require an API key. Generate keys from your dashboard settings.
      </p>

      <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-3">Using Your API Key</h3>
      <p className="text-gray-600 mb-4">
        Include your API key in requests using one of these methods:
      </p>

      <h4 className="font-medium text-gray-900 mb-2">Authorization Header (Recommended)</h4>
      <CodeBlock>{`curl -H "Authorization: Bearer lgk_your_api_key" \\
  https://your-domain.com/api/v1/search`}</CodeBlock>

      <h4 className="font-medium text-gray-900 mt-4 mb-2">X-API-Key Header</h4>
      <CodeBlock>{`curl -H "X-API-Key: lgk_your_api_key" \\
  https://your-domain.com/api/v1/search`}</CodeBlock>

      <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-3">API Key Permissions</h3>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 px-3">Permission</th>
            <th className="text-left py-2 px-3">Description</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="py-2 px-3 font-mono text-xs">search:read</td>
            <td className="py-2 px-3">View search status and list searches</td>
          </tr>
          <tr className="border-b">
            <td className="py-2 px-3 font-mono text-xs">search:write</td>
            <td className="py-2 px-3">Create new searches</td>
          </tr>
          <tr className="border-b">
            <td className="py-2 px-3 font-mono text-xs">results:read</td>
            <td className="py-2 px-3">View search results</td>
          </tr>
          <tr className="border-b">
            <td className="py-2 px-3 font-mono text-xs">export:read</td>
            <td className="py-2 px-3">Export results as CSV/JSON</td>
          </tr>
          <tr className="border-b">
            <td className="py-2 px-3 font-mono text-xs">webhooks:write</td>
            <td className="py-2 px-3">Manage webhooks</td>
          </tr>
          <tr>
            <td className="py-2 px-3 font-mono text-xs">usage:read</td>
            <td className="py-2 px-3">View usage statistics</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function RateLimitingSection() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Rate Limiting</h2>
      <p className="text-gray-600 mb-4">
        API requests are rate-limited to ensure fair usage. Limits are applied per API key.
      </p>

      <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-3">Default Limits</h3>
      <ul className="list-disc list-inside text-gray-600 mb-4">
        <li><strong>Per-minute:</strong> 60 requests</li>
        <li><strong>Monthly:</strong> 10,000 requests</li>
      </ul>

      <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-3">Rate Limit Headers</h3>
      <p className="text-gray-600 mb-4">
        Every response includes rate limit information in headers:
      </p>
      <CodeBlock>{`X-RateLimit-Remaining: 59
X-RateLimit-Limit: 60
X-RateLimit-Reset: 2024-01-15T10:00:00.000Z`}</CodeBlock>

      <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-3">Exceeding Rate Limits</h3>
      <p className="text-gray-600 mb-4">
        When you exceed the rate limit, you&apos;ll receive a 429 response:
      </p>
      <CodeBlock language="json">{`{
  "error": "Rate limit exceeded. Retry after 45 seconds."
}`}</CodeBlock>
      <p className="text-gray-600 mt-2">
        The response includes a <code className="bg-gray-100 px-1 rounded">Retry-After</code> header
        indicating when you can retry.
      </p>
    </div>
  );
}

function SearchSection() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Search Endpoints</h2>

      <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-3">Create a Search</h3>
      <Endpoint method="POST" path="/search" description="Start a new lead search" />

      <h4 className="font-medium text-gray-900 mb-2">Request Body</h4>
      <CodeBlock language="json">{`{
  "query": "dentists",
  "location": "San Francisco, CA",
  "count": 100,
  "priority": "normal",
  "industryCategory": "medical",
  "targetState": "CA",
  "companySizeMin": 10,
  "companySizeMax": 500
}`}</CodeBlock>

      <h4 className="font-medium text-gray-900 mt-4 mb-2">Response</h4>
      <CodeBlock language="json">{`{
  "success": true,
  "data": {
    "id": "job_12345",
    "query": "dentists",
    "location": "San Francisco, CA",
    "targetCount": 100,
    "status": "pending",
    "createdAt": "2024-01-15T10:00:00.000Z"
  }
}`}</CodeBlock>

      <h3 className="text-lg font-semibold text-gray-900 mt-8 mb-3">List Searches</h3>
      <Endpoint method="GET" path="/search" description="List all your searches" />

      <h4 className="font-medium text-gray-900 mb-2">Query Parameters</h4>
      <table className="w-full text-sm border-collapse mb-4">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 px-3">Parameter</th>
            <th className="text-left py-2 px-3">Default</th>
            <th className="text-left py-2 px-3">Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="py-2 px-3 font-mono text-xs">limit</td>
            <td className="py-2 px-3">20</td>
            <td className="py-2 px-3">Number of results (max 100)</td>
          </tr>
        </tbody>
      </table>

      <h3 className="text-lg font-semibold text-gray-900 mt-8 mb-3">Get Search Status</h3>
      <Endpoint method="GET" path="/search/{id}" description="Get detailed search status" />
    </div>
  );
}

function ResultsSection() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Results Endpoints</h2>

      <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-3">Get Results</h3>
      <Endpoint method="GET" path="/results/{id}" description="Get full results for a search" />

      <h4 className="font-medium text-gray-900 mb-2">Query Parameters</h4>
      <table className="w-full text-sm border-collapse mb-4">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 px-3">Parameter</th>
            <th className="text-left py-2 px-3">Default</th>
            <th className="text-left py-2 px-3">Description</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="py-2 px-3 font-mono text-xs">page</td>
            <td className="py-2 px-3">1</td>
            <td className="py-2 px-3">Page number</td>
          </tr>
          <tr className="border-b">
            <td className="py-2 px-3 font-mono text-xs">per_page</td>
            <td className="py-2 px-3">50</td>
            <td className="py-2 px-3">Results per page (max 100)</td>
          </tr>
          <tr className="border-b">
            <td className="py-2 px-3 font-mono text-xs">email_only</td>
            <td className="py-2 px-3">false</td>
            <td className="py-2 px-3">Only return results with emails</td>
          </tr>
          <tr>
            <td className="py-2 px-3 font-mono text-xs">min_confidence</td>
            <td className="py-2 px-3">0</td>
            <td className="py-2 px-3">Minimum email confidence (0-1)</td>
          </tr>
        </tbody>
      </table>

      <h4 className="font-medium text-gray-900 mt-4 mb-2">Response</h4>
      <CodeBlock language="json">{`{
  "success": true,
  "data": {
    "searchId": "job_12345",
    "query": "dentists",
    "status": "completed",
    "results": [
      {
        "id": 1,
        "name": "Smith Dental Clinic",
        "email": "info@smithdental.com",
        "emailConfidence": 0.92,
        "website": "https://smithdental.com",
        "phone": "(415) 555-1234",
        "address": "123 Main St, San Francisco, CA",
        "rating": 4.8,
        "reviewCount": 127
      }
    ]
  },
  "pagination": {
    "page": 1,
    "perPage": 50,
    "total": 100,
    "totalPages": 2
  }
}`}</CodeBlock>
    </div>
  );
}

function ExportSection() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Export Endpoints</h2>

      <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-3">Export Results</h3>
      <Endpoint method="GET" path="/export/{id}" description="Export results in various formats" />

      <h4 className="font-medium text-gray-900 mb-2">Query Parameters</h4>
      <table className="w-full text-sm border-collapse mb-4">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 px-3">Parameter</th>
            <th className="text-left py-2 px-3">Default</th>
            <th className="text-left py-2 px-3">Description</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="py-2 px-3 font-mono text-xs">format</td>
            <td className="py-2 px-3">csv</td>
            <td className="py-2 px-3">Export format (see below)</td>
          </tr>
          <tr className="border-b">
            <td className="py-2 px-3 font-mono text-xs">email_only</td>
            <td className="py-2 px-3">false</td>
            <td className="py-2 px-3">Only export results with emails</td>
          </tr>
          <tr>
            <td className="py-2 px-3 font-mono text-xs">min_confidence</td>
            <td className="py-2 px-3">0</td>
            <td className="py-2 px-3">Minimum email confidence (0-1)</td>
          </tr>
        </tbody>
      </table>

      <h4 className="font-medium text-gray-900 mt-4 mb-2">Available Formats</h4>
      <ul className="list-disc list-inside text-gray-600 mb-4">
        <li><code className="bg-gray-100 px-1 rounded">csv</code> - Standard CSV</li>
        <li><code className="bg-gray-100 px-1 rounded">enhanced</code> - CSV with additional columns</li>
        <li><code className="bg-gray-100 px-1 rounded">json</code> - JSON format</li>
        <li><code className="bg-gray-100 px-1 rounded">hubspot</code> - HubSpot-compatible CSV</li>
        <li><code className="bg-gray-100 px-1 rounded">salesforce</code> - Salesforce-compatible CSV</li>
        <li><code className="bg-gray-100 px-1 rounded">pipedrive</code> - Pipedrive-compatible CSV</li>
        <li><code className="bg-gray-100 px-1 rounded">mailchimp</code> - Mailchimp-compatible CSV</li>
      </ul>

      <h4 className="font-medium text-gray-900 mt-4 mb-2">Example</h4>
      <CodeBlock>{`curl -H "Authorization: Bearer lgk_your_api_key" \\
  "https://your-domain.com/api/v1/export/job_12345?format=hubspot&email_only=true" \\
  -o leads.csv`}</CodeBlock>
    </div>
  );
}

function WebhooksSection() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Webhooks</h2>
      <p className="text-gray-600 mb-4">
        Receive real-time notifications when events occur. Webhooks are sent as POST
        requests to your configured URL.
      </p>

      <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-3">Available Events</h3>
      <ul className="list-disc list-inside text-gray-600 mb-4">
        <li><code className="bg-gray-100 px-1 rounded">search.started</code> - Search has started</li>
        <li><code className="bg-gray-100 px-1 rounded">search.completed</code> - Search finished successfully</li>
        <li><code className="bg-gray-100 px-1 rounded">search.failed</code> - Search failed</li>
        <li><code className="bg-gray-100 px-1 rounded">export.ready</code> - Export file is ready</li>
      </ul>

      <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-3">Create Webhook</h3>
      <Endpoint method="POST" path="/webhooks" description="Create a new webhook" />

      <h4 className="font-medium text-gray-900 mb-2">Request Body</h4>
      <CodeBlock language="json">{`{
  "url": "https://your-server.com/webhook",
  "events": ["search.completed", "search.failed"]
}`}</CodeBlock>

      <h4 className="font-medium text-gray-900 mt-4 mb-2">Response</h4>
      <CodeBlock language="json">{`{
  "success": true,
  "data": {
    "id": "wh_12345",
    "url": "https://your-server.com/webhook",
    "events": ["search.completed", "search.failed"],
    "secret": "abc123...def456",
    "isActive": true
  },
  "message": "Save the secret - it will only be shown once."
}`}</CodeBlock>

      <h3 className="text-lg font-semibold text-gray-900 mt-8 mb-3">Webhook Payload</h3>
      <p className="text-gray-600 mb-2">
        Webhook requests include these headers:
      </p>
      <ul className="list-disc list-inside text-gray-600 mb-4">
        <li><code className="bg-gray-100 px-1 rounded">X-Webhook-Event</code> - The event type</li>
        <li><code className="bg-gray-100 px-1 rounded">X-Webhook-Signature</code> - HMAC signature for verification</li>
      </ul>

      <h4 className="font-medium text-gray-900 mt-4 mb-2">Example Payload</h4>
      <CodeBlock language="json">{`{
  "event": "search.completed",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "jobId": "job_12345",
    "query": "dentists",
    "location": "San Francisco, CA",
    "resultCount": 100
  }
}`}</CodeBlock>

      <h3 className="text-lg font-semibold text-gray-900 mt-8 mb-3">Verify Webhook Signature</h3>
      <CodeBlock language="javascript">{`const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = crypto
    .createHash('sha256')
    .update(secret + payload)
    .digest('hex');
  return signature === expected;
}`}</CodeBlock>
    </div>
  );
}

function UsageSection() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Usage & Statistics</h2>

      <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-3">Get Usage Stats</h3>
      <Endpoint method="GET" path="/usage" description="Get API usage statistics" />

      <h4 className="font-medium text-gray-900 mb-2">Query Parameters</h4>
      <table className="w-full text-sm border-collapse mb-4">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 px-3">Parameter</th>
            <th className="text-left py-2 px-3">Default</th>
            <th className="text-left py-2 px-3">Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="py-2 px-3 font-mono text-xs">days</td>
            <td className="py-2 px-3">30</td>
            <td className="py-2 px-3">Number of days to include</td>
          </tr>
        </tbody>
      </table>

      <h4 className="font-medium text-gray-900 mt-4 mb-2">Response</h4>
      <CodeBlock language="json">{`{
  "success": true,
  "data": {
    "key": {
      "id": "key_12345",
      "name": "Production API Key",
      "permissions": ["search:write", "results:read", "export:read"]
    },
    "limits": {
      "rateLimit": { "limit": 60, "remaining": 55 },
      "monthly": { "limit": 10000, "remaining": 8500 }
    },
    "usage": {
      "period": "30 days",
      "total": {
        "requests": 1500,
        "searches": 50,
        "exports": 30,
        "bytesTransferred": 1048576
      },
      "daily": [
        { "date": "2024-01-15", "requests": 120, "searches": 5 }
      ]
    }
  }
}`}</CodeBlock>
    </div>
  );
}

function ErrorsSection() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Error Handling</h2>
      <p className="text-gray-600 mb-4">
        The API uses standard HTTP status codes and returns JSON error responses.
      </p>

      <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-3">HTTP Status Codes</h3>
      <table className="w-full text-sm border-collapse mb-4">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 px-3">Status</th>
            <th className="text-left py-2 px-3">Description</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="py-2 px-3 font-mono">200</td>
            <td className="py-2 px-3">Success</td>
          </tr>
          <tr className="border-b">
            <td className="py-2 px-3 font-mono">201</td>
            <td className="py-2 px-3">Created (for POST requests)</td>
          </tr>
          <tr className="border-b">
            <td className="py-2 px-3 font-mono">400</td>
            <td className="py-2 px-3">Bad Request - Invalid parameters</td>
          </tr>
          <tr className="border-b">
            <td className="py-2 px-3 font-mono">401</td>
            <td className="py-2 px-3">Unauthorized - Invalid or missing API key</td>
          </tr>
          <tr className="border-b">
            <td className="py-2 px-3 font-mono">403</td>
            <td className="py-2 px-3">Forbidden - Missing required permission</td>
          </tr>
          <tr className="border-b">
            <td className="py-2 px-3 font-mono">404</td>
            <td className="py-2 px-3">Not Found - Resource doesn&apos;t exist</td>
          </tr>
          <tr className="border-b">
            <td className="py-2 px-3 font-mono">429</td>
            <td className="py-2 px-3">Too Many Requests - Rate limit exceeded</td>
          </tr>
          <tr>
            <td className="py-2 px-3 font-mono">500</td>
            <td className="py-2 px-3">Internal Server Error</td>
          </tr>
        </tbody>
      </table>

      <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-3">Error Response Format</h3>
      <CodeBlock language="json">{`{
  "error": "Description of what went wrong"
}`}</CodeBlock>

      <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-3">Common Errors</h3>

      <h4 className="font-medium text-gray-900 mt-4 mb-2">Missing API Key</h4>
      <CodeBlock language="json">{`{
  "error": "API key is required. Provide via Authorization: Bearer <key> or X-API-Key header."
}`}</CodeBlock>

      <h4 className="font-medium text-gray-900 mt-4 mb-2">Invalid API Key</h4>
      <CodeBlock language="json">{`{
  "error": "Invalid or expired API key."
}`}</CodeBlock>

      <h4 className="font-medium text-gray-900 mt-4 mb-2">Missing Permission</h4>
      <CodeBlock language="json">{`{
  "error": "Missing required permission: search:write"
}`}</CodeBlock>

      <h4 className="font-medium text-gray-900 mt-4 mb-2">Rate Limit Exceeded</h4>
      <CodeBlock language="json">{`{
  "error": "Rate limit exceeded. Retry after 45 seconds."
}`}</CodeBlock>
    </div>
  );
}
