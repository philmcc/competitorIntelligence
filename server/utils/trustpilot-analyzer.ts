import { db } from '../../db';
import { competitors, trustpilotReviews } from '../db/schema';
import { eq } from 'drizzle-orm';
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import { sql, desc } from 'drizzle-orm';

export interface TrustpilotReviewData {
  reviewId: string;
  rating: number;
  title?: string;
  content: string;
  author: string;
  publishedAt: Date;
  reviewUrl: string;
}

export async function extractTrustpilotUrl(websiteUrl: string): Promise<string | null> {
  try {
    const response = await fetch(websiteUrl);
    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Look for Trustpilot links
    const trustpilotLinks = Array.from(document.querySelectorAll('a')).filter(link => {
      const href = link.getAttribute('href') || '';
      const text = link.textContent || '';
      return href.includes('trustpilot.com') || text.toLowerCase().includes('trustpilot');
    });

    if (trustpilotLinks.length > 0) {
      const trustpilotUrl = trustpilotLinks[0].getAttribute('href');
      if (trustpilotUrl?.startsWith('/')) {
        return `https://trustpilot.com${trustpilotUrl}`;
      }
      return trustpilotUrl || null;
    }

    // Try to construct Trustpilot URL from domain
    const domain = new URL(websiteUrl).hostname.replace('www.', '');
    return `https://trustpilot.com/review/${domain}`;
  } catch (error) {
    console.error('Error extracting Trustpilot URL:', error);
    return null;
  }
}

export async function analyzeTrustpilotReviews(competitorId: number, websiteUrl: string): Promise<{
  success: boolean;
  message?: string;
  reviews?: TrustpilotReviewData[];
  error?: any;
}> {
  try {
    const trustpilotUrl = await extractTrustpilotUrl(websiteUrl);
    if (!trustpilotUrl) {
      return {
        success: false,
        message: 'Could not find or construct Trustpilot URL',
      };
    }

    const response = await fetch(trustpilotUrl);
    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const reviews: TrustpilotReviewData[] = [];
    const reviewElements = document.querySelectorAll('[data-review-id]');

    for (const element of reviewElements) {
      const reviewId = element.getAttribute('data-review-id') || '';
      const ratingElement = element.querySelector('[data-rating]');
      const rating = parseFloat(ratingElement?.getAttribute('data-rating') || '0');
      const titleElement = element.querySelector('[data-title]');
      const contentElement = element.querySelector('[data-content]');
      const authorElement = element.querySelector('[data-author]');
      const dateElement = element.querySelector('[data-date]');

      if (!reviewId || !rating || !contentElement?.textContent || !authorElement?.textContent) {
        continue;
      }

      const review: TrustpilotReviewData = {
        reviewId,
        rating,
        title: titleElement?.textContent?.trim(),
        content: contentElement.textContent.trim(),
        author: authorElement.textContent.trim(),
        publishedAt: dateElement?.getAttribute('datetime') 
          ? new Date(dateElement.getAttribute('datetime')!) 
          : new Date(),
        reviewUrl: `${trustpilotUrl}#${reviewId}`,
      };

      reviews.push(review);

      // Store in database
      await db.insert(trustpilotReviews).values({
        competitorId,
        reviewId: review.reviewId,
        rating: review.rating,
        title: review.title,
        content: review.content,
        author: review.author,
        publishedAt: review.publishedAt,
        reviewUrl: review.reviewUrl,
      }).onConflictDoNothing();
    }

    return {
      success: true,
      reviews,
    };
  } catch (error) {
    console.error('Error analyzing Trustpilot reviews:', error);
    return {
      success: false,
      message: 'Failed to analyze Trustpilot reviews',
      error,
    };
  }
}

export async function getStoredTrustpilotReviews(competitorId: number) {
  return await db
    .select()
    .from(trustpilotReviews)
    .where(eq(trustpilotReviews.competitorId, competitorId))
    .orderBy(desc(trustpilotReviews.publishedAt));
}
