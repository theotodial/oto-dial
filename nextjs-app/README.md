# OTO-DIAL Next.js Authentication

Next.js 14 App Router implementation with TypeScript, Prisma, PostgreSQL, and custom authentication.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Update the `.env` file with your PostgreSQL connection string:

```
DATABASE_URL="postgresql://user:password@localhost:5432/oto_dial?schema=public"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here-change-in-production"
```

### 3. Set Up Database

Generate Prisma client:

```bash
npm run db:generate
```

Push schema to database:

```bash
npm run db:push
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
nextjs-app/
├── app/
│   ├── api/
│   │   └── auth/
│   │       ├── register/
│   │       │   └── route.ts
│   │       ├── login/
│   │       │   └── route.ts
│   │       └── me/
│   │           └── route.ts
│   ├── login/
│   │   └── page.tsx
│   ├── register/
│   │   └── page.tsx
│   ├── dashboard/
│   │   └── page.tsx
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── libs/
│   ├── auth/
│   │   ├── jwt.ts
│   │   ├── cookie.ts
│   │   └── password.ts
│   ├── validators/
│   │   └── auth.ts
│   └── db/
│       └── prisma.ts
└── prisma/
    └── schema.prisma
```

## Features

- ✅ Email/Password authentication
- ✅ JWT token-based sessions
- ✅ Secure password hashing with bcrypt
- ✅ Zod validation
- ✅ React Hook Form
- ✅ TailwindCSS styling
- ✅ Protected routes
- ✅ Cookie-based session storage

## API Endpoints

### POST /api/auth/register
Register a new user.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "confirmPassword": "SecurePass123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "user": {
    "id": "...",
    "email": "user@example.com",
    "createdAt": "..."
  }
}
```

### POST /api/auth/login
Login with email and password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "id": "...",
    "email": "user@example.com",
    "createdAt": "..."
  }
}
```

### GET /api/auth/me
Get current authenticated user.

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "...",
    "email": "user@example.com",
    "createdAt": "..."
  }
}
```

## Password Requirements

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

## Development

- Database Studio: `npm run db:studio`
- Generate Prisma Client: `npm run db:generate`
- Push Schema: `npm run db:push`

