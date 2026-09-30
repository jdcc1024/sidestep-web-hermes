# Local preview over Tailscale (until real hosting exists)

Status of the decision: JCC, Gate 1 of 0001 (A1). There is no production deploy.
Hosting (Vercel or Hostinger) is a later decision. Until then, the app runs on
JCC's machine and Tailscale makes it reachable.

## Decision

**Customers get the Funnel URL, and JCC runs a production build behind it.**

```
customer phone ──https──► https://<machine>.<tailnet>.ts.net  (Tailscale Funnel, :443)
                                   │  TLS ends at Tailscale, cert is automatic
                                   ▼
                          127.0.0.1:8080   next start   (production build)
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
          Convex dev deployment            Clerk dev instance
          (cloud, NEXT_PUBLIC_CONVEX_URL)  (cloud)
```

| | `tailscale serve` | `tailscale funnel` ✅ |
|---|---|---|
| Who can open it | Only devices signed in to your tailnet (your phone, laptop) | Anyone with the URL |
| Good for | Checking the site from your phone | Sending a customer an FAQ link |

Other options: Cloudflare Tunnel and ngrok. Both work, but each is one more
account and CLI. The free ngrok tier and Cloudflare quick tunnels give you a new
random URL on every restart, and that breaks every link you've already sent. A
Funnel URL is stable (`<machine>.<tailnet>.ts.net`) and free on the personal
plan. That's why it wins here.

## Setup (JCC, one time; needs sudo, so the agents can't do it)

Tailscale is not installed on this machine yet (`tailscale: command not found`).

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up                      # sign in in the browser
sudo tailscale set --operator=$USER    # so serve/funnel don't need sudo
```

Enable HTTPS certificates and Funnel for the tailnet. The first `tailscale
funnel` run prints an approval link for this. MagicDNS must also be on (it is by
default).

## Run it

```bash
cd ~/sidestep-web-hermes
npm run build && npx next start -p 8080     # terminal 1: production build
tailscale funnel 8080                       # terminal 2: foreground, Ctrl+C stops it
# or keep it on across reboots:  tailscale funnel --bg 8080   /  tailscale funnel reset
tailscale funnel status                     # shows the public URL
```

That URL (`https://<machine>.<tailnet>.ts.net`) is what you send customers,
e.g. `https://<machine>.<tailnet>.ts.net/#faq-timeline`. No env var is needed.
(`NEXT_PUBLIC_SITE_URL` used to be set here for the FAQ copy buttons. It was
removed with them: Copy answer removed 2026-09-30 by JCC, d568273 / c265c64.)

## Why `next start`, not `npm run dev`, for customers

- Dev mode shows the Next.js error overlay and stack traces to whoever hits an
  error, and it is slow on first load of each page.
- Dev mode also blocks cross-origin dev resources unless the host is in
  `allowedDevOrigins`. If you do want `npm run dev` over `tailscale serve` (just
  for you), add the `ts.net` host there. **Latent bug:** `next.config.ts`
  currently has both `export default nextConfig` and
  `module.exports = { allowedDevOrigins: [...] }`. Only one of those takes
  effect, so merge them into the `nextConfig` object before relying on either.
  This is small, so file it as a chore if you use dev over Tailscale.

## What this exposes (security)

- Only port 8080 on this machine, over HTTPS. Nothing else on the box.
- Public pages and forms write to the **Convex dev deployment**. A customer who
  submits the intake form creates real rows in dev data. That's fine for a
  preview, but don't treat dev data as disposable once customers use it.
- Admin pages stay behind Clerk (`isAdmin` from private metadata). Funnel
  doesn't change any auth rule.
- The Clerk **development** instance shows a "Development mode" badge and has
  lower limits. It should work on the `ts.net` host, but check sign-in once
  over the Funnel URL before relying on it. Public FAQ pages need no sign-in.
- The site is only up while this machine is awake and both processes run. A
  sleeping laptop means a dead link, and that is the main reason to move to real
  hosting.
- Funnel traffic has Tailscale's bandwidth limits. That doesn't matter for an FAQ.

## Unverified

The commands follow Tailscale's current CLI docs
(tailscale.com/docs/reference/tailscale-cli/funnel). They have not been run here,
because Tailscale isn't installed. Confirm the Clerk behaviour over the Funnel
host when you first try it.
