import crypto from 'crypto';
import { db } from 'db';
import { competitors, websiteChanges } from 'db/schema';
import { eq, desc } from 'drizzle-orm';
import fetch from 'node-fetch';
import { diffWords } from 'diff';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export interface WebsiteChange {
  competitorId: number;
  content: string;
  contentHash: string;
  changes?: any;
  changeType?: string;
  aiAnalysis?: any;
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

async function analyzeChangesWithAI(changes: any[]): Promise<any> {
  try {
    if (!changes || changes.length === 0) {
      return null;
    }

    const changesText = changes.map(change => {
      if (change.added) {
        return `Added: "${change.value}"`;
      } else if (change.removed) {
        return `Removed: "${change.value}"`;
      }
      return null;
    }).filter(Boolean).join('\n');

    const prompt = `Analyze the following website content changes and provide insights:
1. Summarize the main changes
2. Identify potential business implications
3. Highlight any significant updates or announcements

Changes:
${changesText}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are an expert business analyst specializing in competitive analysis. Analyze website changes and provide valuable business insights."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    return {
      summary: response.choices[0].message.content,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error analyzing changes with AI:', error);
    return null;
  }
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
          changeType: 'initial',
          aiAnalysis: null
        });
      }
      return null;
    }

    // Detect changes
    const changes = await detectChanges(content, lastSnapshot.content);
    const changeType = changes.length > 0 ? 'update' : null;

    // Analyze changes with AI if there are any
    const aiAnalysis = changes.length > 0 ? await analyzeChangesWithAI(changes) : null;

    // Save new snapshot with changes and AI analysis
    const [newSnapshot] = await db.insert(websiteChanges)
      .values({
        competitorId,
        content,
        contentHash,
        changes: changes.length > 0 ? changes : null,
        changeType,
        aiAnalysis
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
