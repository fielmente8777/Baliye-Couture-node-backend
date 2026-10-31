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
const routeGlob = path
  .resolve(__dirname, '..', 'routes', `*${path.extname(__filename)}`)
  /* Globs need forward slashes; on Windows path.resolve gives backslashes and finds nothing. */
  .split(path.sep)
  .join('/');

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Baliye API',
      version: '1.0.0',
      description:
        'REST API behind the Baliye Couture website (https://baliyecouture.com) and its admin panel: ' +
        'customer sign-in (Shopify customer accounts, OTP, Google), measurements, Create Your Own Design ' +
        '(garments, steps, options, AI previews), cart and Shopify checkout, orders, returns and ' +
        'replacements, wishlist, website content, and the admin panel (Design Builder, AI Studio, ' +
        'team, newsletter, design credits).\n\n' +
        'Products, prices, the cart and payment for ready-to-wear live in Shopify; this API reads them.\n\n' +
        '**How to authorise:** call `POST /auth/login` (admin) or `POST /auth/send-otp` then ' +
        '`POST /auth/verify-otp` (customer). Copy `data.accessToken` from the response, click ' +
        '**Authorize** above and paste the raw token — do not prefix it with "Bearer".',
    },
    servers: [
      { url: 'https://api.baliyecouture.com/api/v1', description: 'Production' },
      { url: `http://localhost:${env.port}${env.apiPrefix}`, description: 'Local' },
    ],
    tags: [
      { name: 'Auth', description: 'Customer and admin sign-in, tokens' },
      { name: 'Profile', description: 'The signed-in customer’s own profile' },
      { name: 'Addresses', description: 'The signed-in customer’s saved shipping addresses' },
      { name: 'Measurements', description: 'Measurement fields (admin) and customers’ saved measurements' },
      { name: 'Catalog', description: 'Public garment types and products' },
      { name: 'Design', description: 'Create Your Own Design: steps, prices, AI previews, saved designs' },
      { name: 'Cart', description: 'Cart contents for the signed-in customer' },
      { name: 'Orders', description: 'Checkout, order history, cancellation, returns, replacements, tracking' },
      { name: 'Wishlist', description: 'The signed-in customer’s saved products and designs' },
      { name: 'Notifications', description: 'The signed-in customer’s notifications' },
      { name: 'Tokens', description: 'Design credits: the customer’s balance and use' },
      { name: 'Settings', description: 'Public site settings, e.g. whether design credits are on' },
      { name: 'Newsletter', description: 'Newsletter sign-up from the website' },
      { name: 'Content', description: 'Website words and pictures edited in the admin panel' },
      { name: 'Shopify', description: 'Store connection and customer link' },
      { name: 'Admin', description: 'Admin panel: Design Builder, team, website content, orders, credits, newsletter' },
      { name: 'AI Studio', description: 'Embroidery extraction, pieces, try-on and linking to the designer' },
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
