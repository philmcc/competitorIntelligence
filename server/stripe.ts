import Stripe from "stripe";
import { db } from "db";
import { users, subscriptions } from "db/schema";
import { eq } from "drizzle-orm";
import { APIError } from "./errors";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-10-28.acacia"
});

const PLANS = {
  PRO: {
    name: "Pro Plan",
    priceId: "price_1OqXYRKJ8HgDX4Y6bG7pN3Dq",
    features: ["Up to 15 competitors", "All research modules"]
  }
};

export async function createCustomer(userId: number, email: string) {
  try {
    const customer = await stripe.customers.create({ email });
    await db.update(users)
      .set({ stripeCustomerId: customer.id })
      .where(eq(users.id, userId));
    return customer;
  } catch (error) {
    console.error('Stripe customer creation error:', error);
    if (error instanceof Stripe.errors.StripeError) {
      throw new APIError(error.statusCode || 500, error.message);
    }
    throw new APIError(500, "Failed to create customer");
  }
}

export async function createSubscription(userId: number, priceId: string) {
  try {
    // Validate price ID format
    if (!priceId.startsWith('price_')) {
      throw new APIError(400, "Invalid price ID format");
    }

    // Validate price ID matches our plans
    if (!Object.values(PLANS).some(plan => plan.priceId === priceId)) {
      throw new APIError(400, "Invalid price ID");
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    
    if (!user) {
      throw new APIError(404, "User not found");
    }

    let customerId = user.stripeCustomerId;
    
    if (!customerId) {
      const customer = await createCustomer(userId, user.email);
      customerId = customer.id;
    }

    // Verify price exists in Stripe
    try {
      await stripe.prices.retrieve(priceId);
    } catch (error) {
      console.error('Price verification error:', error);
      throw new APIError(400, "Invalid price ID - not found in Stripe");
    }

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        payment_method_types: ['card'],
        save_default_payment_method: 'on_subscription'
      },
      expand: ['latest_invoice.payment_intent']
    });

    await db.insert(subscriptions).values({
      userId,
      stripeSubscriptionId: subscription.id,
      status: subscription.status,
      planType: 'pro',
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    });

    const invoice = subscription.latest_invoice as Stripe.Invoice;
    const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;

    return {
      subscriptionId: subscription.id,
      clientSecret: paymentIntent.client_secret
    };
  } catch (error) {
    console.error('Stripe subscription error details:', error);
    if (error instanceof Stripe.errors.StripeError) {
      throw new APIError(error.statusCode || 500, error.message);
    }
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, "Failed to create subscription");
  }
}

export async function cancelSubscription(userId: number) {
  try {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId));

    if (!subscription) {
      throw new APIError(404, "No active subscription found");
    }

    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true
    });

    await db.update(subscriptions)
      .set({ cancelAtPeriodEnd: true })
      .where(eq(subscriptions.userId, userId));

    await db.update(users)
      .set({ plan: 'free' })
      .where(eq(users.id, userId));

    return { message: "Subscription cancelled successfully" };
  } catch (error) {
    console.error('Stripe cancellation error details:', error);
    if (error instanceof Stripe.errors.StripeError) {
      throw new APIError(error.statusCode || 500, error.message);
    }
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, "Failed to cancel subscription");
  }
}
