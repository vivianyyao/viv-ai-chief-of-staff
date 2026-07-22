# Text-to-timeblock MVP

## What it does

The real app receives a text message at a Twilio phone number, asks Claude to turn the message into a task with a title and estimated length, reads busy times from one Google Calendar, finds the first open weekday slot, and replies with a suggested time. It only reads calendar availability. It does not create an event.

## What it does not do yet

- It does not book, change, or delete calendar events.
- It does not wait for a “yes” or handle a conversation.
- It does not support multiple people or multiple calendars.
- It does not store tasks or message history.
- It does not understand every language or every unusual date phrase.
- It does not guarantee delivery of a text message.
- It has not been deployed or connected to real accounts.

## Local Viv experience

The local experience needs no accounts and contacts no outside service:

```bash
npm run demo
```

Open `http://127.0.0.1:3000` in your browser after the command starts. Press **Control + C** in Terminal to stop it.

For the full beginner walkthrough, open [BEGINNER_SETUP.md](./BEGINNER_SETUP.md).
