---
name: vercel-deployment-check
description: Verify ANY deployment is live with actual browser screenshots. Works for any code changes - theme updates, new features, UI changes, etc.
---

# Deployment Live Verification

Opens a live browser, takes screenshots, and verifies that your requested changes are actually deployed and visible. Works for ANY type of update.

## Usage

After making updates and pushing to main, invoke with what you're expecting to see:

**Generic usage:**
```
/vercel-deployment-check
```

**With specific expectations (describe what should be visible):**
```
/vercel-deployment-check dark theme with indigo accents and health status dots on project cards
```

```
/vercel-deployment-check language breakdown bars at bottom of cards, no white background
```

```
/vercel-deployment-check new button on dashboard, blue accent color, updated form styling
```

## What It Does

1. **Gets latest git commits** - Finds what code should be deployed
2. **Opens browser** - Loads the live Vercel URL in incognito mode (no cache)
3. **Takes screenshots** - Captures multiple views/scrolls to show the full page
4. **Verifies changes** - Compares screenshot against your expectations
5. **Reports with proof** - Shows you the screenshots + confirmation if live or not

## Examples

**Dark theme verification:**
```
/vercel-deployment-check dark navy background, indigo left borders, glass morphism cards
```

**Feature verification:**
```
/vercel-deployment-check new health monitoring dots on cards, colored indicators for deployment and database status
```

**Layout verification:**
```
/vercel-deployment-check language bars visible, no separate health panel at top, integrated into cards
```

## Why This Matters

**No more guessing:**
- ✅ See actual screenshots of what's live
- ✅ Know instantly if Vercel has deployed
- ✅ Compare deployed code vs git commits
- ✅ Catch deployment issues immediately

## Works For Any Project / Any Change

This skill is completely generic and reusable:
- Different projects (agencyos, amarelinha, etc.)
- Different change types (UI, features, styling, functionality)
- Different deployment platforms (Vercel, GitHub Pages, etc.)
- Different expectations (describe what you want to see, we'll verify it's there)

## The Promise

**I will NEVER claim code is live without:**
1. Taking a browser screenshot as proof
2. Comparing it against your expectations
3. Confirming the git commit hash is deployed
4. Showing you the visual evidence
