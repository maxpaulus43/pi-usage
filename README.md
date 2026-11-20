# pi-usage

A [Pi](https://github.com/earendil-works/pi) extension that adds a `/usage` command. It shows how much of your Claude Code and OpenAI Codex subscription limits you have left.

```
 Claude Code
   5h            ████████████████████████████████████████ 100% left  resets in 1h 33m
   Week          ███████████████████████████████████████░  97% left  resets in 4d 13h

 OpenAI Codex team
   5h            ████████████████████████████░░░░░░░░░░░░  71% left  resets in 25m
   Week          ███████████████████████████████████████░  98% left  resets in 6d 23h
```

Bars are green above 50% left, yellow from 21% to 50%, and red at 20% or less. Press Esc or Enter to close.

## Install

```sh
pi install npm:@maxpaulus/pi-usage
```

To try it for one run:

```sh
pi -e npm:@maxpaulus/pi-usage
```

## Log in

`/usage` uses the logins you already have in Pi:

```
/login anthropic
/login openai-codex
```

If a login is missing or expired, that section shows an error. The other section still shows its limits.

## Limits

- The usage endpoints are not official APIs. If Anthropic or OpenAI changes them, that section shows an error until this package is updated.
- Separate weekly limits for Opus or Sonnet show only when your account has them.

## Development

```sh
npm install
npm run check
pi -e ./index.ts
```

Pushes to `main` publish to npm when the version in `package.json` is not on npm yet. See `.github/workflows/publish.yml`.
