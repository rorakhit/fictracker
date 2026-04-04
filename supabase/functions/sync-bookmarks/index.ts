import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// Conservative: 5s between AO3 page requests
const PAGE_DELAY_MS = 5000;
// Supabase Edge Functions have a 150s wall clock limit.
// Reserve 10s for final DB writes and response.
const TIME_BUDGET_MS = 140000;

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── AO3 HTML Scraping ───────────────────────────────────────────────
// AO3 bookmarks page uses li.bookmark.blurb elements.
// Each contains work metadata in a structured HTML format.

function parseBookmarksPage(html: string): { works: any[], totalPages: number } {
  const works: any[] = [];

  // Extract total pages from pagination
  let totalPages = 1;
  const paginationMatch = html.match(/<ol[^>]*class="pagination[^"]*"[^>]*>[\s\S]*?<\/ol>/);
  if (paginationMatch) {
    // Find the last page number link
    const pageLinks = paginationMatch[0].matchAll(/<a[^>]*>\s*(\d+)\s*<\/a>/g);
    for (const m of pageLinks) {
      const num = parseInt(m[1]);
      if (num > totalPages) totalPages = num;
    }
  }

  // Parse each bookmark blurb
  // AO3 bookmark items: <li id="bookmark_123" class="bookmark blurb group" role="article">
  // Inside, the work link is in the heading: <h4 class="heading"><a href="/works/12345">Title</a></h4>
  const blurbRegex = /<li[^>]*class="bookmark[^"]*blurb[^"]*"[^>]*>[\s\S]*?<\/li>/g;
  let blurbMatch;
  while ((blurbMatch = blurbRegex.exec(html)) !== null) {
    const blurb = blurbMatch[0];
    try {
      const work = parseBlurb(blurb);
      if (work) works.push(work);
    } catch (e) {
      console.error('Error parsing blurb:', e);
    }
  }

  return { works, totalPages };
}

function parseBlurb(html: string): any | null {
  // Extract ao3_id from the work link in the heading
  const idMatch = html.match(/<h4[^>]*class="heading"[^>]*>[\s\S]*?<a href="\/works\/(\d+)"/);
  if (!idMatch) return null;
  const ao3_id = parseInt(idMatch[1]);

  // Title
  const titleMatch = html.match(/<h4[^>]*class="heading"[^>]*>[\s\S]*?<a href="\/works\/\d+">([^<]+)<\/a>/);
  const title = titleMatch ? titleMatch[1].trim() : 'Unknown';

  // Authors
  const authors: string[] = [];
  const authorRegex = /<a rel="author"[^>]*>([^<]+)<\/a>/g;
  let am;
  while ((am = authorRegex.exec(html)) !== null) authors.push(am[1].trim());

  // Fandoms
  const fandoms: string[] = [];
  const fandomSection = html.match(/<h5[^>]*class="fandoms[^"]*"[^>]*>[\s\S]*?<\/h5>/);
  if (fandomSection) {
    const fandomRegex = /<a[^>]*class="tag"[^>]*>([^<]+)<\/a>/g;
    let fm;
    while ((fm = fandomRegex.exec(fandomSection[0])) !== null) fandoms.push(fm[1].trim());
  }

  // Tags section — contains relationships, characters, freeform tags
  const relationships: string[] = [];
  const characters: string[] = [];
  const freeform_tags: string[] = [];

  const tagsSection = html.match(/<ul[^>]*class="tags[^"]*"[^>]*>[\s\S]*?<\/ul>/);
  if (tagsSection) {
    // Relationships: li class contains "relationships"
    const relRegex = /<li[^>]*class="[^"]*relationships[^"]*"[^>]*>[\s\S]*?<a[^>]*class="tag"[^>]*>([^<]+)<\/a>/g;
    let rm;
    while ((rm = relRegex.exec(tagsSection[0])) !== null) relationships.push(rm[1].trim());

    // Characters: li class contains "characters"
    const charRegex = /<li[^>]*class="[^"]*characters[^"]*"[^>]*>[\s\S]*?<a[^>]*class="tag"[^>]*>([^<]+)<\/a>/g;
    let cm;
    while ((cm = charRegex.exec(tagsSection[0])) !== null) characters.push(cm[1].trim());

    // Freeform: li class contains "freeforms"
    const ffRegex = /<li[^>]*class="[^"]*freeforms[^"]*"[^>]*>[\s\S]*?<a[^>]*class="tag"[^>]*>([^<]+)<\/a>/g;
    let ff;
    while ((ff = ffRegex.exec(tagsSection[0])) !== null) freeform_tags.push(ff[1].trim());
  }

  // Rating
  const ratingMatch = html.match(/<span[^>]*class="rating-[^"]*"[^>]*title="([^"]+)"/);
  const rating = ratingMatch ? ratingMatch[1] : null;

  // Warnings
  const warnings: string[] = [];
  const warnSpan = html.match(/<span[^>]*class="warnings"[^>]*title="([^"]+)"/);
  if (warnSpan) warnings.push(warnSpan[1]);

  // Categories
  const categories: string[] = [];
  const catSpan = html.match(/<span[^>]*class="category"[^>]*title="([^"]+)"/);
  if (catSpan) catSpan[1].split(', ').forEach((c: string) => categories.push(c.trim()));

  // Word count
  const wcMatch = html.match(/<dd[^>]*class="words"[^>]*>([\d,]+)<\/dd>/);
  const word_count = wcMatch ? parseInt(wcMatch[1].replace(/,/g, '')) : null;

  // Chapters
  let chapter_count = 1;
  let chapter_total: number | null = null;
  let is_complete = false;
  const chapMatch = html.match(/<dd[^>]*class="chapters"[^>]*>[\s\S]*?(\d+)\s*\/\s*(\d+|\?)/);
  if (chapMatch) {
    chapter_count = parseInt(chapMatch[1]);
    if (chapMatch[2] !== '?') {
      chapter_total = parseInt(chapMatch[2]);
      is_complete = chapter_count >= chapter_total;
    }
  }

  // Kudos
  const kudosMatch = html.match(/<dd[^>]*class="kudos"[^>]*>[\s\S]*?([\d,]+)/);
  const kudos = kudosMatch ? parseInt(kudosMatch[1].replace(/,/g, '')) : 0;

  // Hits
  const hitsMatch = html.match(/<dd[^>]*class="hits"[^>]*>([\d,]+)<\/dd>/);
  const hits = hitsMatch ? parseInt(hitsMatch[1].replace(/,/g, '')) : 0;

  // Bookmarks count
  const bmMatch = html.match(/<dd[^>]*class="bookmarks"[^>]*>[\s\S]*?([\d,]+)/);
  const bookmarks_count = bmMatch ? parseInt(bmMatch[1].replace(/,/g, '')) : 0;

  // Comments
  const commMatch = html.match(/<dd[^>]*class="comments"[^>]*>[\s\S]*?([\d,]+)/);
  const comments_count = commMatch ? parseInt(commMatch[1].replace(/,/g, '')) : 0;

  // Language
  const langMatch = html.match(/<dd[^>]*class="language"[^>]*>\s*([^<]+)/);
  const language = langMatch ? langMatch[1].trim() : 'English';

  // Summary
  const summaryMatch = html.match(/<blockquote[^>]*class="userstuff summary"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/blockquote>/);
  let summary = '';
  if (summaryMatch) {
    summary = summaryMatch[1].replace(/<[^>]*>/g, '').trim().substring(0, 2000);
  }

  // Date updated (AO3 shows this as dd.status in the stats dl for WIPs)
  // For complete works or single-chapter works, this may not be present.
  const dateUpdatedMatch = html.match(/<dd[^>]*class="status"[^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/dd>/);
  const date_updated = dateUpdatedMatch ? dateUpdatedMatch[1] : null;

  // Date published
  const datePubMatch = html.match(/<dd[^>]*class="published"[^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/dd>/);
  const date_published = datePubMatch ? datePubMatch[1] : null;

  return {
    ao3_id,
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
    kudos,
    hits,
    bookmarks_count,
    comments_count,
    date_updated,
    date_published,
  };
}

// ─── Status Logic ────────────────────────────────────────────────────
// Determine the right reading status for an imported bookmark:
//   • Complete fic → 'completed'
//   • Incomplete but updated within the last 2 years → 'reading'
//   • Incomplete and NOT updated in 2+ years → 'author_abandoned'

function determineStatus(work: any): string {
  if (work.is_complete) return 'completed';

  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const lastUpdated = work.date_updated ? new Date(work.date_updated) : null;

  if (lastUpdated && lastUpdated < twoYearsAgo) return 'author_abandoned';
  return 'reading';
}

// ─── Main Handler ────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Auth: manual getUser() (verify_jwt is off for extension/bookmarklet compat)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Service role client for DB operations
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get user's AO3 username
    const { data: prefs } = await db
      .from('user_preferences')
      .select('ao3_username, subscription_tier')
      .eq('user_id', user.id)
      .single();

    if (!prefs?.ao3_username) {
      return new Response(JSON.stringify({ error: 'No AO3 username set. Please add your AO3 username in Settings.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const ao3Username = prefs.ao3_username;

    // Check for existing running job
    const { data: existingJobs } = await db
      .from('import_jobs')
      .select('id, status, current_page')
      .eq('user_id', user.id)
      .eq('job_type', 'bookmarks')
      .in('status', ['queued', 'running'])
      .limit(1);

    let jobId: string;
    let startPage = 1;

    if (existingJobs && existingJobs.length > 0) {
      // Resume existing job
      jobId = existingJobs[0].id;
      startPage = (existingJobs[0].current_page || 0) + 1;
      await db.from('import_jobs').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', jobId);
    } else {
      // Create new job
      const { data: newJob } = await db.from('import_jobs').insert({
        user_id: user.id,
        job_type: 'bookmarks',
        ao3_username: ao3Username,
        status: 'running',
        started_at: new Date().toISOString(),
      }).select('id').single();
      jobId = newJob!.id;
    }

    let totalPages: number | null = null;
    let totalImported = 0;
    let totalSkipped = 0;
    let wipUpdatesFound = 0;
    let currentPage = startPage;
    let timedOut = false;

    // Scrape pages within time budget
    while (true) {
      // Check time budget
      if (Date.now() - startTime > TIME_BUDGET_MS) {
        timedOut = true;
        break;
      }

      const url = `https://archiveofourown.org/users/${encodeURIComponent(ao3Username)}/bookmarks?page=${currentPage}`;
      console.log(`Fetching page ${currentPage}: ${url}`);

      let response: Response;
      try {
        response = await fetch(url, {
          headers: {
            'User-Agent': 'FicTracker/1.0 (fanfiction reading tracker; contact: ro.rakhit@gmail.com)',
          },
        });
      } catch (fetchErr) {
        console.error(`Fetch error on page ${currentPage}:`, fetchErr);
        // Update job with error and break
        await db.from('import_jobs').update({
          status: 'failed',
          error_message: `Failed to fetch page ${currentPage}: ${fetchErr.message}`,
          current_page: currentPage,
          completed_at: new Date().toISOString(),
        }).eq('id', jobId);
        return new Response(JSON.stringify({
          error: `Failed to fetch AO3 page ${currentPage}`,
          job_id: jobId,
        }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (response.status === 429) {
        // Rate limited — save progress and return
        await db.from('import_jobs').update({
          status: 'partial',
          current_page: currentPage - 1,
          works_imported: totalImported,
          works_skipped: totalSkipped,
          wip_updates_found: wipUpdatesFound,
          total_pages: totalPages,
          error_message: `Rate limited by AO3 on page ${currentPage}. Resume in a few minutes.`,
        }).eq('id', jobId);
        return new Response(JSON.stringify({
          status: 'partial',
          message: `Rate limited by AO3 on page ${currentPage}. You can resume in a few minutes.`,
          job_id: jobId,
          imported: totalImported,
          skipped: totalSkipped,
          current_page: currentPage - 1,
          total_pages: totalPages,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (response.status === 404) {
        await db.from('import_jobs').update({
          status: 'failed',
          error_message: `AO3 user '${ao3Username}' not found or bookmarks are private.`,
          completed_at: new Date().toISOString(),
        }).eq('id', jobId);
        return new Response(JSON.stringify({
          error: `AO3 user '${ao3Username}' not found or bookmarks are private.`,
          job_id: jobId,
        }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (!response.ok) {
        console.error(`AO3 returned ${response.status} for page ${currentPage}`);
        break;
      }

      const html = await response.text();
      const { works: pageWorks, totalPages: tp } = parseBookmarksPage(html);

      if (totalPages === null) {
        totalPages = tp;
        await db.from('import_jobs').update({ total_pages: totalPages }).eq('id', jobId);
      }

      // Import works in batch
      for (const work of pageWorks) {
        try {
          // Upsert into works table (shared metadata cache)
          const { data: upsertedWork, error: workError } = await db
            .from('works')
            .upsert({
              ao3_id: work.ao3_id,
              title: work.title,
              authors: work.authors,
              rating: work.rating,
              warnings: work.warnings,
              categories: work.categories,
              fandoms: work.fandoms,
              relationships: work.relationships,
              characters: work.characters,
              freeform_tags: work.freeform_tags,
              summary: work.summary,
              language: work.language,
              word_count: work.word_count,
              chapter_count: work.chapter_count,
              chapter_total: work.chapter_total,
              is_complete: work.is_complete,
              kudos: work.kudos,
              hits: work.hits,
              bookmarks_count: work.bookmarks_count,
              comments_count: work.comments_count,
              date_updated: work.date_updated,
              date_published: work.date_published,
              source: 'bookmarks',
              updated_at: new Date().toISOString(),
            }, { onConflict: 'ao3_id' })
            .select('id, chapter_count, is_complete')
            .single();

          if (workError) {
            console.error(`Work upsert error for ao3_id ${work.ao3_id}:`, workError);
            totalSkipped++;
            continue;
          }

          // Determine status: completed / reading / author_abandoned
          const statusForWork = determineStatus(work);

          const statusRecord: any = {
            work_id: upsertedWork.id,
            user_id: user.id,
            status: statusForWork,
            updated_at: new Date().toISOString(),
          };
          if (statusForWork === 'completed') {
            statusRecord.completed_at = new Date().toISOString();
          }
          if (statusForWork === 'reading') {
            statusRecord.started_at = new Date().toISOString();
          }

          // ignoreDuplicates: false so re-imports overwrite existing statuses
          const { error: statusError } = await db
            .from('reading_status')
            .upsert(statusRecord, {
              onConflict: 'work_id,user_id',
              ignoreDuplicates: false,
            });

          if (statusError) {
            console.error(`Status upsert error:`, statusError);
          }

          // WIP tracking: upsert into wip_tracking for incomplete works
          // This gives us bulk WIP data for free while importing
          if (!work.is_complete && work.chapter_count) {
            const { data: existingWip } = await db
              .from('wip_tracking')
              .select('id, last_known_chapters')
              .eq('work_id', upsertedWork.id)
              .eq('user_id', user.id)
              .single();

            if (existingWip) {
              // Check if chapters increased
              if (existingWip.last_known_chapters && work.chapter_count > existingWip.last_known_chapters) {
                await db.from('wip_tracking').update({
                  has_update: true,
                  updated_chapter_count: work.chapter_count,
                  last_checked_at: new Date().toISOString(),
                }).eq('id', existingWip.id);
                wipUpdatesFound++;
              } else {
                // Just update last_checked_at
                await db.from('wip_tracking').update({
                  last_checked_at: new Date().toISOString(),
                }).eq('id', existingWip.id);
              }
            } else {
              // Create new WIP tracking entry
              await db.from('wip_tracking').upsert({
                work_id: upsertedWork.id,
                user_id: user.id,
                last_known_chapters: work.chapter_count,
                last_checked_at: new Date().toISOString(),
                notify_on_update: true,
              }, { onConflict: 'work_id,user_id', ignoreDuplicates: true });
            }
          }

          totalImported++;
        } catch (e) {
          console.error(`Error processing work:`, e);
          totalSkipped++;
        }
      }

      // Update job progress
      await db.from('import_jobs').update({
        current_page: currentPage,
        works_imported: totalImported,
        works_skipped: totalSkipped,
        wip_updates_found: wipUpdatesFound,
      }).eq('id', jobId);

      // Check if we've done all pages
      if (currentPage >= (totalPages || 1)) {
        break;
      }

      currentPage++;

      // Respectful delay between pages
      await delay(PAGE_DELAY_MS);
    }

    // Finalize job
    const finalStatus = timedOut ? 'partial' : 'completed';
    const errorMsg = timedOut
      ? `Processed pages ${startPage}-${currentPage} of ${totalPages || '?'}. Resume to continue.`
      : null;

    await db.from('import_jobs').update({
      status: finalStatus,
      current_page: currentPage,
      works_imported: totalImported,
      works_skipped: totalSkipped,
      wip_updates_found: wipUpdatesFound,
      total_pages: totalPages,
      error_message: errorMsg,
      completed_at: finalStatus === 'completed' ? new Date().toISOString() : null,
    }).eq('id', jobId);

    return new Response(JSON.stringify({
      status: finalStatus,
      job_id: jobId,
      imported: totalImported,
      skipped: totalSkipped,
      wip_updates: wipUpdatesFound,
      current_page: currentPage,
      total_pages: totalPages,
      timed_out: timedOut,
      message: timedOut
        ? `Imported ${totalImported} fics (pages ${startPage}-${currentPage} of ${totalPages}). Click again to continue.`
        : `Import complete! ${totalImported} fics imported${totalSkipped > 0 ? `, ${totalSkipped} skipped` : ''}.${wipUpdatesFound > 0 ? ` Found ${wipUpdatesFound} WIP updates!` : ''}`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('sync-bookmarks error:', e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
