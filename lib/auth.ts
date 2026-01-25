/**
 * Authentication Configuration
 *
 * Uses NextAuth.js for email/password and Google OAuth authentication
 */

import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { compare, hash } from 'bcryptjs';
import { getUserByEmail, createUser, updateUserLastLogin } from './db-users';

export const authOptions: NextAuthOptions = {
  providers: [
    // Google OAuth
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),

    // Email/Password
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required');
        }

        const user = await getUserByEmail(credentials.email);

        if (!user) {
          throw new Error('No account found with this email');
        }

        if (!user.password_hash) {
          throw new Error('Please sign in with Google');
        }

        const isValidPassword = await compare(credentials.password, user.password_hash);

        if (!isValidPassword) {
          throw new Error('Invalid password');
        }

        // Update last login
        await updateUserLastLogin(user.id);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  pages: {
    signIn: '/login',
    signUp: '/signup',
    error: '/login',
  },

  callbacks: {
    async signIn({ user, account }) {
      // Handle Google OAuth sign in
      if (account?.provider === 'google' && user.email) {
        const existingUser = await getUserByEmail(user.email);

        if (!existingUser) {
          // Create new user from Google account
          await createUser({
            email: user.email,
            name: user.name || undefined,
            image: user.image || undefined,
            provider: 'google',
          });
        } else {
          // Update last login for existing user
          await updateUserLastLogin(existingUser.id);
        }
      }
      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};

/**
 * Hash a password for storage
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, 12);
}

// Re-export validation functions from auth-utils
export { validatePassword, validateEmail } from './auth-utils';
