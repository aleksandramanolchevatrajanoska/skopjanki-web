import type Stripe from "stripe";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { fromMinor, stripe } from "@/lib/stripe";
import { confirmPayment } from "@/lib/services/reservations";
import { nextMemberNumber } from "@/lib/services/users";

export const runtime = "nodejs";

function periodEnd(sub: Stripe.Subscription): Date | null {
  // Newer Stripe API versions keep the period on the subscription items.
  const s = sub as unknown as { current_period_end?: number; items?: { data?: { current_period_end?: number }[] } };
  const ts = s.current_period_end ?? s.items?.data?.[0]?.current_period_end;
  return ts ? new Date(ts * 1000) : null;
}

async function syncSubscription(sub: Stripe.Subscription) {
  const userId = sub.metadata?.userId;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId } })
    : await prisma.user.findUnique({ where: { stripeCustomerId: customerId } });
  if (!user) return;
  const active = ["active", "trialing", "past_due"].includes(sub.status);
  const end = periodEnd(sub);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      // A cancelled subscription stays valid until the end of the paid month.
      memberUntil: active ? end : end && end > new Date() ? end : user.memberUntil,
      memberNumber: user.memberNumber ?? (active ? await nextMemberNumber(prisma) : null),
    },
  });
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new NextResponse("Webhook not configured", { status: 500 });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new NextResponse("Bad signature", { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object;
      if (s.payment_status !== "paid") break;
      if (s.metadata?.type === "fusion") {
        const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null;
        await confirmPayment(prisma, s.id, pi, fromMinor(s.amount_total ?? 0));
      } else if (s.metadata?.type === "membership" && s.subscription) {
        const sub = await stripe().subscriptions.retrieve(typeof s.subscription === "string" ? s.subscription : s.subscription.id);
        await syncSubscription(sub);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object);
      break;
    case "invoice.paid": {
      const inv = event.data.object as unknown as { subscription?: string | { id: string }; parent?: { subscription_details?: { subscription?: string } } };
      const subId = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id ?? inv.parent?.subscription_details?.subscription;
      if (subId) await syncSubscription(await stripe().subscriptions.retrieve(subId));
      break;
    }
  }
  return NextResponse.json({ received: true });
}
