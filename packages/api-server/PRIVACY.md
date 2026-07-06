# Privacy — Format Flipper Conversion API

**This is a different product from the Format Flipper browser tool, with a different trust boundary.** The browser tool never sends your data anywhere. This API is the opposite by design: you send data to it to be converted on our servers. If that trade-off doesn't fit your data, use the browser tool or the `format-flipper` npm package/CLI — both process everything on your own machines.

## What happens to submitted data

- Request bodies are **processed in memory and discarded** when the response is sent. They are never written to disk, never logged, and never used for anything except producing the response.
- Error responses contain the parser's error message only — your input is never echoed back or stored on failure.
- No content-derived analytics of any kind.

## What we do retain

- **Usage counts per API key**: number of conversions and total input bytes, for metered billing. Counts only — never content.
- Standard infrastructure-level metadata retained by the hosting provider (connection logs) per their policy; we configure application logging to exclude request bodies.

## Billing

Payment processing is handled by Stripe; we never see full card numbers. Stripe's handling of billing data is covered by [Stripe's privacy policy](https://stripe.com/privacy).

## Contact

toolymctoolface@gmail.com
