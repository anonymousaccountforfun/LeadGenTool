/**
 * Lead Lists API
 *
 * Endpoints for managing and sharing lead lists
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  createLeadList,
  getLeadLists,
  getListById,
  deleteLeadList,
  updateLeadList,
  setListVisibility,
  regenerateShareToken,
  addLeadToList,
  removeLeadFromList,
  incrementListDownloadCount,
  getListBusinesses,
} from '@/lib/db-users';
import { generateCsv, generateJson, ExportColumn } from '@/lib/export';

// GET - Get user's lists or public list by share token
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const shareToken = searchParams.get('token');
    const listId = searchParams.get('id');
    const download = searchParams.get('download');
    const format = searchParams.get('format') || 'csv';

    // Public access via share token
    if (shareToken) {
      const { getListByShareToken, incrementListViewCount } = await import('@/lib/db-users');
      const list = await getListByShareToken(shareToken);

      if (!list) {
        return NextResponse.json({ error: 'List not found or not public' }, { status: 404 });
      }

      // Track view
      await incrementListViewCount(list.id);

      // Download the list data
      if (download === 'true') {
        const businesses = await getListBusinesses(list.id);
        await incrementListDownloadCount(list.id);

        if (format === 'json') {
          const json = generateJson(businesses as never[]);
          return NextResponse.json(json);
        } else {
          const columns: ExportColumn[] = ['name', 'website', 'email', 'phone', 'address', 'rating', 'source'];
          const csv = generateCsv(businesses as never[], { columns });
          return new NextResponse(csv, {
            headers: {
              'Content-Type': 'text/csv',
              'Content-Disposition': `attachment; filename="${list.name.replace(/[^a-z0-9]/gi, '_')}.csv"`,
            },
          });
        }
      }

      // Return list info with businesses
      const businesses = await getListBusinesses(list.id);

      return NextResponse.json({
        list: {
          id: list.id,
          name: list.name,
          description: list.description,
          color: list.color,
          lead_count: list.lead_count,
          view_count: list.view_count,
          download_count: list.download_count,
          created_at: list.created_at,
        },
        businesses,
      });
    }

    // Authenticated access
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get specific list
    if (listId) {
      const list = await getListById(listId);
      if (!list || list.user_id !== session.user.id) {
        return NextResponse.json({ error: 'List not found' }, { status: 404 });
      }

      const businesses = await getListBusinesses(listId);

      return NextResponse.json({
        list,
        businesses,
      });
    }

    // Get all lists for user
    const lists = await getLeadLists(session.user.id);
    return NextResponse.json({ lists });

  } catch (error) {
    console.error('List GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch lists' }, { status: 500 });
  }
}

// POST - Create new list or add lead to list
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    if (action === 'add_lead') {
      // Add lead to existing list
      const { listId, savedLeadId } = body;
      if (!listId || !savedLeadId) {
        return NextResponse.json({ error: 'listId and savedLeadId required' }, { status: 400 });
      }

      await addLeadToList(listId, savedLeadId);
      return NextResponse.json({ success: true });
    }

    // Create new list
    const { name, description, color } = body;
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const list = await createLeadList(session.user.id, name, description, color);
    return NextResponse.json({ list }, { status: 201 });

  } catch (error) {
    console.error('List POST error:', error);
    return NextResponse.json({ error: 'Failed to create list' }, { status: 500 });
  }
}

// PATCH - Update list settings (name, visibility, etc.)
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { listId, action } = body;

    if (!listId) {
      return NextResponse.json({ error: 'listId required' }, { status: 400 });
    }

    // Verify ownership
    const list = await getListById(listId);
    if (!list || list.user_id !== session.user.id) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    switch (action) {
      case 'set_public': {
        const { isPublic } = body;
        const result = await setListVisibility(listId, session.user.id, isPublic);
        return NextResponse.json({
          success: true,
          shareToken: result.shareToken,
          shareUrl: result.shareToken ? `/lists/${result.shareToken}` : null,
        });
      }

      case 'regenerate_token': {
        const token = await regenerateShareToken(listId, session.user.id);
        if (!token) {
          return NextResponse.json({ error: 'List must be public to regenerate token' }, { status: 400 });
        }
        return NextResponse.json({
          success: true,
          shareToken: token,
          shareUrl: `/lists/${token}`,
        });
      }

      case 'update': {
        const { name, description, color } = body;
        await updateLeadList(listId, session.user.id, { name, description, color });
        return NextResponse.json({ success: true });
      }

      case 'remove_lead': {
        const { savedLeadId } = body;
        if (!savedLeadId) {
          return NextResponse.json({ error: 'savedLeadId required' }, { status: 400 });
        }
        await removeLeadFromList(listId, savedLeadId);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error) {
    console.error('List PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update list' }, { status: 500 });
  }
}

// DELETE - Delete a list
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const listId = searchParams.get('id');

    if (!listId) {
      return NextResponse.json({ error: 'List ID required' }, { status: 400 });
    }

    await deleteLeadList(listId, session.user.id);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('List DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete list' }, { status: 500 });
  }
}
