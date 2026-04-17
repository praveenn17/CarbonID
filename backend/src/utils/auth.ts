import bcrypt from 'bcrypt';
import jsonwebtoken from 'jsonwebtoken';

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'supersecret';
const TOKEN_EXPIRY_SECONDS = 24 * 60 * 60; // 1 day

export const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, BCRYPT_ROUNDS);
};

export const comparePasswords = async (password: string, hash: string): Promise<boolean> => {
  return await bcrypt.compare(password, hash);
};

export const generateAccessToken = (userId: string, role: string): string => {
  return jsonwebtoken.sign({ userId, role }, JWT_ACCESS_SECRET, { expiresIn: TOKEN_EXPIRY_SECONDS });
};

/** Returns an ISO timestamp for when the current token will expire */
export const getTokenExpiry = (): string => {
  return new Date(Date.now() + TOKEN_EXPIRY_SECONDS * 1000).toISOString();
};

export const verifyAccessToken = (token: string): any => {
  return jsonwebtoken.verify(token, JWT_ACCESS_SECRET);
};
