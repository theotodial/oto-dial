import { NextRequest, NextResponse } from "next/server";
import { registerSchema } from "@/libs/validators/auth";
import { prisma } from "@/libs/db/prisma";
import { hashPassword } from "@/libs/auth/password";
import { signToken } from "@/libs/auth/jwt";
import { setTokenCookie } from "@/libs/auth/cookie";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    const validationResult = registerSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          message: validationResult.error.errors[0]?.message || "Validation error",
        },
        { status: 400 }
      );
    }

    const { email, password } = validationResult.data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          message: "User with this email already exists",
        },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
      },
    });

    // Generate JWT token
    const token = signToken({
      id: user.id,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
    });

    // Create response with cookie
    const response = NextResponse.json(
      {
        success: true,
        message: "User registered successfully",
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt,
        },
      },
      { status: 201 }
    );

    // Set secure cookie
    setTokenCookie(response, token);

    return response;
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
      },
      { status: 500 }
    );
  }
}

