# MediaSaveDownload

An English-first, responsive web tool for processing supported public videos from TikTok, Instagram Reels, Facebook Reels, YouTube Shorts, and Pinterest video Pins.

The site is deployed to Cloudflare Workers. GitHub Actions runs Wrangler on pushes to `main`.

## Project structure

```
public/index.html                  Responsive homepage and video-only UI
public/about.html                  About page
public/privacy-policy.html         Privacy policy
public/terms.html                  Terms of use
public/copyright.html              Copyright policy
public/contact.html                Contact and support
public/robots.txt                  Crawler rules and sitemap location
public/sitemap.xml                 Public canonical URLs
cloudflare/worker.mjs              Cloudflare Worker API and static asset routing
wrangler.toml                      Cloudflare Workers and static asset configuration
.github/workflows/deploy-cloudflare.yml  Automatic deployment workflow
```

## Deployment

The repository is configured to deploy with Cloudflare Wrangler through GitHub Actions.

1. In the GitHub repository, open **Settings → Secrets and variables → Actions**.
2. Add a repository secret named `CLOUDFLARE_API_TOKEN`. It must have permission to deploy Workers and Workers assets to the intended Cloudflare account.
3. Push a commit to `main`, or manually run the **Deploy MediaSaveDownload to Cloudflare Workers** workflow from the Actions tab.
4. Check the workflow run to confirm deployment succeeded.

The Cloudflare account ID and Worker name are defined in `wrangler.toml`. Do not commit API keys, access tokens, or other secrets.

## Configure SaveAPI

In Cloudflare Dashboard, open **Workers & Pages → mediasavedownload → Settings → Variables and Secrets** and add:

| Name | Type | Required | Purpose |
| --- | --- | --- | --- |
| `SAVEAPI_KEY` | Secret | Yes | API key from your SaveAPI dashboard |
| `MAX_PROXY_BYTES` | Variable | No | Proxy response size limit; default is 19,500,000 bytes |

The Worker calls `https://api.saveapi.org/v1/download` with the source link as the `url` query parameter and authenticates using `Authorization: Bearer …`. The key stays on the server and must never be committed to GitHub or exposed in browser code.

After saving the secret, confirm that `/api/health` returns `{"ok":true,"configured":true,"provider":"saveapi"}`. This confirms the key is present; it does **not** prove every platform is working. Test a public video URL from each supported platform. SaveAPI's free balance is limited, so test links one at a time and check the provider dashboard for remaining credits.


## Supported content

The interface and API are intended for supported public video post URLs only:

- TikTok videos
- Instagram Reels
- Facebook Reels
- YouTube Shorts
- Pinterest video Pins

Photo results are filtered out. Profile-wide downloads and private content are not supported. Only download content you own or have permission to save, and respect the terms and rights of the source platforms.

## SEO and Google Search

The public site includes English page titles and descriptions, canonical URLs, Open Graph metadata, WebApplication and FAQ structured data, crawlable `robots.txt`, a sitemap, and informational pages.

To continue SEO setup:

1. Use a custom domain if you own one, then update canonical URLs, the sitemap, and Open Graph URLs consistently.
2. Verify the site in Google Search Console.
3. Submit `https://YOUR-DOMAIN/sitemap.xml` in Search Console.
4. Inspect the homepage and important informational pages for crawl/indexing issues.
5. Publish useful, original, maintained content and earn genuine links. Indexing and rankings are not guaranteed.

## Advertising and monetization

The homepage contains clearly labelled ad placement placeholders only. No live AdSense or third-party ad code is included yet.

Before enabling an ad network:

- Obtain publisher approval and use the network's current official integration instructions.
- Add the exact publisher-provided ad code and publisher identifiers; do not invent or copy someone else's IDs.
- Add `ads.txt` only with the exact line supplied by the ad network.
- Keep ads visually distinct from download buttons, navigation, and page controls.
- Do not ask visitors to click ads or artificially generate impressions.
- Add a suitable privacy/consent mechanism where required by applicable law and provider policy.
- Review the network's current content and traffic-source policies before enabling monetization.

## Testing checklist

- [ ] Homepage and informational pages load over HTTPS.
- [ ] `/robots.txt` and `/sitemap.xml` are reachable and accurate.
- [ ] `/api/health` reports the expected configuration status.
- [ ] Test a public video URL from each supported platform after configuring a compatible provider.
- [ ] Confirm photo URLs and unsupported URL patterns are rejected.
- [ ] Test individual downloads and ZIP batches on desktop and mobile.
- [ ] Confirm no secret is exposed in frontend source, browser network responses, or Git history.
- [ ] Validate the site in Google Search Console before assuming it is indexed.
