# Authentication Guide for Converse MCP Server

This guide covers the authentication options available for securing remote deployments of the Converse MCP Server.

## Overview

The Converse MCP Server supports multiple authentication strategies to secure remote deployments:

- **None** (default) - No authentication required
- **Bearer Token** - JWT-based authentication
- **API Key** - Simple shared key authentication
- **OAuth 2.0** - Full OAuth2 authorization code flow

## Configuration

All authentication is configured through environment variables. The primary variable is `MCP_AUTH_STRATEGY` which determines the authentication method.

## Authentication Strategies

### 1. No Authentication (Default)

```bash
MCP_AUTH_STRATEGY=none
MCP_AUTH_REQUIRE=false
```

This is the default configuration suitable for:
- Local development
- Internal networks with other security measures
- Testing environments

### 2. Bearer Token Authentication

JWT-based authentication suitable for API clients.

```bash
MCP_AUTH_STRATEGY=bearer
MCP_AUTH_REQUIRE=true
MCP_JWT_SECRET=your-secret-key-at-least-32-chars
MCP_JWT_ALGORITHM=HS256
MCP_JWT_EXPIRES_IN=24h
MCP_JWT_ISSUER=converse-mcp-server
```

**Client Usage:**
```bash
curl -X POST http://localhost:3157/mcp \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

**Token Generation:**
You'll need to implement token generation separately. Example Node.js code:

```javascript
import jwt from 'jsonwebtoken';

const token = jwt.sign(
  { 
    sub: 'user123',
    name: 'John Doe',
    email: 'john@example.com'
  },
  process.env.MCP_JWT_SECRET,
  {
    algorithm: 'HS256',
    expiresIn: '24h',
    issuer: 'converse-mcp-server'
  }
);
```

### 3. API Key Authentication

Simple shared key authentication suitable for server-to-server communication.

```bash
MCP_AUTH_STRATEGY=api_key
MCP_AUTH_REQUIRE=true
MCP_API_KEYS=key1,key2,key3  # Comma-separated list
```

**Client Usage:**
```bash
curl -X POST http://localhost:3157/mcp \
  -H "X-API-Key: key1" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

### 4. OAuth 2.0 Authentication

Full OAuth2 authorization code flow suitable for web applications.

```bash
MCP_AUTH_STRATEGY=oauth2
MCP_AUTH_REQUIRE=true

# JWT for MCP tokens
MCP_JWT_SECRET=your-secret-key-at-least-32-chars

# OAuth Provider Configuration
MCP_OAUTH_CLIENT_ID=your-client-id
MCP_OAUTH_CLIENT_SECRET=your-client-secret
MCP_OAUTH_AUTH_URL=https://accounts.google.com/o/oauth2/v2/auth
MCP_OAUTH_TOKEN_URL=https://oauth2.googleapis.com/token
MCP_OAUTH_CALLBACK_URL=https://your-server.com/oauth/callback
MCP_OAUTH_SCOPE=openid profile email
MCP_OAUTH_USERINFO_URL=https://www.googleapis.com/oauth2/v2/userinfo
```

**OAuth Flow:**

1. **Initiate Authorization:**
   ```
   GET /oauth/authorize?state=random-state
   ```
   
2. **User Authenticates:**
   User is redirected to OAuth provider (Google, GitHub, etc.)

3. **Callback Handling:**
   After authentication, provider redirects to:
   ```
   GET /oauth/callback?code=auth-code&state=random-state
   ```

4. **Token Response:**
   Server returns MCP JWT token:
   ```json
   {
     "access_token": "eyJhbGc...",
     "token_type": "Bearer",
     "expires_in": 86400,
     "user": {
       "sub": "user123",
       "email": "user@example.com",
       "name": "John Doe"
     }
   }
   ```

5. **Use Token:**
   ```bash
   curl -X POST http://localhost:3157/mcp \
     -H "Authorization: Bearer eyJhbGc..." \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
   ```

## Session-Based Authentication

The server supports flexible session-based authentication:

```bash
# Enable session auth
MCP_SESSION_AUTH_ENABLED=true

# Allow creating sessions without auth (default: false)
MCP_SESSION_AUTH_REQUIRE_FOR_SESSION=false

# Require auth for operations (default: true)
MCP_SESSION_AUTH_REQUIRE_FOR_OPERATIONS=true
```

This allows:
- Clients to create sessions without authentication
- But requires authentication for actual operations
- Useful for allowing initial connection but securing data access

## Security Best Practices

### 1. Use HTTPS in Production

Always deploy with TLS/SSL encryption:
```nginx
server {
    listen 443 ssl http2;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3157;
        proxy_set_header Authorization $http_authorization;
    }
}
```

### 2. Generate Strong Secrets

```bash
# Generate a secure JWT secret
openssl rand -base64 32

# Generate API keys
openssl rand -hex 32
```

### 3. Configure CORS Properly

```bash
HTTP_CORS_ORIGINS=https://your-app.com,https://app.your-domain.com
HTTP_CORS_CREDENTIALS=true  # If using cookies
```

### 4. Enable Rate Limiting

```bash
HTTP_RATE_LIMIT_ENABLED=true
HTTP_RATE_LIMIT_WINDOW=900000      # 15 minutes
HTTP_RATE_LIMIT_MAX_REQUESTS=1000  # Per window
```

### 5. Enable DNS Rebinding Protection

```bash
HTTP_DNS_REBINDING_PROTECTION=true
HTTP_ALLOWED_HOSTS=your-server.com,api.your-server.com
```

## Common OAuth Providers

### Google OAuth 2.0

1. Create project at https://console.cloud.google.com
2. Enable Google+ API
3. Create OAuth 2.0 credentials
4. Configure:

```bash
MCP_OAUTH_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
MCP_OAUTH_CLIENT_SECRET=your-google-client-secret
MCP_OAUTH_AUTH_URL=https://accounts.google.com/o/oauth2/v2/auth
MCP_OAUTH_TOKEN_URL=https://oauth2.googleapis.com/token
MCP_OAUTH_USERINFO_URL=https://www.googleapis.com/oauth2/v2/userinfo
```

### GitHub OAuth

```bash
MCP_OAUTH_CLIENT_ID=your-github-client-id
MCP_OAUTH_CLIENT_SECRET=your-github-client-secret
MCP_OAUTH_AUTH_URL=https://github.com/login/oauth/authorize
MCP_OAUTH_TOKEN_URL=https://github.com/login/oauth/access_token
MCP_OAUTH_USERINFO_URL=https://api.github.com/user
MCP_OAUTH_SCOPE=read:user user:email
```

### Auth0

```bash
MCP_OAUTH_CLIENT_ID=your-auth0-client-id
MCP_OAUTH_CLIENT_SECRET=your-auth0-client-secret
MCP_OAUTH_AUTH_URL=https://your-domain.auth0.com/authorize
MCP_OAUTH_TOKEN_URL=https://your-domain.auth0.com/oauth/token
MCP_OAUTH_USERINFO_URL=https://your-domain.auth0.com/userinfo
MCP_OAUTH_SCOPE=openid profile email
```

## Custom Authentication

For custom authentication logic, implement a custom validator:

```javascript
const httpTransport = new HTTPTransportServer({
  auth: {
    strategy: 'custom',
    customValidator: async (req) => {
      // Your custom logic here
      const token = req.headers['x-custom-token'];
      
      // Validate token against your system
      const user = await validateCustomToken(token);
      
      return {
        authenticated: !!user,
        user: user,
        // Additional data
      };
    }
  }
});
```

## Troubleshooting

### Common Issues

1. **401 Unauthorized**
   - Check auth strategy matches client implementation
   - Verify token/API key is correct
   - Check token expiration

2. **CORS Errors**
   - Ensure `HTTP_CORS_ORIGINS` includes your client origin
   - Add `Authorization` to `HTTP_CORS_HEADERS`

3. **OAuth Redirect Issues**
   - Verify `MCP_OAUTH_CALLBACK_URL` matches OAuth provider config
   - Check redirect URI is whitelisted in provider

4. **Session Issues**
   - Ensure `mcp-session-id` header is included
   - Check session timeout configuration

### Debug Mode

Enable debug logging for authentication:
```bash
LOG_LEVEL=debug
```

This will log:
- Authentication attempts
- Token validation results
- Session creation/cleanup
- OAuth flow steps

## Example Configurations

### Development (Local)
```bash
MCP_AUTH_STRATEGY=none
NODE_ENV=development
LOG_LEVEL=debug
```

### Staging (API Key)
```bash
MCP_AUTH_STRATEGY=api_key
MCP_API_KEYS=staging-key-1,staging-key-2
MCP_AUTH_REQUIRE=true
HTTP_RATE_LIMIT_ENABLED=true
LOG_LEVEL=info
```

### Production (OAuth2)
```bash
NODE_ENV=production
MCP_AUTH_STRATEGY=oauth2
MCP_AUTH_REQUIRE=true
MCP_JWT_SECRET=$(openssl rand -base64 32)
MCP_OAUTH_CLIENT_ID=prod-client-id
MCP_OAUTH_CLIENT_SECRET=prod-client-secret
HTTP_RATE_LIMIT_ENABLED=true
HTTP_DNS_REBINDING_PROTECTION=true
HTTP_CORS_ORIGINS=https://app.example.com
LOG_LEVEL=warn
```

## Integration Examples

### JavaScript/TypeScript Client

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const transport = new StreamableHTTPClientTransport(
  new URL('https://your-server.com/mcp'),
  {
    headers: {
      'Authorization': 'Bearer your-jwt-token'
      // or 'X-API-Key': 'your-api-key'
    }
  }
);

const client = new Client({
  name: 'my-client',
  version: '1.0.0'
});

await client.connect(transport);
```

### Python Client

```python
import httpx
from mcp import Client

headers = {
    "Authorization": "Bearer your-jwt-token"
    # or "X-API-Key": "your-api-key"
}

async with httpx.AsyncClient(headers=headers) as http_client:
    client = Client("my-client", "1.0.0")
    await client.connect(
        url="https://your-server.com/mcp",
        http_client=http_client
    )
```

## Deployment Checklist

- [ ] Choose appropriate authentication strategy
- [ ] Generate secure secrets (32+ characters)
- [ ] Configure OAuth provider (if using OAuth2)
- [ ] Set up HTTPS/TLS
- [ ] Configure CORS for your clients
- [ ] Enable rate limiting
- [ ] Set appropriate session timeouts
- [ ] Test authentication flow end-to-end
- [ ] Monitor authentication logs
- [ ] Document API keys/tokens for clients