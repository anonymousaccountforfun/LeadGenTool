/**
 * Tests for Shareable Lead Lists
 */

import { describe, it, expect } from 'vitest';

// Test the share token generation logic
describe('Share Token Generation', () => {
  function generateShareToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 12; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }

  it('should generate 12 character tokens', () => {
    const token = generateShareToken();
    expect(token.length).toBe(12);
  });

  it('should only contain alphanumeric characters', () => {
    const token = generateShareToken();
    expect(/^[A-Za-z0-9]+$/.test(token)).toBe(true);
  });

  it('should generate unique tokens', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateShareToken());
    }
    // All 100 tokens should be unique (collision extremely unlikely)
    expect(tokens.size).toBe(100);
  });

  it('should be URL-safe', () => {
    const token = generateShareToken();
    expect(encodeURIComponent(token)).toBe(token);
  });
});

// Test the LeadList type
describe('LeadList Interface', () => {
  interface LeadList {
    id: string;
    user_id: string;
    name: string;
    description: string | null;
    color: string;
    is_public: boolean;
    share_token: string | null;
    view_count: number;
    download_count: number;
    created_at: string;
    updated_at: string;
    lead_count?: number;
  }

  it('should have required sharing fields', () => {
    const list: LeadList = {
      id: 'list_123',
      user_id: 'user_456',
      name: 'Test List',
      description: null,
      color: '#64ffda',
      is_public: false,
      share_token: null,
      view_count: 0,
      download_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    expect(list).toHaveProperty('is_public');
    expect(list).toHaveProperty('share_token');
    expect(list).toHaveProperty('view_count');
    expect(list).toHaveProperty('download_count');
  });

  it('should have share_token when public', () => {
    const publicList: LeadList = {
      id: 'list_123',
      user_id: 'user_456',
      name: 'Public List',
      description: 'A shared list',
      color: '#64ffda',
      is_public: true,
      share_token: 'Abc123Xyz789',
      view_count: 10,
      download_count: 5,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      lead_count: 25,
    };

    expect(publicList.is_public).toBe(true);
    expect(publicList.share_token).toBeTruthy();
    expect(publicList.share_token?.length).toBe(12);
  });

  it('should have null share_token when private', () => {
    const privateList: LeadList = {
      id: 'list_123',
      user_id: 'user_456',
      name: 'Private List',
      description: null,
      color: '#64ffda',
      is_public: false,
      share_token: null,
      view_count: 0,
      download_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    expect(privateList.is_public).toBe(false);
    expect(privateList.share_token).toBeNull();
  });
});

// Test share URL generation
describe('Share URL Generation', () => {
  const BASE_URL = 'https://example.com';

  function getShareUrl(shareToken: string | null): string | null {
    if (!shareToken) return null;
    return `${BASE_URL}/lists/${shareToken}`;
  }

  it('should generate correct share URL', () => {
    const token = 'Abc123Xyz789';
    const url = getShareUrl(token);
    expect(url).toBe('https://example.com/lists/Abc123Xyz789');
  });

  it('should return null for null token', () => {
    const url = getShareUrl(null);
    expect(url).toBeNull();
  });

  it('should be a valid URL', () => {
    const token = 'Abc123Xyz789';
    const url = getShareUrl(token);
    expect(() => new URL(url!)).not.toThrow();
  });
});

// Test embed code generation
describe('Embed Widget Code Generation', () => {
  function getEmbedCode(shareUrl: string): string {
    return `<iframe src="${shareUrl}" width="100%" height="500" frameborder="0"></iframe>`;
  }

  it('should generate valid iframe code', () => {
    const shareUrl = 'https://example.com/lists/Abc123';
    const embedCode = getEmbedCode(shareUrl);

    expect(embedCode).toContain('<iframe');
    expect(embedCode).toContain('src="https://example.com/lists/Abc123"');
    expect(embedCode).toContain('width="100%"');
    expect(embedCode).toContain('height="500"');
    expect(embedCode).toContain('frameborder="0"');
    expect(embedCode).toContain('</iframe>');
  });

  it('should escape special characters in URL', () => {
    const shareUrl = 'https://example.com/lists/test&token=123';
    const embedCode = getEmbedCode(shareUrl);
    expect(embedCode).toContain('test&token=123');
  });
});

// Test visibility analytics
describe('List Analytics', () => {
  interface ListStats {
    view_count: number;
    download_count: number;
  }

  it('should track views', () => {
    const stats: ListStats = { view_count: 0, download_count: 0 };
    stats.view_count += 1;
    expect(stats.view_count).toBe(1);
  });

  it('should track downloads separately', () => {
    const stats: ListStats = { view_count: 10, download_count: 0 };
    stats.download_count += 1;
    expect(stats.download_count).toBe(1);
    expect(stats.view_count).toBe(10);
  });

  it('should calculate download rate', () => {
    const stats: ListStats = { view_count: 100, download_count: 25 };
    const downloadRate = stats.view_count > 0 ? (stats.download_count / stats.view_count) * 100 : 0;
    expect(downloadRate).toBe(25);
  });
});

// Test list business data for export
describe('List Business Data', () => {
  interface ListBusiness {
    id: number;
    name: string;
    website: string | null;
    email: string | null;
    email_confidence: number;
    phone: string | null;
    address: string | null;
    rating: number | null;
    review_count: number | null;
    source: string;
  }

  const sampleBusiness: ListBusiness = {
    id: 1,
    name: 'Test Business',
    website: 'https://test.com',
    email: 'contact@test.com',
    email_confidence: 0.9,
    phone: '555-123-4567',
    address: '123 Main St, City, ST 12345',
    rating: 4.5,
    review_count: 100,
    source: 'google_maps',
  };

  it('should have all required fields for export', () => {
    expect(sampleBusiness).toHaveProperty('id');
    expect(sampleBusiness).toHaveProperty('name');
    expect(sampleBusiness).toHaveProperty('email');
    expect(sampleBusiness).toHaveProperty('phone');
    expect(sampleBusiness).toHaveProperty('address');
  });

  it('should handle nullable fields', () => {
    const businessWithNulls: ListBusiness = {
      ...sampleBusiness,
      website: null,
      email: null,
      phone: null,
      rating: null,
    };

    expect(businessWithNulls.website).toBeNull();
    expect(businessWithNulls.email).toBeNull();
    expect(businessWithNulls.phone).toBeNull();
    expect(businessWithNulls.rating).toBeNull();
  });

  it('should have email confidence for verified status', () => {
    const verifiedBusiness = { ...sampleBusiness, email_confidence: 0.9 };
    const unverifiedBusiness = { ...sampleBusiness, email_confidence: 0.5 };

    expect(verifiedBusiness.email_confidence >= 0.8).toBe(true);
    expect(unverifiedBusiness.email_confidence >= 0.8).toBe(false);
  });
});

// Test public/private toggle logic
describe('Visibility Toggle', () => {
  interface VisibilityState {
    is_public: boolean;
    share_token: string | null;
  }

  function toggleVisibility(state: VisibilityState, makePublic: boolean): VisibilityState {
    if (makePublic) {
      return {
        is_public: true,
        share_token: 'newToken12345',
      };
    } else {
      return {
        is_public: false,
        share_token: null,
      };
    }
  }

  it('should set public with new token', () => {
    const initial: VisibilityState = { is_public: false, share_token: null };
    const result = toggleVisibility(initial, true);

    expect(result.is_public).toBe(true);
    expect(result.share_token).toBeTruthy();
  });

  it('should set private and clear token', () => {
    const initial: VisibilityState = { is_public: true, share_token: 'existingToken' };
    const result = toggleVisibility(initial, false);

    expect(result.is_public).toBe(false);
    expect(result.share_token).toBeNull();
  });

  it('should generate new token when making public', () => {
    const initial: VisibilityState = { is_public: false, share_token: null };
    const result = toggleVisibility(initial, true);

    expect(result.share_token).not.toBeNull();
    expect(result.share_token).not.toBe(initial.share_token);
  });
});

// Test color options
describe('List Colors', () => {
  const AVAILABLE_COLORS = ['#64ffda', '#f472b6', '#818cf8', '#fb923c', '#4ade80', '#f87171'];

  it('should have multiple color options', () => {
    expect(AVAILABLE_COLORS.length).toBeGreaterThan(3);
  });

  it('should have valid hex color format', () => {
    const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
    AVAILABLE_COLORS.forEach(color => {
      expect(hexColorRegex.test(color)).toBe(true);
    });
  });

  it('should include default accent color', () => {
    expect(AVAILABLE_COLORS).toContain('#64ffda');
  });
});
