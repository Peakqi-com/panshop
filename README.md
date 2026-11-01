# PanShop

**Pan your phone across your products. Your shop is ready.**

PanShop turns one slow pan of your phone camera into a complete store: a deduplicated product list, clean product images, titles and descriptions, a Meta-ready catalog file, a shoppable page, and one short vertical video per product. Talk while you pan and the names and prices come along for free.

PanShop is built for the [Meta Global AI Developer Hackathon](https://cerebralvalley.ai/e/meta-ai-developer-hackathon) (Startup track, theme *Build for Your World*) by [PEAKQI](https://peakqi.com), Taipei.

[繁體中文說明](./README.zh-TW.md)

---

## Why

Small sellers, group-buy hosts, market vendors and resellers rotate inventory every week. Listing 20 products still means a day of photographing, background removal, copywriting, catalog entry and video editing. PanShop collapses that day into one pan of the camera: one to three minutes of video, shot on whatever table the products are already on.

## What it does

1. **Pan**: film one slow pan across your products. Say the product names and prices as you go.
2. **Segment and deduplicate**: SAM 3.1 finds every product, tracks it across frames and keeps one record per physical item, even when it leaves and re-enters the frame.
3. **Identify**: Muse Spark reads the best crops of each item and what you said during the pan, transcribed by Muse Voice Transcribe, to produce title, attributes, category, price and description.
4. **Shoot**: the SAM mask gives a transparent cutout, then Muse Image produces three studio angles (front, three-quarter, side) and one lifestyle shot per item from its own crops, in a style the seller picks.
5. **Review**: one table. Fix a price, drop an item, done. A timeline shows every second each item was on camera, so you can see that a product that left and came back still counts once.
6. **Shop**: export a Meta Commerce Manager catalog CSV, open your shoppable page, and get a 15-second 9:16 product ad per item: hook, hero zoom on the cutout, three selling-point cards, price and call to action, with the seller's own voice from the pan as the voiceover over a generated music bed. Titles, prices, captions and selling points are editable, and any item's shots or video can be regenerated on its own.

## Meta models used

| Model | Role |
|---|---|
| SAM 3.1 (`sam-3.1`) | Concept-prompted video segmentation and cross-frame tracking of every product; per-item best-angle crops and mask cutouts |
| Muse Spark 1.3 (`muse-spark-1.3`) | Category discovery, crop matching for deduplication, product attributes, copy |
| Muse Voice Transcribe (`muse-voice-transcribe-1.0`) | Spoken product names and prices with turn-level timestamps |
| Muse Image (`muse-image-1.0`) | Studio and lifestyle product images, video covers |
| Muse Spark Open (open weights, hosted on Baseten) | Comment-to-product matching and reply drafts on the shoppable page. *Built with Muse Spark Open.* |

## How the pipeline works

```
upload (Blob client upload)
  │
  ├─ 1 extract     ffmpeg: 4 fps 720p proxy for SAM, overview frames, 24 kHz mono WAV
  ├─ 2 discover    Muse Spark lists the product categories in the overview frames
  ├─ 3 segment     SAM 3.1, one request per category: boxes, masks, stable object ids
  │                → tracks → best-angle crops → mask cutouts on white
  ├─ 4 dedup       rule: two tracks visible at the same time are different items;
  │                non-overlapping tracks are matched by Muse Spark on their crops
  ├─ 5 transcribe  Muse Voice Transcribe → Traditional Chinese → names and prices per turn
  ├─ 6 identify    Muse Spark per item: crops + the speech from when it was on camera
  │
  ▼  review table + timeline (human confirms once)
  │
  ├─ 7 shoot       Muse Image: three studio angles and a lifestyle shot from the item's own crops
  └─ 8 render      copy, Meta catalog CSV, shoppable page, one 15 s product ad per item (canvas frames + ffmpeg, seller voice + music)
```

Every stage runs as its own serverless function invocation and writes its status to the job, so any stage can be re-run on its own. SAM is fed a 4 fps proxy, which keeps a 3-minute pan under 750 frames per category.

## Architecture

- **App and pipeline**: Next.js 16 (App Router) on Vercel. Route handlers run the pipeline stages; ffmpeg comes from `ffmpeg-static`.
- **Data**: MongoDB Atlas (jobs, tracks, items, assets, comments) through the official driver with zod schemas and a thin repository layer. Media (video proxy, frames, crops, cutouts, images, videos) lives in Vercel Blob.
- **Models**: Meta Model API for SAM 3.1, Muse Spark, Muse Voice Transcribe and Muse Image. Muse Spark Open through Baseten's OpenAI-compatible endpoint.
- **Keys**: model keys are entered once in `/admin` and stored AES-256-GCM encrypted in MongoDB; environment variables are a fallback.

## Evaluation

First benchmark: a synthetic 81-second tabletop pan with 8 items in 3 categories (3 mugs, 3 notebooks, 2 shoes), spoken names and prices on the audio track, and the camera panning back so that 4 items leave and re-enter the frame. Ground truth is in `eval/labels/synthetic.json`. Real footage numbers will be added once shot.

| Metric | Result |
|---|---|
| Item count after deduplication | 8 of 8, no ghost items (the 4 re-entries were merged back) |
| Title and attribute accuracy | 8 of 8 |
| Price captured from speech | 8 of 8 |
| Title accuracy, vision only vs. vision + speech | TBD |
| Time from upload to review table | about 4 minutes (SAM 3.1 runs once per category, 13 to 18 s each) |
| API cost per listing session | about $0.45 to the review table, about $0.7 including product shots and videos |

Earlier runs on the same clip produced 10 items (two re-entry fragments not merged, one notebook also picked up by the `mug` prompt). The fixes are the ones described in the pipeline: splitting tracks at gaps, a category check on every track, a rule that co-visible tracks are distinct, and a second merge pass after naming. See `docs/api-notes.md` for measured latencies and model behaviour.

## Getting started

```bash
pnpm install
cp .env.example .env.local   # fill in the values below
pnpm indexes                 # create MongoDB indexes
pnpm dev
```

| Variable | Purpose |
|---|---|
| `MONGODB_URI`, `DATABASE_NAME` | MongoDB Atlas connection |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store |
| `ADMIN_PASSCODE` | Passcode for `/admin`, where model keys are entered |
| `SECRETS_MASTER_KEY` | 32-byte base64 key that encrypts stored model keys (`openssl rand -base64 32`) |
| `WORKER_SECRET` | Shared secret for stage-to-stage calls (`openssl rand -hex 24`) |
| `UPLOAD_PASSCODE` | Optional passcode on the upload page |
| `META_API_KEY`, `BASETEN_API_KEY`, `BASETEN_MODEL` | Fallbacks if keys are not stored through `/admin` |
| `FFMPEG_PATH` | Optional local ffmpeg; `ffmpeg-static` is used when unset |
| `NEXT_PUBLIC_SITE_URL` | Public URL, used by stages to call the next stage |

Model smoke tests, each one call against the Meta Model API:

```bash
node --env-file=.env.local --import tsx eval/smoke/run.mts spark
node --env-file=.env.local --import tsx eval/smoke/run.mts sam-video path/to/clip.mp4 mug
node --env-file=.env.local --import tsx eval/smoke/run.mts voice path/to/clip.mp4
node --env-file=.env.local --import tsx eval/smoke/run.mts image
```

## Repository layout

```
src/app/                 pages: upload, job view (progress, timeline, review, outputs), shoppable page, /admin
src/app/api/             upload token, jobs, items, stage runner, produce
src/lib/meta.ts          Meta Model API client (Spark JSON, SAM 3.1 streams, Files, Muse Image, Voice Transcribe)
src/lib/baseten.ts       Muse Spark Open via Baseten
src/lib/pipeline/        stage runner and the eight stages
src/lib/ffmpeg.ts        ffmpeg helpers (proxy, frames, audio, cutouts via sharp)
src/models/              zod schemas: job, track, item, asset, comment
src/repositories/        all database access
eval/                    smoke tests, labeled test footage and accuracy scripts
```

## Status and hackathon disclosure

- All code in this repository was written during the hackathon window (26 Oct to 4 Nov 2026).
- The product is designed as a new module of our production marketing-content SaaS. That product is linked, not included; no existing code or customer assets are in this repository.
- Demo footage is a pan across our own household items. No third-party products or brands.
- Instagram and WhatsApp publishing are on the roadmap and are not part of this submission. Catalog export targets the Meta Commerce Manager CSV format.

## Roadmap

- Instagram: publish Reels via the Content Publishing API; product tags in markets with native checkout; comment-to-DM purchase links
- WhatsApp: catalog sync and conversational ordering
- Ads: Advantage+ catalog ad drafts from the generated catalog
- Shoppable video: make existing videos and live replays purchasable, match comments to products

## Team

PEAKQI Co., Ltd. (奇鋒國際有限公司), Taipei, Taiwan.

## License

MIT. See [LICENSE](./LICENSE).
