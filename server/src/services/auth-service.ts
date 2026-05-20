import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { createUser, getUserByEmail, getUserById, getAllUsers, deleteUser } from '../db/user-queries.js';
import { AuthPayload, AuthResponse, LoginRequest, RegisterRequest } from '../types/index.js';

export class AuthService {
  async register(req: RegisterRequest): Promise<AuthResponse> {
    const existing = getUserByEmail(req.email);
    if (existing) {
      throw new Error('Email already registered');
    }

    const passwordHash = await bcrypt.hash(req.password, 10);
    const isFirstUser = getAllUsers().length === 0;
    const user = createUser({
      id: uuidv4(),
      email: req.email,
      passwordHash,
      role: isFirstUser ? 'admin' : 'user',
      createdAt: Date.now(),
    });

    const token = this.generateToken({ userId: user.id, email: user.email, role: user.role });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  async login(req: LoginRequest): Promise<AuthResponse> {
    const user = getUserByEmail(req.email);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const valid = await bcrypt.compare(req.password, user.passwordHash);
    if (!valid) {
      throw new Error('Invalid credentials');
    }

    const token = this.generateToken({ userId: user.id, email: user.email, role: user.role });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  verifyToken(token: string): AuthPayload {
    try {
      const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
      return payload;
    } catch (err) {
      throw new Error('Invalid token');
    }
  }

  private generateToken(payload: AuthPayload): string {
    return jwt.sign(payload, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });
  }
}
