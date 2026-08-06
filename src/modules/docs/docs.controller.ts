import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { asyncApiSpec } from './asyncapi-spec';

/**
 * Serves the AsyncAPI event documentation:
 *   GET /api/events-docs      → HTML viewer (AsyncAPI React component via CDN)
 *   GET /api/events-docs/spec → raw JSON spec
 */
@ApiExcludeController()
@Controller('api/events-docs')
export class DocsController {
  @Get('spec')
  @Header('Content-Type', 'application/json')
  spec() {
    return asyncApiSpec;
  }

  @Get()
  @Header('Content-Type', 'text/html')
  ui() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ProFootball Events API — AsyncAPI Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/@asyncapi/react-component@1/styles/default.min.css" />
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  </style>
</head>
<body>
  <div id="asyncapi"></div>
  <script src="https://unpkg.com/@asyncapi/react-component@1/browser/standalone/index.js"></script>
  <script>
    AsyncApiStandalone.render({
      schema: ${JSON.stringify(asyncApiSpec)},
      config: {
        show: {
          sidebar: true,
          info: true,
          servers: true,
          operations: true,
          messages: true,
          schemas: true,
          errors: true,
        },
      },
    }, document.getElementById('asyncapi'));
  </script>
</body>
</html>`;
  }
}
