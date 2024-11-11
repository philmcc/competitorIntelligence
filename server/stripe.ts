import Stripe from "stripe";
import { db } from "db";
import { users, subscriptions } from "db/schema";
import { eq } from "drizzle-orm";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-10-28.acacia"
});

const PLANS = {
  PRO: {
    name: "Pro Plan",
    priceId: "price_pro", // Replace with actual Stripe price ID
    features: ["Up to 15 competitors", "All research modules"]
  }
};

export async function createCustomer(userId: number, email: string) {
  const customer = await stripe.customers.create({ email });
  await db.update(users)
    .set({ stripeCustomerId: customer.id })
    .where(eq(users.id, userId));
  return customer;
}

export async function createSubscription(userId: number, priceId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  
  if (!user.stripeCustomerId) {
    throw new Error("User does not have a Stripe customer ID");
  }

  const subscription = await stripe.subscriptions.create({
    customer: user.stripeCustomerId,
    items: [{ price: priceId }],
    payment_behavior: 'default_incomplete',
    expand: ['latest_invoice.payment_intent'],
  });

  await db.insert(subscriptions).values({
    userId,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    planType: 'pro',
    currentPeriodStart: new Date(subscription.current_period_start * 1000),
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
  });

  return subscription;
}

export async function cancelSubscription(userId: number) {
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId));

  if (!subscription) {
    throw new Error("No active subscription found");
  }

  await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });

  await db.update(subscriptions)
    .set({ cancelAtPeriodEnd: true })
    .where(eq(subscriptions.userId, userId));
}

export async function handleWebhook(event: Stripe.Event) {
  switch (event.type) {
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.stripeCustomerId, subscription.customer as string));

      if (!user) return;

      await db.update(subscriptions)
        .set({
          status: subscription.status,
          currentPeriodStart: new Date(subscription.current_period_start * 1000),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        })
        .where(eq(subscriptions.userId, user.id));

      // Update user's plan based on subscription status
      await db.update(users)
        .set({
          plan: subscription.status === 'active' ? 'pro' : 'free'
        })
        .where(eq(users.id, user.id));
      break;
    }
  }
}
