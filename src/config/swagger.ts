import path from 'path';
import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env';
import { buildZodComponents } from './swaggerSchemas';

/**
 * Resolve the route glob relative to THIS file rather than the process cwd.
 * In dev that lands on src/routes/*.ts; after `npm run build` the same
 * expression lands on dist/routes/*.js. The old cwd-relative glob silently
 * produced an empty spec whenever the server was started from any other
 * directory — which is the usual reason Swagger renders with no endpoints.
 */
const routeGlob = path.resolve(__dirname, '..', 'routes', `*${path.extname(__filename)}`);

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Baliye API',
      version: '1.0.0',
      description:
        'REST API for a multi-role (Admin/User) custom suit tailoring platform: ' +
        'authentication (OTP + Google), measurements, suit design, cart, orders and order tracking.\n\n' +
        '**How to authorise:** call `POST /auth/send-otp`, then `POST /auth/verify-otp` ' +
        '(or `POST /auth/login` for admin). Copy `data.accessToken` from the response, ' +
        'click **Authorize** above and paste the raw token — do not prefix it with "Bearer".',
    },
    servers: [
      { url: `http://localhost:${env.port}${env.apiPrefix}`, description: 'Local' },
    ],
    tags: [
      { name: 'Auth', description: 'Registration, OTP, Google and admin login' },
      { name: 'Profile', description: 'The signed-in user’s own profile' },
      { name: 'Addresses', description: 'The signed-in user’s saved shipping addresses' },
      { name: 'Measurements', description: 'Admin templates and user measurements' },
      { name: 'Design', description: 'Design option catalog and saved suit designs' },
      { name: 'Cart', description: 'Cart contents for the signed-in user' },
      { name: 'Orders', description: 'Order placement, history, cancellation and tracking' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Request successful' },
            data: { type: 'object' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Validation failed' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string', example: 'phone' },
                  message: { type: 'string', example: 'String must contain at least 8 character(s)' },
                },
              },
            },
          },
        },
        AuthTokens: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
          },
        },
        // Every request body below is generated from the Zod schemas.
        ...buildZodComponents(),
      },
      responses: {
        Unauthorized: {
          description: 'Missing, malformed or expired access token',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
        Forbidden: {
          description: 'Authenticated, but the role is not permitted',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
        NotFound: {
          description: 'Resource not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
        ValidationError: {
          description: 'Request body or params failed validation',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
      },
      parameters: {
        IdParam: {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string', example: '66b2f0c1e4b0a1a2b3c4d5e6' },
          description: 'MongoDB ObjectId',
        },
        PageQuery: {
          name: 'page',
          in: 'query',
          schema: { type: 'integer', minimum: 1, default: 1 },
        },
        LimitQuery: {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: [routeGlob],
};

export const swaggerSpec = swaggerJsdoc(options);

/** Exposed so `GET /api-docs.json` can serve the raw spec for Postman import. */
export const swaggerRouteGlob = routeGlob;
