import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import {
  createOrGetUserByEmail,
  validateUserCredentials,
  isAllowedInstitutionEmail,
} from "@/data/users";
import { logAudit } from "@/lib/audit";

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        studentId: { label: "Student ID", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const user = validateUserCredentials(
          credentials.studentId,
          credentials.password
        );
        if (user) return user;
        return null;
      },
    }),

    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
      async profile(googleProfile) {
        const email = googleProfile.email || "";
        const user = isAllowedInstitutionEmail(email)
          ? createOrGetUserByEmail(email, googleProfile.name)
          : null;
        return {
          id: googleProfile.sub || googleProfile.id || email,
          name: googleProfile.name || "",
          email,
          image: googleProfile.picture || null,
          role: user?.role || "student",
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        const email = user.email || token.email || "";
        token.studentId = String(email).split("@")[0].toLowerCase();
      }
      return token;
    },

    async session({ session, token }) {
      if (token?.role) session.user.role = token.role;
      if (token?.studentId) session.user.studentId = token.studentId;
      if (!session.user.studentId && session.user.email) {
        session.user.studentId = String(session.user.email).split("@")[0].toLowerCase();
      }
      return session;
    },

    async signIn({ user, account }) {
      if (account?.provider === "google") {
        const email = user?.email;
        if (!email) return true;
        // Reject non-institution emails
        if (!isAllowedInstitutionEmail(email)) return false;
      }
      return true;
    },

    async redirect({ url, baseUrl }) {
      if (url && url.startsWith("/")) return `${baseUrl}${url}`;
      try {
        const target = new URL(url);
        if (target.origin === baseUrl) return url;
      } catch (_) {}
      return `${baseUrl}/auth/redirect`;
    },
  },

  pages: {
    signIn: "/",
    error: "/auth/error",
  },

  events: {
    // Record only admin/teacher logins — student logins are out of scope.
    async signIn({ user }) {
      if (user?.role !== "teacher") return;
      await logAudit({
        actor: user.email || user.studentId || user.id,
        actorName: user.name,
        action: "LOGIN",
      });
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
