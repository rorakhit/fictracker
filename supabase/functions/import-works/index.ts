import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FREE_FIC_LIMIT = 50;

// --- AO3 metadata scraper -------------------------------------------------
//
// Fetches a single AO3 work page and extracts the metadata fields we store
// in the `works` table. Used for the "Add by URL" flow, where the client
// only knows the ao3_id and needs the server to populate the rest.
//
// Why server-side: AO3 doesn't send permissive CORS headers, so the browser
// can't fetch their HTML directly. Doing it from the edge function sidesteps
// the issue entirely.
//
// Why regex instead of a DOM parser: AO3's metadata block uses very stable
// CSS classes (`dd.words`, `dd.chapters`, `rel="author"`, etc.) that have
// barely changed in years. Pulling in deno_dom would add cold-start cost
// for what amounts to ~15 small extractions. Each extractor is wrapped so a
// single missing field can't tank the whole import.

const AO3_BASE = "https://archiveofourown.org";

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

// Pull all <a class="tag">...</a> children out of a given <dd> block
function extractTagList(html: string, ddClass: string): string[] {
  const ddMatch = html.match(
    new RegExp(`<dd[^>]*class="[^"]*\\b${ddClass}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/dd>`, "i")
  );
  if (!ddMatch) return [];
  const tagMatches = ddMatch[1].matchAll(/<a[^>]*class="tag"[^>]*>([\s\S]*?)<\/a>/gi);
  return Array.from(tagMatches).map(m => stripTags(m[1])).filter(Boolean);
}

function extractDdText(html: string, ddClass: string): string | null {
  const m = html.match(
    new RegExp(`<dd[^>]*class="[^"]*\\b${ddClass}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/dd>`, "i")
  );
  return m ? stripTags(m[1]) : null;
}

function parseIntSafe(s: string | null): number | null {
  if (!s) return null;
  const n = parseInt(s.replace(/[,\s]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

interface Ao3Metadata {
  title: string;
  authors: string[];
  rating: string | null;
  warnings: string[];
  categories: string[];
  fandoms: string[];
  relationships: string[];
  characters: string[];
  freeform_tags: string[];
  summary: string | null;
  language: string;
  word_count: number | null;
  chapter_count: number | null;
  chapter_total: number | null;
  is_complete: boolean;
  date_published: string | null;
  date_updated: string | null;
  kudos: number | null;
  hits: number | null;
  bookmarks_count: number | null;
  comments_count: number | null;
}

async function fetchAo3Metadata(ao3Id: number): Promise<Ao3Metadata> {
  // view_adult=true bypasses the explicit-content interstitial; without it,
  // mature/explicit works return a confirmation page rather than the work.
  const url = `${AO3_BASE}/works/${ao3Id}?view_adult=true`;
  const res = await fetch(url, {
    headers: {
      // AO3 sometimes serves a degraded page to default Deno UA. A normal
      // browser UA gets the full markup.
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`AO3 returned ${res.status} for work ${ao3Id}`);
  }

  const html = await res.text();

  // Locked / registered-users-only works render a login form instead of the
  // work. Detect that explicitly so we don't store garbage.
  if (/This work is only available to registered users/i.test(html) ||
      /<form[^>]*action="\/users\/login"/i.test(html) && !/class="preface group"/i.test(html)) {
    throw new Error(`Work ${ao3Id} is restricted to registered users`);
  }

  // Title lives inside .preface .title.heading
  const title = safe(() => {
    const m = html.match(/<h2[^>]*class="title heading"[^>]*>([\s\S]*?)<\/h2>/i);
    return m ? stripTags(m[1]) : "Untitled";
  }, "Untitled");

  // Authors: <a rel="author">NAME</a>
  const authors = safe(() => {
    const matches = html.matchAll(/<a[^>]*rel="author"[^>]*>([\s\S]*?)<\/a>/gi);
    return Array.from(new Set(Array.from(matches).map(m => stripTags(m[1])).filter(Boolean)));
  }, [] as string[]);

  const rating = safe(() => {
    const tags = extractTagList(html, "rating");
    return tags[0] || null;
  }, null);

  const warnings = safe(() => extractTagList(html, "warning"), [] as string[]);
  const categories = safe(() => extractTagList(html, "category"), [] as string[]);
  const fandoms = safe(() => extractTagList(html, "fandom"), [] as string[]);
  const relationships = safe(() => extractTagList(html, "relationship"), [] as string[]);
  const characters = safe(() => extractTagList(html, "character"), [] as string[]);
  const freeform_tags = safe(() => extractTagList(html, "freeform"), [] as string[]);

  // Summary: <div class="summary module"><h3>Summary:</h3><blockquote>...</blockquote></div>
  const summary = safe(() => {
    const m = html.match(
      /<div[^>]*class="[^"]*\bsummary\b[^"]*module[^"]*"[^>]*>[\s\S]*?<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i
    );
    return m ? stripTags(m[1]).slice(0, 2000) : null;
  }, null);

  const language = safe(() => extractDdText(html, "language") || "English", "English");

  const word_count = safe(() => parseIntSafe(extractDdText(html, "words")), null);

  // Chapters: "3/10" or "3/?"
  const { chapter_count, chapter_total, is_complete } = safe(() => {
    const text = extractDdText(html, "chapters") || "";
    const m = text.match(/(\d+)\s*\/\s*(\d+|\?)/);
    if (!m) return { chapter_count: null, chapter_total: null, is_complete: false };
    const cur = parseInt(m[1], 10);
    const tot = m[2] === "?" ? null : parseInt(m[2], 10);
    return {
      chapter_count: cur,
      chapter_total: tot,
      is_complete: tot !== null && cur === tot,
    };
  }, { chapter_count: null, chapter_total: null, is_complete: false });

  const date_published = safe(() => extractDdText(html, "published"), null);
  // `dd.status` only renders when a work has been updated since publication.
  const date_updated = safe(() => extractDdText(html, "status"), null) || date_published;

  const kudos = safe(() => parseIntSafe(extractDdText(html, "kudos")), null);
  const hits = safe(() => parseIntSafe(extractDdText(html, "hits")), null);
  const bookmarks_count = safe(() => parseIntSafe(extractDdText(html, "bookmarks")), null);
  const comments_count = safe(() => parseIntSafe(extractDdText(html, "comments")), null);

  // Sanity check: if AO3 ever changes their HTML structure, the regex
  // extractors will silently return empty fields rather than crashing.
  // Detect total scrape failure by looking at the three fields least likely
  // to legitimately be empty on a real work — every published work has a
  // title, a non-zero word count, and at least one fandom. If all three are
  // missing, something has gone structurally wrong (markup change, AO3
  // serving an error page, redirect to interstitial we didn't catch, etc.)
  // and we should fail loudly rather than store a row of empty fields.
  if ((!title || title === "Untitled") && !word_count && fandoms.length === 0) {
    throw new Error(
      `AO3 scrape returned no usable metadata for work ${ao3Id} — ` +
      `the page may have changed, be restricted, or be unreachable`
    );
  }

  return {
    title,
    authors,
    rating,
    warnings,
    categories,
    fandoms,
    relationships,
    characters,
    freeform_tags,
    summary,
    language,
    word_count,
    chapter_count,
    chapter_total,
    is_complete,
    date_published,
    date_updated,
    kudos,
    hits,
    bookmarks_count,
    comments_count,
  };
}

// A "stub" work is one the client posted with only an ao3_id and a
// placeholder title — i.e. the Add-by-URL flow. The bookmarklet/extension
// always send full metadata, so we only hydrate when needed.
function isStubWork(work: any): boolean {
  if (!work) return false;
  if (work.word_count) return false;
  if (Array.isArray(work.fandoms) && work.fandoms.length > 0) return false;
  return !work.title || work.title === "Loading..." || work.title === "Untitled";
}
// --- end AO3 scraper ------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;

    const { works, source = 'bookmarks', defaultStatus } = await req.json();

    if (!works || !Array.isArray(works) || works.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No works provided' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // --- SERVER-SIDE FIC CAP ENFORCEMENT ---
    // Check subscription tier and current fic count. Free users are capped
    // at 50 fics. Plus/beta users get unlimited. We check this server-side
    // so the limit can't be bypassed by calling the Edge Function directly
    // (e.g. via curl or a modified bookmarklet).

    const { data: prefs } = await supabaseAdmin
      .from('user_preferences')
      .select('subscription_tier')
      .eq('user_id', userId)
      .single();

    const tier = prefs?.subscription_tier || 'free';
    const isPremium = tier === 'plus' || tier === 'beta';

    let worksToImport = works;

    if (!isPremium) {
      // Count existing fics for this user
      const { count: currentFicCount } = await supabaseAdmin
        .from('reading_status')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);

      const currentCount = currentFicCount || 0;
      const remaining = Math.max(0, FREE_FIC_LIMIT - currentCount);

      if (remaining === 0) {
        return new Response(
          JSON.stringify({
            error: 'Free plan limit reached',
            message: `You've reached the ${FREE_FIC_LIMIT}-fic limit on the free plan. Upgrade to Plus for unlimited fics.`,
            imported: 0,
            skipped: works.length,
            total: works.length,
            limit: FREE_FIC_LIMIT,
            current: currentCount,
          }),
          { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      if (works.length > remaining) {
        // Truncate the batch to only fill remaining slots, rather than
        // rejecting the entire import. This way a user importing 30
        // bookmarks when they have 35 fics still gets 15 of them.
        worksToImport = works.slice(0, remaining);
      }
    }
    // --- END FIC CAP ENFORCEMENT ---

    let imported = 0;
    let skipped = 0;
    let errors: string[] = [];

    for (const work of worksToImport) {
      try {
        if (!work.ao3_id) {
          errors.push(`Missing ao3_id for work: ${work.title || 'unknown'}`);
          continue;
        }

        // If this is a stub from the Add-by-URL flow, scrape AO3 ourselves
        // and merge the result over whatever the client sent. We let the
        // client-supplied fields win when they exist (e.g. bookmark imports
        // pass `bookmarked_at` which AO3's work page can't give us).
        let workData = work;
        if (isStubWork(work)) {
          try {
            const meta = await fetchAo3Metadata(work.ao3_id);
            workData = { ...meta, ...work, title: meta.title, ao3_id: work.ao3_id };
          } catch (fetchErr) {
            errors.push(`Could not fetch AO3 metadata for ${work.ao3_id}: ${fetchErr.message}`);
            skipped++;
            continue;
          }
        }

        const { data: upsertedWork, error: workError } = await supabaseAdmin
          .from('works')
          .upsert({
            ao3_id: workData.ao3_id,
            title: workData.title || 'Untitled',
            authors: workData.authors || [],
            rating: workData.rating || null,
            warnings: workData.warnings || [],
            categories: workData.categories || [],
            fandoms: workData.fandoms || [],
            relationships: workData.relationships || [],
            characters: workData.characters || [],
            freeform_tags: workData.freeform_tags || [],
            summary: workData.summary || null,
            language: workData.language || 'English',
            word_count: workData.word_count || null,
            chapter_count: workData.chapter_count || null,
            chapter_total: workData.chapter_total || null,
            is_complete: workData.is_complete || false,
            date_published: workData.date_published || null,
            date_updated: workData.date_updated || null,
            kudos: workData.kudos || null,
            hits: workData.hits || null,
            bookmarks_count: workData.bookmarks_count || null,
            comments_count: workData.comments_count || null,
            source: source,
            ao3_bookmarked_at: workData.bookmarked_at || null,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'ao3_id',
          })
          .select('id')
          .single();

        if (workError) {
          errors.push(`Error upserting work ${work.ao3_id}: ${workError.message}`);
          continue;
        }

        // Determine the right status for newly-imported works.
        // For bookmark syncs we infer status from AO3 metadata:
        //   • Complete fic → 'completed'
        //   • Incomplete but updated within the last 2 years → 'reading'
        //   • Incomplete and NOT updated in 2+ years → 'author_abandoned'
        // The 2-year threshold is a pragmatic cutoff: most active fics get
        // at least one update within two years, so silence beyond that is a
        // strong signal the author has moved on.
        let statusForNew;
        if (defaultStatus) {
          statusForNew = defaultStatus;
        } else if (source === 'bookmarks') {
          if (workData.is_complete) {
            statusForNew = 'completed';
          } else {
            const twoYearsAgo = new Date();
            twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
            const lastUpdated = workData.date_updated ? new Date(workData.date_updated) : null;
            statusForNew = (lastUpdated && lastUpdated < twoYearsAgo)
              ? 'author_abandoned'
              : 'reading';
          }
        } else {
          statusForNew = 'to_read';
        }

        const statusRecord: any = {
          work_id: upsertedWork.id,
          user_id: userId,
          status: statusForNew,
        };
        if (statusForNew === 'completed') {
          statusRecord.completed_at = new Date().toISOString();
        }
        if (statusForNew === 'reading') {
          statusRecord.started_at = new Date().toISOString();
        }

        const { error: statusError } = await supabaseAdmin
          .from('reading_status')
          .upsert(statusRecord, {
            onConflict: 'work_id,user_id',
            ignoreDuplicates: false
          });

        if (statusError) {
          errors.push(`Error creating status for ${work.ao3_id}: ${statusError.message}`);
        }

        if (!workData.is_complete && upsertedWork) {
          await supabaseAdmin
            .from('wip_tracking')
            .upsert({
              work_id: upsertedWork.id,
              user_id: userId,
              last_known_chapters: workData.chapter_count || 1,
              last_checked_at: new Date().toISOString(),
            }, {
              onConflict: 'work_id,user_id',
            });
        }

        imported++;
      } catch (e) {
        errors.push(`Unexpected error for work ${work.ao3_id}: ${e.message}`);
        skipped++;
      }
    }

    // If we truncated the batch, report the ones we couldn't import as skipped
    const cappedSkips = works.length - worksToImport.length;

    return new Response(
      JSON.stringify({
        message: cappedSkips > 0
          ? `Import complete (${cappedSkips} skipped — free plan limit of ${FREE_FIC_LIMIT} fics)`
          : `Import complete`,
        imported,
        skipped: skipped + cappedSkips,
        total: works.length,
        limit: isPremium ? null : FREE_FIC_LIMIT,
        errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
