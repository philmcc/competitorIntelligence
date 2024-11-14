import crypto from 'crypto';
import { db } from 'db';
import { competitors, websiteChanges } from 'db/schema';
import { eq, desc } from 'drizzle-orm';
import fetch from 'node-fetch';
import { diffWords } from 'diff';

export interface WebsiteChange {
  competitorId: number;
  content: string;
  contentHash: string;
  changes?: any;
  changeType?: string;
}

export async function fetchWebsiteContent(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    const text = await response.text();
    return text;
  } catch (error) {
    console.error(`Error fetching website content for ${url}:`, error);
    throw error;
  }
}

export async function calculateContentHash(content: string): Promise<string> {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export async function detectChanges(newContent: string, oldContent: string): Promise<any> {
  const differences = diffWords(oldContent, newContent);
  return differences.filter(part => part.added || part.removed);
}

export async function trackWebsiteChanges(competitorId: number, websiteUrl: string): Promise<WebsiteChange | null> {
  try {
    // Fetch new content
    const content = await fetchWebsiteContent(websiteUrl);
    const contentHash = await calculateContentHash(content);

    // Get the most recent snapshot
    const [lastSnapshot] = await db
      .select()
      .from(websiteChanges)
      .where(eq(websiteChanges.competitorId, competitorId))
      .orderBy(desc(websiteChanges.createdAt))
      .limit(1);

    // If no changes or first snapshot, save and return
    if (!lastSnapshot || lastSnapshot.contentHash === contentHash) {
      if (!lastSnapshot) {
        // Save initial snapshot
        await db.insert(websiteChanges).values({
          competitorId,
          content,
          contentHash,
          changes: null,
          changeType: 'initial'
        });
      }
      return null;
    }

    // Detect changes
    const changes = await detectChanges(content, lastSnapshot.content);
    const changeType = changes.length > 0 ? 'update' : null;

    // Save new snapshot with changes
    const [newSnapshot] = await db.insert(websiteChanges)
      .values({
        competitorId,
        content,
        contentHash,
        changes: changes.length > 0 ? changes : null,
        changeType
      })
      .returning();

    return newSnapshot;
  } catch (error) {
    console.error(`Error tracking changes for competitor ${competitorId}:`, error);
    throw error;
  }
}

export async function trackAllCompetitors(): Promise<void> {
  try {
    // Get all selected competitors
    const selectedCompetitors = await db
      .select()
      .from(competitors)
      .where(eq(competitors.isSelected, true));

    // Track changes for each competitor
    for (const competitor of selectedCompetitors) {
      try {
        await trackWebsiteChanges(competitor.id, competitor.website);
      } catch (error) {
        console.error(`Failed to track changes for competitor ${competitor.id}:`, error);
        // Continue with next competitor even if one fails
        continue;
      }
    }
  } catch (error) {
    console.error('Error in trackAllCompetitors:', error);
    throw error;
  }
}
