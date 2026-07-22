#!/bin/bash
set -e
printf "Paste your Twilio Auth Token, then press Return (your paste will stay hidden): "
IFS= read -r -s TWILIO_TOKEN
printf "\n"
if [ -z "$TWILIO_TOKEN" ]; then
  printf "Nothing was saved because the token was empty.\n"
  exit 1
fi
TWILIO_AUTH_TOKEN_INPUT="$TWILIO_TOKEN" node scripts/save-twilio-token.mjs
unset TWILIO_TOKEN
