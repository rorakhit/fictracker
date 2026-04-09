import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_AI_RECS_PER_DAY = 3;
const NUM_SEARCHES = 7;

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function scrapeSearchResults(html: string): any[] {
  const works: any[] = [];
  const workBlocks = html.split(/class="work blurb group"/).slice(1);

  for (const block of workBlocks.slice(0, 6)) {
    try {
      const idMatch = block.match(/id="work_(\d+)"/) || block.match(/\/works\/(\d+)/);
      if (!idMatch) continue;
      const ao3_id = parseInt(idMatch[1]);

      const titleMatch = block.match(/<a href="\/works\/\d+">([^<]+)<\/a>/);
      const title = titleMatch ? titleMatch[1].trim() : "Unknown";

      const authorMatches = [...block.matchAll(/<a rel="author"[^>]*>([^<]+)<\/a>/g)];
      const authors = authorMatches.map(m => m[1].trim());

      const fandomSection = block.match(/class="fandoms heading">(.*?)<\/h5>/s);
      const fandoms: string[] = [];
      if (fandomSection) {
        const links = [...fandomSection[1].matchAll(/<a[^>]*class="tag"[^>]*>([^<]+)<\/a>/g)];
        fandoms.push(...links.map(m => m[1].trim()));
      }

      const relSection = block.match(/class="relationships">(.*?)(?:<\/li>|<li class="(?!relationships))/s);
      const relationships: string[] = [];
      if (relSection) {
        const links = [...relSection[1].matchAll(/<a[^>]*class="tag"[^>]*>([^<]+)<\/a>/g)];
        relationships.push(...links.map(m => m[1].trim()));
      }

      const wcMatch = block.match(/class="words">(\S+)</);
      const word_count = wcMatch ? parseInt(wcMatch[1].replace(/,/g, "")) : null;

      const kudosMatch = block.match(/class="kudos">\s*<a[^>]*>(\S+)<\/a>/);
      const kudos = kudosMatch ? parseInt(kudosMatch[1].replace(/,/g, "")) : null;

      const chapMatch = block.match(/class="chapters">\s*(?:<a[^>]*>)?(\d+)\/(\d+|\?)/s);
      let is_complete: boolean | null = null;
      if (chapMatch) is_complete = chapMatch[2] !== "?" && chapMatch[1] === chapMatch[2];

      const summaryMatch = block.match(/class="userstuff summary"[^>]*>\s*<p>([^]*?)<\/p>/s);
      const summary = summaryMatch
        ? summaryMatch[1].replace(/<[^>]*>/g, "").trim().slice(0, 300)
        : null;

      works.push({ ao3_id, title, authors, fandoms, relationships, word_count, kudos, is_complete, summary });
    } catch (e) { /* skip */ }
  }
  return works;
}

async function fetchAo3Search(query: any): Promise<{ works: any[]; query: any }> {
  const params = new URLSearchParams();
  if (query.fandom) params.set("work_search[fandom_names]", query.fandom);
  if (query.relationship) params.set("work_search[relationship_names]", query.relationship);
  params.set("work_search[sort_column]", "kudos_count");
  params.set("work_search[sort_direction]", "desc");
  params.set("commit", "Search");
  const url = `https://archiveofourown.org/works/search?${params.toString()}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "FicTracker/1.0 (rec-engine)", "Accept": "text/html" },
      redirect: "follow",
    });
    if (!res.ok) return { works: [], query };
    const html = await res.text();
    return { works: scrapeSearchResults(html), query };
  } catch (e) {
    console.error("AO3 search error:", e);
    return { works: [], query };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) return jsonResponse({ error: "ANTHROPIC_API_KEY not configured" }, 500);

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return jsonResponse({ error: "Unauthorized" }, 401);

  try {
    // Subscription + rate limit
    const { data: prefs } = await supabaseAdmin
      .from("user_preferences")
      .select("subscription_tier, ai_recs_timestamps")
      .eq("user_id", user.id)
      .maybeSingle();
    const tier = prefs?.subscription_tier || "free";
    if (tier !== "plus" && tier !== "beta") {
      return jsonResponse({ error: "AI recommendations require a Plus subscription" }, 403);
    }

    const now = new Date();
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const timestamps: string[] = (prefs?.ai_recs_timestamps || [])
      .filter((ts: string) => new Date(ts) > cutoff);

    if (timestamps.length >= MAX_AI_RECS_PER_DAY) {
      const oldest = new Date(timestamps.sort()[0]);
      const resetsAt = new Date(oldest.getTime() + 24 * 60 * 60 * 1000);
      return jsonResponse({
        error: `You've used all ${MAX_AI_RECS_PER_DAY} AI picks for today. Resets at ${resetsAt.toLocaleTimeString()}.`,
        rate_limit: { used: timestamps.length, max: MAX_AI_RECS_PER_DAY, remaining: 0, resets_at: resetsAt.toISOString() },
        recommendations: [],
      }, 429);
    }

    const updatedTimestamps = [...timestamps, now.toISOString()];
    await supabaseAdmin.from("user_preferences")
      .update({ ai_recs_timestamps: updatedTimestamps })
      .eq("user_id", user.id);

    // Get rated works
    const { data: ratedRows } = await supabaseAdmin
      .from("reading_status")
      .select("rating_personal, work:works(title, authors, fandoms, relationships, freeform_tags)")
      .eq("user_id", user.id)
      .gte("rating_personal", 4);

    if (!ratedRows || ratedRows.length < 2) {
      return jsonResponse({ error: "Need at least 2 highly-rated fics", recommendations: [] });
    }

    // Library exclusion
    const { data: allStatuses } = await supabaseAdmin
      .from("reading_status")
      .select("work_id, work:works(ao3_id)")
      .eq("user_id", user.id);
    const libraryAo3Ids = new Set((allStatuses || []).map((s: any) => s.work?.ao3_id).filter(Boolean));

    const tasteData = (ratedRows || []).map((r: any) => ({
      title: r.work?.title,
      authors: r.work?.authors,
      fandoms: r.work?.fandoms,
      relationships: r.work?.relationships,
      rating: r.rating_personal,
    })).filter((w: any) => w.title);

    const userFandoms = [...new Set(tasteData.flatMap((w: any) => w.fandoms || []))];

    // ---- STEP 1: Claude generates 7 search strategies ----
    const prompt = `You are a fanfiction taste analyst for AO3. Analyze this reader's rated fics and generate exactly 7 search strategies.

Rated fics (${tasteData.length} works, 4-5 stars):
${JSON.stringify(tasteData, null, 2)}

Generate exactly 7 strategies using EXACT AO3 canonical tag names:

- Strategy 1-2: CORE — Their proven fandoms/ships with fresh angles they haven't explored yet
- Strategy 3-4: ADJACENT — Fandoms or ships they haven't read but that share DNA with what they love (similar dynamics, themes, or tone in a different universe)
- Strategy 5-7: WILDCARD — Fandoms and ships the reader has probably NEVER encountered. Think:
  • A K-drama fandom if they read Western media, or vice versa
  • A book/podcast/game fandom with the same emotional core
  • A rarepair or small fandom that punches above its weight in quality
  • An older fandom with a deep back-catalog of classics
  The goal is genuine discovery — introduce them to corners of AO3 they'd never find on their own.

The reader's current fandoms are: ${userFandoms.join(", ")}. Wildcards MUST be from DIFFERENT fandoms than these.

Return ONLY a JSON array:
[
  {
    "fandom": "Exact AO3 Fandom Tag",
    "relationship": "Character A/Character B" or null,
    "category": "core" | "adjacent" | "wildcard",
    "reason": "Why this matches their taste — be specific about the connection"
  }
]`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeRes.ok) return jsonResponse({ error: "AI service temporarily unavailable" }, 502);
    const claudeData = await claudeRes.json();
    const responseText = claudeData.content?.[0]?.text || "";

    let searchQueries: any[] = [];
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) searchQueries = JSON.parse(jsonMatch[0]);
    } catch (e) {
      return jsonResponse({ error: "Failed to parse AI response" }, 500);
    }

    // ---- STEP 2: Fire ALL AO3 searches in parallel ----
    const ao3Promises = searchQueries.slice(0, NUM_SEARCHES).map(q => fetchAo3Search(q));
    const ao3Results = await Promise.allSettled(ao3Promises);

    // ---- STEP 3: Collect, dedupe, filter, rank ----
    const allResults: any[] = [];
    const seenAo3Ids = new Set<number>();

    for (const result of ao3Results) {
      if (result.status !== "fulfilled") continue;
      const { works, query } = result.value;

      for (const work of works) {
        if (seenAo3Ids.has(work.ao3_id)) continue;
        if (libraryAo3Ids.has(work.ao3_id)) continue;
        seenAo3Ids.add(work.ao3_id);

        allResults.push({
          verified: true,
          ai_reason: query.reason,
          category: query.category || "core",
          ao3_id: work.ao3_id,
          title: work.title,
          authors: work.authors,
          fandoms: work.fandoms,
          relationships: work.relationships,
          word_count: work.word_count,
          kudos: work.kudos,
          is_complete: work.is_complete,
          summary: work.summary,
          work_id: null,
          ao3_url: `https://archiveofourown.org/works/${work.ao3_id}`,
        });
      }
    }

    // Interleave categories
    const byCategory: Record<string, any[]> = { core: [], adjacent: [], wildcard: [] };
    for (const r of allResults) {
      const cat = r.category || "core";
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(r);
    }
    for (const cat of Object.keys(byCategory)) {
      byCategory[cat].sort((a: any, b: any) => (b.kudos || 0) - (a.kudos || 0));
    }

    const interleaved: any[] = [];
    const maxPerCat = { core: 4, adjacent: 4, wildcard: 6 };
    const counts: Record<string, number> = { core: 0, adjacent: 0, wildcard: 0 };
    const catOrder = ["wildcard", "core", "adjacent", "wildcard", "adjacent", "core", "wildcard"];
    for (const cat of catOrder) {
      const max = maxPerCat[cat as keyof typeof maxPerCat] || 4;
      if (counts[cat] < max && byCategory[cat]?.length > counts[cat]) {
        interleaved.push(byCategory[cat][counts[cat]]);
        counts[cat]++;
      }
    }
    for (const cat of ["wildcard", "adjacent", "core"]) {
      const max = maxPerCat[cat as keyof typeof maxPerCat] || 4;
      while (counts[cat] < max && byCategory[cat]?.length > counts[cat]) {
        if (interleaved.length >= 14) break;
        interleaved.push(byCategory[cat][counts[cat]]);
        counts[cat]++;
      }
    }

    // Build AO3 search links
    const ao3SearchLinks = searchQueries.slice(0, NUM_SEARCHES).map((q: any) => {
      const params = new URLSearchParams();
      if (q.fandom) params.set("work_search[fandom_names]", q.fandom);
      if (q.relationship) params.set("work_search[relationship_names]", q.relationship);
      params.set("work_search[sort_column]", "kudos_count");
      params.set("work_search[sort_direction]", "desc");
      params.set("commit", "Search");
      return {
        reason: q.reason,
        fandom: q.fandom,
        relationship: q.relationship,
        category: q.category || "core",
        url: `https://archiveofourown.org/works/search?${params.toString()}`,
      };
    });

    const remaining = MAX_AI_RECS_PER_DAY - updatedTimestamps.length;

    return jsonResponse({
      recommendations: interleaved,
      ao3_search_links: ao3SearchLinks,
      rate_limit: { used: updatedTimestamps.length, max: MAX_AI_RECS_PER_DAY, remaining },
      taste_summary: {
        top_fandoms: [...new Set(tasteData.flatMap((w: any) => w.fandoms || []))].slice(0, 5),
        top_ships: [...new Set(tasteData.flatMap((w: any) => w.relationships || []))].slice(0, 5),
        fics_analyzed: tasteData.length,
      },
    });
  } catch (e: any) {
    console.error("AI recommendations error:", e);
    return jsonResponse({ error: e.message || "Internal error" }, 500);
  }
});
