import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';

import app from '../app.js';
import { errorHandler } from '../middleware/error-handler.js';
import { validate } from '../middleware/validate.js';

describe('API', () => {
  it('GET /health should return 200', async () => {
    const response = await request(app).get('/health');

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      status: 'ok',
      service: 'portfolio-api',
    });
  });

  it('unknown routes should return 404', async () => {
    const response = await request(app).get('/unknown');

    assert.equal(response.status, 404);
    assert.deepEqual(response.body, {
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource was not found.',
      },
    });
  });

  it('should return a generic 500 response for unexpected errors', async () => {
    const testApp = express();

    testApp.get('/trigger-error', () => {
      throw new Error('Sensitive internal error');
    });

    testApp.use(errorHandler);

    const response = await request(testApp).get('/trigger-error');

    assert.equal(response.status, 500);
    assert.deepEqual(response.body, {
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
      },
    });

    assert.equal(
      JSON.stringify(response.body).includes('Sensitive internal error'),
      false,
    );
  });
});


describe('Request validation', () => {
  const bodySchema = z.object({
    name: z.string().trim().min(2),
    age: z.number().int().positive(),
  });

  function createTestApp() {
    const testApp = express();
    testApp.use(express.json());

    testApp.post('/test', validate(bodySchema), (_req, res) => {
      res.status(200).json(res.locals.validated.body);
    });

    testApp.get(
      '/users',
      validate(
        z.object({
          page: z.coerce.number().int().positive(),
        }),
        'query',
      ),
      (_req, res) => {
        res.status(200).json(res.locals.validated.query);
      },
    );

    testApp.get(
      '/users/:id',
      validate(
        z.object({
          id: z.string().uuid(),
        }),
        'params',
      ),
      (_req, res) => {
        res.status(200).json(res.locals.validated.params);
      },
    );

    return testApp;
  }

  it('should accept valid body data and preserve transformations', async () => {
    const response = await request(createTestApp())
      .post('/test')
      .send({ name: ' Yatin ', age: 22 });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      name: 'Yatin',
      age: 22,
    });
  });

  it('should reject invalid body data', async () => {
    const response = await request(createTestApp())
      .post('/test')
      .send({ name: 'Y', age: -5 });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    assert.equal(response.body.error.details.length, 2);
  });

  it('should validate and transform query parameters', async () => {
    const response = await request(createTestApp())
      .get('/users?page=2');

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { page: 2 });
  });

  it('should reject invalid query parameters', async () => {
    const response = await request(createTestApp())
      .get('/users?page=invalid');

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  });

  it('should validate route parameters', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';

    const response = await request(createTestApp())
      .get(`/users/${id}`);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { id });
  });

  it('should reject invalid route parameters', async () => {
    const response = await request(createTestApp())
      .get('/users/not-a-uuid');

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  });
});
test('GET /health returns a valid request ID', async () => {
  const response = await request(app).get('/health');

  assert.equal(response.status, 200);

  const requestId = response.headers['x-request-id'];

  assert.ok(requestId);
  assert.match(
    requestId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
});

test('each request receives a unique request ID', async () => {
  const firstResponse = await request(app).get('/health');
  const secondResponse = await request(app).get('/health');

  assert.notEqual(
    firstResponse.headers['x-request-id'],
    secondResponse.headers['x-request-id'],
  );
});