# API Response Format Documentation

## Standard Response Format

All API endpoints follow a consistent response format:

```json
{
  "status": "success" | "error",
  "data"?: any,
  "meta"?: {
    "total": number,
    "limit": number,
    "remaining": number
  },
  "message"?: string,
  "errors"?: Array<{
    "code": string,
    "message": string,
    "path": string[]
  }>,
  "requestId": string,
  "timestamp": string
}
```

### Success Response Example

```json
{
  "status": "success",
  "data": [{
    "id": 1,
    "name": "Competitor Name",
    "website": "https://example.com",
    "reason": "Direct competitor in market",
    "isSelected": true
  }],
  "meta": {
    "total": 5,
    "limit": 15,
    "remaining": 10
  },
  "requestId": "abc123",
  "timestamp": "2024-11-12T11:42:39.738Z"
}
```

### Error Response Example

```json
{
  "status": "error",
  "message": "Validation failed",
  "errors": [{
    "code": "invalid_input",
    "message": "Website URL is invalid",
    "path": ["website"]
  }],
  "requestId": "xyz789",
  "timestamp": "2024-11-12T11:42:39.738Z"
}
```

## Specific Endpoint Formats

### GET /api/competitors

Returns the list of competitors for the authenticated user.

```json
{
  "status": "success",
  "data": [
    {
      "id": number,
      "name": string,
      "website": string,
      "reason": string,
      "isSelected": boolean,
      "customFields"?: Record<string, any>,
      "userId": number
    }
  ],
  "meta": {
    "total": number,
    "limit": number,
    "remaining": number
  }
}
```

### POST /api/competitors/discover

Discovers potential competitors based on a website URL.

Request:
```json
{
  "websiteUrl": string
}
```

Response:
```json
{
  "status": "success",
  "data": [
    {
      "name": string,
      "website": string,
      "reason": string
    }
  ]
}
```

## Error Handling

### Common HTTP Status Codes

- 200: Successful request
- 400: Bad Request (validation errors)
- 401: Unauthorized (authentication required)
- 403: Forbidden (insufficient permissions)
- 404: Not Found
- 429: Too Many Requests (rate limit exceeded)
- 500: Internal Server Error

### Rate Limit Response

When rate limit is exceeded:
```json
{
  "status": "error",
  "message": "Too many requests",
  "retryAfter": number,
  "requestId": string,
  "timestamp": string
}
```

### Validation Error Response

```json
{
  "status": "error",
  "message": "Validation failed",
  "errors": [
    {
      "code": string,
      "message": string,
      "path": string[]
    }
  ],
  "requestId": string,
  "timestamp": string
}
```

## Plan-based Limitations

- Free Plan: 3 selected competitors maximum
- Pro Plan: 15 selected competitors maximum

When competitor limit is reached:
```json
{
  "status": "error",
  "message": "You have reached the maximum number of selected competitors (3) for your free plan. You can still add competitors to your available list, but please upgrade to select more competitors for tracking.",
  "requestId": string,
  "timestamp": string
}
```
