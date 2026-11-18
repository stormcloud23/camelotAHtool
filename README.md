# Camelot Auction Ledger

A static, browser-only market desk for **WoW Forever · Alliance · US RP-PvP**, focused on conservative commodity resale rather than speculative resets.

## First release

- Editable, locally saved character roster, starting with a level 40 Dwarf Hunter: Mining 191 / Engineering 225.
- Live market overview and on-demand order books from [Auction House's public API](https://auctionhouse.tk.gg/data/). No API credentials or backend required.
- Budget-aware purchase plan, separate risk watchlist, vendor-value checks, item search, profession-material filter, downloadable Markdown reports.
- Freshness checks, fees and relisting reserve, conservative targets, small demand-based positions, and a market-confirmation gate.

The provider **infers** that `us-2-123` is the RP-PvP Alliance market. Cross-check multiple prices against the game or [BootyBayBroker](https://bootybaybroker.com/forever/ah?region=us&realm=camwow-au1-realm-4-rp-pvp&faction=alliance) before enabling the plan. BootyBayBroker is a comparison link, not a scraped data dependency. Do not mistake the provider's `ruleset_name: Normal` for the actual market; its documented house grouping determines the inferred mapping.

## Run locally

Requires Node.js 22+ (24 recommended), no packages to install.

```sh
npm test
npm run build
npm run dev
```

Open http://127.0.0.1:4173. Serve over HTTP; browser modules do not work reliably via `file://`.

## GitHub Pages

In repository **Settings → Pages → Build and deployment → Source**, choose **GitHub Actions**. The included workflow tests, builds `dist/`, and deploys on pushes to `main`. Pull requests run tests/build only. After initial Pages setup, rerun the workflow if necessary. Expected address: https://stormcloud23.github.io/camelotAHtool/ . Relative paths support the repository subdirectory.

## Model and limitations

`src/market.js` is a pure analysis module; `src/app.js` handles UI, local cache and profiles. Fields are mapped by name, not index. All currency calculations use integer copper.

Candidates need at least 20 tracker-confirmed units/24h, 30% confirmation share, 20 comparable hours, 18 hourly asks and a tracked sale within six hours. We reject >2× ask variation, >50% discounts to the price anchor, and supply beyond two days of confirmed demand. The target is 90% of the minimum of inferred average sale price, last tracked sale price and median hourly ask, capped below the next ask. Purchase caps are the minimum of near-ask depth, 5% of confirmed demand, 100 units, per-item capital and remaining total budget. Buy ceilings include up to 5% slippage; fees and a configurable cost reserve reduce projected proceeds. No recommendations survive data older than two hours.

These heuristics reduce exposure; they do not establish reliable future returns. The default 5% AH cut should be checked in-game. The reserve is not an exact deposit model. Sales and “confirmed” classifications come from snapshot comparisons, not Blizzard transaction receipts. Reports use only the available 24-hour window; even a passing candidate has not been proven over weeks. Exact depth is checked on demand, and all purchases require in-game confirmation. The tool never trades for you.

One overview fetch per browser per hour, as requested by the provider; history is fetched per selected item and cached by snapshot. Failed requests show explicit errors and timestamped cached data if available. Profiles/cache remain in this browser and are not synced. GitHub Pages cannot securely hold Blizzard client secrets: a direct Blizzard adapter would require a trusted backend or Actions data pipeline.

## Roadmap

1. Verified Forever recipe catalog with skill requirements and owned-recipe selection. Material relevance currently displays profession skill; it **does not** claim that a character can craft an item.
2. Engineering and Mining crafting/smelting margins with full reagent-depth costs, output quantities, fees, recipe access and specialization restrictions.
3. Multi-day demand and price persistence, requiring enough observed days before marking a market steady.
4. Purchase/sale ledger to measure realized returns, deposits and time-to-sale.

No bundled live-data fixtures, keys, trackers, or fake opportunity examples. Tests use synthetic inputs. Data attribution: Auction House / Blizzard. Unofficial fan project, not endorsed by Blizzard.
