import { NextRequest, NextResponse } from 'next/server';
import type { HuggingFaceSearchResponse } from '@/types/dataset/huggingface';

interface SearchRequestBody {
  query: string;
  limit?: number;
  offset?: number;
  sort?: 'downloads' | 'likes' | 'updated' | 'created';
  token?: string;
}

interface HuggingFaceRawDataset {
  _id: string;
  id: string;
  author?: string;
  description?: string;
  downloads?: number;
  likes?: number;
  tags?: string[];
  private?: boolean;
  disabled?: boolean;
  gated?: boolean;
  lastModified?: string;
  createdAt?: string;
  sha?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: SearchRequestBody = await request.json();
    const { query, limit = 8, offset = 0, sort = 'downloads', token } = body;

    // Validate pagination parameters
    if (limit < 1 || limit > 50) {
      return NextResponse.json(
        { error: 'Limit must be between 1 and 50' },
        { status: 400 }
      );
    }

    if (offset < 0) {
      return NextResponse.json(
        { error: 'Offset must be non-negative' },
        { status: 400 }
      );
    }

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      );
    }

    // Use the original query - don't modify it
    const roboticsKeywords = ['robot', 'lerobot', 'manipulation', 'navigation', 'perception', 'control', 'trajectory', 'sensor'];
    const enhancedQuery = query; // Use original query without modification

    // Construct Hugging Face API URL
    const baseUrl = 'https://huggingface.co/api/datasets';
    // Request more results from HF API to handle offset and filtering
    const requestLimit = Math.min(limit + offset + 20, 100); // Buffer for offset + filtering
    
    const searchParams = new URLSearchParams({
      search: enhancedQuery,
      limit: requestLimit.toString(),
      sort: sort,
      direction: '-1', // Descending order
    });

    const apiUrl = `${baseUrl}?${searchParams}`;

    // Prepare headers
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'User-Agent': 'RoboKit/1.0',
      'Cache-Control': 'no-cache',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Call Hugging Face API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const hfResponse = await fetch(apiUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!hfResponse.ok) {
        const errorText = await hfResponse.text();
        console.error('HuggingFace API error:', hfResponse.status, errorText);
        throw new Error(`HuggingFace API error: ${hfResponse.status} ${hfResponse.statusText}`);
      }

      const hfData = await hfResponse.json() as HuggingFaceRawDataset[];

      // Optional: Light filtering to prioritize robotics datasets but don't exclude non-robotics ones
      const isRoboticsQuery = roboticsKeywords.some(keyword => query.toLowerCase().includes(keyword));
      
      let filteredData = isRoboticsQuery 
        ? hfData.filter(dataset => {
            const searchText = `${dataset.id} ${dataset.description || ''} ${(dataset.tags || []).join(' ')}`.toLowerCase();
            return roboticsKeywords.some(keyword => searchText.includes(keyword)) ||
                   query.toLowerCase().split(' ').every(term => searchText.includes(term));
          })
        : hfData; // If not a robotics query, return all results

      // Apply pagination
      const totalResults = filteredData.length;
      const paginatedData = filteredData.slice(offset, offset + limit);
      const hasMore = offset + limit < totalResults || hfData.length >= requestLimit;
      
      filteredData = paginatedData;

      // Transform HF response to our format with enhanced data
      const datasets = filteredData.map((dataset: HuggingFaceRawDataset) => ({
        id: dataset.id,
        author: dataset.author || dataset.id.split('/')[0] || 'unknown',
        name: dataset.id.split('/')[1] || dataset.id,
        description: dataset.description || 'No description available',
        downloads: dataset.downloads || 0,
        likes: dataset.likes || 0,
        tags: dataset.tags || [],
        isPrivate: dataset.private || false,
        size: 'Unknown', // Size not provided in API response
        createdAt: dataset.createdAt || dataset.lastModified || new Date().toISOString(),
        sha: dataset.sha || 'main', // Git commit hash for Git LFS, default to 'main'
      }));

      const response: HuggingFaceSearchResponse = {
        datasets,
        total: Math.min(totalResults, datasets.length + offset), // Current page total
        hasMore,
        offset,
        limit,
      };

      return NextResponse.json(response);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  } catch (error) {
    console.error('HuggingFace search error:', error);
    
    // Provide more specific error messages
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Search request timed out. Please try again.' },
        { status: 408 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to search datasets. Please check your connection and try again.' },
      { status: 500 }
    );
  }
}