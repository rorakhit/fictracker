// Vercel Serverless Function: handles Stripe webhook events.
//
// Why Vercel instead of Supabase Edge Function:
// Ro chose Vercel so the webhook lives in the Git repo and auto-deploys
// with the frontend. The tradeoff is backend logic split across two
// platforms, but for a single function it's manageable.
//
// Events handled:
// - checkout.session.completed: User just paid → create subscription row, upgrade tier
// - invoice.paid: Recurring payment succeeded → extend subscription period
// - customer.subscription.updated: Plan change, cancel scheduled, etc.
// - customer.subscription.deleted: Subscription ended → downgrade to free

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Service role client bypasses RLS — needed because webhook requests
// aren't authenticated as a user. This is the standard pattern for
// server-to-server writes in Supabase.
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://nivqfnrkpuoyjtugavtj.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Vercel doesn't parse the body for us when we need the raw buffer
// for Stripe signature verification. This config tells Vercel to
// pass the raw body through.
export const config = {
  api: { bodyParser: false },
};

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// Update user_preferences.subscription_tier — this is what the app
// actually reads to determine premium status. The subscriptions table
// has the full Stripe details; this field is the denormalized "fast read."
async function updateUserTier(userId, tier) {
  const { error } = await supabase
    .from('user_preferences')
    .update({ subscription_tier: tier })
    .eq('user_id', userId);
  if (error) console.error('Failed to update user tier:', error);
}

async function handleCheckoutCompleted(session) {
  const userId = session.metadata?.supabase_user_id;
  if (!userId) {
    console.error('No supabase_user_id in session metadata');
    return;
  }

  // Retrieve the full subscription to get period dates and price info
  const subscription = await stripe.subscriptions.retrieve(session.subscription);
  const priceId = subscription.items.data[0]?.price?.id;
  const interval = subscription.items.data[0]?.price?.recurring?.interval; // 'month' or 'year'

  // Upsert subscription row
  const { error } = await supabase
    .from('subscriptions')
    .upsert({
      user_id: userId,
      stripe_customer_id: session.customer,
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
      plan_interval: interval || 'month',
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'stripe_subscription_id',
    });

  if (error) console.error('Failed to upsert subscription:', error);

  // Upgrade the user to Plus
  await updateUserTier(userId, 'plus');
}

async function handleSubscriptionUpdated(subscription) {
  const userId = subscription.metadata?.supabase_user_id;
  if (!userId) {
    // Try to look up user by stripe_customer_id
    const { data } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', subscription.customer)
      .limit(1)
      .single();
    if (!data) {
      console.error('Cannot find user for subscription:', subscription.id);
      return;
    }
    return handleSubscriptionUpdatedForUser(data.user_id, subscription);
  }
  return handleSubscriptionUpdatedForUser(userId, subscription);
}

async function handleSubscriptionUpdatedForUser(userId, subscription) {
  const priceId = subscription.items.data[0]?.price?.id;
  const interval = subscription.items.data[0]?.price?.recurring?.interval;

  const { error } = await supabase
    .from('subscriptions')
    .upsert({
      user_id: userId,
      stripe_customer_id: subscription.customer,
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
      plan_interval: interval || 'month',
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'stripe_subscription_id',
    });

  if (error) console.error('Failed to update subscription:', error);

  // If subscription is active or trialing, user is Plus. Otherwise, free.
  const activeTier = ['active', 'trialing'].includes(subscription.status) ? 'plus' : 'free';
  await updateUserTier(userId, activeTier);
}

async function handleSubscriptionDeleted(subscription) {
  // Look up user from our subscriptions table
  const { data } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_subscription_id', subscription.id)
    .single();

  if (data) {
    // Mark subscription as canceled in our table
    await supabase
      .from('subscriptions')
      .update({
        status: 'canceled',
        canceled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_subscription_id', subscription.id);

    // Check if user has any OTHER active subscriptions before downgrading
    const { data: activeSubs } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('user_id', data.user_id)
      .in('status', ['active', 'trialing']);

    if (!activeSubs || activeSubs.length === 0) {
      // Don't downgrade beta users — they bypass Stripe entirely
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('subscription_tier')
        .eq('user_id', data.user_id)
        .single();

      if (prefs?.subscription_tier !== 'beta') {
        await updateUserTier(data.user_id, 'free');
      }
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      case 'invoice.paid':
        // invoice.paid fires on every successful payment (initial + renewals).
        // The subscription.updated event handles the period extension,
        // so we just ensure the tier stays plus.
        if (event.data.object.subscription) {
          const sub = await stripe.subscriptions.retrieve(event.data.object.subscription);
          await handleSubscriptionUpdated(sub);
        }
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`Error handling ${event.type}:`, err);
    // Return 200 anyway — Stripe will retry on 5xx, and we don't want
    // retries for bugs in our handler (they'd just fail again).
    // Log the error for debugging.
  }

  return res.status(200).json({ received: true });
}
