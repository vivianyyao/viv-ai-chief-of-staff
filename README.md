# viv

## What it does

Viv is an AI chief of staff designed for text messages. The current MVP accepts a message, asks Claude to identify the task or request, duration, deadline, and whether clarification is needed, then replies in Viv's concise voice.

## What it does not do yet

- It does not read or change a calendar.
- It does not remember earlier messages or handle confirmations yet.
- It does not support multiple people.
- It does not store tasks or message history.
- It is not permanently hosted.
- Real personalized SMS replies require a paid, registered Twilio sender.

## Local Viv experience

The local conversation simulator uses Claude when `ANTHROPIC_API_KEY` is configured and falls back to a simple offline interpreter when it is not:

```bash
npm run demo
```

Open `http://127.0.0.1:3000` in your browser after the command starts. Press **Control + C** in Terminal to stop it.

For the full beginner walkthrough, open [BEGINNER_SETUP.md](./BEGINNER_SETUP.md).
