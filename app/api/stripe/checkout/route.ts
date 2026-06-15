import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? "";
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
const priceIds = {
  pro: process.env.STRIPE_PRO_PRICE_ID ?? "",
  business: process.env.STRIPE_BUSINESS_PRICE_ID ?? ""
};

export async function POST(request: Request) {
  if (!stripeSecretKey) {
    return NextResponse.json({ error: "Stripe checkout is not configured yet." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as { plan?: "pro" | "business" };
  const plan = body.plan === "business" ? "business" : "pro";
  const price = priceIds[plan];

  if (!price) {
    return NextResponse.json({ error: `Stripe price ID for ${plan} is not configured yet.` }, { status: 503 });
  }

  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Log in before starting checkout." }, { status: 401 });
  }

  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });
  const { data: profile } = await supabase
    .from("users")
    .select("stripe_customer_id,email")
    .eq("id", user.id)
    .single();

  let customerId = profile?.stripe_customer_id as string | null | undefined;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? profile?.email ?? undefined,
      metadata: { acrex_user_id: user.id }
    });
    customerId = customer.id;
    await supabase
      .from("users")
      .update({ stripe_customer_id: customerId, subscription_source: "stripe" })
      .eq("id", user.id);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    success_url: `${appUrl}/dashboard?billing=success`,
    cancel_url: `${appUrl}/dashboard?billing=cancelled`,
    metadata: {
      acrex_user_id: user.id,
      plan
    },
    subscription_data: {
      metadata: {
        acrex_user_id: user.id,
        plan
      }
    }
  });

  return NextResponse.json({ url: session.url });
}
