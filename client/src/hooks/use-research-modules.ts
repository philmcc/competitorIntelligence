import useSWR from 'swr';
import type { ResearchModule } from '@/types/modules';

export function useResearchModules() {
  const { data, error, mutate } = useSWR<{
    status: string;
    data: ResearchModule[];
  }>('/api/modules');

  const toggleModule = async (moduleId: string, enabled: boolean) => {
    try {
      const response = await fetch(`/api/modules/${moduleId}/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled }),
      });
      
      const result = await response.json();
      if (result.status === 'success') {
        await mutate();
        return { ok: true };
      }
      return { ok: false, error: result.message };
    } catch (error) {
      return { 
        ok: false, 
        error: error instanceof Error ? error.message : 'An unexpected error occurred' 
      };
    }
  };

  return {
    modules: data?.data || [],
    isLoading: !error && !data,
    error,
    toggleModule,
  };
} 