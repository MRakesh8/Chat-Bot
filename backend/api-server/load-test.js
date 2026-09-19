import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },  // ramp up to 50 users
    { duration: '1m', target: 50 },   // stay at 50 users for 1 min
    { duration: '30s', target: 100 }, // ramp up to 100 users
    { duration: '1m', target: 100 },  // stay at 100 users for 1 min
    { duration: '30s', target: 0 },   // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
    http_req_failed: ['rate<0.01'],   // less than 1% failure rate
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:8080/api';
const API_KEY = __ENV.API_KEY || 'sk_test_123';
const PROJECT_ID = __ENV.PROJECT_ID || '11111111-1111-1111-1111-111111111111';

export default function () {
  // Test health check route (no DB/Redis)
  const healthRes = http.get(`${BASE_URL}/healthz`);
  check(healthRes, {
    'healthz status is 200': (r) => r.status === 200,
  });

  // Test RAG Retrieval (Mock Provider mode)
  const ragPayload = JSON.stringify({
    messages: [
      { role: 'user', content: 'What is Raghub?' }
    ],
    mock_provider: true // Do not hit real LLM
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
  };

  const ragRes = http.post(`${BASE_URL}/gemini/conversations/loadtest_1/messages`, ragPayload, params);
  
  check(ragRes, {
    'rag status is 200 or 429': (r) => r.status === 200 || r.status === 429,
  });

  sleep(1);
}
