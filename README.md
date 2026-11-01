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
4. **Shoot**: Muse Image generates a white-background shot and a lifestyle shot per item from its own crops.
5. **Review**: one table. Fix a price, drop an item, done.
6. **Shop**: export a Meta Commerce Manager catalog CSV, open your shoppable page, and get a 9:16 video with cover and caption for every product.

## Meta models used

| Model | Role |
|---|---|
| SAM 3.1 (`sam-3.1`) | Concept-prompted segmentation and cross-frame tracking of every product; per-item best-angle crops |
| Muse Spark 1.3 (`muse-spark-1.3`) | Category discovery, crop matching for deduplication, product attributes, copy |
| Muse Voice Transcribe (`muse-voice-transcribe-1.0`) | Spoken product names and prices with timestamps |
| Muse Image (`muse-image-1.0`) | White-background and lifestyle product images, video covers |
| Muse Glimmer (open weights, fine-tuned) | Lightweight product-category and comment-intent classifier. *Built with Muse Glimmer.* |

## Architecture

```
video ──► ffmpeg (frames @2fps, audio)
            │
            ├─► Muse Spark: list categories in overview frame
            │       └─► SAM 3.1 per category: masks, boxes, stable track IDs
            │               └─► dedup: track IDs + Spark crop matching ──► items
            └─► Muse Voice Transcribe: names, prices, timestamps ───────┘
                                                                         │
                                        review table ◄───────────────────┘
                                             │
                     Muse Image (shots) ── Spark (copy) ── Glimmer (classify)
                                             │
                     catalog CSV · shoppable page · per-item 9:16 video
```

- Web app and API: Next.js on Vercel
- Video worker: Modal (ffmpeg, SAM 3.1, Voice, Spark, Muse Image, video rendering)
- Open-weight inference: Muse Glimmer fine-tuned and served on Fireworks
- Data: MongoDB Atlas (metadata) and Vercel Blob (frames, crops, images, videos)

## Evaluation

Measured on a real 15-item, 3-category tabletop pan shot during the hackathon. Numbers will be filled in as they are measured.

| Metric | Result |
|---|---|
| Item count accuracy after deduplication | TBD |
| Title and attribute accuracy | TBD |
| Title accuracy, vision only vs. vision + speech | TBD |
| Processing time for a 3-minute video | TBD |
| API cost per listing session | TBD (estimate under $1) |

## Status and hackathon disclosure

- All code in this repository was written during the hackathon window (26 Oct to 4 Nov 2026).
- The product is designed as a new module of our production marketing-content SaaS. That product is linked, not included; no existing code or customer assets are in this repository.
- Demo footage is a pan across our own household items. No third-party products or brands.
- Instagram and WhatsApp publishing are on the roadmap and are not part of this submission. Catalog export targets the Meta Commerce Manager CSV format.

## Getting started

Setup instructions, environment variables and a sample video will be added as the pipeline lands.

```
apps/web/          Next.js app: upload, progress, review table, outputs, shoppable page
workers/pipeline/  Modal worker: ffmpeg, SAM 3.1, Voice, Spark, Muse Image, rendering
workers/classify/  Muse Glimmer fine-tune and inference
packages/schema/   Shared types: job, track, item, asset
eval/              Labeled test video and accuracy scripts
```

## Roadmap

- Instagram: publish Reels via the Content Publishing API; product tags in markets with native checkout; comment-to-DM purchase links
- WhatsApp: catalog sync and conversational ordering
- Ads: Advantage+ catalog ad drafts from the generated catalog
- Shoppable video: make existing videos and live replays purchasable, match comments to products

## Team

PEAKQI Co., Ltd. (奇鋒國際有限公司), Taipei, Taiwan.

## License

MIT. See [LICENSE](./LICENSE).
