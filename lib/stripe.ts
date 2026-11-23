import Stripe from "stripe";
import type { Event, User } from "@prisma/client";
import { prisma } from "./db";
import { appUrl } from "./email";
import { AppError } from "./services/common";

let client: Stripe | null = null;
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new AppError("STRIPE_NOT_CONFIGURED");
  client ??= new Stripe(key);
  return client;
}

const currency = () => (process.env.STRIPE_CURRENCY ?? "mkd").toLowerCase();
// MKD is not a zero-decimal currency in Stripe: amounts are sent in deni (1 MKD = 100).
const toMinor = (mkd: number) => mkd * 100;
export const fromMinor = (minor: number) => Math.round(minor / 100);

/** Checkout for a held fusion seat. The seat is confirmed by the webhook, never by the redirect. */
export async function fusionCheckout(reservationId: string, event: Event, user: User, amount: number) {
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: user.stripeCustomerId ? undefined : user.email,
    customer: user.stripeCustomerId ?? undefined,
    line_items: [{ quantity: 1, price_data: { currency: currency(), unit_amount: toMinor(amount), product_data: { name: `Skopjanki · ${event.title}` } } }],
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    metadata: { type: "fusion", reservationId },
    success_url: appUrl(`/app/events/${event.id}?ok=paid`),
    cancel_url: appUrl(`/app/events/${event.id}`),
  });
  await prisma.reservation.update({ where: { id: reservationId }, data: { stripeSessionId: session.id } });
  return session.url!;
}

export async function membershipCheckout(user: User) {
  const price = process.env.STRIPE_MEMBERSHIP_PRICE_ID;
  if (!price) throw new AppError("STRIPE_NOT_CONFIGURED");
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: user.stripeCustomerId ?? undefined,
    customer_email: user.stripeCustomerId ? undefined : user.email,
    line_items: [{ price, quantity: 1 }],
    metadata: { type: "membership", userId: user.id },
    subscription_data: { metadata: { userId: user.id } },
    success_url: appUrl("/app/membership?ok=memberWelcome"),
    cancel_url: appUrl("/app/membership"),
  });
  return session.url!;
}

export async function billingPortal(user: User) {
  if (!user.stripeCustomerId) throw new AppError("STRIPE_NOT_CONFIGURED");
  const s = await stripe().billingPortal.sessions.create({ customer: user.stripeCustomerId, return_url: appUrl("/app/membership") });
  return s.url;
}

export async function refund(paymentIntentId: string, amount: number) {
  await stripe().refunds.create({ payment_intent: paymentIntentId, amount: toMinor(amount) });
}
