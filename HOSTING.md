# Hosting

Cost: $0. The repository stays private. GitHub Pages stays off. The game is not deployed to a public host, and Cloudflare is left unchanged until Robert explicitly says otherwise.

`main` already holds the private Virga MVP (pull requests #1–#7). This note is only about how that static build is served. It does not publish anything.

## Now: private review

Serve `dist/` from the Grok Bot box for Robert's private review only. Do not expose it publicly before 17 November 2026.

```bash
npm ci
npm run build
cd dist
python3 -m http.server --bind 127.0.0.1
```

`python3 -m http.server` in `dist/` is the same server. Binding to `127.0.0.1` keeps it on the box. Do not publish that URL, do not open the port to the internet, and do not turn on GitHub Pages.

`npm run build` writes a static bundle: `index.html`, hashed CSS and JavaScript, and `og.png`. The page does not call a server.

## After an explicit reveal OK

Nothing in this section happens until Robert explicitly approves the reveal. Then pick one path. Both stay at $0. Do not start either before that OK.

**(a) GitHub Pages.** Make the repository public and enable GitHub Pages on `main`. Only with his OK.

**(b) Cloudflare Pages Free.** Put the site on the Cloudflare Pages free plan behind an Access policy, then unlock that policy when he is ready. Only with his OK. Do not change Cloudflare before that.

## Domain

Buying a domain waits until after the reveal. No domain purchase is part of this plan.
