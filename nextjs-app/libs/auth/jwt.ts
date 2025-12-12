import * as jwt from "jsonwebtoken";

const SECRET = process.env.NEXTAUTH_SECRET || "fallback-secret-key-change-in-production";

export interface JWTPayload {
  id: string;
  email: string;
  createdAt: string;
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, SECRET, {
    expiresIn: "30d",
  });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, SECRET) as JWTPayload;
  } catch (error) {
    return null;
  }
}

