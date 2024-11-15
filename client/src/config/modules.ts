export interface ResearchModule {
  id: string;
  name: string;
  description: string;
  availableOnFree: boolean;
  isActive: boolean;
}

export const RESEARCH_MODULES: ResearchModule[] = [
  {
    id: "website-changes",
    name: "Website Change Tracking",
    description: "Monitor changes to competitor websites",
    availableOnFree: true,
    isActive: true,
  },
  {
    id: "trustpilot",
    name: "Trustpilot Review Monitoring",
    description: "Track new reviews and ratings on Trustpilot",
    availableOnFree: true,
    isActive: true,
  },
  {
    id: "social-media",
    name: "Social Media Monitoring",
    description: "Track social media presence and engagement",
    availableOnFree: false,
    isActive: true,
  },
  {
    id: "seo",
    name: "SEO Analysis",
    description: "Monitor SEO performance and rankings",
    availableOnFree: false,
    isActive: true,
  }
]; 