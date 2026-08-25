---
name: vercel-deployment-check
description: Verify Vercel deployment is live and matches latest git commits. Opens a browser to visually confirm updates are deployed.
---

# Vercel Deployment Check

Automatically verifies that your latest commits have been deployed to Vercel and are live. Opens a browser to take screenshots and confirm the UI matches your changes.

## Usage

Run this after making any updates and pushing to main:

```
/vercel-deployment-check
```

## What It Does

1. **Checks Git History** - Finds the latest commit hash on main
2. **Checks Vercel Status** - Verifies the deployment includes your latest changes
3. **Opens Browser** - Takes a screenshot of the live site to visually confirm
4. **Validates Updates** - Compares what's deployed vs what should be deployed
5. **Reports Results** - Shows you exactly what's live with screenshot proof

## Options

Pass a Vercel URL to check a specific deployment:

```
/vercel-deployment-check https://agencyos-rbt6y4lyn-tami4.vercel.app/
```

## Why This Matters

**Before:** Push code → Hope it's deployed → User checks → "It's not live yet"

**After:** Push code → Run skill → "✅ Verified live with screenshot" OR "❌ Deployment behind by N commits"

Saves the back-and-forth and gives you proof before claiming anything is live.

## Common Issues Fixed

- ❌ Claiming code is live when Vercel hasn't rebuilt yet
- ❌ Browser cache hiding updates (use incognito in browser check)
- ❌ Old commits still being deployed
- ❌ Not knowing if changes are actually visible

## For Multiple Projects

This skill is project-agnostic and can be used in any repo. Just run it after pushing updates to verify deployment is complete and live.
