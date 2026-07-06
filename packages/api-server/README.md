# Format Flipper Conversion API

A hosted conversion API wrapping the exact same 12-format engine as the [browser tool](https://toolymctoolface.com/format/) and the [`format-flipper` npm package](../format-flipper/).

**Positioning matters here.** The browser tool's promise is *"your data never leaves your device."* This API is a deliberately separate product where clients **do** send data to a server — for automation, webhooks, and environments where running Node isn't an option. The compensating promise, enforced in `server.js`, is **process-and-forget**: request bodies are never logged, never stored, and never retained past the response (see [PRIVACY.md](./PRIVACY.md)). Any marketing or cross-linking between the two products must keep this distinction explicit so nobody thinks the free tool uploads data.

If your data can't leave your infrastructure, don't use this — `npm install format-flipper` gives you the identical engine locally.

## Run

```bash
npm install
FF_API_KEYS="my-secret-key:customer-name" node server.js
# format-flipper API listening on :8787 (1 key)
```

## Use

```bash
curl -s http://localhost:8787/v1/convert \
  -H "Authorization: Bearer my-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"input": "id,name\n1,Ada", "from": "csv", "to": "json"}'
# {"output": "[\n  {\n    \"id\": 1,\n    \"name\": \"Ada\"\n  }\n]", "from": "csv", "to": "json"}
```

`opts` accepts the same options as the library (`sqlTable`, `sqlQuote`, `strictParse`, `csvDelimiterIn`, indents, …). `GET /v1/formats` lists formats; `GET /healthz` is the liveness probe.

## Billing integration

Usage is metered per API key (conversion count + input bytes) into `usage.json`. The Stripe wiring point is marked `STRIPE INTEGRATION POINT` in `server.js`: report one meter event per conversion to a Stripe metered subscription item, fire-and-forget with a retry queue so billing never blocks a response. Key provisioning is env-based (`FF_API_KEYS`) for v1; move keys to your secret store when deploying.

## Deploy checklist

- [ ] TLS termination in front (this server speaks plain HTTP)
- [ ] `FF_API_KEYS` from a secret manager, not shell history
- [ ] Host on a distinct subdomain (e.g. `api.toolymctoolface.com`) — never under `/format/`
- [ ] Confirm provider-level request logging excludes bodies
- [ ] Wire the Stripe meter event + provision real keys
- [ ] Publish PRIVACY.md at the API's own domain

## Test

```bash
npm test   # boots on an ephemeral port, exercises auth/convert/error paths
```
