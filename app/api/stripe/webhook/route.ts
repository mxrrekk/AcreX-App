import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? "";
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function planFromSubscription(subscription: Stripe.Subscription) {
  const metadataPlan = subscription.metadata.plan;
  return metadataPlan === "business" ? "business" : metadataPlan === "pro" ? "pro" : "free";
}

export async function POST(request: Request) {
  if (!stripeSecretKey || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Stripe webhook is not fully configured." }, { status: 503 });
  }

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid Stripe webhook signature." }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const isActive = ["active", "trialing"].includes(subscription.status);

    await supabase
      .from("users")
      .update({
        plan: isActive ? planFromSubscription(subscription) : "free",
        subscription_status: subscription.status,
        subscription_source: "stripe",
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id
      })
      .eq("stripe_customer_id", customerId);
  }

  return NextResponse.json({ received: true });
}
