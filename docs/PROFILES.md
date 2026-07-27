# Profile and Avatar Guide

Debate Lab lets each user customize the visible identity they see in the app.

## Available Settings

The current profile settings include:

- display name
- gender
- pronouns
- avatar style
- avatar accent color
- GitHub avatar preference

You can tune those settings from the Settings screen after signing in, and the onboarding flow uses the same profile model.

The same profile controls are also available from the top-right account menu, which makes them easier to reach during normal use.

## Why This Exists

The default avatar should not feel generic or repetitive. The profile layer exists so the app can show distinct characters and a more personal representation of the user.

## Avatar Behavior

The generated avatar uses:

- the chosen display name as a seed
- the selected gender
- the selected style
- the selected accent color

If GitHub avatar preference is enabled and a GitHub avatar exists, the app can use that instead.

The generated avatar is meant to be varied enough that two users do not end up with the same default face and color.

## Saving Changes

The current implementation stores these preferences in the browser. That means:

- the settings persist on that browser
- they are easy to change
- they are not yet synchronized across devices unless you extend the backend profile model

## Account setup idea

If you want richer account setup, the next natural extension is to store:

- preferred display name
- gender and pronouns
- avatar style
- accent color
- whether GitHub avatar is preferred

Those fields can live in the backend profile row so they sync across browsers and devices.

## Suggested Next Step

If you want account-wide persistence, the right follow-up is to save these fields in the backend profile table and load them from `auth/me`.
