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

import { logger } from './logger';

export async function extractTrustpilotUrl(websiteUrl: string): Promise<string | null> {
  try {
    if (!websiteUrl) {
      logger.error('No website URL provided for Trustpilot extraction', { 
        context: 'extractTrustpilotUrl' 
      });
      return null;
    }

    let url: URL;
    try {
      url = new URL(websiteUrl);
    } catch (urlError) {
      logger.error('Invalid website URL format', { 
        websiteUrl,
        error: urlError,
        context: 'extractTrustpilotUrl'
      });
      return null;
    }

    logger.info('Attempting to extract Trustpilot URL', { 
      websiteUrl,
      context: 'extractTrustpilotUrl'
    });

    try {
      const response = await fetch(websiteUrl);
      if (!response.ok) {
        logger.error('Failed to fetch website', { 
          status: response.status,
          statusText: response.statusText,
          websiteUrl,
          context: 'extractTrustpilotUrl'
        });
        return null;
      }

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
        logger.info('Found Trustpilot links in webpage', {
          count: trustpilotLinks.length,
          context: 'extractTrustpilotUrl'
        });

        const trustpilotUrl = trustpilotLinks[0].getAttribute('href');
        if (trustpilotUrl?.startsWith('/')) {
          return `https://trustpilot.com${trustpilotUrl}`;
        }
        if (trustpilotUrl && (trustpilotUrl.startsWith('http://') || trustpilotUrl.startsWith('https://'))) {
          return trustpilotUrl;
        }
      }

      // Try to construct Trustpilot URL from domain
      const domain = url.hostname.replace('www.', '');
      logger.info('Constructing Trustpilot URL from domain', {
        domain,
        context: 'extractTrustpilotUrl'
      });
      return `https://trustpilot.com/review/${domain}`;

    } catch (fetchError) {
      logger.error('Error fetching website content', {
        error: fetchError,
        websiteUrl,
        context: 'extractTrustpilotUrl'
      });
      return null;
    }
  } catch (error) {
    logger.error('Unexpected error in Trustpilot URL extraction', {
      error,
      websiteUrl,
      context: 'extractTrustpilotUrl'
    });
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
      logger.error('Could not find or construct Trustpilot URL', { websiteUrl });
      
      // Call Make.com webhook to discover Trustpilot URL
      if (process.env.MAKE_TRUSTPILOT_WEBHOOK_URL) {
        try {
          const webhookResponse = await fetch(process.env.MAKE_TRUSTPILOT_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ website_url: websiteUrl })
          });

          if (webhookResponse.ok) {
            const data = await webhookResponse.json();
            if (data?.trustpilot_url) {
              logger.info('Successfully discovered Trustpilot URL via webhook', { 
                trustpilot_url: data.trustpilot_url 
              });
              return {
                success: true,
                message: 'Found Trustpilot URL via webhook',
                trustpilot_url: data.trustpilot_url
              };
            }
          }
        } catch (webhookError) {
          logger.error('Failed to call Make.com webhook', { error: webhookError });
        }
      }

      return {
        success: false,
        message: 'Could not find or construct Trustpilot URL',
      };
    }

    const response = await fetch(trustpilotUrl);
    if (!response.ok) {
      return {
        success: false,
        message: `Failed to fetch Trustpilot page: ${response.status} ${response.statusText}`,
      };
    }

    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const reviews: TrustpilotReviewData[] = [];
    const reviewElements = Array.from(document.querySelectorAll('.review'));
    
    logger.info(`Found ${reviewElements.length} review elements on Trustpilot page`);

    for (const element of reviewElements) {
      try {
        const reviewId = element.getAttribute('id') || '';
        const ratingElement = element.querySelector('.star-rating');
        const rating = parseFloat(ratingElement?.getAttribute('aria-label')?.match(/\d+(\.\d+)?/)?.[0] || '0');
        const titleElement = element.querySelector('.review-title');
        const contentElement = element.querySelector('.review-content');
        const authorElement = element.querySelector('.consumer-name');
        const dateElement = element.querySelector('time');

        if (!reviewId || !rating || !contentElement?.textContent || !authorElement?.textContent) {
          logger.warn('Skipping review due to missing required fields', {
            reviewId,
            rating,
            hasContent: !!contentElement?.textContent,
            hasAuthor: !!authorElement?.textContent
          });
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

        try {
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
        } catch (dbError) {
          logger.error('Failed to store review in database', { 
            error: dbError, 
            reviewId: review.reviewId 
          });
        }
      } catch (reviewError) {
        logger.error('Error processing review element', { error: reviewError });
        continue;
      }
    }

    if (reviews.length === 0) {
      return {
        success: false,
        message: 'No valid reviews found on the page',
      };
    }

    return {
      success: true,
      reviews,
      message: `Successfully analyzed ${reviews.length} reviews`,
    };
  } catch (error) {
    logger.error('Error analyzing Trustpilot reviews:', { error });
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
