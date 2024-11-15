import crypto from 'crypto';
import { db } from 'db';
import { competitors, websiteChanges } from 'db/schema';
import { eq, desc } from 'drizzle-orm';
import fetch from 'node-fetch';
import { diffWords } from 'diff';
import { logger } from './logger';
import { scheduleJob, Job } from 'node-schedule';
import type { LogContext } from './logger';

export interface WebsiteChange {
  id: number;
  competitorId: number;
  content: string;
  contentHash: string;
  changes?: DiffPart[];
  changeType: string | undefined;
  snapshotDate: Date;
  isReported: boolean;
  createdAt: Date;
}

interface DiffPart {
  added?: boolean;
  removed?: boolean;
  value: string;
}

interface WebhookPayload {
  competitorId: number;
  changeType: string | undefined;
  changes: DiffPart[] | undefined;
  timestamp: string;
  snapshotDate: Date;
  contentHash: string;
}

let isTrackingEnabled = true;
let trackingJob: Job | null = null;
const DEFAULT_SCHEDULE = '0 */6 * * *'; // Every 6 hours

export async function fetchWebsiteContent(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch website: ${response.statusText}`);
    }
    const text = await response.text();
    return text;
  } catch (error) {
    const logContext: LogContext = {
      url,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    logger.error('Error fetching website content', error, logContext);
    throw error;
  }
}

export async function calculateContentHash(content: string): Promise<string> {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export async function detectChanges(newContent: string, oldContent: string): Promise<DiffPart[]> {
  const differences = diffWords(oldContent, newContent);
  return differences.filter((part: DiffPart) => part.added || part.removed);
}

async function notifyWebhook(change: WebsiteChange): Promise<void> {
  const webhookUrl = process.env.MAKE_WEBHOOK_URL;
  if (!webhookUrl) {
    const logContext: LogContext = {
      error: 'MAKE_WEBHOOK_URL missing'
    };
    logger.error('Make.com webhook URL not configured', null, logContext);
    return;
  }

  try {
    const payload: WebhookPayload = {
      competitorId: change.competitorId,
      changeType: change.changeType,
      changes: change.changes,
      timestamp: new Date().toISOString(),
      snapshotDate: change.snapshotDate,
      contentHash: change.contentHash
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Webhook notification failed: ${response.statusText}`);
    }

    const logContext: LogContext = {
      competitorId: change.competitorId,
      changeType: change.changeType,
      timestamp: new Date().toISOString()
    };
    logger.info('Webhook notification sent successfully', logContext);
  } catch (error) {
    const logContext: LogContext = {
      error: error instanceof Error ? error.message : 'Unknown error',
      competitorId: change.competitorId
    };
    logger.error('Failed to send webhook notification', error, logContext);
  }
}

export async function trackWebsiteChanges(competitorId: number, websiteUrl: string): Promise<WebsiteChange | null> {
  if (!isTrackingEnabled) {
    const logContext: LogContext = { competitorId };
    logger.info('Website tracking is disabled', logContext);
    return null;
  }

  try {
    const content = await fetchWebsiteContent(websiteUrl);
    const contentHash = await calculateContentHash(content);
    const snapshotDate = new Date();

    const [lastSnapshot] = await db
      .select()
      .from(websiteChanges)
      .where(eq(websiteChanges.competitorId, competitorId))
      .orderBy(desc(websiteChanges.createdAt))
      .limit(1);

    if (!lastSnapshot || lastSnapshot.contentHash !== contentHash) {
      const changes = lastSnapshot ? await detectChanges(content, lastSnapshot.content) : [];
      const changeType = !lastSnapshot ? 'initial' : (changes.length > 0 ? 'update' : undefined);

      const [newSnapshot] = await db.insert(websiteChanges)
        .values({
          competitorId,
          content,
          contentHash,
          changes: changes.length > 0 ? changes : undefined,
          changeType,
          snapshotDate,
          isReported: false
        })
        .returning();

      if (changes.length > 0) {
        await notifyWebhook(newSnapshot);
      }

      const logContext: LogContext = {
        competitorId,
        changeType,
        hasChanges: changes.length > 0,
        timestamp: new Date().toISOString()
      };
      logger.info('Website changes tracked successfully', logContext);

      return newSnapshot;
    }

    return null;
  } catch (error) {
    const logContext: LogContext = {
      competitorId,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    logger.error('Error tracking changes for competitor', error, logContext);
    throw error;
  }
}

export async function trackAllCompetitors(): Promise<void> {
  if (!isTrackingEnabled) {
    logger.info('Website tracking is disabled');
    return;
  }

  try {
    const selectedCompetitors = await db
      .select()
      .from(competitors)
      .where(eq(competitors.isSelected, true));

    const logContext: LogContext = {
      competitorCount: selectedCompetitors.length,
      timestamp: new Date().toISOString()
    };
    logger.info('Starting batch tracking for all competitors', logContext);

    for (const competitor of selectedCompetitors) {
      try {
        await trackWebsiteChanges(competitor.id, competitor.website);
      } catch (error) {
        const errorContext: LogContext = {
          id: competitor.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
        logger.error('Failed to track changes for competitor', error, errorContext);
      }
    }

    logger.info('Batch tracking completed', {
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const logContext: LogContext = {
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    logger.error('Error in trackAllCompetitors', error, logContext);
    throw error;
  }
}

export function setTrackingEnabled(enabled: boolean): void {
  isTrackingEnabled = enabled;
  if (!enabled && trackingJob) {
    trackingJob.cancel();
    trackingJob = null;
    logger.info('Website tracking job cancelled');
  } else if (enabled && !trackingJob) {
    scheduleTracking(DEFAULT_SCHEDULE);
  }
  logger.info(`Website tracking ${enabled ? 'enabled' : 'disabled'}`);
}

export function scheduleTracking(cronSchedule: string = DEFAULT_SCHEDULE): Job {
  if (trackingJob) {
    trackingJob.cancel();
  }

  trackingJob = scheduleJob(cronSchedule, async () => {
    const logContext: LogContext = {
      schedule: cronSchedule,
      timestamp: new Date().toISOString()
    };
    logger.info('Starting scheduled website tracking', logContext);

    try {
      await trackAllCompetitors();
      logger.info('Scheduled website tracking completed successfully');
    } catch (error) {
      const errorContext: LogContext = {
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      logger.error('Scheduled website tracking failed', error, errorContext);
    }
  });

  logger.info('Website tracking scheduled', { 
    cronSchedule,
    nextRun: trackingJob.nextInvocation().toISOString()
  });
  
  return trackingJob;
}

export function getTrackingSchedule(): string | null {
  return trackingJob ? trackingJob.nextInvocation().toISOString() : null;
}

export function isTrackingActive(): boolean {
  return isTrackingEnabled;
}
