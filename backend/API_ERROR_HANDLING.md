# API Error Handling Documentation

**Date:** December 17, 2025  
**Project:** OTO-DIAL Backend  
**Status:** ✅ Standardized

---

## 🎯 Overview

All OTO-DIAL API endpoints now return consistent, standardized JSON responses. This ensures predictable error handling on the frontend and prevents information leakage.

---

## 📋 Response Format

### Success Responses

All successful API responses follow this format:

```json
{
  "success": true,
  "data": { ... }
}
```

Or with inline data:

```json
{
  "success": true,
  "id": "123",
  "email": "user@example.com"
}
```

### Error Responses

All error responses follow this format:

```json
{
  "success": false,
  "error": "Human-readable error message"
}
```

**Key Points:**
- ✅ Always includes `"success": false`
- ✅ Always includes user-friendly `"error"` message
- ✅ Never leaks internal error details
- ✅ Never exposes SQL or Supabase errors
- ✅ Consistent across all endpoints

---

## 🔐 Error Types

### 1. Validation Errors (400)

**When:** Invalid input, missing required fields, data format issues

**Examples:**
```json
{ "success": false, "error": "Email and password are required" }
{ "success": false, "error": "Amount must be a positive number" }
{ "success": false, "error": "Password must be at least 6 characters" }
```

### 2. Authentication Errors (401)

**When:** Invalid credentials, missing/expired tokens

**Examples:**
```json
{ "success": false, "error": "Invalid email or password" }
{ "success": false, "error": "Authorization required" }
{ "success": false, "error": "Invalid or expired token" }
```

### 3. Authorization Errors (403)

**When:** User lacks permission for the requested action

**Examples:**
```json
{ "success": false, "error": "You do not have permission to perform this action" }
```

### 4. Not Found Errors (404)

**When:** Requested resource doesn't exist

**Examples:**
```json
{ "success": false, "error": "Wallet not found" }
{ "success": false, "error": "Resource not found" }
```

### 5. Conflict Errors (409)

**When:** Resource already exists (e.g., duplicate email)

**Examples:**
```json
{ "success": false, "error": "An account with this email already exists" }
{ "success": false, "error": "This record already exists" }
```

### 6. Server Errors (500)

**When:** Unexpected server-side issues

**Examples:**
```json
{ "success": false, "error": "An unexpected error occurred" }
{ "success": false, "error": "An error occurred while processing your request" }
```

---

## 🛡️ Security Features

### 1. No Information Leakage

**Before (❌ Insecure):**
```json
{
  "error": "insert or update on table \"wallets\" violates foreign key constraint \"wallets_user_id_fkey\""
}
```

**After (✅ Secure):**
```json
{
  "success": false,
  "error": "Invalid reference to related record"
}
```

### 2. Mapped Database Errors

| Postgres Code | User-Friendly Message |
|---------------|----------------------|
| `23505` | "This record already exists" |
| `23503` | "Invalid reference to related record" |
| `23502` | "Required field is missing" |
| `23514` | "Invalid data format or value" |
| `PGRST116` | "Record not found" |
| Others | "An error occurred while processing your request" |

### 3. Consistent Auth Errors

All authentication failures return:
- **Status:** 401
- **Message:** "Invalid email or password" (never reveals which field is wrong)

This prevents username enumeration attacks.

---

## 📚 Endpoint Examples

### Authentication Endpoints

#### POST `/api/signup`

**Success (200):**
```json
{
  "success": true,
  "id": "user-uuid",
  "email": "user@example.com"
}
```

**Errors:**
```json
{ "success": false, "error": "Email and password are required" }          // 400
{ "success": false, "error": "Password must be at least 6 characters" }   // 400
{ "success": false, "error": "An account with this email already exists" } // 409
```

#### POST `/api/login`

**Success (200):**
```json
{
  "success": true,
  "id": "user-uuid",
  "email": "user@example.com"
}
```

**Errors:**
```json
{ "success": false, "error": "Email and password are required" }  // 400
{ "success": false, "error": "Invalid email or password" }        // 401
```

---

### Wallet Endpoints

#### GET `/api/wallet` (requires auth)

**Headers Required:**
```
Authorization: Bearer <supabase-access-token>
```

**Success (200):**
```json
{
  "success": true,
  "balance": 10.50
}
```

**Errors:**
```json
{ "success": false, "error": "Authorization required" }      // 401
{ "success": false, "error": "Invalid or expired token" }    // 401
```

#### POST `/api/wallet/topup` (requires auth)

**Request:**
```json
{
  "amount": 10
}
```

**Success (200):**
```json
{
  "success": true,
  "balance": 20.50
}
```

**Errors:**
```json
{ "success": false, "error": "Amount must be a positive number" }  // 400
{ "success": false, "error": "Wallet not found" }                  // 404
{ "success": false, "error": "Authorization required" }            // 401
```

---

### Phone Number Endpoints

#### POST `/api/numbers/buy` (requires auth)

**Request:**
```json
{
  "country": "US"
}
```

**Success (200):**
```json
{
  "success": true,
  "number": {
    "id": "uuid",
    "number": "+15551234567",
    "country": "US",
    "user_id": "user-uuid"
  }
}
```

**Errors:**
```json
{ "success": false, "error": "Insufficient balance. Please top up your wallet" }  // 400
{ "success": false, "error": "Authorization required" }                           // 401
```

#### GET `/api/numbers` (requires auth)

**Success (200):**
```json
{
  "success": true,
  "numbers": [
    {
      "id": "uuid",
      "number": "+15551234567",
      "country": "US"
    }
  ]
}
```

---

### Call Endpoints

#### POST `/api/calls` (requires auth)

**Request:**
```json
{
  "from_number": "+15551234567",
  "to_number": "+15559876543",
  "status": "completed"
}
```

**Success (200):**
```json
{
  "success": true,
  "call": {
    "id": "uuid",
    "from_number": "+15551234567",
    "to_number": "+15559876543",
    "status": "completed"
  }
}
```

**Errors:**
```json
{ "success": false, "error": "From number and to number are required" }  // 400
```

#### GET `/api/calls` (requires auth)

**Success (200):**
```json
{
  "success": true,
  "calls": [
    {
      "id": "uuid",
      "from_number": "+15551234567",
      "to_number": "+15559876543",
      "status": "completed",
      "created_at": "2025-12-17T10:00:00Z"
    }
  ]
}
```

---

### Chat Endpoints

#### GET `/api/chat` (requires auth)

**Success (200):**
```json
{
  "success": true,
  "messages": [
    {
      "id": "uuid",
      "direction": "outbound",
      "content": "Hello",
      "created_at": "2025-12-17T10:00:00Z"
    }
  ]
}
```

#### POST `/api/chat` (requires auth)

**Request:**
```json
{
  "text": "Hello"
}
```

**Success (200):**
```json
{
  "success": true,
  "user": { "id": "uuid", "content": "Hello", "direction": "outbound" },
  "bot": { "id": "uuid", "content": "Echo: Hello", "direction": "inbound" }
}
```

**Errors:**
```json
{ "success": false, "error": "Message text is required" }  // 400
```

---

## 🔧 Implementation Details

### Error Handler Module

Located in: `backend/src/errorHandler.js`

**Key Functions:**

1. **`createErrorResponse(error, customMessage)`**
   - Maps errors to standardized responses
   - Prevents information leakage
   - Returns `{ response, status }`

2. **`createSuccessResponse(data)`**
   - Wraps successful responses
   - Returns `{ success: true, ...data }`

3. **`validationError(message)`**
   - Creates validation error (400)

4. **`authenticationError(message)`**
   - Creates auth error (401)

5. **`notFoundError(resource)`**
   - Creates not found error (404)

6. **`asyncHandler(fn)`**
   - Wraps async routes to catch errors

7. **`errorMiddleware(err, req, res, next)`**
   - Global error handler middleware

---

## 🧪 Testing Error Responses

### Valid Request
```bash
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'
```

**Response:**
```json
{
  "success": true,
  "id": "user-uuid",
  "email": "user@example.com"
}
```

### Invalid Credentials
```bash
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"wrong"}'
```

**Response:**
```json
{
  "success": false,
  "error": "Invalid email or password"
}
```

### Missing Fields
```bash
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
```

**Response:**
```json
{
  "success": false,
  "error": "Email and password are required"
}
```

### Protected Endpoint Without Auth
```bash
curl -X GET http://localhost:5000/api/wallet
```

**Response:**
```json
{
  "success": false,
  "error": "Authorization required"
}
```

### Protected Endpoint With Auth
```bash
curl -X GET http://localhost:5000/api/wallet \
  -H "Authorization: Bearer <your-supabase-access-token>"
```

**Response:**
```json
{
  "success": true,
  "balance": 10.50
}
```

---

## 📊 Migration Guide

### Before (Old Format)

```javascript
// Old error handling
if (error) {
  return res.status(500).json({ error: error.message });
}

// Old success response
res.json({ balance: wallet.balance });
```

### After (New Format)

```javascript
// New error handling
if (error) {
  const { response, status } = createErrorResponse(error);
  return res.status(status).json(response);
}

// New success response
res.json(createSuccessResponse({ balance: wallet.balance }));
```

---

## ✅ Benefits

1. **Consistency:** All endpoints return the same format
2. **Security:** No internal error leakage
3. **Frontend-Friendly:** Easy to parse `success` boolean
4. **Debugging:** Standardized error messages
5. **Scalability:** Easy to add new error types
6. **Maintenance:** Centralized error handling logic

---

## 🚀 Frontend Integration

### Checking Response Success

```javascript
const response = await fetch('/api/wallet', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();

if (data.success) {
  // Handle success
  console.log('Balance:', data.balance);
} else {
  // Handle error
  console.error('Error:', data.error);
  showErrorToast(data.error);
}
```

### Axios Example

```javascript
try {
  const { data } = await axios.post('/api/login', {
    email,
    password
  });
  
  if (data.success) {
    // Login successful
    return data;
  } else {
    // Should not happen with proper error handling
    throw new Error(data.error);
  }
} catch (error) {
  if (error.response?.data?.success === false) {
    // Show user-friendly error
    return error.response.data.error;
  }
  // Network or other error
  return 'An unexpected error occurred';
}
```

---

## 📝 Best Practices

### DO ✅

- Always check `data.success` on frontend
- Use `createSuccessResponse()` for all success cases
- Use `createErrorResponse()` for all error cases
- Wrap async routes with `asyncHandler()`
- Return user-friendly error messages
- Map database errors to generic messages

### DON'T ❌

- Don't leak SQL error messages
- Don't expose Supabase internal errors
- Don't return raw `error.message`
- Don't skip validation
- Don't reveal which credential is wrong (username enumeration)
- Don't expose database structure in errors

---

## 🔍 Error Monitoring

For production, consider adding:

1. **Error Logging Service** (e.g., Sentry)
   ```javascript
   if (error) {
     Sentry.captureException(error); // Log internally
     const { response, status } = createErrorResponse(error); // Return generic message
     return res.status(status).json(response);
   }
   ```

2. **Request ID Tracking**
   ```javascript
   const requestId = generateId();
   console.error(`[${requestId}] Error:`, error);
   res.status(500).json({
     success: false,
     error: 'An unexpected error occurred',
     requestId // User can reference this in support
   });
   ```

---

## 📚 Related Documentation

- [Environment Variables Audit](../ENVIRONMENT_VARIABLES_AUDIT.md)
- [Supabase Documentation](https://supabase.com/docs)
- [Express Error Handling](https://expressjs.com/en/guide/error-handling.html)

---

**Last Updated:** 2025-12-17  
**Version:** 1.0.0  
**Status:** ✅ Production Ready

