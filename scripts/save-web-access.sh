#!/bin/bash
set -e

printf "Enter the private password you chose (it will stay hidden): "
IFS= read -r -s VIV_PASSWORD
printf "\nEnter it one more time: "
IFS= read -r -s VIV_PASSWORD_CONFIRM
printf "\n"

if [ -z "$VIV_PASSWORD" ]; then
  printf "Nothing was saved because the password was empty.\n"
  exit 1
fi

if [ "$VIV_PASSWORD" != "$VIV_PASSWORD_CONFIRM" ]; then
  printf "Those passwords did not match. Nothing was saved.\n"
  exit 1
fi

VIV_ACCESS_PASSWORD_INPUT="$VIV_PASSWORD" node scripts/save-web-access.mjs
unset VIV_PASSWORD VIV_PASSWORD_CONFIRM
