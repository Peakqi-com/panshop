import Link from "next/link";
import { makeT } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { settings } from "@/repositories/settings";
import { loadShowcase, SHOWCASE_DEFAULT } from "@/lib/showcase";
import { PanTheater } from "@/components/landing/pan-theater";
import { ShowcasePanel } from "@/components/landing/showcase";
import { CommentPlayground } from "@/components/landing/comment-playground";
import { CountUp, Reveal } from "@/components/landing/motion";

export const dynamic = "force-dynamic";

/**
 * 首頁（介紹頁）：捲動敘事主視覺 → 真實成果 → 試玩 → 模型 → 數字 → 給誰用 → 行動。
 * 所有圖片、短片、價格都來自正式站一筆跑完的真實掃描（lib/showcase.ts）；開始掃描在 /new。
 */
export default async function Landing() {
  const [cfg, lang] = await Promise.all([settings.get(), getLang()]);
  const t = makeT(lang);
  const [stage, show] = await Promise.all([
    loadShowcase(SHOWCASE_DEFAULT.zh),
    loadShowcase(cfg.featuredJobCode || SHOWCASE_DEFAULT[lang]),
  ]);

  const models = [
    { name: "SAM 3.1", tone: "var(--teal)", body: t("逐格切出每件商品、跨畫面追蹤，離開又回來的同一件只算一次。", "Segments and tracks every product across frames; an item that leaves and returns is counted once.") },
    { name: "Muse Spark", tone: "var(--yellow)", body: t("看最佳角度裁切加上口述，寫品名、屬性、文案、短片分鏡，並檢查每張生成圖。", "Names each item from its best crops and your speech, writes copy and storyboards, and checks every generated image.") },
    { name: "Muse Voice Transcribe", tone: "var(--purple)", body: t("聽出你說的品名和價格，附時間戳，也剪出你自己介紹那件的原聲當短片口白。", "Hears names and prices with timestamps, and cuts your own sentence about each item as the video narration.") },
    { name: "Muse Image", tone: "var(--pink)", body: t("以商品自己的裁切為參考，做三個棚拍角度、一張情境圖和直式分鏡畫面。", "Three studio angles, a lifestyle shot and 9:16 scenes, referenced on the item's own crops.") },
    { name: "Muse Spark Open", tone: "var(--accent)", body: t("開放權重模型，處理留言裡的提問：判斷意圖、對到商品、擬好回覆。", "Open weights. Handles shopper questions in comments: intent, product match and a reply draft.") },
  ];
  const audience = [
    { who: t("直播賣家", "Live sellers"), en: "LIVE", tone: "var(--pink)", body: t("開播前掃一圈就有代碼清單，下播後把留言貼進來就有訂單表。", "Pan before the show for a coded list; paste the comments after it for an order sheet.") },
    { who: t("團購主", "Group-buy hosts"), en: "GROUP BUY", tone: "var(--teal)", body: t("每週換一批貨也不怕，商品圖、文案、可購買頁一次重做好。", "New stock every week: photos, copy and the shop page are rebuilt in one pass.") },
    { who: t("小店老闆", "Small shops"), en: "SHOPS", tone: "var(--yellow)", body: t("沒有商品目錄的店，從這裡接上 Meta 商品目錄、商店與目錄廣告。", "No catalog yet? This is the on-ramp to Meta's catalog, shops and catalog ads.") },
  ];
  const ticker = ["SAM 3.1", "MUSE SPARK", "MUSE VOICE TRANSCRIBE", "MUSE IMAGE", "MUSE SPARK OPEN", t("掃一圈，就開賣", "PAN ONCE, START SELLING")];

  return (
    <main className="overflow-x-clip">
      {cfg.announcement && <p className="mx-auto mt-4 max-w-6xl rounded-lg border-2 border-[var(--ink)] bg-[var(--yellow)] px-4 py-2 text-sm font-bold">{cfg.announcement}</p>}

      <PanTheater show={stage} />

      {/* 跑馬燈 */}
      <div className="overflow-hidden py-4" aria-hidden>
      <div className="relative -mx-4 -rotate-1 border-y-[3px] border-[var(--ink)] bg-[var(--yellow)] py-3">
        <div className="ps-marquee flex w-max whitespace-nowrap font-black tracking-wide">
          {[0, 1].map((k) => <span key={k} className="flex gap-8 pr-8">{ticker.map((x) => <span key={x} className="flex items-center gap-8">{x}<span className="text-[var(--accent)]">✦</span></span>)}</span>)}
        </div>
      </div>
      </div>

      <div className="mx-auto max-w-6xl px-4">
        {show && (
          <section id="showcase" className="scroll-mt-20 pt-20">
            <Reveal>
              <SectionHead tag="REAL OUTPUT" tone="var(--teal)" title={t("不是示意圖，是正式站真的跑出來的", "Not a mock-up. This came out of production.")} sub={t("左右拖拉比較：影片裡切出來的那一格，和 Muse Image 做出的棚拍圖。右邊是同一件商品自動產生的直式短片。", "Drag to compare the frame cut from the video with the Muse Image studio shot. On the right, the 9:16 video made for the same item.")} />
            </Reveal>
            <Reveal className="mt-8"><ShowcasePanel show={show} /></Reveal>
          </section>
        )}

        {show && (
          <section id="comments" className="scroll-mt-20 pt-24">
            <Reveal>
              <SectionHead tag="TRY IT" tone="var(--pink)" title={t("打一則留言，看它變成訂單", "Type a comment. Watch it become an order.")} sub={t("「A1+1」「小美：B1 x2」「+1 C1」「A1 兩個」全形半形都可以，一則可以下好幾件。", "“A1+1”, “Amy: B1 x2”, “+1 C1”: several items per comment, full-width characters too.")} />
            </Reveal>
            <Reveal className="mt-8"><CommentPlayground items={show.items} currency={show.currency} /></Reveal>
          </section>
        )}

        <section id="models" className="scroll-mt-20 pt-24">
          <Reveal>
            <SectionHead tag="META MODELS" tone="var(--purple)" title={t("整條流程，每一個模型都是 Meta", "Every model in the pipeline is a Meta model")} sub={t("八個階段各自是一次函式呼叫，可以單獨重跑；留言下單代碼用規則解析，不花模型額度。", "Eight stages, each its own function call that can be re-run alone. Order codes in comments are parsed by rules, with no model call.")} />
          </Reveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {models.map((m, i) => (
              <Reveal key={m.name} delay={i * 80}>
                <div className="card ps-tilt h-full p-4">
                  <span className="inline-block rounded-lg border-[2.5px] border-[var(--ink)] px-2 py-0.5 text-sm font-black" style={{ background: m.tone, color: m.tone === "var(--purple)" ? "white" : undefined }}>{m.name}</span>
                  <p className="mt-3 text-sm leading-relaxed text-stone-700">{m.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="numbers" className="pt-24">
          <Reveal>
            <SectionHead tag="MEASURED" tone="var(--yellow)" title={t("實測數字", "Measured, not promised")} sub={t("合成的 81 秒掃描影片（8 件、3 個品類、4 件離開又回來），以及正式站 20 秒、3 件的實跑紀錄。", "An 81-second synthetic pan (8 items, 3 categories, 4 leave and re-enter the frame) and a 20-second, 3-item run on production.")} />
          </Reveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              { v: <><CountUp to={8} lang={lang} /> / 8</>, l: t("件數正確，去重後沒有多出來的幽靈商品", "items after de-duplication, no ghost items"), tone: "var(--teal)" },
              { v: <CountUp to={146} kind="sec" lang={lang} />, l: t("從上傳到確認表（20 秒影片、3 件）", "from upload to review table (20 s pan, 3 items)"), tone: "var(--pink)" },
              { v: <CountUp to={0.46} kind="usd" lang={lang} />, l: t("一次掃描的模型總費用：12 張商品圖、3 支短片", "total model cost for one scan: 12 photos, 3 videos"), tone: "var(--yellow)" },
            ].map((n, i) => (
              <Reveal key={i} delay={i * 100}>
                <div className="card relative overflow-hidden p-5">
                  <span aria-hidden className="absolute -right-6 -top-6 h-20 w-20 rounded-full border-[3px] border-[var(--ink)]" style={{ background: n.tone }} />
                  <p className="relative text-4xl font-black sm:text-5xl">{n.v}</p>
                  <p className="relative mt-2 text-sm text-stone-700">{n.l}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="who" className="pt-24">
          <Reveal>
            <SectionHead tag="FOR WHO" tone="var(--pink)" title={t("給靠留言賣東西的人", "For people who sell through comments")} />
          </Reveal>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {audience.map((a, i) => (
              <Reveal key={a.en} delay={i * 100}>
                <div className="card ps-tilt h-full p-5" style={{ background: a.tone }}>
                  <p className="font-mono text-xs font-black tracking-[0.16em]">{a.en}</p>
                  <p className="mt-1 text-2xl font-black">{a.who}</p>
                  <p className="mt-3 text-sm leading-relaxed">{a.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="py-24">
          <Reveal>
            <div className="card relative overflow-hidden px-6 py-12 text-center" style={{ background: "var(--accent)" }}>
              <span aria-hidden className="ps-float absolute left-[6%] top-[18%] h-10 w-10 rounded-full border-[3px] border-[var(--ink)] bg-[var(--yellow)]" />
              <span aria-hidden className="ps-float-2 absolute bottom-[14%] right-[8%] h-10 w-10 rotate-12 border-[3px] border-[var(--ink)] bg-[var(--teal)]" />
              <h2 className="text-3xl font-black sm:text-5xl"><span className="mark">{t("現在就掃一圈", "Pan your first shelf")}</span></h2>
              <p className="mx-auto mt-4 max-w-xl font-bold">{cfg.trialJobsPerIp > 0 ? t(`不用註冊，每天可以免費掃 ${cfg.trialJobsPerIp} 次。沒有影片也可以用範例影片試。`, `No sign-up. ${cfg.trialJobsPerIp} free scans a day, and a sample video if you don't have one yet.`) : t("不用註冊，沒有影片也可以用範例影片試。", "No sign-up, and a sample video if you don't have one yet.")}</p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link href="/new" className="btn bg-white px-6 py-3 text-base">{t("開始掃描", "Start a scan")} →</Link>
                {show && <Link href={`/s/${show.code}`} className="btn btn-ghost px-6 py-3 text-base">{t("看範例可購買頁", "See a sample shop page")}</Link>}
              </div>
            </div>
          </Reveal>
        </section>
      </div>
    </main>
  );
}

function SectionHead({ tag, tone, title, sub }: { tag: string; tone: string; title: string; sub?: string }) {
  return (
    <div>
      <p className="inline-flex items-center gap-2 font-mono text-xs font-black uppercase tracking-[0.16em]"><span className="h-3 w-3 rotate-45 border-2 border-[var(--ink)]" style={{ background: tone }} />{tag}</p>
      <h2 className="mt-2 text-3xl font-black leading-tight tracking-tight sm:text-4xl">{title}</h2>
      {sub && <p className="mt-3 max-w-2xl text-stone-700">{sub}</p>}
    </div>
  );
}
