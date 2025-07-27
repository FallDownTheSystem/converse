/**
 * Mock context processor for testing
 */

import { vi } from 'vitest';

export function createMockContextProcessor() {
  return {
    processFiles: vi.fn().mockResolvedValue([
      {
        path: '/test/file.txt',
        content: 'Test file content',
        mimeType: 'text/plain'
      }
    ]),
    
    processImages: vi.fn().mockResolvedValue([
      {
        path: '/test/image.png',
        content: 'base64-image-data',
        mimeType: 'image/png'
      }
    ]),
    
    processCombined: vi.fn().mockImplementation(async ({ files = [], images = [] }) => {
      const processedFiles = files.map(f => ({
        path: f,
        content: `Content of ${f}`,
        mimeType: 'text/plain'
      }));
      
      const processedImages = images.map(i => ({
        path: i,
        content: 'base64-image-data',
        mimeType: 'image/png'
      }));
      
      return {
        files: processedFiles,
        images: processedImages
      };
    })
  };
}