import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { competitors, researchRuns } from "../../db/schema";
import { eq } from "drizzle-orm";
import * as dotenv from 'dotenv';
import { desc } from 'drizzle-orm';

dotenv.config();

const sqlClient = neon(process.env.DATABASE_URL!);
const db = drizzle(sqlClient, { schema: { competitors, researchRuns } });

export async function getTrustpilotUrl(websiteUrl: string) {
  try {
    console.log('Fetching Trustpilot URL for:', websiteUrl);
    
    const response = await fetch(
      "https://hook.eu2.make.com/des6gfa096l3fximks5myjt92d7f8fl3",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ website_url: websiteUrl }),
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch Trustpilot URL: ${response.status} ${response.statusText}`);
    }
    
    // Get the URL directly as text
    const trustpilotUrl = await response.text();
    console.log('Received Trustpilot URL:', trustpilotUrl);

    if (!trustpilotUrl || !trustpilotUrl.startsWith('https://')) {
      throw new Error('Invalid Trustpilot URL received');
    }

    return trustpilotUrl;
  } catch (error) {
    console.error('getTrustpilotUrl error:', error);
    throw error;
  }
}

export async function analyzeTrustpilotReviews(url: string) {
  const response = await fetch(
    "https://hook.eu2.make.com/lbx354i2jyw0j738hpysbz0awokd7ltg",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    }
  );
  
  if (!response.ok) {
    throw new Error("Failed to analyze Trustpilot reviews");
  }
  
  const data = await response.json();
  return data.analysis;
}

export async function handleTrustpilotAnalysis(competitorId: number) {
  try {
    // Get competitor using select instead of query
    const [competitor] = await db
      .select()
      .from(competitors)
      .where(eq(competitors.id, competitorId))
      .limit(1);

    if (!competitor) {
      throw new Error("Competitor not found");
    }

    // Get or fetch Trustpilot URL
    let trustpilotUrl = competitor.trustpilotUrl;
    if (!trustpilotUrl) {
      trustpilotUrl = await getTrustpilotUrl(competitor.website);
      // Store the Trustpilot URL
      await db
        .update(competitors)
        .set({ trustpilotUrl })
        .where(eq(competitors.id, competitorId));
    }

    // Analyze reviews
    const analysis = await analyzeTrustpilotReviews(trustpilotUrl);

    // Store the research run
    const [researchRun] = await db
      .insert(researchRuns)
      .values({
        competitorId,
        moduleId: "trustpilot",
        result: analysis,
        runDate: new Date(),
      })
      .returning();

    return {
      analysis,
      researchRunId: researchRun.id
    };
  } catch (error) {
    console.error('Trustpilot analysis error:', error);
    throw error;
  }
} 