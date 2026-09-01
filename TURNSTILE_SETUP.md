# PharMate bot-protection setup

PharMate supports two explicit modes. It never silently downgrades from
Turnstile to the weaker fallback.

## Option A: Cloudflare Turnstile (recommended)

1. Create or sign in to a free Cloudflare account.
2. Open **Turnstile** in the Cloudflare dashboard and select **Add widget**.
3. Name the widget `PharMate Authentication`.
4. Select **Managed** mode.
5. Add the production hostname(s) that serve the React application.
6. Copy the public **Site key** and private **Secret key**.
7. Configure the client environment:

   ```env
   VITE_CAPTCHA_PROVIDER=turnstile
   VITE_TURNSTILE_SITE_KEY=your-public-site-key
   ```

8. Configure the server environment:

   ```env
   CAPTCHA_PROVIDER=turnstile
   TURNSTILE_SECRET_KEY=your-private-secret-key
   TURNSTILE_ALLOWED_HOSTNAMES=pharmate.example.com,www.pharmate.example.com
   ```

9. Restart both Vite and the Node.js server after changing environment files.

The repository's local `.env` files use Cloudflare's official always-pass test
keys. Replace both keys before production. Never put the secret key in a
`VITE_` variable or commit it to source control.

## Option B: fully self-hosted SVG challenge

Use this mode only when the server must make no external CAPTCHA request.
Configure both sides explicitly:

```env
# client
VITE_CAPTCHA_PROVIDER=self-hosted

# server
CAPTCHA_PROVIDER=self-hosted
CAPTCHA_SIGNING_SECRET=at-least-64-cryptographically-random-characters
```

Generate the signing secret locally:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The challenge answer is hashed into a five-minute signed JWT stored in an
HttpOnly, SameSite cookie. The cookie is cleared after a verification attempt.
Rate limiting and account lockout remain active in both CAPTCHA modes.

## Packages

```powershell
cd C:\xampp\htdocs\Pharmate\client
npm install @marsidev/react-turnstile

cd C:\xampp\htdocs\Pharmate\server
npm install svg-captcha axios express-rate-limit
```

Node's `crypto` module is built in and must not be installed from npm.
