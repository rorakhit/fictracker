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

        const { data: upsertedWork, error: workError } = await supabaseAdmin
          .from('works')
          .upsert({
            ao3_id: work.ao3_id,
            title: work.title || 'Untitled',
            authors: work.authors || [],
            rating: work.rating || null,
            warnings: work.warnings || [],
            categories: work.categories || [],
            fandoms: work.fandoms || [],
            relationships: work.relationships || [],
            characters: work.characters || [],
            freeform_tags: work.freeform_tags || [],
            summary: work.summary || null,
            language: work.language || 'English',
            word_count: work.word_count || null,
            chapter_count: work.chapter_count || null,
            chapter_total: work.chapter_total || null,
            is_complete: work.is_complete || false,
            date_published: work.date_published || null,
            date_updated: work.date_updated || null,
            kudos: work.kudos || null,
            hits: work.hits || null,
            bookmarks_count: work.bookmarks_count || null,
            comments_count: work.comments_count || null,
            source: source,
            ao3_bookmarked_at: work.bookmarked_at || null,
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
          if (work.is_complete) {
            statusForNew = 'completed';
          } else {
            const twoYearsAgo = new Date();
            twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
            const lastUpdated = work.date_updated ? new Date(work.date_updated) : null;
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
            ignoreDuplicates: true
          });

        if (statusError) {
          errors.push(`Error creating status for ${work.ao3_id}: ${statusError.message}`);
        }

        if (!work.is_complete && upsertedWork) {
          await supabaseAdmin
            .from('wip_tracking')
            .upsert({
              work_id: upsertedWork.id,
              user_id: userId,
              last_known_chapters: work.chapter_count || 1,
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
