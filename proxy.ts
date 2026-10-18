import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/intake",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  // Jersey run public form — fans submit without an account.
  "/run/(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  // Invite link: set cookie with intakeId token and redirect to sign-up.
  // The order creation form (2-06) reads this cookie to pre-fill from the intake record.
  if (request.nextUrl.pathname === "/invite") {
    const token = request.nextUrl.searchParams.get("token");
    const signUpUrl = new URL("/sign-up", request.url);
    const response = NextResponse.redirect(signUpUrl);
    if (token) {
      response.cookies.set("sidestep_invite_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      });
    }
    return response;
  }

  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
