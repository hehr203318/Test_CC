# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository contains a single-file browser Nim game (`nim.html`) — a two-player strategy game (player vs AI) where players alternately remove stones from piles. The player who takes the last stone wins.

## Git Workflow

After completing any meaningful unit of work, commit and push to GitHub:

```
git add <files>
git commit -m "concise description of what changed and why"
git push
```

Keep commits focused and atomic — one logical change per commit. Never batch unrelated changes together.

## Running the Project

Open `nim.html` directly in any browser — no build step, no server, no dependencies.

## Architecture

`nim.html` is a self-contained file with inline CSS and JavaScript:

- **State**: `piles[]` (current stone counts), `selected[]` (pending player move per pile), `playerTurn`, `gameOver`, `difficulty`
- **Rendering**: `renderPiles()` rebuilds the DOM from state on every change
- **AI strategies**:
  - Hard (`nimOptimalMove`): XOR-sum strategy — finds a move that reduces nim-value XOR to 0; falls back to removing 1 stone when already in a losing position
  - Easy (`nimRandomMove`): picks a random pile and takes a random number of stones
- **Game flow**: player selects stones via `+`/`−` controls → `confirmMove()` → `applyMove()` → check win → `aiMove()` fires after 800ms delay

The UI uses a dark theme (`#0f172a` background, Tailwind-style slate palette) with no external CSS or JS dependencies.
