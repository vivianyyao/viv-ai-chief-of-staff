# viv

## What it does

Viv is an AI chief of staff built around one private conversation. The current browser MVP accepts a natural message, asks Claude to understand its intent and relevant details, remembers the thread locally, reads today's Google Calendar without changing it, and replies in Viv's concise voice.

## What it does not do yet

- It cannot create, move, or delete calendar events.
- It remembers the conversation, known tasks, local commitments, and tentative recommendations in this browser.
- It does not handle yes/no confirmations yet.
- It does not support multiple people.
- It does not sync memory across browsers or devices.
- It is not permanently hosted.
- Real personalized SMS replies require a paid, registered Twilio sender.

## Local Viv conversation

The local conversation uses Claude when `ANTHROPIC_API_KEY` is configured and falls back to a simple offline interpreter when it is not:

```bash
npm run demo
```

Open `http://127.0.0.1:3000` in your browser after the command starts. Press **Control + C** in Terminal to stop it.

For the full beginner walkthrough, open [BEGINNER_SETUP.md](./BEGINNER_SETUP.md).
