import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function createPrice() {
  try {
    const product = await stripe.products.create({
      name: 'Pro Plan',
      description: 'Track up to 15 competitors with all features',
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: 4900, // $49.00
      currency: 'usd',
      recurring: {
        interval: 'month',
      },
    });

    console.log('Created price:', price.id);
    return price.id;
  } catch (error) {
    console.error('Error creating price:', error);
    throw error;
  }
}

createPrice();
